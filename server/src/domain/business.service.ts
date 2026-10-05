import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MemoryStore } from './memory.store';
import { Order, OrderStatus, Role } from './types';
import { decryptField } from '../security/field-crypto';

const statusText: Record<string, string> = {
  pending_payment: '待支付', paid: '待发货', shipped: '待收货', completed: '已完成', cancelled: '已取消', refunding: '退款中', refunded: '已退款'
};

function rulesForCompany(rules: Array<Record<string, any>>, items: Array<Record<string, any>>) {
  return items.map((item) => ({ item, rule: rules.find((entry) => entry.productId === item.productId && entry.promoterType === 'COMPANY' && entry.enabled !== false) })).filter((row) => row.rule);
}

@Injectable()
export class BusinessService {
  private readonly idempotency = new Map<string, string>();

  constructor(public readonly store: MemoryStore) {}

  health() { return { status: 'ok', mode: process.env.NODE_ENV === 'production' ? 'production' : (process.env.REPOSITORY_MODE === 'prisma' ? 'development' : 'demo'), repository: process.env.REPOSITORY_MODE === 'prisma' ? 'prisma' : 'memory', time: this.store.timestamp() }; }

  listProducts(query: { category?: string; keyword?: string; includeInactive?: boolean }) {
    const keyword = String(query.keyword || '').trim().toLowerCase();
    const source = query.includeInactive ? this.store.state.products : this.store.findActiveProducts();
    return source.filter((item) => (!query.category || query.category === 'all' || item.category === query.category) && (!keyword || `${item.name}${item.badge} ${item.subtitle || ''}`.toLowerCase().includes(keyword)));
  }

  product(id: string) { const item = this.store.findProduct(id); if (!item) throw new NotFoundException('商品不存在'); return { ...item, skus: this.store.state.skus.filter((sku: any) => sku.productId === id && sku.active !== false) }; }

  createOrder(input: any, actor: { id: string; role: Role; idempotencyKey?: string }) {
    if (actor.idempotencyKey) {
      const existingId = this.idempotency.get(actor.idempotencyKey)
        || this.store.state.orders.find((item) => item.idempotencyKey === actor.idempotencyKey)?.id;
      if (existingId) return this.store.findOrder(existingId)!;
    }
    if (!Array.isArray(input.items) || input.items.length === 0) throw new BadRequestException('订单不能为空');
    const targetUserId = input.customerUserId && ['sales', 'admin'].includes(actor.role) ? String(input.customerUserId) : actor.id;
    if (input.customerUserId && actor.role === 'sales') {
      const relation = this.store.state.promoterRelations.find((item) => item.promoterId === actor.id && item.customerId === targetUserId && item.active);
      if (!relation) throw new ForbiddenException('销售人员只能为名下客户代客下单');
    }
    if (['consumer', 'member'].includes(actor.role)) {
      const user: any = this.store.state.users.find((entry) => entry.id === actor.id);
      if (user && !user.phoneMasked && !user.phone) throw new BadRequestException('请先绑定手机号');
    }
    const requested = new Map<string, { productId: string; skuId?: string; quantity: number }>();
    input.items.forEach((line: any) => {
      const productId = String(line?.productId || '');
      const skuId = line?.skuId ? String(line.skuId) : undefined;
      const quantity = Number(line?.quantity);
      if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new BadRequestException('商品数量不合法');
      const key = `${productId}::${skuId || 'default'}`;
      const previous = requested.get(key);
      requested.set(key, { productId, skuId, quantity: (previous?.quantity || 0) + quantity });
    });
    const items = Array.from(requested.values()).map(({ productId, skuId, quantity }) => {
      const product = this.product(productId);
      if (!product.active) throw new BadRequestException('商品已下架');
      const sku: any = skuId ? this.store.state.skus.find((row: any) => row.id === skuId && row.productId === product.id && row.active !== false) : this.store.state.skus.find((row: any) => row.productId === product.id && row.id === `${product.id}-default` && row.active !== false);
      if (skuId && !sku) throw new BadRequestException('商品规格不存在或已停用');
      const unitPriceFen = Number(sku?.priceFen ?? product.priceFen ?? Math.round(Number(product.price || 0) * 100));
      if (this.availableStock(product.id, sku?.stock ?? product.stock, sku?.id) < quantity) throw new BadRequestException(`${product.name}库存不足`);
      return { productId: product.id, skuId: sku?.id, skuName: sku?.name, name: product.name, category: product.category, quantity, unitPrice: unitPriceFen / 100, unitPriceFen };
    });
    const hasPrescription = items.some((item: any) => item.category === 'prescription');
    const hasDaily = items.some((item: any) => item.category === 'daily');
    if (hasPrescription && hasDaily) throw new BadRequestException('处方商品和普通商品需分开下单');
    if (hasPrescription) {
      const prescription = input.prescriptionId ? this.store.findPrescription(input.prescriptionId) : undefined;
      if (!prescription || prescription.status !== 'approved' || prescription.userId !== targetUserId) throw new BadRequestException('缺少有效处方');
      if (prescription.usedAt) throw new BadRequestException('处方已使用');
      if (input.patientId && prescription.patientId && String(input.patientId) !== String(prescription.patientId)) throw new ForbiddenException('订单就诊人与处方不一致');
      if (prescription.patientId) {
        const patient = this.store.state.patients.find((entry) => entry.id === prescription.patientId && entry.userId === targetUserId);
        if (!patient) throw new ForbiddenException('处方就诊人归属不正确');
      } else if (!this.store.state.patients.some((entry) => entry.userId === targetUserId && entry.name === prescription.patientName)) {
        throw new ForbiddenException('处方未绑定有效就诊人');
      }
      if (!prescription.validUntil || Date.parse(`${String(prescription.validUntil).slice(0, 10)}T23:59:59.999Z`) < Date.now()) throw new BadRequestException('处方已过期');
      if (prescription.itemName && !items.some((item: any) => String(prescription.itemName).includes(item.name) || item.name.includes(String(prescription.itemName)))) throw new BadRequestException('处方品种与订单不匹配');
    }
    const addressId = String(input.addressId || input.address?.id || '');
    if (addressId) {
      const savedAddress: any = this.store.state.addresses.find((entry) => entry.id === addressId && entry.userId === targetUserId);
      if (!savedAddress) throw new ForbiddenException('收货地址不属于当前用户');
      let savedPhone = savedAddress.phone;
      if (!savedPhone && savedAddress.phoneCiphertext) { try { savedPhone = decryptField(String(savedAddress.phoneCiphertext)); } catch { savedPhone = undefined; } }
      input.address = { id: savedAddress.id, name: savedAddress.name, phone: savedPhone || input.address?.phone || savedAddress.phoneMasked, detail: savedAddress.detail };
    }
    if (!input.address?.name || !input.address?.phone || !input.address?.detail) throw new BadRequestException('收货地址不完整');
    const amountFen = items.reduce((sum: number, item: any) => sum + Number(item.unitPriceFen || Math.round(item.unitPrice * 100)) * item.quantity, 0);
    const freightFen = amountFen >= Number(this.store.state.settings.shippingFreeThresholdFen || 19900) ? 0 : Number(this.store.state.settings.shippingFeeFen || 800);
    const amount = amountFen / 100;
    const freight = freightFen / 100;
    const existingAttribution: any = this.store.state.customerAttributions.find((item: any) => String(item.customerId) === targetUserId && item.active !== false);
    const existingRelation = this.store.state.promoterRelations.find((item) => item.customerId === targetUserId && item.active);
    let promoterId: string | undefined = actor.role === 'sales' ? actor.id : undefined;
    let beneficiaryKind: 'company' | 'sales' | 'member' = actor.role === 'sales' ? 'sales' : 'company';
    if (actor.role === 'admin') promoterId = input.promoterId || input.promoter;
    if (actor.role !== 'sales' && actor.role !== 'admin' && !existingRelation && (input.promoterId || input.promoter)) {
      const candidate = String(input.promoterId || input.promoter);
      if (this.store.state.promoters.some((item) => String(item.id) === candidate && item.active !== false)) promoterId = candidate;
    }
    if (existingAttribution && actor.role !== 'sales' && actor.role !== 'admin') {
      promoterId = existingAttribution.ownerKind === 'company' ? undefined : String(existingAttribution.ownerPromoterId || '');
      beneficiaryKind = existingAttribution.ownerKind === 'sales' ? 'sales' : existingAttribution.ownerKind === 'member' ? 'member' : 'company';
    } else if (existingRelation && actor.role !== 'sales' && actor.role !== 'admin') {
      promoterId = String(existingRelation.promoterId);
    }
    if (promoterId) {
      const promoter: any = this.store.state.promoters.find((item: any) => String(item.id) === String(promoterId));
      beneficiaryKind = promoter?.type === 'sales' || promoter?.level === 'STAFF' ? 'sales' : 'member';
    }
    const promoterOwnerIds = new Set<string>([String(actor.id)]);
    if (actor.role === 'member') this.store.state.promoters.filter((item: any) => String(item.userId || '') === String(actor.id)).forEach((item: any) => promoterOwnerIds.add(String(item.id)));
    const selfPurchase = promoterOwnerIds.has(String(targetUserId));
    if (selfPurchase && actor.role !== 'sales' && actor.role !== 'admin') beneficiaryKind = 'member';
    const totalAmountFen = amountFen + freightFen;
    const order: Order = { id: this.store.newId('order'), orderNo: `JZ${Date.now().toString().slice(-10)}`, userId: targetUserId, items, amount, freight, totalAmount: totalAmountFen / 100, amountFen, freightFen, totalAmountFen, status: 'pending_payment', statusText: statusText.pending_payment, address: input.address, prescriptionId: input.prescriptionId, patientId: input.patientId, promoterId, idempotencyKey: actor.idempotencyKey, createdAt: this.store.timestamp() };
    (order as any).beneficiaryKind = beneficiaryKind;
    (order as any).selfPurchase = selfPurchase;
    this.store.state.orders.unshift(order);
    items.forEach((item: any) => this.reserveInventory(item.productId, item.quantity, order.id, item.skuId));
    if (input.prescriptionId) {
      const prescription = this.store.findPrescription(input.prescriptionId)!;
      prescription.status = 'used';
      prescription.statusText = '已占用待支付';
      prescription.usedAt = this.store.timestamp();
    }
    if (actor.idempotencyKey) this.idempotency.set(actor.idempotencyKey, order.id);
    if (order.promoterId || beneficiaryKind === 'company') {
      const customer = this.store.state.customers.find((item) => item.id === targetUserId);
      const ownerLabel = beneficiaryKind === 'company' ? 'company' : order.promoterId;
      if (!customer) this.store.state.customers.push({ id: targetUserId, name: input.address?.name || '微信客户', promoter: ownerLabel, lastOrder: items[0].name, amount: order.totalAmount, amountFen: order.totalAmountFen, tags: [] });
      else {
        const currentFen = Number((customer as any).amountFen ?? Math.round(Number(customer.amount || 0) * 100));
        (customer as any).amountFen = currentFen + Number(order.totalAmountFen || 0);
        customer.amount = Number((customer as any).amountFen) / 100;
        customer.lastOrder = items[0].name;
      }
      (order as any).customerAmountApplied = true;
      const relationExists = this.store.state.promoterRelations.some((item) => item.customerId === targetUserId && item.active);
      if (order.promoterId && !relationExists) this.store.state.promoterRelations.push({ id: this.store.newId('rel'), promoterId: order.promoterId, customerId: targetUserId, source: actor.role === 'sales' ? 'sales-order' : 'share-link', active: true, createdAt: this.store.timestamp() });
      const attributionExists = this.store.state.customerAttributions.some((item: any) => String(item.customerId) === targetUserId && item.active !== false);
      if (!attributionExists) this.store.state.customerAttributions.push({ id: this.store.newId('attr'), customerId: targetUserId, ownerKind: beneficiaryKind, ownerPromoterId: order.promoterId, source: actor.role === 'sales' ? 'sales-order' : (input.promoterId || input.promoter ? 'share-link' : 'company-default'), active: true, boundAt: this.store.timestamp() });
      const performancePromoterId = beneficiaryKind === 'company' ? 'company' : (selfPurchase ? String(this.store.state.promoters.find((item: any) => String(item.userId || '') === String(actor.id))?.id || actor.id) : order.promoterId);
      this.store.state.performanceLedger.push({ id: this.store.newId('performance'), orderId: order.id, customerId: targetUserId, promoterId: performancePromoterId, amountFen: totalAmountFen, selfPurchase, kind: selfPurchase ? 'self' : 'direct', period: this.store.timestamp().slice(0, 7), createdAt: this.store.timestamp() });
      if (order.promoterId && !selfPurchase) {
        const promoter = this.store.state.promoters.find((item) => item.id === order.promoterId && item.active !== false);
        if (promoter) {
          const rules = this.store.state.commissionRules;
          items.forEach((item: any) => {
            const promoterType = String(promoter.level || (promoter.type === 'sales' ? 'STAFF' : 'ORDINARY_MEMBER'));
            const rule = rules.find((entry) => entry.productId === item.productId && entry.promoterType === promoterType && entry.enabled !== false);
            if (!rule) return;
            const commissionFen = Number(rule.fixedFen || 0) > 0
              ? Number(rule.fixedFen) * item.quantity
              : Math.round(Number(item.unitPriceFen || Math.round(item.unitPrice * 100)) * item.quantity * Number(rule.rate || 0));
            this.store.state.commissions.unshift({ id: this.store.newId('commission'), orderId: order.id, orderItemId: `${order.id}:${item.productId}:${item.skuId || 'default'}`, promoterId: order.promoterId, beneficiaryKind, source: `${item.name} × ${item.quantity}`, amount: commissionFen / 100, amountFen: commissionFen, baseAmountFen: Number(item.unitPriceFen || Math.round(item.unitPrice * 100)) * item.quantity, ruleId: rule.id, status: 'pending', statusText: '待生效', date: order.createdAt, effectiveAt: undefined });
          });
        }
      }
      if (beneficiaryKind === 'company' && !selfPurchase) {
        const companyRules = rulesForCompany(this.store.state.commissionRules, items);
        companyRules.forEach(({ item, rule }: any) => {
          const commissionFen = Number(rule.fixedFen || 0) > 0 ? Number(rule.fixedFen) * item.quantity : Math.round(Number(item.unitPriceFen || 0) * item.quantity * Number(rule.rate || 0));
          if (commissionFen > 0) this.store.state.commissions.unshift({ id: this.store.newId('commission'), orderId: order.id, promoterId: 'company', beneficiaryKind: 'company', source: `${item.name} × ${item.quantity}`, amount: commissionFen / 100, amountFen: commissionFen, baseAmountFen: Number(item.unitPriceFen || 0) * item.quantity, ruleId: rule.id, status: 'pending', statusText: '待生效', date: order.createdAt, effectiveAt: undefined });
        });
      }
    }
    this.store.addAudit(actor.id, actor.role, 'order.create', 'order', order.id, { totalAmount: order.totalAmount });
    return order;
  }

  updateOrder(orderId: string, action: string, actor: { id: string; role: Role }, input: any = {}) {
    const order = this.store.findOrder(orderId); if (!order) throw new NotFoundException('订单不存在');
    if (action === 'ship' && !['admin', 'fulfillment'].includes(actor.role)) throw new ForbiddenException('无发货权限');
    if (['pay', 'cancel', 'receive'].includes(action) && order.userId !== actor.id && !['admin', 'fulfillment'].includes(actor.role)) throw new ForbiddenException('无订单操作权限');
    if (action === 'pay' && process.env.NODE_ENV === 'production' && input?.source !== 'payment_callback') throw new ForbiddenException('订单只能由支付回调确认');
    if (action === 'pay' && order.status === 'pending_payment') {
      order.status = 'paid'; order.statusText = statusText.paid; order.paidAt = this.store.timestamp();
      const paidAt = order.paidAt;
      const transactionId = input?.transactionId ? String(input.transactionId) : undefined;
      order.payment = { provider: String(input?.provider || 'manual'), status: 'paid', amountFen: Number(order.totalAmountFen ?? Math.round(order.totalAmount * 100)), transactionId, paidAt };
      const payment = this.store.state.payments.find((entry: any) => entry.orderId === order.id) as any;
      if (payment) Object.assign(payment, { status: 'paid', transactionId, paidAt });
      else this.store.state.payments.unshift({ id: this.store.newId('payment'), orderId: order.id, provider: order.payment.provider, amountFen: order.payment.amountFen, status: 'paid', transactionId, paidAt, createdAt: paidAt });
      order.items.forEach((item) => this.consumeInventory(item.productId, item.quantity, order.id, item.skuId));
    }
    else if (action === 'pay' && order.status === 'paid') {
      const existingTransactionId = String(order.payment?.transactionId || '');
      if (input?.transactionId && existingTransactionId && existingTransactionId !== String(input.transactionId)) throw new BadRequestException('订单已绑定其他支付流水');
      return order;
    }
    else if (action === 'cancel' && order.status === 'pending_payment') {
      order.status = 'cancelled'; order.statusText = statusText.cancelled;
      order.items.forEach((item) => this.releaseInventory(item.productId, item.quantity, order.id, item.skuId));
      this.store.state.performanceLedger.filter((row: any) => String(row.orderId) === String(order.id) && row.status !== 'cancelled').forEach((row: any) => { row.status = 'cancelled'; row.cancelledAt = this.store.timestamp(); });
      this.store.state.commissions.filter((item: any) => String(item.orderId) === String(order.id) && ['pending', 'held'].includes(String(item.status))).forEach((item: any) => { item.status = 'void'; item.statusText = '订单已取消'; item.voidedAt = this.store.timestamp(); });
      if ((order as any).customerAmountApplied) {
        const customer: any = this.store.state.customers.find((item) => item.id === order.userId);
        if (customer) { customer.amountFen = Math.max(0, Number(customer.amountFen ?? Math.round(Number(customer.amount || 0) * 100)) - Number(order.totalAmountFen || 0)); customer.amount = customer.amountFen / 100; }
        delete (order as any).customerAmountApplied;
      }
      if (order.prescriptionId) { const prescription = this.store.findPrescription(order.prescriptionId); if (prescription?.status === 'used') { prescription.status = 'approved'; prescription.statusText = '审核通过'; delete prescription.usedAt; } }
    }
    else if (action === 'cancel' && order.status === 'cancelled') return order;
    else if (action === 'ship' && order.status === 'paid') { if (!input.carrier || !input.trackingNo) throw new BadRequestException('发货需要填写快递公司和单号'); order.status = 'shipped'; order.statusText = statusText.shipped; order.shippedAt = this.store.timestamp(); order.shipment = { carrier: input.carrier, trackingNo: input.trackingNo, status: '已揽收' }; }
    else if (action === 'receive' && order.status === 'shipped') { order.status = 'completed'; order.statusText = statusText.completed; order.receivedAt = this.store.timestamp(); }
    else throw new BadRequestException('订单状态不允许该操作');
    this.store.addAudit(actor.id, actor.role, `order.${action}`, 'order', order.id);
    return order;
  }

  previewOrder(input: any, actor: { id: string; role: Role }) {
    if (!Array.isArray(input?.items) || input.items.length === 0) throw new BadRequestException('订单不能为空');
    if (['consumer', 'member'].includes(actor.role)) {
      const user: any = this.store.state.users.find((entry) => entry.id === actor.id);
      if (user && !user.phoneMasked && !user.phone) throw new BadRequestException('请先绑定手机号');
    }
    const addressId = String(input.addressId || input.address?.id || '');
    if (addressId && !this.store.state.addresses.some((entry) => entry.id === addressId && entry.userId === actor.id)) throw new ForbiddenException('收货地址不属于当前用户');
    const requested = new Map<string, { productId: string; skuId?: string; quantity: number }>();
    input.items.forEach((line: any) => {
      const productId = String(line?.productId || '');
      const skuId = line?.skuId ? String(line.skuId) : undefined;
      const quantity = Number(line?.quantity);
      if (!productId || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new BadRequestException('商品数量不合法');
      const key = `${productId}::${skuId || 'default'}`;
      const previous = requested.get(key);
      requested.set(key, { productId, skuId, quantity: (previous?.quantity || 0) + quantity });
    });
    const items = Array.from(requested.values()).map(({ productId, skuId, quantity }) => {
      const product = this.product(productId);
      if (!product.active) throw new BadRequestException('商品已下架');
      const sku: any = skuId ? this.store.state.skus.find((row: any) => row.id === skuId && row.productId === product.id && row.active !== false) : this.store.state.skus.find((row: any) => row.productId === product.id && row.id === `${product.id}-default` && row.active !== false);
      if (skuId && !sku) throw new BadRequestException('商品规格不存在或已停用');
      if (this.availableStock(product.id, sku?.stock ?? product.stock, sku?.id) < quantity) throw new BadRequestException(`${product.name}库存不足`);
      return { productId: product.id, skuId: sku?.id, skuName: sku?.name, name: product.name, category: product.category, quantity, unitPriceFen: Number(sku?.priceFen ?? product.priceFen ?? Math.round(product.price * 100)) };
    });
    const hasPrescription = items.some((item) => item.category === 'prescription');
    const hasDaily = items.some((item) => item.category === 'daily');
    if (hasPrescription && hasDaily) throw new BadRequestException('处方商品和普通商品需分开下单');
    if (hasPrescription) {
      const prescription = input.prescriptionId ? this.store.findPrescription(String(input.prescriptionId)) : undefined;
      if (!prescription || prescription.status !== 'approved' || prescription.userId !== actor.id || prescription.usedAt) throw new BadRequestException('缺少有效处方');
      if (!prescription.validUntil || Date.parse(`${String(prescription.validUntil).slice(0, 10)}T23:59:59.999Z`) < Date.now()) throw new BadRequestException('处方已过期');
      if (prescription.itemName && !items.some((item) => String(prescription.itemName).includes(item.name) || item.name.includes(String(prescription.itemName)))) throw new BadRequestException('处方品种与订单不匹配');
    }
    const amountFen = items.reduce((sum, item) => sum + item.unitPriceFen * item.quantity, 0);
    const freightFen = amountFen >= Number(this.store.state.settings.shippingFreeThresholdFen || 19900) ? 0 : Number(this.store.state.settings.shippingFeeFen || 800);
    return { items, amountFen, freightFen, totalAmountFen: amountFen + freightFen, amount: amountFen / 100, freight: freightFen / 100, totalAmount: (amountFen + freightFen) / 100 };
  }

  beginRefund(orderId: string, actor: { id: string; role: Role }, aftersaleId?: string, amountFen?: number) {
    if (!['admin', 'fulfillment'].includes(actor.role)) throw new ForbiddenException('无退款权限');
    const order = this.store.findOrder(orderId); if (!order) throw new NotFoundException('订单不存在');
    if (!['paid', 'shipped', 'completed', 'refunding'].includes(order.status)) throw new BadRequestException('当前订单不可退款');
    const refunds = this.store.state.refunds as Array<Record<string, unknown>>;
    const existing = refunds.find((item) => String(item.orderId) === order.id && ['processing', 'succeeded'].includes(String(item.status)));
    if (existing) return existing;
    const retry = refunds.find((item: any) => String(item.orderId) === order.id && item.status === 'failed');
    const refund: any = retry || { id: this.store.newId('refund'), orderId: order.id, aftersaleId, amountFen: Number(amountFen || order.totalAmountFen || Math.round(order.totalAmount * 100)), status: 'processing', provider: 'manual', previousOrderStatus: order.status, idempotencyKey: `refund:${order.id}:${aftersaleId || 'direct'}`, createdAt: this.store.timestamp() };
    if (retry) { refund.status = 'processing'; refund.aftersaleId = aftersaleId || refund.aftersaleId; refund.amountFen = Number(amountFen || refund.amountFen); refund.previousOrderStatus = order.status; refund.updatedAt = this.store.timestamp(); }
    if (!retry) refunds.unshift(refund);
    if (order.status !== 'refunding') { order.status = 'refunding'; order.statusText = statusText.refunding; }
    this.store.state.outbox.unshift({ id: this.store.newId('task'), provider: 'wechat-pay', type: 'refund', referenceId: refund.id, payload: refund, status: 'pending', createdAt: this.store.timestamp() });
    this.store.addAudit(actor.id, actor.role, 'refund.begin', 'refund', String(refund.id), { orderId, amountFen: refund.amountFen });
    return refund;
  }

  confirmRefund(refundId: string, actor: { id: string; role: Role }, result: { status: 'succeeded' | 'failed'; provider?: string; transactionId?: string }) {
    if (!['admin', 'fulfillment'].includes(actor.role)) throw new ForbiddenException('无退款权限');
    const refund: any = (this.store.state.refunds as Array<Record<string, unknown>>).find((item) => String(item.id) === refundId);
    if (!refund) throw new NotFoundException('退款记录不存在');
    if (refund.status === 'succeeded') return refund;
    refund.status = result.status; refund.provider = result.provider || refund.provider; refund.transactionId = result.transactionId || refund.transactionId; refund.updatedAt = this.store.timestamp();
    const order = this.store.findOrder(String(refund.orderId));
    if (order && result.status === 'succeeded') {
      const previousStatus = String(refund.previousOrderStatus || order.status);
      order.status = 'refunded'; order.statusText = statusText.refunded;
      if (['paid', 'refunding'].includes(previousStatus)) order.items.forEach((line) => this.restoreInventory(line.productId, line.quantity, String(refund.id), line.skuId));
      const refundRatio = Math.min(1, Number(refund.amountFen || 0) / Math.max(1, Number(order.totalAmountFen || Math.round(order.totalAmount * 100))));
      this.store.state.commissions.filter((item: any) => item.orderId === order.id && ['pending', 'eligible', 'settled', 'held'].includes(item.status)).forEach((item: any) => {
        const originalFen = Number(item.amountFen || Math.round(Number(item.amount || 0) * 100));
        const reversedFen = Math.min(originalFen, Math.max(1, Math.round(originalFen * refundRatio)));
        const previousStatus = String(item.status);
        item.reversedAmountFen = Number(item.reversedAmountFen || 0) + reversedFen;
        item.amountFen = Math.max(0, originalFen - reversedFen);
        item.amount = item.amountFen / 100;
        item.reversedAt = this.store.timestamp();
        if (item.amountFen === 0) { item.status = 'reversed'; item.statusText = '退款扣回'; }
        else { item.statusText = '部分退款扣回'; }
        if (String(item.promoterId || '') !== 'company' && ['settled', 'held'].includes(previousStatus)) this.store.state.rewardWallet.push({ id: this.store.newId('wallet'), promoterId: String(item.promoterId), kind: 'reversal', amountFen: -reversedFen, referenceId: refund.id, createdAt: this.store.timestamp() });
      });
      const aftersale: any = refund.aftersaleId ? this.store.state.aftersales.find((item: any) => item.id === refund.aftersaleId) : undefined;
      if (aftersale) { aftersale.status = 'refunded'; aftersale.statusText = '已退款'; aftersale.refundedAt = this.store.timestamp(); }
    } else if (order && result.status === 'failed') {
      const previousStatus = String(refund.previousOrderStatus || 'paid') as keyof typeof statusText;
      order.status = (previousStatus in statusText ? previousStatus : 'paid') as OrderStatus; order.statusText = statusText[order.status];
      const aftersale: any = refund.aftersaleId ? this.store.state.aftersales.find((item: any) => item.id === refund.aftersaleId) : undefined;
      if (aftersale) { aftersale.status = 'approved'; aftersale.statusText = '退款失败，待重新处理'; }
    }
    this.store.addAudit(actor.id, actor.role, `refund.${result.status}`, 'refund', refundId, { orderId: refund.orderId });
    return refund;
  }

  listOrders(query: { status?: string; userId?: string; keyword?: string; from?: string; to?: string }) {
    const keyword = String(query.keyword || '').trim().toLowerCase();
    const from = query.from ? Date.parse(`${query.from}T00:00:00.000Z`) : undefined;
    const to = query.to ? Date.parse(`${query.to}T23:59:59.999Z`) : undefined;
    return this.store.state.orders.filter((item) => {
      const createdAt = Date.parse(item.createdAt);
      const searchable = `${item.orderNo} ${item.userId} ${item.address?.name || ''} ${item.address?.phone || ''}`.toLowerCase();
      return (!query.status || query.status === 'all' || item.status === query.status)
        && (!query.userId || item.userId === query.userId)
        && (!keyword || searchable.includes(keyword))
        && (from === undefined || createdAt >= from)
        && (to === undefined || createdAt <= to);
    });
  }

  listPrescriptions(actor: { id: string; role: Role }) {
    if (actor.role === 'admin' || actor.role === 'pharmacist') return this.store.state.prescriptions;
    if (actor.role === 'sales') {
      const customerIds = new Set(this.store.state.promoterRelations.filter((item) => item.promoterId === actor.id && item.active).map((item) => item.customerId));
      return this.store.state.prescriptions.filter((item) => customerIds.has(item.userId)).map((item) => ({ ...item, patientName: item.patientName ? `${item.patientName.slice(0, 1)}女士` : '已脱敏', idNo: undefined }));
    }
    return this.store.state.prescriptions.filter((item) => item.userId === actor.id);
  }

  reconcileScheduledJobs(actor: { id: string; role: Role }) {
    if (actor.role !== 'admin') throw new ForbiddenException('只有管理员可以执行订单补偿任务');
    const nowValue = Date.now();
    let cancelled = 0;
    let received = 0;
    let rewardsActivated = 0;
    const cancelMinutes = Number(this.store.state.settings.autoCancelMinutes || 30);
    const receiveDays = Number(this.store.state.settings.autoReceiveDays || 7);
    const rewardActivationDays = Number(this.store.state.settings.rewardActivationDays || 7);
    this.store.state.orders.forEach((order) => {
      const age = nowValue - Date.parse(order.createdAt);
      if (order.status === 'pending_payment' && age >= cancelMinutes * 60 * 1000) { this.updateOrder(order.id, 'cancel', actor); cancelled += 1; }
      if (order.status === 'shipped' && order.shippedAt && nowValue - Date.parse(order.shippedAt) >= receiveDays * 24 * 60 * 60 * 1000) { this.updateOrder(order.id, 'receive', actor); received += 1; }
    });
    this.store.state.commissions.filter((item: any) => item.status === 'pending' && item.orderId).forEach((commission: any) => {
      const order = this.store.findOrder(commission.orderId);
      const hasAfterSale = this.store.state.aftersales.some((item: any) => item.orderId === commission.orderId && ['pending_review', 'approved', 'refunding'].includes(item.status));
      if (order?.status === 'completed' && order.receivedAt && nowValue - Date.parse(order.receivedAt) >= rewardActivationDays * 24 * 60 * 60 * 1000 && !hasAfterSale) { commission.status = 'eligible'; commission.statusText = '可结算'; commission.effectiveAt = this.store.timestamp(); rewardsActivated += 1; }
    });
    return { cancelled, received, rewardsActivated, executedAt: this.store.timestamp() };
  }

  createPrescription(input: any, actor: { id: string; role: Role }) {
    const patient = input.patientId
      ? this.store.state.patients.find((entry) => entry.id === String(input.patientId) && entry.userId === actor.id)
      : this.store.state.patients.find((entry) => entry.userId === actor.id && entry.name === String(input.patientName || ''));
    if (!patient) throw new BadRequestException('处方必须绑定当前用户的实名就诊人');
    if (!input.fileKey) throw new BadRequestException('请上传处方凭证');
    const file: any = this.store.findFile(String(input.fileKey));
    if (!file || file.purpose !== 'prescription' || String(file.ownerId) !== actor.id) throw new ForbiddenException('处方凭证不属于当前用户');
    const item = { id: this.store.newId('rx'), userId: actor.id, patientId: String(patient.id), patientName: String(patient.name), source: input.source === 'internet_hospital' ? 'internet_hospital' as const : 'offline' as const, status: 'pending_review' as const, statusText: '待审核', fileKey: String(input.fileKey) };
    this.store.state.prescriptions.unshift(item);
    this.store.addAudit(actor.id, actor.role, 'prescription.submit', 'prescription', item.id);
    return item;
  }

  reviewPrescription(id: string, input: any, actor: { id: string; role: Role }) {
    const item = this.store.findPrescription(id); if (!item) throw new NotFoundException('处方不存在');
    if (!['pharmacist', 'admin'].includes(actor.role)) throw new ForbiddenException('无处方审核权限');
    if (input.approved) {
      if (!input.itemName || !String(input.validUntil || '').trim()) throw new BadRequestException('审核通过必须填写处方品种和有效期');
      const validUntil = Date.parse(`${String(input.validUntil).slice(0, 10)}T23:59:59.999Z`);
      if (!Number.isFinite(validUntil) || validUntil < Date.now()) throw new BadRequestException('处方有效期必须晚于当前时间');
      item.itemName = String(input.itemName);
      if (input.productId) {
        const product = this.store.findProduct(String(input.productId));
        if (!product || product.category !== 'prescription') throw new BadRequestException('处方品种不存在或不是处方商品');
        item.productId = product.id;
        item.skuId = input.skuId ? String(input.skuId) : undefined;
      }
      item.validUntil = String(input.validUntil).slice(0, 10);
    } else {
      item.itemName = input.itemName || item.itemName;
      item.validUntil = input.validUntil || item.validUntil;
    }
    item.status = input.approved ? 'approved' : 'rejected'; item.statusText = input.approved ? '审核通过' : '审核拒绝'; item.reviewerId = actor.id; item.reviewedAt = this.store.timestamp();
    this.store.addAudit(actor.id, actor.role, 'prescription.review', 'prescription', item.id, { approved: input.approved });
    return item;
  }

  salesOverview(userId = 'u-demo') {
    const promoterIds = new Set<string>([String(userId), ...this.store.state.promoters.filter((item: any) => String(item.userId || '') === String(userId)).map((item: any) => String(item.id))]);
    const direct = this.store.state.customers.filter((item: any) => promoterIds.has(String(item.promoter || item.promoterId || '')) || this.store.state.customerAttributions.some((attribution: any) => attribution.active !== false && promoterIds.has(String(attribution.ownerPromoterId)) && String(attribution.customerId) === String(item.id)));
    const commission = this.store.state.commissions.filter((item) => promoterIds.has(String(item.promoterId)));
    const earnedFen = commission.filter((item) => ['eligible', 'settled'].includes(String(item.status))).reduce((sum, item: any) => sum + Number(item.amountFen ?? Math.round(Number(item.amount || 0) * 100)), 0);
    const withdrawalFen = this.store.state.withdrawals.filter((item: any) => String(item.userId || item.promoterId) === String(userId) && ['pending_review', 'approved', 'processing', 'manual_review', 'paid'].includes(String(item.status))).reduce((sum, item: any) => sum + Number(item.amountFen ?? Math.round(Number(item.amount || 0) * 100)), 0);
    const balanceFen = Math.max(0, earnedFen - withdrawalFen);
    const performanceFen = this.store.state.performanceLedger.filter((item: any) => promoterIds.has(String(item.promoterId))).reduce((sum, item: any) => sum + Number(item.amountFen || 0), 0);
    const withdrawThresholdFen = Number(this.store.state.settings.withdrawThresholdFen || 50000);
    return { directCustomers: direct, commission, balance: balanceFen / 100, balanceFen, earnedFen, performanceFen, performance: performanceFen / 100, withdrawThreshold: withdrawThresholdFen / 100, withdrawThresholdFen, settlementDay: '每周一' };
  }

  async applyMember(input: any, actor: { id: string; role: Role }) {
    const token = String(input.referrerPromoterId || input.recommender || '').trim();
    const exact = token ? this.store.state.promoters.find((item: any) => String(item.id) === token && item.active !== false) : undefined;
    const nameMatches = token ? this.store.state.promoters.filter((item: any) => item.active !== false && String(item.name || '').trim().toLowerCase() === token.toLowerCase()) : [];
    if (token && !exact && nameMatches.length !== 1) throw new BadRequestException(nameMatches.length > 1 ? '推荐人姓名对应多个推广人，请填写推广编号' : '推荐人不存在或已停用');
    const referrer = exact || nameMatches[0];
    if (this.store.state.memberApplications.some((row: any) => String(row.userId) === String(actor.id) && ['pending', 'pending_review', 'review'].includes(String(row.status).toLowerCase()))) throw new BadRequestException('已有待审核的会员申请');
    const item = { id: this.store.newId('member'), userId: actor.id, name: String(input.name || '').trim(), phone: String(input.phone || '').trim(), recommender: input.recommender, referrerPromoterId: referrer?.id, sourceType: referrer ? 'referral' : 'direct', status: 'pending', statusText: '待审核', createdAt: this.store.timestamp() };
    if (!item.name || !item.phone) throw new BadRequestException('姓名和手机号不能为空');
    return this.store.runAtomic(async () => { this.store.state.memberApplications.unshift(item); this.store.addAudit(actor.id, actor.role, 'member.apply', 'member_application', item.id, { referrerPromoterId: referrer?.id, sourceType: item.sourceType }); return item; });
  }
  createWithdrawal(input: any, actor: { id: string; role: Role }) {
    if (!['member', 'sales'].includes(actor.role)) throw new ForbiddenException('只有推广人可以提现');
    const amountFen = input.amountFen !== undefined ? Number(input.amountFen) : Math.round(Number(input.amount) * 100);
    const overview = this.salesOverview(actor.id);
    if (!Number.isInteger(amountFen) || amountFen < overview.withdrawThresholdFen) throw new BadRequestException(`余额满${overview.withdrawThreshold}元后可提现`);
    if (amountFen > overview.balanceFen) throw new BadRequestException('提现金额超过可用余额');
    const item = { id: this.store.newId('withdraw'), userId: actor.id, amount: amountFen / 100, amountFen, status: 'pending_review', statusText: '待审核', createdAt: this.store.timestamp() };
    this.store.state.withdrawals.unshift(item); this.store.addAudit(actor.id, actor.role, 'withdrawal.create', 'withdrawal', item.id, { amountFen }); return item;
  }

  customers(actor: { id: string; role: Role }) { if (!['admin', 'sales'].includes(actor.role)) throw new BadRequestException('无客户档案权限'); return this.store.state.customers.filter((item) => actor.role === 'admin' || item.promoter === actor.id); }
  bindReferral(input: { promoterId?: string }, actor: { id: string; role: Role }) {
    const promoterId = String(input.promoterId || '');
    if (!promoterId || promoterId === actor.id) throw new BadRequestException('推广人不合法');
    const current = this.store.state.promoterRelations.find((item) => item.customerId === actor.id && item.active !== false);
    if (current) return current;
    const promoter = this.store.state.promoters.find((item) => item.id === promoterId && item.active !== false);
    if (!promoter) throw new BadRequestException('推广人不存在或已停用');
    const relation = { id: this.store.newId('rel'), promoterId, customerId: actor.id, source: 'share-link', active: true, createdAt: this.store.timestamp() };
    this.store.state.promoterRelations.push(relation);
    const user = this.store.state.users.find((item) => item.id === actor.id);
    if (!this.store.state.customerAttributions.some((item: any) => String(item.customerId) === actor.id && item.active !== false)) this.store.state.customerAttributions.push({ id: this.store.newId('attr'), customerId: actor.id, ownerKind: this.store.state.promoters.find((item: any) => String(item.id) === promoterId)?.type === 'sales' ? 'sales' : 'member', ownerPromoterId: promoterId, source: 'share-link', active: true, boundAt: this.store.timestamp() });
    if (!this.store.state.customers.some((item) => item.id === actor.id)) this.store.state.customers.push({ id: actor.id, name: String(user?.nickname || '微信客户'), promoter: promoterId, lastOrder: '', amount: 0, amountFen: 0, tags: [] });
    this.store.addAudit(actor.id, actor.role, 'promoter.referral.bind', 'promoter_relation', relation.id, { promoterId });
    return relation;
  }
  dashboard(actor?: { id: string; role: Role }) { if (actor && actor.role !== 'admin') throw new ForbiddenException('无后台概览权限'); const orders = this.store.state.orders; return { orders: orders.length, paidOrders: orders.filter((item) => ['paid', 'shipped', 'completed'].includes(item.status)).length, salesAmount: orders.reduce((sum, item) => sum + (item.status === 'cancelled' ? 0 : item.totalAmount), 0), prescriptionsPending: this.store.state.prescriptions.filter((item) => item.status === 'pending_review').length, withdrawalsPending: this.store.state.withdrawals.filter((item: any) => item.status === 'pending_review').length, newCustomers: this.store.state.customers.length }; }

  articleCoverImage(article: any) {
    const fallback = `/assets/articles/generated/${article.category || article.tag || 'daily-health'}.webp`;
    if (article.coverMode !== 'custom') return article.coverKey || fallback;
    const file: any = this.store.findFile(String(article.coverKey || ''));
    if (!file || file.purpose !== 'article-cover') return fallback;
    if (file.data) return `data:${file.mimeType};base64,${file.data}`;
    const base = process.env.PUBLIC_API_BASE_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:3002');
    return `${base}/api/v1/content/articles/${encodeURIComponent(String(article.id))}/cover`;
  }

  content(query: { category?: string; keyword?: string; recommended?: string | boolean } = {}) {
    const keyword = String(query.keyword || '').trim().toLowerCase();
    const recommendedOnly = query.recommended === true || ['1', 'true', 'yes'].includes(String(query.recommended || '').toLowerCase());
    return this.store.state.articles.filter((article: any) => article.published !== false)
      .filter((article: any) => !query.category || String(article.category || article.tag) === String(query.category))
      .filter((article: any) => !recommendedOnly || article.recommended === true)
      .filter((article: any) => !keyword || `${article.title} ${article.summary || ''}`.toLowerCase().includes(keyword))
      .sort((a: any, b: any) => Number(Boolean(b.recommended)) - Number(Boolean(a.recommended)) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
      .map((article: any) => ({ ...article, coverImage: this.articleCoverImage(article) }));
  }
  banners(query: { active?: string | boolean } = {}) {
    const activeOnly = query.active === undefined || query.active === true || ['1', 'true', 'yes'].includes(String(query.active || '').toLowerCase());
    return this.store.state.banners.filter((banner: any) => !activeOnly || banner.active !== false).sort((a: any, b: any) => Number(a.sort || 0) - Number(b.sort || 0)).map((banner: any, index: number) => {
      const file: any = this.store.findFile(String(banner.imageKey || ''));
      const publicBase = process.env.PUBLIC_API_BASE_URL || (process.env.NODE_ENV === 'production' ? '' : 'http://127.0.0.1:3002');
      const fileImage = file?.purpose === 'banner' && file.data ? `data:${file.mimeType};base64,${file.data}` : (file?.purpose === 'banner' ? `${publicBase}/api/v1/content/banners/${encodeURIComponent(String(file.id))}/image` : undefined);
      return { ...banner, image: banner.image || fileImage || banner.imageKey, imageUrl: fileImage, subtitle: banner.subtitle || (banner.mode === 'default' && index === 0 ? '把日常健康，交给长期记录' : banner.mode === 'default' ? '有效处方 · 药师审核 · 直服不煎煮' : ''), tone: banner.tone || (index % 2 === 0 ? 'teal' : 'amber') };
    });
  }
  auditLogs(actor?: { id: string; role: Role }) { if (actor && actor.role !== 'admin') throw new ForbiddenException('无审计日志权限'); return this.store.state.auditLogs.slice(0, 200); }

  private availableStock(productId: string, fallback: number, skuId?: string) {
    const batches = this.store.state.inventoryBatches.filter((row: any) => row.productId === productId && (!skuId || row.skuId === skuId) && row.active !== false && (!row.expiresAt || Date.parse(`${String(row.expiresAt).slice(0, 10)}T23:59:59.999Z`) >= Date.now()));
    if (!batches.length) return Number(fallback || 0);
    return batches.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.quantity || 0) - Number(row.reservedQuantity || 0)), 0);
  }

  private reserveInventory(productId: string, quantity: number, referenceId: string, skuId?: string) {
    const batches = this.store.state.inventoryBatches.filter((row: any) => row.productId === productId && (!skuId || row.skuId === skuId) && row.active !== false && (!row.expiresAt || Date.parse(`${String(row.expiresAt).slice(0, 10)}T23:59:59.999Z`) >= Date.now())).sort((a: any, b: any) => String(a.expiresAt || '').localeCompare(String(b.expiresAt || '')));
    if (!batches.length) { const sku: any = skuId ? this.store.state.skus.find((row: any) => row.id === skuId) : undefined; const product = this.store.findProduct(productId); if (sku) sku.stock = Math.max(0, Number(sku.stock || 0) - quantity); else if (product) product.stock -= quantity; return; }
    let remaining = quantity;
    for (const batch of batches as any[]) {
      const available = Math.max(0, Number(batch.quantity || 0) - Number(batch.reservedQuantity || 0));
      const reserved = Math.min(available, remaining);
      batch.reservedQuantity = Number(batch.reservedQuantity || 0) + reserved;
      if (reserved) this.store.state.inventoryMovements.unshift({ id: this.store.newId('movement'), productId, skuId: batch.skuId, batchId: batch.id, quantity: reserved, kind: 'reserve', referenceId, createdAt: this.store.timestamp() });
      remaining -= reserved;
      if (!remaining) break;
    }
    if (remaining) throw new BadRequestException('库存不足');
    const product = this.store.findProduct(productId); if (product) product.stock = this.availableStock(productId, product.stock);
  }

  private consumeInventory(productId: string, quantity: number, referenceId: string, skuId?: string) {
    const batches = this.store.state.inventoryBatches.filter((row: any) => row.productId === productId && (!skuId || row.skuId === skuId) && row.active !== false).sort((a: any, b: any) => String(a.expiresAt || '').localeCompare(String(b.expiresAt || '')));
    if (!batches.length) return;
    let remaining = quantity;
    for (const batch of batches as any[]) {
      const reserved = Math.min(Number(batch.reservedQuantity || 0), remaining);
      if (!reserved) continue;
      batch.reservedQuantity -= reserved; batch.quantity = Math.max(0, Number(batch.quantity || 0) - reserved);
      this.store.state.inventoryMovements.unshift({ id: this.store.newId('movement'), productId, skuId: batch.skuId, batchId: batch.id, quantity: -reserved, kind: 'consume', referenceId, createdAt: this.store.timestamp() });
      remaining -= reserved;
      if (!remaining) break;
    }
    const product = this.store.findProduct(productId); if (product) product.stock = this.availableStock(productId, product.stock);
  }

  private releaseInventory(productId: string, quantity: number, referenceId: string, skuId?: string) {
    const batches = this.store.state.inventoryBatches.filter((row: any) => row.productId === productId && (!skuId || row.skuId === skuId) && row.active !== false);
    if (!batches.length) { const sku: any = skuId ? this.store.state.skus.find((row: any) => row.id === skuId) : undefined; const product = this.store.findProduct(productId); if (sku) sku.stock += quantity; else if (product) product.stock += quantity; return; }
    let remaining = quantity;
    for (const batch of batches as any[]) {
      const released = Math.min(Number(batch.reservedQuantity || 0), remaining);
      if (!released) continue;
      batch.reservedQuantity -= released;
      this.store.state.inventoryMovements.unshift({ id: this.store.newId('movement'), productId, skuId: batch.skuId, batchId: batch.id, quantity: released, kind: 'release', referenceId, createdAt: this.store.timestamp() });
      remaining -= released;
      if (!remaining) break;
    }
    const product = this.store.findProduct(productId); if (product) product.stock = this.availableStock(productId, product.stock);
  }

  private restoreInventory(productId: string, quantity: number, referenceId: string, skuId?: string) {
    const batches = this.store.state.inventoryBatches.filter((row: any) => row.productId === productId && (!skuId || row.skuId === skuId) && row.active !== false);
    if (!batches.length) { const sku: any = skuId ? this.store.state.skus.find((row: any) => row.id === skuId) : undefined; const product = this.store.findProduct(productId); if (sku) sku.stock += quantity; else if (product) product.stock += quantity; return; }
    const batch: any = batches[0]; batch.quantity = Number(batch.quantity || 0) + quantity;
    this.store.state.inventoryMovements.unshift({ id: this.store.newId('movement'), productId, skuId: batch.skuId, batchId: batch.id, quantity, kind: 'refund', referenceId, createdAt: this.store.timestamp() });
    const product = this.store.findProduct(productId); if (product) product.stock = this.availableStock(productId, product.stock);
  }
}
