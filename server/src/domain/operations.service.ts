import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'crypto';
import { MemoryStore } from './memory.store';
import { Role } from './types';
import { decryptField, encryptField } from '../security/field-crypto';
import { BusinessService } from './business.service';

type Actor = { id: string; role: Role };

type ListResult<T> = T[] | { items: T[]; total: number; page: number; pageSize: number };

const ARTICLE_CATEGORIES = new Set([
  'prescription-guide', 'clinic-service', 'food-origin', 'nutrition',
  'daily-health', 'service-guide', 'member-sharing'
]);
const SYSTEM_ARTICLE_COVERS = new Set([
  '/assets/articles/generated/prescription-guide.webp',
  '/assets/articles/generated/clinic-service.webp',
  '/assets/articles/generated/food-origin.webp',
  '/assets/articles/generated/nutrition.webp',
  '/assets/articles/generated/daily-health.webp',
  '/assets/articles/generated/service-guide.webp',
  '/assets/articles/generated/member-sharing.webp',
]);

const DEFAULT_SETTINGS: Record<string, number | string | boolean> = {
  shippingFreeThresholdFen: 19900,
  shippingFeeFen: 800,
  autoCancelMinutes: 30,
  autoReceiveDays: 7,
  withdrawThresholdFen: 50000,
  rewardActivationDays: 7,
  settlementWeekday: 1,
  memberUpgradeThresholdFen: 30000000,
  promoterReleaseDays: 183,
  allowRelationshipTransfer: true
};

function requiredRewardTiers(set: any, tiers: any[]) {
  const defaults = ['SALES', 'MEMBER', 'COMPANY'].map((tier) => ({ tier, method: 'PERCENT', rateBps: 0, fixedFen: 0, active: true }));
  if (!set) return defaults;
  return defaults.map((fallback) => {
    const row = tiers.find((item: any) => String(item.ruleSetId) === String(set.id) && String(item.tier).toUpperCase() === fallback.tier);
    return row ? { tier: fallback.tier, method: String(row.method || 'PERCENT').toUpperCase(), rateBps: Number(row.rateBps || 0), fixedFen: Number(row.fixedFen || 0), active: row.active !== false } : fallback;
  });
}

@Injectable()
export class OperationsService {
  constructor(private readonly store: MemoryStore, private readonly business: BusinessService) {}

  private allow(actor: Actor, roles: Role[]) { if (!roles.includes(actor.role)) throw new ForbiddenException('无操作权限'); }

  /**
   * Consent is append-only.  A customer is authorised only when the newest
   * record for the consent type is a grant.  Looking for any historical grant
   * would make a later revoke ineffective.
   */
  private latestHealthConsent(userId: string, consentType?: string) {
    const at = (item: any) => Math.max(...['grantedAt', 'revokedAt', 'createdAt'].map((key) => Date.parse(String(item[key] || ''))).filter(Number.isFinite), 0);
    return this.store.state.healthConsents
      .map((item: any, index) => ({ item, index }))
      .filter(({ item }) => item.userId === userId && (!consentType || item.consentType === consentType))
      .sort((a, b) => at(b.item) - at(a.item) || b.index - a.index)
      .map(({ item }) => item)[0];
  }

  private hasHealthConsent(userId: string, consentType?: string) {
    return this.latestHealthConsent(userId, consentType)?.granted === true
      && !this.latestHealthConsent(userId, consentType)?.revokedAt;
  }

  private actorPromoterIds(actor: Actor) {
    const ids = new Set<string>([String(actor.id)]);
    this.store.state.promoters.filter((item: any) => String(item.userId || '') === String(actor.id)).forEach((item: any) => ids.add(String(item.id)));
    return ids;
  }

  private customerBelongsToActor(customer: any, actor: Actor) {
    const promoterIds = this.actorPromoterIds(actor);
    if (promoterIds.has(String(customer.promoter || customer.promoterId || ''))) return true;
    return this.store.state.promoterRelations.some((relation: any) => relation.active !== false
      && promoterIds.has(String(relation.promoterId)) && String(relation.customerId) === String(customer.id));
  }

  profile(actor: Actor) { const user = this.store.state.users.find((item) => item.id === actor.id) || { id: actor.id, nickname: '新用户', role: 'CONSUMER' }; return { id: user.id, nickname: user.nickname, phone: user.phoneMasked || user.phone, role: user.role, memberLevel: user.memberLevel }; }
  saveHealthConsent(input: any, actor: Actor) {
    if (!input?.version || !input?.consentType || typeof input.granted !== 'boolean') throw new BadRequestException('健康信息授权参数不完整');
    const now = this.store.timestamp();
    const item: any = {
      id: this.store.newId('consent'), userId: actor.id, version: String(input.version),
      consentType: String(input.consentType), granted: input.granted, grantedAt: now,
      ...(input.granted ? {} : { revokedAt: now })
    };
    this.store.state.healthConsents.push(item);
    this.store.addAudit(actor.id, actor.role, input.granted ? 'health-consent.grant' : 'health-consent.revoke', 'health_consent', item.id, { version: item.version, consentType: item.consentType });
    return item;
  }
  patients(actor: Actor) { return this.store.state.patients.filter((item) => item.userId === actor.id).map((item) => ({ id: item.id, name: item.name, idNoMasked: item.idNoMasked, phoneMasked: item.phoneMasked || item.phone, relation: item.relation, allergies: item.allergies, history: item.history })); }
  deletePatient(id: string, actor: Actor) {
    const index = this.store.state.patients.findIndex((item) => item.id === id && item.userId === actor.id);
    if (index < 0) throw new NotFoundException('就诊人不存在');
    const linked = this.store.state.prescriptions.some((item) => item.patientId === id && ['pending_review', 'approved'].includes(String(item.status)));
    if (linked) throw new BadRequestException('该就诊人存在有效处方，暂不能删除');
    this.store.state.patients.splice(index, 1);
    this.store.addAudit(actor.id, actor.role, 'patient.delete', 'patient', id);
    return { id, deleted: true };
  }
  addresses(actor: Actor) {
    return this.store.state.addresses.filter((item) => item.userId === actor.id).map((item: any) => ({
      id: item.id, name: item.name, phone: this.decryptPhone(item), detail: item.detail, isDefault: item.isDefault
    }));
  }
  deleteAddress(id: string, actor: Actor) {
    const index = this.store.state.addresses.findIndex((item) => item.id === id && item.userId === actor.id);
    if (index < 0) throw new NotFoundException('收货地址不存在');
    const wasDefault = Boolean(this.store.state.addresses[index].isDefault);
    this.store.state.addresses.splice(index, 1);
    if (wasDefault) {
      const next = this.store.state.addresses.find((item) => item.userId === actor.id);
      if (next) next.isDefault = true;
    }
    this.store.addAudit(actor.id, actor.role, 'address.delete', 'address', id);
    return { id, deleted: true };
  }
  saveProfile(input: any, actor: Actor) {
    const user: any = this.store.state.users.find((item) => item.id === actor.id);
    if (!user) throw new NotFoundException('用户不存在');
    if (input.nickname !== undefined) {
      const nickname = String(input.nickname).trim();
      if (!nickname || nickname.length > 40) throw new BadRequestException('昵称长度不合法');
      user.nickname = nickname;
    }
    if (input.avatarUrl !== undefined) user.avatarUrl = String(input.avatarUrl).slice(0, 500);
    this.store.addAudit(actor.id, actor.role, 'profile.save', 'user', actor.id, { fields: Object.keys(input || {}) });
    return this.profile(actor);
  }

  savePatient(input: any, actor: Actor) {
    if (!input?.name || (!input.id && !input.idNo) || (!input.id && !input.phone)) throw new BadRequestException('请完善就诊人实名信息');
    const existing: any = input.id ? this.store.state.patients.find((entry) => entry.id === String(input.id)) : undefined;
    if (input.id && (!existing || existing.userId !== actor.id)) throw new ForbiddenException('无就诊人修改权限');
    const idNo = input.idNo === undefined || input.idNo === null || input.idNo === ''
      ? undefined
      : String(input.idNo).trim();
    const phone = input.phone === undefined || input.phone === null || input.phone === ''
      ? undefined
      : String(input.phone).trim();
    if (idNo && /[*•]/.test(idNo)) throw new BadRequestException('编辑就诊人时不能提交脱敏证件号');
    if (phone && /[*•]/.test(phone)) throw new BadRequestException('编辑就诊人时不能提交脱敏手机号');
    // Keep the encrypted values when an edit only changes the profile fields.
    const normalizedIdNo = idNo || (existing?.idNoCiphertext ? this.decryptFieldSafe(existing.idNoCiphertext) : undefined);
    const normalizedPhone = phone || (existing?.phoneCiphertext ? this.decryptFieldSafe(existing.phoneCiphertext) : undefined);
    if (!normalizedIdNo || !normalizedPhone || !/^(?:\d{17}[\dXx]|\d{18})$/.test(normalizedIdNo) || !/^1\d{10}$/.test(normalizedPhone)) throw new BadRequestException('就诊人证件号或手机号格式不合法');
    const duplicate = this.store.state.patients.find((entry: any) => entry.id !== (input.id || '') && this.decryptFieldSafe(entry.idNoCiphertext)?.toUpperCase() === normalizedIdNo.toUpperCase());
    if (duplicate) throw new BadRequestException('该证件号已绑定其他就诊人');
    const item = {
      id: input.id || this.store.newId('patient'), userId: actor.id, name: String(input.name).trim(),
      idNoCiphertext: idNo ? encryptField(normalizedIdNo) : existing.idNoCiphertext,
      idNoMasked: idNo ? `${normalizedIdNo.slice(0, 4)}********${normalizedIdNo.slice(-4)}` : existing.idNoMasked,
      phoneCiphertext: phone ? encryptField(normalizedPhone) : existing.phoneCiphertext,
      phoneMasked: phone ? normalizedPhone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : (existing.phoneMasked || existing.phone),
      relation: input.relation === undefined ? (existing?.relation || '本人') : String(input.relation || '本人'),
      allergies: input.allergies === undefined ? (existing?.allergies || '') : String(input.allergies || ''),
      history: input.history === undefined ? (existing?.history || '') : String(input.history || '')
    };
    const index = this.store.state.patients.findIndex((entry) => entry.id === item.id && entry.userId === actor.id);
    if (index >= 0) this.store.state.patients[index] = item; else this.store.state.patients.push(item);
    this.store.addAudit(actor.id, actor.role, 'patient.save', 'patient', item.id);
    return { id: item.id, name: item.name, idNoMasked: item.idNoMasked, phoneMasked: item.phoneMasked, relation: item.relation, allergies: item.allergies, history: item.history };
  }

  saveAddress(input: any, actor: Actor) {
    if (!input?.name || !input?.detail || (!input.id && !input.phone)) throw new BadRequestException('请完善收货地址');
    const existing: any = input.id ? this.store.state.addresses.find((entry) => entry.id === String(input.id)) : undefined;
    if (input.id && (!existing || existing.userId !== actor.id)) throw new ForbiddenException('无收货地址修改权限');
    const phone = input.phone === undefined || input.phone === null || input.phone === '' ? undefined : String(input.phone).trim();
    if (phone && /[*•]/.test(phone)) throw new BadRequestException('编辑地址时不能提交脱敏手机号');
    const normalizedPhone = phone || (existing?.phoneCiphertext ? this.decryptFieldSafe(existing.phoneCiphertext) : existing?.phone);
    if (!normalizedPhone || !/^1\d{10}$/.test(normalizedPhone)) throw new BadRequestException('手机号格式不合法');
    const item = {
      id: input.id || this.store.newId('address'), userId: actor.id, name: String(input.name).trim(),
      phoneCiphertext: phone ? encryptField(normalizedPhone) : existing.phoneCiphertext,
      phoneMasked: phone ? normalizedPhone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2') : (existing.phoneMasked || existing.phone),
      detail: String(input.detail).trim(), isDefault: input.isDefault === undefined ? Boolean(existing?.isDefault) : Boolean(input.isDefault)
    };
    if (item.isDefault) this.store.state.addresses.forEach((entry) => { if (entry.userId === actor.id) entry.isDefault = false; });
    const index = this.store.state.addresses.findIndex((entry) => entry.id === item.id && entry.userId === actor.id);
    if (index >= 0) this.store.state.addresses[index] = item; else this.store.state.addresses.push(item);
    this.store.addAudit(actor.id, actor.role, 'address.save', 'address', item.id);
    return { id: item.id, name: item.name, phone: normalizedPhone, detail: item.detail, isDefault: item.isDefault };
  }

  createAftersale(input: any, actor: Actor) {
    const order = this.store.findOrder(input.orderId); if (!order) throw new NotFoundException('订单不存在');
    if (order.userId !== actor.id && actor.role !== 'admin') throw new ForbiddenException('无订单权限');
    if (!['paid', 'shipped', 'completed'].includes(order.status)) throw new BadRequestException('当前订单状态不能申请售后');
    const reason = String(input.reason || '').trim();
    if (reason.length < 2 || reason.length > 200) throw new BadRequestException('请填写明确的售后原因');
    const prescriptionOrder = order.items.some((line) => line.category === 'prescription');
    const qualityReason = /(quality|质量|破损|变质|错发|漏发|包装损坏|临期)/i.test(reason);
    if (prescriptionOrder && !qualityReason) throw new BadRequestException('处方商品仅支持质量问题售后');
    let fileKey: string | undefined;
    if (input.fileKey !== undefined) {
      const file: any = this.store.findFile(String(input.fileKey));
      if (!file || file.purpose !== 'aftersale' || (actor.role !== 'admin' && String(file.ownerId) !== String(order.userId))) throw new ForbiddenException('售后凭证不存在或不属于该订单用户');
      fileKey = String(file.id);
    }
    if (qualityReason && !fileKey) throw new BadRequestException('质量问题售后必须上传凭证');
    if (!prescriptionOrder && order.status === 'completed') {
      if (!order.receivedAt) throw new BadRequestException('订单缺少收货时间，暂不能申请售后');
      const elapsed = Date.now() - Date.parse(order.receivedAt);
      if (!Number.isFinite(elapsed) || elapsed < 0 || elapsed > 7 * 24 * 60 * 60 * 1000) throw new BadRequestException('普通商品仅支持收货后七天内售后');
    }
    const activeExisting = this.store.state.aftersales.find((row: any) => row.orderId === order.id && ['pending_review', 'approved', 'refunding', 'processing'].includes(String(row.status)));
    if (activeExisting) throw new BadRequestException('该订单已有处理中售后申请');
    const item = { id: this.store.newId('aftersale'), orderId: order.id, userId: order.userId, reason, note: input.note || '', fileKey, status: 'pending_review', statusText: '待审核', createdAt: this.store.timestamp() };
    this.store.state.aftersales.unshift(item);
    this.store.state.commissions.filter((commission: any) => commission.orderId === order.id && ['pending', 'eligible', 'settled'].includes(commission.status)).forEach((commission: any) => { commission.beforeAftersaleStatus = commission.status; commission.status = 'held'; commission.statusText = '售后处理中'; commission.holdAftersaleId = item.id; });
    this.store.addAudit(actor.id, actor.role, 'aftersale.create', 'aftersale', item.id);
    return item;
  }

  createInvoice(input: any, actor: Actor) {
    const order = this.store.findOrder(input.orderId); if (!order) throw new NotFoundException('订单不存在');
    if (order.userId !== actor.id && actor.role !== 'admin') throw new ForbiddenException('无订单权限');
    if (order.status !== 'completed') throw new BadRequestException('确认收货后才能申请发票');
    if (!input.title || String(input.title).trim().length > 160) throw new BadRequestException('请填写有效发票抬头');
    const existing = this.store.state.invoices.find((row: any) => row.orderId === order.id && !['rejected', 'cancelled'].includes(String(row.status)));
    if (existing) throw new BadRequestException('该订单已有发票申请');
    const taxNo = String(input.taxNo || '').trim(); if (taxNo.length > 80) throw new BadRequestException('税号长度不合法');
    const item = { id: this.store.newId('invoice'), orderId: order.id, userId: order.userId, type: input.type || 'personal', title: String(input.title).trim(), taxNo, status: 'pending', statusText: '待开票', createdAt: this.store.timestamp() };
    this.store.state.invoices.unshift(item);
    this.store.addAudit(actor.id, actor.role, 'invoice.create', 'invoice', item.id);
    return item;
  }

  myAftersales(actor: Actor, query: any = {}): ListResult<Record<string, unknown>> {
    const source = this.store.state.aftersales.filter((row: any) => { const order = this.store.findOrder(String(row.orderId)); return order?.userId === actor.id && (!query.orderId || row.orderId === query.orderId); });
    return this.page(source, query, true);
  }

  myInvoices(actor: Actor, query: any = {}): ListResult<Record<string, unknown>> {
    const source = this.store.state.invoices.filter((row: any) => { const order = this.store.findOrder(String(row.orderId)); return order?.userId === actor.id && (!query.orderId || row.orderId === query.orderId); });
    return this.page(source, query);
  }

  uploadInvoice(id: string, input: any, actor: Actor) {
    this.allow(actor, ['admin']);
    const invoice = this.store.state.invoices.find((item) => item.id === id); if (!invoice) throw new NotFoundException('发票申请不存在');
    if (!['processing', 'pending'].includes(String(invoice.status).toLowerCase())) throw new BadRequestException('当前发票申请不能上传开票文件');
    if (!input.fileKey || String(input.fileKey).length > 1600000) throw new BadRequestException('缺少发票文件');
    const file: any = this.store.findFile(String(input.fileKey));
    if (!file || file.purpose !== 'invoice') throw new BadRequestException('发票文件用途不正确或文件不存在');
    invoice.fileKey = String(file.id); invoice.invoiceNo = input.invoiceNo ? String(input.invoiceNo) : invoice.invoiceNo; invoice.status = 'issued'; invoice.statusText = '已开票'; invoice.issuedAt = this.store.timestamp();
    this.store.addAudit(actor.id, actor.role, 'invoice.issue', 'invoice', id);
    return invoice;
  }

  settleRewards(actor: Actor) {
    this.allow(actor, ['admin']);
    const settings: any = this.ensureSettings();
    const period = this.periodKey(new Date(), Number(settings.settlementWeekday));
    const existingSettlement = this.collection('settlements').find((row: any) => row.period === period && row.status === 'settled');
    if (existingSettlement) return existingSettlement;
    const eligible = this.store.state.commissions.filter((item: any) => {
      if (item.status !== 'eligible') return false;
      const order: any = item.orderId ? this.store.findOrder(String(item.orderId)) : undefined;
      if (!order || order.status !== 'completed') return false;
      return !this.store.state.aftersales.some((row: any) => row.orderId === order.id && ['pending_review', 'approved', 'processing', 'refunding'].includes(String(row.status)));
    });
    if (!eligible.length) return { period, count: 0, totalFen: 0, total: 0, status: 'no_eligible', created: false };
    const settlementId = this.store.newId('settlement');
    const totalFen = eligible.reduce((sum, item: any) => sum + this.amountFen(item), 0);
    eligible.forEach((item: any) => {
      item.status = 'settled'; item.statusText = '已结算'; item.settledAt = this.store.timestamp();
      if (String(item.promoterId || '') !== 'company') this.store.state.rewardWallet.push({ id: this.store.newId('wallet'), promoterId: String(item.promoterId), kind: 'earn', amountFen: this.amountFen(item), referenceId: item.id, createdAt: this.store.timestamp() });
    });
    const settlements = this.collection('settlements');
    const settlement = { id: settlementId, period, commissionIds: eligible.map((item) => item.id), totalFen, total: totalFen / 100, count: eligible.length, status: 'settled', settledAt: this.store.timestamp(), actorId: actor.id };
    settlements.unshift(settlement);
    this.store.addAudit(actor.id, actor.role, 'reward.settle', 'settlement', settlementId, { count: eligible.length, totalFen });
    return { ...settlement };
  }

  exportCustomers(actor: Actor) {
    this.allow(actor, ['admin']);
    const rows = this.store.state.customers;
    this.store.addAudit(actor.id, actor.role, 'customer.export', 'customer', undefined, { count: rows.length, masked: true, scoped: false });
    return rows;
  }
  healthServiceExport(actor: Actor) { this.allow(actor, ['admin']); this.store.addAudit(actor.id, actor.role, 'health-service.export', 'customer', undefined, { masked: true, count: this.store.state.customers.length }); return this.store.state.customers.map((customer: any) => ({ customerId: customer.id, name: customer.name, tags: customer.tags || [], lastOrder: customer.lastOrder, amount: customer.amount, consent: this.hasHealthConsent(customer.id) })); }
  queueHealthServicePush(id: string, actor: Actor) {
    this.allow(actor, ['admin']);
    const customer: any = this.store.state.customers.find((item: any) => String(item.id) === String(id));
    if (!customer) throw new NotFoundException('客户不存在');
    if (!this.hasHealthConsent(id)) throw new ForbiddenException('客户未授权健康信息');
    const task = { id: this.store.newId('health-push'), provider: 'health-service', type: 'customer-profile.push', referenceId: id, payload: { customerId: id, name: customer.name, tags: customer.tags || [], amountFen: customer.amountFen || 0 }, mode: 'manual', status: 'pending', attempts: 0, createdAt: this.store.timestamp() };
    this.store.state.outbox.unshift(task);
    this.store.addAudit(actor.id, actor.role, 'health-service.push.enqueue', 'customer', id, { taskId: task.id });
    return task;
  }
  customerProfile(id: string, actor: Actor, query: any = {}) {
    this.allow(actor, ['admin', 'sales', 'pharmacist']);
    const customer = this.store.state.customers.find((item) => item.id === id);
    if (!customer) throw new NotFoundException('客户不存在');
    if (actor.role === 'sales' && !this.customerBelongsToActor(customer, actor)) throw new ForbiddenException('无客户档案权限');
    const wantsSensitive = query.sensitive === true || ['true', '1', 'yes'].includes(String(query.sensitive || '').toLowerCase());
    const reason = String(query.reason || '').trim();
    if (wantsSensitive) {
      if (!['admin', 'pharmacist'].includes(actor.role)) throw new ForbiddenException('只有管理员或药师可以查看敏感信息');
      if (!reason) throw new BadRequestException('查看敏感信息必须填写原因');
      const consent = this.hasHealthConsent(id);
      if (!consent) throw new ForbiddenException('客户未授权健康信息');
      this.store.addAudit(actor.id, actor.role, 'customer.sensitive.view', 'customer', id, { reason });
    } else this.store.addAudit(actor.id, actor.role, 'customer.view', 'customer', id);
    const hasConsent = this.hasHealthConsent(id);
    const safeCustomer = wantsSensitive ? { ...customer, healthConsent: hasConsent } : { ...customer, phone: undefined, idNo: undefined, healthInfo: undefined, healthConsent: hasConsent };
    return {
      customer: safeCustomer,
      patients: this.store.state.patients.filter((item) => item.userId === id).map((item) => ({ name: item.name, relation: item.relation, idNoMasked: item.idNoMasked, phoneMasked: item.phoneMasked || item.phone, allergies: wantsSensitive ? item.allergies : undefined, history: wantsSensitive ? item.history : undefined })),
      prescriptions: this.store.state.prescriptions.filter((item) => item.userId === id).map((item) => ({ id: item.id, itemName: item.itemName, status: item.statusText || item.status, validUntil: item.validUntil, fileKey: wantsSensitive ? item.fileKey : undefined, patientName: wantsSensitive ? item.patientName : (item.patientName ? `${item.patientName.slice(0, 1)}女士` : '已脱敏') })),
      orders: this.store.state.orders.filter((item) => item.userId === id).map((item) => ({ orderNo: item.orderNo, totalAmount: item.totalAmount, status: item.statusText, createdAt: item.createdAt })),
      consents: this.store.state.healthConsents.filter((item) => item.userId === id).map((item) => ({ version: item.version, consentType: item.consentType, granted: item.granted, grantedAt: item.grantedAt }))
    };
  }

  articles(actor: Actor, query: any = {}): ListResult<Record<string, unknown>> {
    this.allow(actor, ['admin']);
    const keyword = String(query.keyword || query.q || '').trim().toLowerCase();
    const category = this.normalizeCategory(query.category || query.tag);
    if ((query.category || query.tag) && !category) throw new BadRequestException('文章分类不合法');
    const published = query.published === undefined || String(query.published).toLowerCase() === 'all' ? undefined : !['false', '0', 'draft', 'off'].includes(String(query.published).toLowerCase());
    const source = this.store.state.articles.filter((item: any) => {
      return (!category || this.normalizeCategory(item.category || item.tag) === category)
        && (published === undefined || item.published === published)
        && (!keyword || `${item.title} ${item.summary || ''} ${item.body || ''}`.toLowerCase().includes(keyword));
    }).sort((a: any, b: any) => Number(Boolean(b.recommended)) - Number(Boolean(a.recommended)) || String(b.updatedAt || '').localeCompare(String(a.updatedAt || ''))).map((item: any) => ({ ...item, coverImage: this.business.articleCoverImage(item) }));
    return this.page(source, query);
  }

  articleDetail(id: string, actor: Actor) {
    this.allow(actor, ['admin']);
    const article = this.store.state.articles.find((item) => item.id === id);
    if (!article) throw new NotFoundException('文章不存在');
    return { ...article, coverImage: this.business.articleCoverImage(article) };
  }

  /** Resolve a referral token without guessing across similarly named people. */
  private resolveReferrer(item: any) {
    const token = String(item?.referrerPromoterId || item?.recommender || '').trim();
    if (!token) return undefined;
    const exact = this.store.state.promoters.find((row: any) => String(row.id) === token && row.active !== false);
    if (exact) return exact;
    const matches = this.store.state.promoters.filter((row: any) => row.active !== false && String(row.name || '').trim().toLowerCase() === token.toLowerCase());
    return matches.length === 1 ? matches[0] : undefined;
  }

  private activeSalesOwner(memberPromoterId: string) {
    const membership: any = this.store.state.promoterMemberships.find((row: any) => String(row.memberPromoterId) === String(memberPromoterId) && String(row.status).toLowerCase() === 'active');
    const sales: any = membership && this.store.state.promoters.find((row: any) => String(row.id) === String(membership.salesPromoterId) && String(row.type).toLowerCase() === 'sales' && row.active !== false);
    return sales?.id ? String(sales.id) : undefined;
  }

  memberApplications(actor: Actor, query: any = {}): any {
    this.allow(actor, ['admin']);
    const keyword = String(query.keyword || query.q || '').trim().toLowerCase();
    const sourceType = query.sourceType || query.type;
    const applicantKeyword = String(query.applicantKeyword || query.applicantName || query.applicant || '').trim().toLowerCase();
    const referrerKeyword = String(query.referrerKeyword || query.referrerName || query.referrer || '').trim().toLowerCase();
    const normalizeStatus = (status: unknown) => {
      const value = String(status || '').toLowerCase();
      return value === 'pending_review' || value === 'review' ? 'pending' : value || 'pending';
    };
    const view = (item: any) => {
      const applicant = this.store.state.users.find((user: any) => String(user.id) === String(item.userId));
      const referrer = this.resolveReferrer(item);
      const salesId = item.resolvedSalesPromoterId || (referrer?.type === 'sales' ? referrer.id : referrer ? this.activeSalesOwner(String(referrer.id)) : undefined);
      const sales = salesId ? this.store.state.promoters.find((row: any) => String(row.id) === String(salesId)) : undefined;
      return {
        ...item,
        status: normalizeStatus(item.status),
        statusText: normalizeStatus(item.status) === 'pending' ? '待审批' : normalizeStatus(item.status) === 'approved' ? '已审批' : '已驳回',
        sourceType: item.sourceType || (item.referrerPromoterId || item.recommender ? 'referral' : 'direct'),
        applicantName: applicant?.nickname || item.name || item.userId,
        referrerName: referrer?.name || item.recommender || item.referrerPromoterId || '',
        referrerPromoterId: item.referrerPromoterId || referrer?.id,
        salesName: sales?.name || salesId || '',
        salesPromoterId: salesId || undefined,
        reviewerId: item.reviewedBy || item.reviewerId
      };
    };
    const matches = (item: any, includeStatus: boolean) => {
      const row = view(item);
      const text = `${row.applicantName || ''} ${row.referrerName || ''} ${row.userId || ''} ${row.id || ''}`.toLowerCase();
      const status = normalizeStatus(item.status);
      return (!includeStatus || !query.status || query.status === 'all' || status === normalizeStatus(query.status))
        && (!sourceType || sourceType === 'all' || String(row.sourceType) === String(sourceType))
        && (!applicantKeyword || `${row.applicantName || ''} ${row.userId || ''}`.toLowerCase().includes(applicantKeyword))
        && (!referrerKeyword || `${row.referrerName || ''} ${row.referrerPromoterId || ''}`.toLowerCase().includes(referrerKeyword))
        && (!keyword || text.includes(keyword))
        && (!query.from || String(item.createdAt || '').slice(0, 10) >= String(query.from))
        && (!query.to || String(item.createdAt || '').slice(0, 10) <= String(query.to));
    };
    const source = this.store.state.memberApplications.filter((item: any) => matches(item, true)).map(view);
    const result = this.page(source, query, true) as { items: any[]; total: number; page: number; pageSize: number };
    const counts = { pending: 0, approved: 0, rejected: 0 };
    this.store.state.memberApplications.filter((item: any) => matches(item, false)).forEach((item: any) => { const status = normalizeStatus(item.status); if (status in counts) (counts as any)[status] += 1; });
    return { ...result, counts };
  }

  memberApplicationDetail(id: string, actor: Actor) {
    this.allow(actor, ['admin']);
    const item = this.store.state.memberApplications.find((row: any) => String(row.id) === String(id));
    if (!item) throw new NotFoundException('会员申请不存在');
    const referrer = this.resolveReferrer(item);
    const salesId = item.resolvedSalesPromoterId || (referrer?.type === 'sales' ? referrer.id : referrer ? this.activeSalesOwner(String(referrer.id)) : undefined);
    const applicant = this.store.state.users.find((user: any) => String(user.id) === String(item.userId));
    const normalizedStatus = ['pending_review', 'review'].includes(String(item.status)) ? 'pending' : String(item.status || 'pending');
    return {
      ...item,
      status: normalizedStatus,
      statusText: normalizedStatus === 'pending' ? '待审批' : normalizedStatus === 'approved' ? '已审批' : '已驳回',
      applicantName: applicant?.nickname || item.name || item.userId,
      referrerName: referrer?.name || item.recommender || item.referrerPromoterId || '',
      salesName: this.store.state.promoters.find((row: any) => String(row.id) === String(salesId))?.name || '',
      salesPromoterId: salesId || undefined
    };
  }

  private promotionSnapshot(promoterId: string) {
    const nowDate = new Date();
    const shanghaiParts = (date: Date) => {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit' }).formatToParts(date);
      return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}`;
    };
    const current = shanghaiParts(nowDate);
    const [year, month] = current.split('-').map(Number);
    const months = Array.from({ length: 3 }, (_, index) => {
      const date = new Date(Date.UTC(year, month - 1 - (2 - index), 1));
      return shanghaiParts(date);
    });
    const promoter: any = this.store.state.promoters.find((row: any) => String(row.id) === String(promoterId));
    const ownerUserId = promoter?.userId ? String(promoter.userId) : undefined;
    const rows = this.store.state.performanceLedger.filter((row: any) => {
      if (String(row.promoterId) !== String(promoterId) || row.selfPurchase === true || String(row.status || '').toLowerCase() === 'cancelled') return false;
      if (ownerUserId && String(row.customerId) === ownerUserId) return false;
      const order: any = row.orderId ? this.store.findOrder(String(row.orderId)) : undefined;
      return !order || ['paid', 'shipped', 'completed'].includes(String(order.status).toLowerCase());
    });
    const monthly = months.map((period) => ({ period, amountFen: rows.filter((row: any) => String(row.period || String(row.createdAt || '').slice(0, 7)) === period).reduce((sum, row: any) => sum + Number(row.amountFen || 0), 0) }));
    const totalAmountFen = monthly.reduce((sum, row) => sum + row.amountFen, 0);
    const monthlyQualified = monthly.every((row) => row.amountFen >= 10000000);
    const totalQualified = totalAmountFen >= 30000000;
    const legacyEligible = String(promoter?.level || '').toUpperCase() === 'SENIOR_MEMBER' && String(promoter?.type || '').toLowerCase() === 'member';
    return { months, monthly, totalAmountFen, monthlyQualified, totalQualified, legacyEligible, eligible: legacyEligible || monthlyQualified || totalQualified, criteria: legacyEligible ? 'legacy-senior-member' : monthlyQualified ? 'monthly' : totalQualified ? 'total' : 'none' };
  }

  promotionEligibility(actor: Actor) {
    this.allow(actor, ['member', 'sales']);
    const promoter = this.store.state.promoters.find((row: any) => String(row.userId || row.id) === String(actor.id));
    if (!promoter) throw new NotFoundException('当前账号没有会员推广档案');
    const snapshot = this.promotionSnapshot(String(promoter.id));
    const latest = this.store.state.promotionApplications.filter((row: any) => String(row.memberPromoterId) === String(promoter.id)).sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
    const application = latest ? { ...latest, statusText: latest.status === 'pending' ? '待审批' : latest.status === 'approved' ? '已审批' : '已驳回' } : null;
    return { promoter: this.promoterView(promoter), snapshot, application, canApply: promoter.type === 'member' && snapshot.eligible && !['pending', 'approved'].includes(String(latest?.status || '')) };
  }

  promotionApplication(actor: Actor) {
    this.allow(actor, ['member', 'sales']);
    const promoter = this.store.state.promoters.find((row: any) => String(row.userId || row.id) === String(actor.id));
    if (!promoter) throw new NotFoundException('当前账号没有会员推广档案');
    const application: any = this.store.state.promotionApplications.filter((row: any) => String(row.memberPromoterId) === String(promoter.id)).sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
    return application ? { ...application, statusText: application.status === 'pending' ? '待审批' : application.status === 'approved' ? '已审批' : '已驳回' } : null;
  }

  async applyPromotion(actor: Actor) {
    this.allow(actor, ['member']);
    const promoter = this.store.state.promoters.find((row: any) => String(row.userId || row.id) === String(actor.id));
    if (!promoter) throw new NotFoundException('当前账号没有会员推广档案');
    return this.store.runAtomic(async () => {
      const existing = this.store.state.promotionApplications.find((row: any) => String(row.memberPromoterId) === String(promoter.id) && row.status === 'pending');
      if (existing) return existing;
      const snapshot = this.promotionSnapshot(String(promoter.id));
      if (!snapshot.eligible) throw new BadRequestException('当前业绩尚未达到晋升条件');
      const currentSales = this.store.state.promoterMemberships.find((row: any) => String(row.memberPromoterId) === String(promoter.id) && row.status === 'active')?.salesPromoterId;
      const item = { id: this.store.newId('promotion'), userId: actor.id, memberPromoterId: promoter.id, status: 'pending', criteria: snapshot.criteria, monthlySnapshot: snapshot.monthly, totalAmountFen: snapshot.totalAmountFen, currentSalesPromoterId: currentSales, submittedAt: this.store.timestamp(), createdAt: this.store.timestamp() };
      this.store.state.promotionApplications.unshift(item);
      this.store.addAudit(actor.id, actor.role, 'promotion.apply', 'promotion_application', item.id, { criteria: item.criteria, totalAmountFen: item.totalAmountFen });
      return item;
    });
  }

  promotionApplications(actor: Actor, query: any = {}): any {
    this.allow(actor, ['admin']);
    const keyword = String(query.keyword || query.q || '').trim().toLowerCase();
    const applicantKeyword = String(query.applicantKeyword || query.applicantName || '').trim().toLowerCase();
    const superiorKeyword = String(query.superiorKeyword || query.superiorName || '').trim().toLowerCase();
    const matches = (item: any, includeStatus: boolean) => {
      const promoter = this.store.state.promoters.find((row: any) => String(row.id) === String(item.memberPromoterId));
      const applicant = this.store.state.users.find((row: any) => String(row.id) === String(item.userId));
      const superior = item.currentSalesPromoterId ? this.store.state.promoters.find((row: any) => String(row.id) === String(item.currentSalesPromoterId)) : undefined;
      const text = `${item.id} ${item.userId} ${applicant?.nickname || ''} ${promoter?.name || ''} ${superior?.name || ''}`.toLowerCase();
      return (!includeStatus || !query.status || query.status === 'all' || item.status === query.status)
        && (!applicantKeyword || `${applicant?.nickname || ''} ${item.userId || ''}`.toLowerCase().includes(applicantKeyword))
        && (!query.superiorId || String(item.currentSalesPromoterId || '') === String(query.superiorId))
        && (!superiorKeyword || String(superior?.name || '').toLowerCase().includes(superiorKeyword))
        && (!query.from || String(item.createdAt || item.submittedAt || '').slice(0, 10) >= String(query.from))
        && (!query.to || String(item.createdAt || item.submittedAt || '').slice(0, 10) <= String(query.to))
        && (!keyword || text.includes(keyword));
    };
    const source = this.store.state.promotionApplications.filter((item: any) => matches(item, true)).map((item: any) => ({ ...item, statusText: item.status === 'pending' ? '待审批' : item.status === 'approved' ? '已审批' : '已驳回', applicantName: this.store.state.users.find((row: any) => String(row.id) === String(item.userId))?.nickname || item.userId, promoterName: this.store.state.promoters.find((row: any) => String(row.id) === String(item.memberPromoterId))?.name || item.memberPromoterId, salesName: this.store.state.promoters.find((row: any) => String(row.id) === String(item.currentSalesPromoterId))?.name || item.currentSalesPromoterId }));
    const result = this.page(source, query, true) as any;
    const counts = { pending: 0, approved: 0, rejected: 0 };
    this.store.state.promotionApplications.filter((item: any) => matches(item, false)).forEach((item: any) => { if (item.status in counts) (counts as any)[item.status] += 1; });
    return { ...result, counts };
  }

  promotionApplicationDetail(id: string, actor: Actor) {
    this.allow(actor, ['admin']);
    const item = this.store.state.promotionApplications.find((row: any) => String(row.id) === String(id));
    if (!item) throw new NotFoundException('晋升申请不存在');
    const applicant = this.store.state.users.find((row: any) => String(row.id) === String(item.userId));
    const promoter = this.store.state.promoters.find((row: any) => String(row.id) === String(item.memberPromoterId));
    const superior = item.currentSalesPromoterId ? this.store.state.promoters.find((row: any) => String(row.id) === String(item.currentSalesPromoterId)) : undefined;
    const status = String(item.status || 'pending');
    return { ...item, statusText: status === 'pending' ? '待审批' : status === 'approved' ? '已审批' : '已驳回', applicantName: applicant?.nickname || item.userId, promoterName: promoter?.name || item.memberPromoterId, salesName: superior?.name || item.currentSalesPromoterId || '' };
  }

  async reviewPromotionApplication(id: string, input: any, actor: Actor) {
    this.allow(actor, ['admin']);
    const item: any = this.store.state.promotionApplications.find((row: any) => String(row.id) === String(id));
    if (!item) throw new NotFoundException('晋升申请不存在');
    if (item.status !== 'pending') return this.promotionApplicationDetail(id, actor);
    if (typeof input?.approved !== 'boolean') throw new BadRequestException('晋升审核结果必须明确选择');
    if (input.approved === false && !String(input.reason || '').trim()) throw new BadRequestException('驳回晋升申请需要填写原因');
    const promoter: any = this.store.state.promoters.find((row: any) => String(row.id) === String(item.memberPromoterId) && row.active !== false);
    const user: any = this.store.state.users.find((row: any) => String(row.id) === String(item.userId));
    if (!promoter || !user || String(promoter.type).toLowerCase() !== 'member') throw new BadRequestException('晋升申请关联的会员档案不存在或已升级');
    const reason = String(input.reason || '').trim().slice(0, 500) || undefined;
    return this.store.runAtomic(async () => {
      const now = this.store.timestamp();
      item.status = input.approved ? 'approved' : 'rejected'; item.reviewReason = reason; item.reviewerId = actor.id; item.reviewedAt = now;
      if (input.approved) {
        promoter.type = 'sales'; promoter.level = 'STAFF'; promoter.active = true; promoter.upgradedAt = now;
        user.role = 'SALES'; user.memberLevel = 'SENIOR_MEMBER';
        this.store.state.promoterMemberships.filter((row: any) => String(row.memberPromoterId) === String(promoter.id) && row.status === 'active').forEach((row: any) => { row.status = 'released'; row.releasedAt = now; row.reason = '会员晋升为销售人员'; });
      }
      this.store.addAudit(actor.id, actor.role, 'promotion.review', 'promotion_application', id, { approved: input.approved, reason });
      return item;
    });
  }

  createCustomer(input: any, actor: Actor) {
    this.allow(actor, ['admin']);
    if (!input.name || !String(input.name).trim()) throw new BadRequestException('客户姓名不能为空');
    const amountFen = input.amountFen !== undefined ? this.integerFen(input.amountFen, '累计金额') : Math.round(Number(input.amount || 0) * 100);
    if (!Number.isFinite(amountFen) || amountFen < 0) throw new BadRequestException('累计金额不合法');
    const promoterId = input.promoter || input.promoterId || ''; if (promoterId && !this.store.state.promoters.some((row) => row.id === String(promoterId) && row.active !== false)) throw new BadRequestException('推广人不存在或已停用');
    const item = { id: input.id || this.store.newId('customer'), name: String(input.name).trim(), promoter: String(promoterId), lastOrder: input.lastOrder || '', amount: amountFen / 100, amountFen, tags: Array.isArray(input.tags) ? input.tags.map(String).filter(Boolean).slice(0, 30) : [] };
    const index = this.store.state.customers.findIndex((entry) => entry.id === item.id);
    if (index >= 0) this.store.state.customers[index] = item; else this.store.state.customers.unshift(item);
    this.store.addAudit(actor.id, actor.role, 'customer.save', 'customer', item.id);
    return item;
  }

  customers(query: any = {}, actor?: Actor): ListResult<any> {
    if (!actor && query && typeof query === 'object' && query.role) { actor = query as Actor; query = {}; }
    if (!actor) throw new ForbiddenException('无客户档案权限');
    this.allow(actor, ['admin', 'sales']); const keyword = String(query?.keyword || query?.q || '').trim().toLowerCase();
    const source = this.store.state.customers.filter((item: any) => {
      const bound = Boolean(item.promoter && item.promoter !== 'company') || this.store.state.promoterRelations.some((row: any) => row.active !== false && String(row.customerId) === String(item.id)) || this.store.state.customerAttributions.some((row: any) => row.active !== false && String(row.customerId) === String(item.id) && row.ownerKind !== 'company');
      return (actor.role !== 'sales' || this.customerBelongsToActor(item, actor)) && (!query?.promoterId || (actor.role !== 'sales' && item.promoter === query.promoterId)) && (!query?.bound || query.bound === 'all' || (query.bound === 'bound' ? bound : !bound)) && (!keyword || `${item.name} ${item.id} ${(item.tags || []).join(' ')}`.toLowerCase().includes(keyword));
    }).map((item: any) => ({ ...item, amountFen: item.amountFen ?? Math.round(Number(item.amount || 0) * 100), consent: this.hasHealthConsent(item.id) }));
    return this.page(source, query);
  }

  memberApplication(actor: Actor) {
    const item = this.store.state.memberApplications.find((row: any) => row.userId === actor.id);
    return item || null;
  }

  myWithdrawals(actor: Actor) {
    this.allow(actor, ['member', 'sales']);
    return this.store.state.withdrawals.filter((row: any) => row.userId === actor.id).map((row: any) => ({ ...row, amountFen: row.amountFen ?? Math.round(Number(row.amount || 0) * 100) }));
  }

  consultation(input: any, actor: Actor) {
    if (!input?.patientId || !this.store.state.patients.some((patient) => patient.id === String(input.patientId) && patient.userId === actor.id)) throw new BadRequestException('问诊必须绑定当前用户的就诊人');
    const task = { id: this.store.newId('consultation'), provider: 'hospital', type: 'consultation', referenceId: actor.id, payload: { ...input, userId: actor.id }, mode: 'manual', status: 'pending', createdAt: this.store.timestamp() };
    this.store.state.outbox.unshift(task); this.store.addAudit(actor.id, actor.role, 'consultation.create', 'outbox', task.id); return { ...task, statusText: '待人工处理' };
  }

  async createPromoter(input: any, actor: Actor) {
    this.allow(actor, ['admin']);
    if (!input.name || !String(input.name).trim()) throw new BadRequestException('推广人名称不能为空');
    const type = this.normalizePromoterClass(input);
    // Keep the legacy storage fields for compatibility, but expose only two
    // business identities to the admin: sales (senior member) or member.
    const level = type === 'sales' ? 'STAFF' : 'ORDINARY_MEMBER';
    if (input.userId && this.store.state.promoters.some((entry) => entry.userId === String(input.userId) && entry.id !== input.id)) throw new BadRequestException('该用户已经绑定推广人');
    // Creation IDs are server generated. Editing is handled by updatePromoter
    // and therefore never accepts a caller supplied ID for a new row.
    let promoterId = randomUUID();
    while (this.store.state.promoters.some((entry: any) => String(entry.id) === promoterId) || this.store.state.promoterArchives.some((entry: any) => String(entry.originalPromoterId) === promoterId)) promoterId = randomUUID();
    return this.store.runAtomic(async () => {
      const item = { id: promoterId, userId: input.userId ? String(input.userId) : undefined, type, level, name: String(input.name).trim(), active: input.active !== false };
      this.store.state.promoters.unshift(item);
      this.store.addAudit(actor.id, actor.role, 'promoter.save', 'promoter', item.id);
      return this.promoterView(item);
    });
  }

  async updatePromoter(id: string, input: any, actor: Actor) {
    this.allow(actor, ['admin']);
    const item: any = this.store.state.promoters.find((entry) => entry.id === id);
    if (!item) throw new NotFoundException('推广人不存在');
    return this.store.runAtomic(async () => {
      if (input.name !== undefined) item.name = String(input.name);
      if (input.promoterClass !== undefined || input.type !== undefined || input.role !== undefined) {
        item.type = this.normalizePromoterClass(input, item.type === 'sales' ? 'sales' : 'member');
        item.level = item.type === 'sales' ? 'STAFF' : 'ORDINARY_MEMBER';
      }
      if (input.active !== undefined) item.active = Boolean(input.active);
      this.store.addAudit(actor.id, actor.role, 'promoter.update', 'promoter', id, { level: item.level, active: item.active });
      return this.promoterView(item);
    });
  }

  private normalizePromoterClass(input: any, fallback: 'sales' | 'member' = 'member'): 'sales' | 'member' {
    const raw = String(input?.promoterClass ?? input?.role ?? input?.type ?? '').trim().toLowerCase();
    if (raw === 'sales' || raw === 'salesperson' || raw === 'sales_staff' || raw === 'staff') return 'sales';
    if (raw === 'member' || raw === 'ordinary_member' || raw === 'senior_member') return 'member';
    // Old callers submitted STAFF as the level while omitting type.
    if (!raw && String(input?.level || '').toUpperCase() === 'STAFF') return 'sales';
    return fallback;
  }

  private promoterView(item: any) {
    const promoterClass = String(item.type || '').toLowerCase() === 'sales' || String(item.level || '').toUpperCase() === 'STAFF' ? 'sales' : 'member';
    return { ...item, promoterClass, promoterClassText: promoterClass === 'sales' ? '销售人员（高级会员）' : '会员' };
  }

  async batchDeletePromoters(input: any, actor: Actor) {
    this.allow(actor, ['admin']);
    const ids = Array.from(new Set((Array.isArray(input?.ids) ? input.ids : []).map(String).filter(Boolean)));
    if (!ids.length) throw new BadRequestException('请选择要删除的推广人');
    const reason = String(input?.reason || '').trim();
    if (!reason) throw new BadRequestException('删除推广人必须填写原因');
    return this.store.runAtomic(async () => {
      const archives: any[] = [];
      const existingPromoters = ids.map((id) => this.store.state.promoters.find((row: any) => String(row.id) === id)).filter(Boolean) as any[];
      const deletedOwnerIds = new Set<string>(existingPromoters.map((row) => String(row.id)));
      existingPromoters.forEach((row: any) => { if (row.userId) deletedOwnerIds.add(String(row.userId)); });
      // Deleting a sales person releases all subordinate member memberships and
      // their customer ownership as well; no new sales-under-sales hierarchy is
      // created during this operation.
      existingPromoters.filter((row) => String(row.type).toLowerCase() === 'sales').forEach((sales) => this.store.state.promoterMemberships.filter((row: any) => String(row.salesPromoterId) === String(sales.id)).forEach((row: any) => { row.status = 'released'; row.releasedAt = this.store.timestamp(); row.reason = reason; }));
      for (const promoter of existingPromoters) {
        const id = String(promoter.id);
        const boundUserId = String(promoter.userId || '');
        const ownerKeys = new Set([id, ...(boundUserId ? [boundUserId] : [])]);
        const relations = this.store.state.promoterRelations.filter((row: any) => ownerKeys.has(String(row.promoterId)) || ownerKeys.has(String(row.customerId)));
        const memberships = this.store.state.promoterMemberships.filter((row: any) => ownerKeys.has(String(row.memberPromoterId)) || ownerKeys.has(String(row.salesPromoterId)));
        const attributions = this.store.state.customerAttributions.filter((row: any) => ownerKeys.has(String(row.ownerPromoterId || '')) || ownerKeys.has(String(row.assignedBy || '')));
        const orders = this.store.state.orders.filter((row: any) => ownerKeys.has(String(row.promoterId || '')) || ownerKeys.has(String(row.userId || '')));
        const rewards = this.store.state.commissions.filter((row: any) => ownerKeys.has(String(row.promoterId || '')));
        const walletRows = this.store.state.rewardWallet.filter((row: any) => ownerKeys.has(String(row.promoterId || '')));
        const withdrawals = this.store.state.withdrawals.filter((row: any) => ownerKeys.has(String(row.userId || row.promoterId || '')));
        const archiveId = this.store.newId('promoter-archive');
        const archive = { id: archiveId, originalPromoterId: id, userId: promoter.userId, type: promoter.type, level: promoter.level, name: promoter.name, deletionReason: reason, deletedBy: actor.id, deletedAt: this.store.timestamp(), orderCount: orders.length, rewardCount: rewards.length, relationCount: relations.length + memberships.length + attributions.length, totalRewardFen: rewards.reduce((sum: number, row: any) => sum + Number(row.amountFen || 0), 0), createdAt: this.store.timestamp() };
        this.store.state.promoterArchives.unshift(archive);
        const addItems = (kind: string, rows: any[], amount = (_row: any) => undefined) => rows.forEach((row: any) => {
          const payload = kind === 'order'
            ? { id: row.id, orderNo: row.orderNo, userId: row.userId, promoterId: row.promoterId, status: row.status, totalAmountFen: row.totalAmountFen ?? Math.round(Number(row.totalAmount || 0) * 100), createdAt: row.createdAt, items: Array.isArray(row.items) ? row.items.map((line: any) => ({ productId: line.productId, skuId: line.skuId, name: line.name, quantity: line.quantity, unitPriceFen: line.unitPriceFen ?? Math.round(Number(line.unitPrice || 0) * 100) })) : [] }
            : JSON.parse(JSON.stringify(row));
          this.store.state.promoterArchiveItems.unshift({ id: this.store.newId('promoter-archive-item'), archiveId, kind, originalId: row.id, amountFen: amount(row), occurredAt: row.createdAt || row.date, payload });
        });
        addItems('relation', relations); addItems('membership', memberships); addItems('attribution', attributions);
        addItems('order', orders, (row) => row.totalAmountFen || Math.round(Number(row.totalAmount || 0) * 100));
        addItems('reward', rewards, (row) => row.amountFen || Math.round(Number(row.amount || 0) * 100));
        addItems('wallet', walletRows, (row) => row.amountFen || 0); addItems('withdrawal', withdrawals, (row) => row.amountFen || Math.round(Number(row.amount || 0) * 100));
        const now = this.store.timestamp();
        memberships.filter((row: any) => row.status === 'active').forEach((row: any) => { row.status = 'released'; row.releasedAt = now; row.reason = reason; });
        relations.filter((row: any) => row.active !== false).forEach((row: any) => { row.active = false; row.releasedAt = now; row.releaseReason = reason; });
        promoter.active = false; promoter.inactiveAt = now; promoter.inactiveReason = reason;
        archives.push(archive);
      }
      // Move every affected customer to an explicit company attribution. Keep
      // historical rows immutable and append a new active company row.
      for (const customer of this.store.state.customers as any[]) {
        const owner = String(customer.promoter || customer.promoterId || '');
        const active = this.store.state.customerAttributions.find((row: any) => row.active !== false && String(row.customerId) === String(customer.id));
        const affected = deletedOwnerIds.has(owner) || (active && deletedOwnerIds.has(String(active.ownerPromoterId || '')));
        if (!affected) continue;
        this.store.state.customerAttributions.filter((row: any) => String(row.customerId) === String(customer.id) && row.active !== false).forEach((row: any) => { row.active = false; row.releasedAt = this.store.timestamp(); row.releaseReason = reason; });
        if (!this.store.state.customerAttributions.some((row: any) => String(row.customerId) === String(customer.id) && row.active !== false && row.ownerKind === 'company')) this.store.state.customerAttributions.push({ id: this.store.newId('attr'), customerId: customer.id, ownerKind: 'company', ownerPromoterId: undefined, source: 'promoter-delete', active: true, boundAt: this.store.timestamp(), assignedBy: actor.id });
        customer.promoter = 'company'; customer.promoterId = undefined;
      }
      // Physical removal is deliberate. Orders/rewards retain the original ID,
      // while archive rows are the only read-only replacement for the promoter.
      this.store.state.promoters = this.store.state.promoters.filter((row: any) => !ids.includes(String(row.id)));
      existingPromoters.forEach((promoter: any) => {
        const user = this.store.state.users.find((row: any) => String(row.id) === String(promoter.userId));
        if (user && !['SALES', 'ADMIN', 'PHARMACIST', 'FULFILLMENT'].includes(String(user.role || '').toUpperCase())) { user.role = 'CONSUMER'; user.memberLevel = null; }
      });
      this.store.addAudit(actor.id, actor.role, 'promoter.batch-delete', 'promoter', undefined, { ids, reason, archived: archives.map((row) => row.id) });
      return { archived: archives.length, archives };
    });
  }

  deletePromoter(id: string, input: any, actor: Actor) {
    return this.batchDeletePromoters({ ids: [id], reason: input?.reason }, actor);
  }

  promoterHistory(id: string, actor: Actor, query: any = {}): ListResult<Record<string, unknown>> {
    this.allow(actor, ['admin']);
    const archives = this.store.state.promoterArchives.filter((row: any) => String(row.originalPromoterId) === String(id)).sort((a: any, b: any) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
    const archive = archives[0];
    if (!archive) throw new NotFoundException('推广人历史不存在');
    const kind = query.kind && query.kind !== 'all' ? String(query.kind) : undefined;
    const source = this.store.state.promoterArchiveItems.filter((row: any) => String(row.archiveId) === String(archive.id) && (!kind || row.kind === kind));
    const result = this.page(source, query, true) as any;
    return { archive, ...result };
  }

  promoterArchives(actor: Actor, query: any = {}) {
    this.allow(actor, ['admin']);
    const keyword = String(query.keyword || query.q || '').trim().toLowerCase();
    const source = this.store.state.promoterArchives.filter((row: any) => !keyword || `${row.originalPromoterId} ${row.name} ${row.userId || ''} ${row.deletionReason || ''}`.toLowerCase().includes(keyword)).sort((a: any, b: any) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
    return this.page(source, query, true);
  }

  analytics(query: any, actor: Actor) {
    this.allow(actor, ['admin']);
    const from = query?.from ? Date.parse(`${query.from}T00:00:00.000Z`) : undefined;
    const to = query?.to ? Date.parse(`${query.to}T23:59:59.999Z`) : undefined;
    if ((from !== undefined && !Number.isFinite(from)) || (to !== undefined && !Number.isFinite(to))) throw new BadRequestException('报表日期格式不合法');
    if (from !== undefined && to !== undefined && from > to) throw new BadRequestException('报表开始日期不能晚于结束日期');
    const orders = this.store.state.orders.filter((order) => {
      const time = Date.parse(order.createdAt);
      const categoryMatch = !query?.category || query.category === 'all' || order.items.some((line) => line.category === query.category);
      const productMatch = !query?.productId || order.items.some((line) => line.productId === query.productId);
      const promoter = order.promoterId ? this.store.state.promoters.find((item: any) => String(item.id) === String(order.promoterId)) : undefined;
      const promoterMatch = !query?.promoterId || order.promoterId === query.promoterId;
      const levelMatch = !query?.level || String(promoter?.level || '') === String(query.level);
      return (from === undefined || time >= from) && (to === undefined || time <= to) && categoryMatch && productMatch && promoterMatch && levelMatch;
    });
    const activeOrders = orders.filter((order) => ['paid', 'shipped', 'completed', 'refunding'].includes(order.status));
    const filteredOrderIds = new Set(activeOrders.map((order) => order.id));
    const filteredCustomerIds = new Set(activeOrders.map((order) => order.userId));
    const filteredPromoterIds = new Set(activeOrders.map((order) => order.promoterId).filter(Boolean) as string[]);
    const filteredCommissions = this.store.state.commissions.filter((item: any) => item.orderId && filteredOrderIds.has(String(item.orderId)));
    const filteredWithdrawals = this.store.state.withdrawals.filter((item: any) => filteredPromoterIds.has(String(item.userId || item.promoterId)));
    const performanceRows = this.store.state.performanceLedger.filter((item: any) => item.status !== 'cancelled' && (!query?.promoterId || String(item.promoterId) === String(query.promoterId)) && (!query?.level || String(this.store.state.promoters.find((promoter: any) => String(promoter.id) === String(item.promoterId))?.level || '') === String(query.level)) && (!from || Date.parse(String(item.createdAt || '')) >= from) && (!to || Date.parse(String(item.createdAt || '')) <= to));
    const productMap = new Map<string, { productId: string; name: string; quantity: number; amount: number; amountFen: number }>();
    activeOrders.forEach((order) => order.items.forEach((line) => {
      const current = productMap.get(line.productId) || { productId: line.productId, name: line.name, quantity: 0, amount: 0, amountFen: 0 };
      current.quantity += Number(line.quantity || 0);
      current.amount += (Number(line.unitPriceFen ?? Math.round(Number(line.unitPrice || 0) * 100)) / 100) * Number(line.quantity || 0);
      current.amountFen += Number(line.unitPriceFen ?? Math.round(Number(line.unitPrice || 0) * 100)) * Number(line.quantity || 0);
      productMap.set(line.productId, current);
    }));
    const promoterMap = new Map<string, { promoterId: string; amount: number; amountFen: number; orders: number; level: string }>();
    activeOrders.forEach((order) => {
      if (!order.promoterId) return;
      const current = promoterMap.get(order.promoterId) || { promoterId: order.promoterId, amount: 0, amountFen: 0, orders: 0, level: String(this.store.state.promoters.find((promoter: any) => String(promoter.id) === String(order.promoterId))?.level || '') };
      current.amount += Number(order.totalAmount || 0);
      current.amountFen += this.amountFen(order.totalAmount);
      current.orders += 1;
      promoterMap.set(order.promoterId, current);
    });
    const dailyEnd = to === undefined ? new Date() : new Date(to); const dailyStart = from === undefined ? new Date(dailyEnd.getTime() - 6 * 86400000) : new Date(from); const dayCount = Math.min(90, Math.max(1, Math.floor((dailyEnd.getTime() - dailyStart.getTime()) / 86400000) + 1));
    const daily = Array.from({ length: dayCount }, (_, index) => {
      const date = new Date(dailyStart.getTime() + index * 86400000);
      const key = date.toISOString().slice(0, 10);
      const rows = activeOrders.filter((order) => order.createdAt.slice(0, 10) === key);
      return { date: key, orders: rows.length, amount: rows.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0), amountFen: rows.reduce((sum, order) => sum + this.amountFen(order.totalAmount), 0) };
    });
    return {
       summary: { orders: activeOrders.length, paidOrders: activeOrders.length, salesAmount: activeOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0), salesAmountFen: activeOrders.reduce((sum, order) => sum + this.amountFen(order.totalAmount), 0), performance: performanceRows.reduce((sum, row: any) => sum + Number(row.amountFen || 0), 0) / 100, performanceFen: performanceRows.reduce((sum, row: any) => sum + Number(row.amountFen || 0), 0), customers: filteredCustomerIds.size, commissions: filteredCommissions.reduce((sum, item: any) => sum + Number(item.amount ?? this.amountFen(item) / 100), 0), commissionsFen: filteredCommissions.reduce((sum, item: any) => sum + this.amountFen(item), 0), withdrawals: filteredWithdrawals.reduce((sum, item: any) => sum + Number(item.amount ?? this.amountFen(item) / 100), 0), withdrawalsFen: filteredWithdrawals.reduce((sum, item: any) => sum + this.amountFen(item), 0) },
      productRank: Array.from(productMap.values()).sort((a, b) => b.amount - a.amount).slice(0, 10),
      promoterRank: Array.from(promoterMap.values()).map((item) => ({ ...item, name: this.store.state.promoters.find((promoter) => promoter.id === item.promoterId)?.name || item.promoterId })).sort((a, b) => b.amount - a.amount).slice(0, 10),
      daily
    };
  }

  settings(actor: Actor) { this.allow(actor, ['admin']); this.ensureSettings(); return this.store.state.settings; }
  staffAccounts(actor: Actor) {
    this.allow(actor, ['admin']);
    let accounts: any[] = [];
    try { accounts = JSON.parse(process.env.STAFF_ACCOUNTS_JSON || '[]'); } catch { accounts = []; }
    if (!Array.isArray(accounts) || !accounts.length) {
      if (process.env.NODE_ENV !== 'production') return [{ username: 'admin', role: 'admin', active: true }, { username: 'pharmacist', role: 'pharmacist', active: true }, { username: 'fulfillment', role: 'fulfillment', active: true }];
      return [];
    }
    return accounts.map((account: any) => ({ username: String(account.username || ''), role: String(account.role || ''), active: account.active !== false }));
  }
  saveSettings(input: any, actor: Actor) {
    this.allow(actor, ['admin']);
    this.ensureSettings();
    const numeric = ['shippingFreeThresholdFen', 'shippingFeeFen', 'autoCancelMinutes', 'autoReceiveDays', 'withdrawThresholdFen', 'rewardActivationDays', 'settlementWeekday', 'memberUpgradeThresholdFen', 'promoterReleaseDays'];
    const next: any = { ...(this.store.state.settings as any) };
    numeric.forEach((key) => { if (input[key] !== undefined) { const value = Number(input[key]); if (!Number.isFinite(value) || value < 0) throw new BadRequestException(`设置项 ${key} 不合法`); if (['shippingFreeThresholdFen', 'shippingFeeFen', 'withdrawThresholdFen', 'memberUpgradeThresholdFen'].includes(key) && !Number.isInteger(value)) throw new BadRequestException(`设置项 ${key} 必须是整数分`); next[key] = value; } });
    if (input.settlementWeekday !== undefined && (!Number.isInteger(Number(input.settlementWeekday)) || Number(input.settlementWeekday) < 0 || Number(input.settlementWeekday) > 6)) throw new BadRequestException('结算星期必须是0到6');
    ['companyName', 'servicePhone'].forEach((key) => { if (input[key] !== undefined) next[key] = String(input[key]).trim().slice(0, 120); });
    if (input.allowRelationshipTransfer !== undefined) next.allowRelationshipTransfer = !['false', '0', 'off'].includes(String(input.allowRelationshipTransfer).toLowerCase());
    Object.assign(this.store.state.settings, next);
    this.store.addAudit(actor.id, actor.role, 'settings.save', 'settings', undefined, { keys: Object.keys(input || {}) });
    return this.store.state.settings;
  }
  outbox(actor: Actor) { this.allow(actor, ['admin']); return this.store.state.outbox; }
  integrationStatus(actor: Actor) { this.allow(actor, ['admin']); return { repository: process.env.REPOSITORY_MODE === 'prisma' ? 'prisma' : 'memory', wechatAuth: process.env.WECHAT_APPID && process.env.WECHAT_SECRET ? 'real' : 'manual', wechatPayment: process.env.WECHAT_MCHID && process.env.WECHAT_API_V3_KEY && process.env.WECHAT_PRIVATE_KEY_PATH ? 'real' : 'manual', hospital: process.env.HOSPITAL_API_URL ? 'real' : 'manual', invoice: process.env.INVOICE_API_URL ? 'real' : 'manual', logistics: process.env.LOGISTICS_API_URL ? 'real' : 'manual', sms: process.env.SMS_API_URL ? 'real' : 'manual', erp: process.env.ERP_API_URL ? 'real' : 'manual', healthService: process.env.HEALTH_SERVICE_API_URL ? 'real' : 'manual', cos: process.env.COS_BUCKET ? 'real' : 'manual' }; }

  queueManualTask(input: any, actor: Actor) {
    this.allow(actor, ['admin', 'pharmacist', 'fulfillment']);
    if (!input?.provider || !input?.type || !String(input.provider).trim() || !String(input.type).trim()) throw new BadRequestException('人工任务缺少服务商或任务类型');
    const item = { id: this.store.newId('task'), provider: String(input.provider).trim(), type: String(input.type).trim(), referenceId: input.referenceId, payload: input.payload || {}, mode: 'manual', status: 'pending', attempts: 0, createdAt: this.store.timestamp() };
    this.store.state.outbox.unshift(item);
    this.store.addAudit(actor.id, actor.role, 'integration.manual.enqueue', 'outbox', item.id, { provider: item.provider });
    return item;
  }

  manualTasks(actor: Actor, query: any = {}): ListResult<Record<string, unknown>> {
    this.allow(actor, ['admin', 'pharmacist', 'fulfillment']);
    const keyword = String(query.keyword || query.q || '').trim().toLowerCase();
    const source = this.store.state.outbox.filter((task: any) => task.mode === 'manual' && this.canHandleManualTask(task, actor)
      && (!query.status || query.status === 'all' || task.status === query.status)
      && (!query.provider || task.provider === String(query.provider))
      && (!keyword || `${task.id} ${task.type} ${task.provider} ${task.referenceId || ''}`.toLowerCase().includes(keyword)));
    return this.page(source, query);
  }

  processManualTask(id: string, input: any, actor: Actor) {
    this.allow(actor, ['admin', 'pharmacist', 'fulfillment']);
    const task: any = this.store.state.outbox.find((row: any) => row.id === id && row.mode === 'manual');
    if (!task) throw new NotFoundException('人工任务不存在');
    if (!this.canHandleManualTask(task, actor)) throw new ForbiddenException('无人工任务处理权限');
    const action = String(input?.action || input?.status || '').toLowerCase();
    if (action === 'start' || action === 'processing') {
      if (!['pending', 'failed'].includes(String(task.status))) throw new BadRequestException('当前人工任务不能开始处理');
      task.status = 'processing'; task.startedAt = this.store.timestamp(); task.lastError = undefined;
    } else if (action === 'fail' || action === 'failed') {
      const reason = String(input?.reason || input?.error || '').trim();
      if (!reason) throw new BadRequestException('人工任务失败必须填写原因');
      if (['completed', 'cancelled'].includes(String(task.status))) throw new BadRequestException('已完成任务不能再次失败');
      task.status = 'failed'; task.lastError = reason.slice(0, 1000); task.attempts = Number(task.attempts || 0) + 1; task.failedAt = this.store.timestamp();
    } else if (action === 'complete' || action === 'completed') {
      const evidence = String(input?.evidence || input?.transactionId || input?.manualReference || '').trim();
      if (input?.confirmed !== true || !evidence) throw new BadRequestException('人工任务完成必须明确确认并填写第三方凭证');
      if (task.status === 'completed') return task;
      if (!['pending', 'processing', 'failed'].includes(String(task.status))) throw new BadRequestException('当前人工任务不能完成');
      if (task.type === 'refund' && task.referenceId) {
        if (typeof (this.business as any).confirmRefund !== 'function') throw new BadRequestException('退款确认服务暂不可用，不能标记人工任务完成');
        (this.business as any).confirmRefund(String(task.referenceId), actor, { status: 'succeeded', provider: task.provider, transactionId: evidence });
      }
      task.status = 'completed'; task.result = { evidence }; task.completedAt = this.store.timestamp(); task.attempts = Number(task.attempts || 0) + 1; task.lastError = undefined;
    } else {
      throw new BadRequestException('人工任务操作不合法');
    }
    this.store.addAudit(actor.id, actor.role, `integration.manual.${task.status}`, 'outbox', id, { action, evidence: task.result?.evidence });
    return task;
  }

  retryManualTask(id: string, actor: Actor) {
    this.allow(actor, ['admin', 'pharmacist', 'fulfillment']);
    const task: any = this.store.state.outbox.find((row: any) => row.id === id && row.mode === 'manual');
    if (!task) throw new NotFoundException('人工任务不存在');
    if (!this.canHandleManualTask(task, actor)) throw new ForbiddenException('无人工任务重试权限');
    if (task.status !== 'failed') throw new BadRequestException('只有失败的人工任务可以重试');
    task.status = 'pending'; task.nextRunAt = undefined; task.lastError = undefined; task.retriedAt = this.store.timestamp();
    this.store.addAudit(actor.id, actor.role, 'integration.manual.retry', 'outbox', id, { attempts: task.attempts || 0 });
    return task;
  }

  async reviewMember(id: string, input: any, actor: Actor) {
    this.allow(actor, ['admin']);
    const item: any = this.store.state.memberApplications.find((entry) => entry.id === id); if (!item) throw new NotFoundException('会员申请不存在');
    if (!['pending', 'pending_review'].includes(String(item.status).toLowerCase())) return this.memberApplicationDetail(id, actor);
    if (typeof input?.approved !== 'boolean') throw new BadRequestException('会员审核结果必须明确选择通过或拒绝');
    if (input.approved === false && !String(input.reason || '').trim()) throw new BadRequestException('驳回会员申请需要填写原因');
    const user: any = this.store.state.users.find((entry) => entry.id === item.userId);
    if (!user) throw new BadRequestException('会员申请用户不存在');
    if (input.approved === true) {
      if (String(user.id) !== String(item.userId)) throw new BadRequestException('会员申请与登录用户不匹配');
      if (user.role && !['CONSUMER', 'MEMBER', 'SENIOR_MEMBER'].includes(String(user.role).toUpperCase())) throw new BadRequestException('当前账号不能转为会员');
      const referrer = this.resolveReferrer(item);
      const suggestedSalesId = referrer?.type === 'sales' ? String(referrer.id) : referrer ? this.activeSalesOwner(String(referrer.id)) : undefined;
      const salesPromoterId = String(input.salesPromoterId || suggestedSalesId || '').trim();
      if (!salesPromoterId) throw new BadRequestException('会员审批通过前必须指定销售人员');
      const sales = this.store.state.promoters.find((row: any) => String(row.id) === salesPromoterId && String(row.type).toLowerCase() === 'sales' && row.active !== false);
      if (!sales) throw new BadRequestException('指定的销售人员不存在或已停用');
    }
    const reason = String(input.reason || '').trim().slice(0, 500);
    return this.store.runAtomic(async () => {
      const now = this.store.timestamp();
      item.status = input.approved === true ? 'approved' : 'rejected'; item.statusText = input.approved === true ? '审核通过' : '审核拒绝'; item.reviewNote = reason; item.reviewedAt = now; item.reviewedBy = actor.id; item.reviewerId = actor.id;
      if (input.approved === true) {
        user.role = 'MEMBER';
        const memberLevel = ['SENIOR', 'SENIOR_MEMBER'].includes(String(user.memberLevel || '').toUpperCase()) ? 'SENIOR_MEMBER' : 'ORDINARY_MEMBER';
        user.memberLevel = memberLevel;
        let existingPromoter: any = this.store.state.promoters.find((entry: any) => String(entry.userId || '') === String(item.userId));
        let promoterId: string;
        if (existingPromoter) {
          existingPromoter.type = 'member'; existingPromoter.level = String(existingPromoter.level || '').toUpperCase() === 'SENIOR_MEMBER' ? 'SENIOR_MEMBER' : 'ORDINARY_MEMBER'; existingPromoter.active = true;
          promoterId = String(existingPromoter.id);
        } else {
          promoterId = this.store.newId('promoter');
          existingPromoter = { id: promoterId, userId: String(item.userId), type: 'member', level: memberLevel, name: String(user.nickname || item.name), active: true, createdAt: now };
          this.store.state.promoters.unshift(existingPromoter);
        }
        const referrer = this.resolveReferrer(item);
        const suggestedSalesId = referrer?.type === 'sales' ? String(referrer.id) : referrer ? this.activeSalesOwner(String(referrer.id)) : undefined;
        const salesPromoterId = String(input.salesPromoterId || suggestedSalesId);
        const memberships = this.store.state.promoterMemberships as any[];
        memberships.filter((membership) => String(membership.memberPromoterId) === promoterId && membership.status === 'active').forEach((membership) => { membership.status = 'released'; membership.releasedAt = now; membership.reason = '会员审核重新绑定'; });
        memberships.unshift({ id: this.store.newId('membership'), memberPromoterId: promoterId, salesPromoterId, status: 'active', source: input.salesPromoterId ? 'admin-assignment' : (referrer?.type === 'sales' ? 'sales-referral' : 'member-referral'), createdAt: now, assignedBy: actor.id });
        item.resolvedSalesPromoterId = salesPromoterId;
      }
      this.store.addAudit(actor.id, actor.role, 'member.review', 'member_application', id, { approved: input.approved, reason });
      return item;
    });
  }

  createProduct(input: any, actor: Actor) {
    this.allow(actor, ['admin']);
    if (!input.name || !String(input.name).trim() || !input.category) throw new BadRequestException('商品名称和分类不能为空');
    if (!['daily', 'prescription'].includes(String(input.category))) throw new BadRequestException('商品分类不合法');
    const defaultImage = input.category === 'prescription' ? '/assets/products/dan-nan-xing-default.webp' : '/assets/products/jujube-tea-default.webp';
    const image = typeof input.image === 'string' && input.image.length <= 1600000 ? input.image : defaultImage;
    const priceFen = input.priceFen !== undefined ? this.integerFen(input.priceFen, '商品价格') : Math.round(Number(input.price || 0) * 100); if (priceFen < 0) throw new BadRequestException('商品价格不合法');
    const stock = Number(input.stock ?? 0); if (!Number.isInteger(stock) || stock < 0) throw new BadRequestException('库存数量不合法');
    const item: any = { id: input.id || this.store.newId('product'), name: String(input.name).trim(), category: input.category, price: priceFen / 100, priceFen, stock, unit: input.unit || '件', badge: input.badge || '新品', rewardRule: input.rewardRule || '暂不参与', active: input.active !== false, image, overlay: input.overlay || (input.category === 'prescription' ? '/assets/overlays/botanical-linework.webp' : '/assets/overlays/amber-orbit.webp'), subtitle: input.subtitle || '', description: input.description || '', color: input.color || '#E6F4F1', registrationNo: input.registrationNo || '' };
    const index = this.store.state.products.findIndex((entry) => entry.id === item.id);
    if (index >= 0) this.store.state.products[index] = { ...this.store.state.products[index], ...item } as any; else this.store.state.products.push(item as any);
    const skus = this.collection('skus');
    const defaultSku: any = skus.find((sku: any) => sku.productId === item.id && sku.id === `${item.id}-default`);
    if (defaultSku) { defaultSku.name = item.unit; defaultSku.priceFen = priceFen; defaultSku.price = priceFen / 100; if (input.stock !== undefined) defaultSku.stock = item.stock; defaultSku.updatedAt = this.store.timestamp(); }
    else skus.push({ id: `${item.id}-default`, productId: item.id, name: item.unit, priceFen, price: priceFen / 100, stock: item.stock, active: true, createdAt: this.store.timestamp(), updatedAt: this.store.timestamp() });
    this.store.addAudit(actor.id, actor.role, 'product.save', 'product', item.id);
    return item;
  }

  updateProductStock(id: string, input: any, actor: Actor) {
    this.allow(actor, ['admin', 'fulfillment']);
    const product = this.store.findProduct(id); if (!product) throw new NotFoundException('商品不存在');
    if (input.stock !== undefined) { const stock = Number(input.stock); if (!Number.isInteger(stock) || stock < 0) throw new BadRequestException('库存数量不合法'); product.stock = stock; const defaultSku: any = this.collection('skus').find((sku: any) => sku.productId === id && sku.id === `${id}-default`); if (defaultSku) defaultSku.stock = stock; }
    if (input.active !== undefined) product.active = Boolean(input.active);
    this.store.addAudit(actor.id, actor.role, 'product.inventory.update', 'product', id, { stock: product.stock, active: product.active });
    return product;
  }

  products(query: any, actor: Actor): ListResult<any> {
    this.allow(actor, ['admin', 'fulfillment']);
    const keyword = String(query?.keyword || query?.q || '').trim().toLowerCase();
    const active = query?.active === undefined ? undefined : !['false', '0', 'off'].includes(String(query.active).toLowerCase());
    const source = this.store.state.products.filter((item: any) => (!query?.category || query.category === 'all' || item.category === query.category) && (active === undefined || item.active === active) && (!keyword || `${item.id || ''} ${item.name || ''} ${item.badge || ''} ${item.registrationNo || ''}`.toLowerCase().includes(keyword))).map((item: any) => {
      const skus = this.collection('skus').filter((sku: any) => sku.productId === item.id);
      const batches = this.collection('inventoryBatches').filter((batch: any) => batch.productId === item.id && batch.active !== false);
      const expiringDays = Number(query?.expiringDays || 30); if (!Number.isFinite(expiringDays) || expiringDays < 0) throw new BadRequestException('有效期预警天数不合法');
      const expiryWarning = batches.some((batch: any) => batch.expiresAt && Date.parse(String(batch.expiresAt)) <= Date.now() + expiringDays * 86400000);
      return { ...item, priceFen: item.priceFen ?? Math.round(Number(item.price || 0) * 100), stock: this.availableStock(item.id, item.stock), skuCount: skus.length, expiryWarning };
    });
    return this.page(source, query);
  }

  productDetail(id: string, actor: Actor) {
    this.allow(actor, ['admin', 'fulfillment']); const product = this.store.findProduct(id); if (!product) throw new NotFoundException('商品不存在');
    return { ...product, priceFen: (product as any).priceFen ?? Math.round(Number(product.price || 0) * 100), stock: this.availableStock(id, product.stock), skus: this.collection('skus').filter((row: any) => row.productId === id), batches: this.collection('inventoryBatches').filter((row: any) => row.productId === id), movements: this.collection('inventoryMovements').filter((row: any) => row.productId === id).slice(0, 100) };
  }

  deleteProduct(id: string, actor: Actor) {
    this.allow(actor, ['admin']); const product = this.store.findProduct(id); if (!product) throw new NotFoundException('商品不存在');
    const used = this.store.state.orders.some((order) => order.items.some((line) => line.productId === id)); if (used) { product.active = false; this.store.addAudit(actor.id, actor.role, 'product.archive', 'product', id); return { id, deleted: false, archived: true }; }
    const index = this.store.state.products.findIndex((row) => row.id === id); this.store.state.products.splice(index, 1); this.store.addAudit(actor.id, actor.role, 'product.delete', 'product', id); return { id, deleted: true };
  }

  skus(productId: string, actor: Actor): ListResult<any> { this.allow(actor, ['admin', 'fulfillment']); if (!this.store.findProduct(productId)) throw new NotFoundException('商品不存在'); return this.collection('skus').filter((row: any) => row.productId === productId); }
  saveSku(productId: string, input: any, actor: Actor) {
    this.allow(actor, ['admin']); if (!this.store.findProduct(productId)) throw new NotFoundException('商品不存在'); if (!input.name || !String(input.name).trim()) throw new BadRequestException('规格名称不能为空');
    const priceFen = input.priceFen !== undefined ? this.integerFen(input.priceFen, '规格价格') : Math.round(Number(input.price || 0) * 100); if (priceFen < 0) throw new BadRequestException('规格价格不合法');
    const stock = Number(input.stock ?? 0); if (!Number.isInteger(stock) || stock < 0) throw new BadRequestException('规格库存不合法');
    const skus = this.collection('skus'); const previous: any = input.id ? skus.find((row: any) => row.id === String(input.id)) : undefined; if (previous && previous.productId !== productId) throw new ForbiddenException('无规格修改权限'); const item: any = { id: input.id || this.store.newId('sku'), productId, name: String(input.name).trim(), priceFen, price: priceFen / 100, stock, active: input.active !== false, createdAt: input.createdAt || this.store.timestamp(), updatedAt: this.store.timestamp() };
    const index = skus.findIndex((row: any) => row.id === item.id); if (index >= 0) skus[index] = { ...skus[index], ...item }; else skus.push(item);
    this.syncProductStock(productId); this.store.addAudit(actor.id, actor.role, 'product.sku.save', 'sku', item.id, { productId }); return item;
  }

  deleteSku(productId: string, skuId: string, actor: Actor) {
    this.allow(actor, ['admin']); const product = this.store.findProduct(productId); if (!product) throw new NotFoundException('商品不存在'); const skus = this.collection('skus'); const index = skus.findIndex((row: any) => row.id === skuId && row.productId === productId); if (index < 0) throw new NotFoundException('规格不存在');
    if (skuId === `${productId}-default`) throw new BadRequestException('默认规格不能删除'); const used = this.store.state.orders.some((order: any) => order.items.some((line: any) => line.skuId === skuId)); const batches = this.collection('inventoryBatches').filter((row: any) => row.skuId === skuId); if (batches.some((row: any) => Number(row.reservedQuantity || 0) > 0)) throw new BadRequestException('该规格存在预占库存，不能删除'); if (used || batches.some((row: any) => Number(row.quantity || 0) > 0)) { skus[index].active = false; this.store.addAudit(actor.id, actor.role, 'product.sku.archive', 'sku', skuId, { productId }); return { id: skuId, deleted: false, archived: true }; }
    skus.splice(index, 1); this.syncProductStock(productId); this.store.addAudit(actor.id, actor.role, 'product.sku.delete', 'sku', skuId, { productId }); return { id: skuId, deleted: true };
  }

  inventoryBatches(query: any, actor: Actor): ListResult<any> {
    this.allow(actor, ['admin', 'fulfillment']); const expiringDays = Number(query?.expiringDays || 0); if (!Number.isFinite(expiringDays) || expiringDays < 0) throw new BadRequestException('有效期预警天数不合法'); const threshold = Date.now() + Math.max(0, expiringDays) * 86400000; const expiredOnly = query?.expired !== undefined && ['true', '1', 'yes'].includes(String(query.expired).toLowerCase()); const active = query?.active === undefined ? undefined : !['false', '0', 'off'].includes(String(query.active).toLowerCase());
    const source = this.collection('inventoryBatches').filter((row: any) => (!query?.productId || row.productId === query.productId) && (!query?.skuId || row.skuId === query.skuId) && (active === undefined || (row.active !== false) === active) && (!expiredOnly || (row.expiresAt && Date.parse(String(row.expiresAt)) <= threshold)));
    return this.page(source, query);
  }
  saveInventoryBatch(input: any, actor: Actor) {
    this.allow(actor, ['admin', 'fulfillment']); if (!input.productId || !this.store.findProduct(String(input.productId))) throw new BadRequestException('商品不存在');
    const quantity = Number(input.quantity); if (!Number.isInteger(quantity) || quantity < 0) throw new BadRequestException('库存数量不合法');
    const expiresAt = input.expiresAt ? String(input.expiresAt).slice(0, 10) : undefined; if (expiresAt && !Number.isFinite(Date.parse(`${expiresAt}T23:59:59.999Z`))) throw new BadRequestException('有效期不合法');
    const skus = this.collection('skus'); let skuId = input.skuId ? String(input.skuId) : undefined; let sku: any = skuId ? skus.find((row: any) => row.id === skuId) : skus.find((row: any) => row.productId === String(input.productId) && row.id === `${input.productId}-default`);
    if (!sku) { if (skuId) throw new BadRequestException('规格不存在或不属于该商品'); const product: any = this.store.findProduct(String(input.productId)); skuId = `${input.productId}-default`; sku = { id: skuId, productId: String(input.productId), name: product.unit, priceFen: product.priceFen ?? Math.round(Number(product.price || 0) * 100), price: product.price, stock: product.stock, active: true, createdAt: this.store.timestamp(), updatedAt: this.store.timestamp() }; skus.push(sku); }
    if (sku.productId !== String(input.productId)) throw new BadRequestException('规格不属于该商品');
    const batches = this.collection('inventoryBatches'); const existing: any = input.id ? batches.find((row: any) => row.id === input.id) : undefined;
    if (existing && existing.productId !== String(input.productId)) throw new ForbiddenException('无库存批次修改权限');
    const item: any = { id: input.id || this.store.newId('batch'), productId: String(input.productId), skuId, batchNo: String(input.batchNo || '').trim() || this.store.newId('batch-no'), quantity, reservedQuantity: Math.max(0, Number(existing?.reservedQuantity || 0)), expiresAt, receivedAt: existing?.receivedAt || this.store.timestamp(), active: input.active !== false, updatedAt: this.store.timestamp() };
    if (batches.some((row: any) => row.id !== item.id && row.productId === item.productId && row.skuId === item.skuId && row.batchNo === item.batchNo)) throw new BadRequestException('同一商品的批号不能重复');
    if (item.quantity < item.reservedQuantity) throw new BadRequestException('库存不能少于已预占数量');
    const index = batches.findIndex((row: any) => row.id === item.id); if (index >= 0) batches[index] = { ...batches[index], ...item }; else batches.push(item);
    this.syncProductStock(item.productId); this.store.addAudit(actor.id, actor.role, 'inventory.batch.save', 'inventory_batch', item.id, { quantity, expiresAt }); return item;
  }
  adjustInventoryBatch(id: string, input: any, actor: Actor) {
    this.allow(actor, ['admin', 'fulfillment']); const batch: any = this.collection('inventoryBatches').find((row: any) => row.id === id); if (!batch) throw new NotFoundException('库存批次不存在'); const delta = Number(input.quantity); if (!Number.isInteger(delta) || delta === 0) throw new BadRequestException('库存调整数量不合法'); const movements = this.collection('inventoryMovements'); if (input.idempotencyKey) { const previous = movements.find((row: any) => row.idempotencyKey === String(input.idempotencyKey)); if (previous) return batch; } const next = Number(batch.quantity) + delta; if (next < Number(batch.reservedQuantity || 0)) throw new BadRequestException('调整后库存不能少于已预占数量'); batch.quantity = next; batch.updatedAt = this.store.timestamp(); movements.unshift({ id: this.store.newId('movement'), productId: batch.productId, skuId: batch.skuId, batchId: id, quantity: delta, kind: 'adjust', referenceId: input.referenceId, idempotencyKey: input.idempotencyKey, createdAt: this.store.timestamp(), actorId: actor.id }); this.syncProductStock(batch.productId); this.store.addAudit(actor.id, actor.role, 'inventory.batch.adjust', 'inventory_batch', id, { delta }); return batch;
  }

  deleteInventoryBatch(id: string, actor: Actor) {
    this.allow(actor, ['admin', 'fulfillment']); const batch: any = this.collection('inventoryBatches').find((row: any) => row.id === id); if (!batch) throw new NotFoundException('库存批次不存在'); if (Number(batch.reservedQuantity || 0) > 0) throw new BadRequestException('已有预占库存，不能停用批次'); batch.active = false; batch.updatedAt = this.store.timestamp(); this.syncProductStock(batch.productId); this.store.addAudit(actor.id, actor.role, 'inventory.batch.archive', 'inventory_batch', id); return { id, deleted: false, archived: true };
  }

  manualPrescription(input: any, actor: Actor) {
    this.allow(actor, ['admin', 'pharmacist']);
    if (!input.userId || !input.patientName || !input.itemName) throw new BadRequestException('人工录入处方信息不完整');
    const patient = input.patientId
      ? this.store.state.patients.find((row) => row.id === String(input.patientId) && row.userId === String(input.userId))
      : this.store.state.patients.find((row) => row.userId === String(input.userId) && row.name === String(input.patientName));
    if (!patient) throw new BadRequestException('处方必须绑定该用户的实名就诊人');
    if (!input.fileKey) throw new BadRequestException('人工录入处方必须绑定处方文件');
    const files = this.collection('files'); const file: any = files.find((row: any) => row.key === String(input.fileKey) || row.id === String(input.fileKey));
    if (!file || file.purpose !== 'prescription' || (file.ownerId && file.ownerId !== String(input.userId))) throw new BadRequestException('处方文件不存在或不属于该用户');
    const validUntil = String(input.validUntil || '').slice(0, 10); if (!validUntil || !Number.isFinite(Date.parse(`${validUntil}T23:59:59.999Z`)) || Date.parse(`${validUntil}T23:59:59.999Z`) < Date.now()) throw new BadRequestException('处方有效期不合法');
    const product: any = input.productId ? this.store.findProduct(String(input.productId)) : this.store.state.products.find((row: any) => row.category === 'prescription' && row.name === String(input.itemName));
    if (!product || product.category !== 'prescription') throw new BadRequestException('处方品种必须绑定有效处方商品');
    const item = { id: this.store.newId('rx'), userId: input.userId, patientName: patient.name, patientId: patient.id, source: 'offline', status: 'approved', statusText: '审核通过', itemName: product.name, productId: product.id, skuId: input.skuId, validUntil, fileKey: input.fileKey, externalId: input.externalId, reviewerId: actor.id, reviewedAt: this.store.timestamp() };
    this.store.state.prescriptions.unshift(item as any);
    this.store.addAudit(actor.id, actor.role, 'prescription.manual.create', 'prescription', item.id);
    return item;
  }

  promoters(actor: Actor, query: any = {}): ListResult<Record<string, unknown>> {
    this.allow(actor, ['admin', 'sales']);
    const keyword = String(query.keyword || query.q || '').trim().toLowerCase(); const owned = this.actorPromoterIds(actor);
    const classQuery = String(query.class || query.type || '').toLowerCase();
    const activeQuery = query.active === undefined ? 'true' : String(query.active).toLowerCase();
    const source = this.store.state.promoters
      .filter((item: any) => {
        const type = String(item.type || '').toLowerCase();
        const matchesClass = !classQuery || classQuery === 'all' || (['sales', 'salesperson', 'staff', 'sales_staff'].includes(classQuery) ? type === 'sales' : ['member', 'ordinary_member', 'senior_member'].includes(classQuery) ? type === 'member' : type === classQuery);
        return (actor.role !== 'sales' || owned.has(String(item.id))) && matchesClass && (!activeQuery || activeQuery === 'all' || item.active === !['false', '0', 'off'].includes(activeQuery)) && (!keyword || `${item.id} ${item.name} ${item.level} ${item.userId || ''}`.toLowerCase().includes(keyword));
      })
      .map((item: any) => this.promoterView(item));
    return this.page(source, query, true);
  }
  promoAssets(actor: Actor) { if (!['admin', 'sales', 'member'].includes(actor.role)) throw new ForbiddenException('无推广素材权限'); return { promoterId: actor.id, sharePath: `/pages/index/index?promoter=${encodeURIComponent(actor.id)}`, articleSharePath: `/pages/articles/list?promoter=${encodeURIComponent(actor.id)}`, poster: { mode: 'manual-template', status: 'ready', templateKey: 'health-default-v1' }, qrPayload: { scene: `p=${actor.id}`, page: 'pages/index/index' } }; }
  relationships(actor: Actor, query: any = {}): ListResult<Record<string, unknown>> {
    this.allow(actor, ['admin', 'sales']); const owned = this.actorPromoterIds(actor);
    const source = this.store.state.promoterRelations.filter((item: any) => (actor.role !== 'sales' || owned.has(String(item.promoterId))) && (!query.promoterId || (actor.role !== 'sales' && item.promoterId === query.promoterId)) && (!query.customerId || item.customerId === query.customerId) && (query.active === undefined || item.active === !['false', '0', 'off'].includes(String(query.active).toLowerCase())));
    return this.page(source, query);
  }
  assignRelationship(input: any, actor: Actor) {
    this.allow(actor, ['admin']);
    if (!input.promoterId || !input.customerId) throw new BadRequestException('推广人和客户不能为空');
    const promoter = this.store.state.promoters.find((item) => item.id === String(input.promoterId) && item.active !== false);
    if (!promoter) throw new BadRequestException('推广人不存在或已停用');
    if (String((promoter as any).type).toLowerCase() === 'member' && !this.activeSalesOwner(String((promoter as any).id))) throw new BadRequestException('会员必须先绑定有效销售人员');
    const customer = this.store.state.customers.find((item) => item.id === String(input.customerId));
    if (!customer) throw new BadRequestException('客户不存在');
    if (String(input.promoterId) === String(input.customerId) || String(promoter.userId || '') === String(input.customerId)) throw new BadRequestException('不能将客户归属到本人');
    const relations = this.store.state.promoterRelations as any[];
    const ancestors = new Set<string>(); let cursor = String(input.promoterId);
    while (cursor) { if (cursor === String(input.customerId)) throw new BadRequestException('推广关系不能形成循环'); if (ancestors.has(cursor)) throw new BadRequestException('当前推广关系存在循环，请先修复'); ancestors.add(cursor); const parent = relations.find((item) => item.customerId === cursor && item.active); cursor = parent ? String(parent.promoterId) : ''; }
    const current = relations.find((item) => item.customerId === String(input.customerId) && item.active);
    if (current && current.promoterId === String(input.promoterId)) return current;
    this.ensureSettings();
    if (current && !(this.store.state.settings as any).allowRelationshipTransfer) throw new BadRequestException('当前设置不允许转移推广关系');
    if (current && !String(input.reason || '').trim()) throw new BadRequestException('转移推广关系必须填写原因');
    if (current) { current.active = false; current.releasedAt = this.store.timestamp(); current.releaseReason = String(input.reason); }
    const relation = { id: this.store.newId('rel'), promoterId: String(input.promoterId), customerId: String(input.customerId), source: input.source || 'admin-assignment', active: true, assignedAt: this.store.timestamp(), assignedBy: actor.id, transferReason: input.reason || undefined };
    relations.push(relation);
    customer.promoter = relation.promoterId;
    this.store.state.customerAttributions.filter((row: any) => String(row.customerId) === String(customer.id) && row.active !== false).forEach((row: any) => { row.active = false; row.releasedAt = this.store.timestamp(); row.releaseReason = String(input.reason || '关系重新绑定'); });
    this.store.state.customerAttributions.push({ id: this.store.newId('attr'), customerId: customer.id, ownerKind: String((promoter as any).type).toLowerCase() === 'sales' ? 'sales' : 'member', ownerPromoterId: String(promoter.id), source: input.source || 'admin-assignment', active: true, boundAt: this.store.timestamp(), assignedBy: actor.id });
    this.store.addAudit(actor.id, actor.role, current ? 'promoter.relation.transfer' : 'promoter.relation.assign', 'promoter_relation', relation.id, { customerId: relation.customerId, promoterId: relation.promoterId, previousPromoterId: current?.promoterId, reason: input.reason });
    return relation;
  }

  relationTree(actor: Actor) {
    this.allow(actor, ['admin', 'sales']);
    const promoterIds = actor.role === 'admin'
      ? new Set(this.store.state.promoters.map((item: any) => String(item.id)))
      : this.actorPromoterIds(actor);
    const memberships = this.store.state.promoterMemberships.filter((item: any) => actor.role === 'admin' || promoterIds.has(String(item.salesPromoterId)) || promoterIds.has(String(item.memberPromoterId)));
    const attributions = this.store.state.customerAttributions.filter((item: any) => actor.role === 'admin' || promoterIds.has(String(item.ownerPromoterId)));
    return {
      sales: this.store.state.promoters.filter((item: any) => item.type === 'sales' && (actor.role === 'admin' || promoterIds.has(String(item.id)))),
      members: this.store.state.promoters.filter((item: any) => item.type === 'member' && (actor.role === 'admin' || promoterIds.has(String(item.id)) || memberships.some((row: any) => String(row.salesPromoterId) === String(item.id)))),
      memberships,
      attributions,
      companyCustomers: this.store.state.customers.filter((item: any) => String(item.promoter || '') === 'company' || attributions.some((row: any) => String(row.customerId) === String(item.id) && row.ownerKind === 'company'))
    };
  }

  salesRelationList(actor: Actor, query: any = {}): ListResult<Record<string, unknown>> {
    this.allow(actor, ['admin']);
    const keyword = String(query.keyword || query.q || '').trim().toLowerCase();
    const source = this.store.state.promoters.filter((row: any) => String(row.type).toLowerCase() === 'sales' && row.active !== false && (!keyword || `${row.id} ${row.name} ${row.userId || ''}`.toLowerCase().includes(keyword)));
    return this.page(source.map((row: any) => this.promoterView(row)), query, true);
  }

  salesRelationTree(salesId: string, actor: Actor, query: any = {}) {
    this.allow(actor, ['admin']);
    const sales: any = this.store.state.promoters.find((row: any) => String(row.id) === String(salesId) && String(row.type).toLowerCase() === 'sales' && row.active !== false);
    if (!sales) throw new NotFoundException('销售人员不存在或已停用');
    const memberships = this.store.state.promoterMemberships.filter((row: any) => String(row.salesPromoterId) === String(salesId) && row.status === 'active');
    const memberIds = new Set(memberships.map((row: any) => String(row.memberPromoterId)));
    const members = this.store.state.promoters.filter((row: any) => memberIds.has(String(row.id)) && row.active !== false).map((row: any) => this.promoterView(row));
    const ownerIds = new Set([String(salesId), ...Array.from(memberIds)]);
    const relations = this.store.state.promoterRelations.filter((row: any) => row.active !== false && ownerIds.has(String(row.promoterId)));
    const attributions = this.store.state.customerAttributions.filter((row: any) => row.active !== false && ownerIds.has(String(row.ownerPromoterId)));
    const boundIds = new Set([...relations.map((row: any) => String(row.customerId)), ...attributions.map((row: any) => String(row.customerId))]);
    const keyword = String(query.keyword || query.q || '').trim().toLowerCase();
    const matches = (row: any) => !keyword || `${row.id} ${row.name} ${row.lastOrder || ''} ${row.promoter || ''}`.toLowerCase().includes(keyword);
    const customers = this.store.state.customers.filter((row: any) => boundIds.has(String(row.id)) && matches(row));
    const unboundCustomers = this.store.state.customers.filter((row: any) => (!row.promoter || row.promoter === 'company' || !this.store.state.promoterRelations.some((rel: any) => rel.active !== false && String(rel.customerId) === String(row.id))) && matches(row));
    const nestedMembers = members.map((member: any) => ({
      ...member,
      customers: customers.filter((customer: any) => String(customer.promoter || customer.promoterId || '') === String(member.id) || attributions.some((row: any) => String(row.ownerPromoterId) === String(member.id) && String(row.customerId) === String(customer.id)))
    }));
    return { sales: this.promoterView(sales), memberships, members: nestedMembers, relations, attributions, customers, unboundCustomers };
  }

  network(actor: Actor) {
    this.allow(actor, ['member', 'sales']);
    const promoter: any = this.store.state.promoters.find((row: any) => String(row.userId || row.id) === String(actor.id));
    if (!promoter) return { role: actor.role, promoter: null, superior: null, members: [], sales: [], customers: [] };
    const promoterId = String(promoter.id);
    const memberships = this.store.state.promoterMemberships.filter((row: any) => row.status === 'active');
    const superiorId = memberships.find((row: any) => String(row.memberPromoterId) === promoterId)?.salesPromoterId;
    const superior = superiorId ? this.store.state.promoters.find((row: any) => String(row.id) === String(superiorId)) : null;
    const memberIds = actor.role === 'sales' ? memberships.filter((row: any) => String(row.salesPromoterId) === promoterId).map((row: any) => String(row.memberPromoterId)) : [promoterId];
    const memberRows = this.store.state.promoters.filter((row: any) => memberIds.includes(String(row.id)) && row.active !== false).map((row: any) => this.promoterView(row));
    const ownerIds = new Set([promoterId, ...memberIds]);
    const customers = this.store.state.customers.filter((row: any) => ownerIds.has(String(row.promoter || row.promoterId || '')) || this.store.state.customerAttributions.some((attr: any) => attr.active !== false && ownerIds.has(String(attr.ownerPromoterId)) && String(attr.customerId) === String(row.id)));
    const subordinateSales = actor.role === 'sales' ? this.store.state.promoters.filter((row: any) => row.active !== false && String(row.type).toLowerCase() === 'sales' && String(row.id) !== promoterId && memberships.some((link: any) => String(link.salesPromoterId) === promoterId && String(link.memberPromoterId) === String(row.id))).map((row: any) => this.promoterView(row)) : [];
    return { role: actor.role, promoter: this.promoterView(promoter), superior: superior ? this.promoterView(superior) : null, members: memberRows, sales: subordinateSales, customers };
  }

  async batchAssignRelations(input: any, actor: Actor) {
    this.allow(actor, ['admin']);
    const targetType = String(input?.targetType || '').toLowerCase(); const targetId = String(input?.targetId || ''); const reason = String(input?.reason || '').trim();
    if (!targetId || !['sales', 'member'].includes(targetType)) throw new BadRequestException('关系绑定目标不完整');
    if (!reason) throw new BadRequestException('关系绑定必须填写原因');
    const memberIds = Array.from(new Set((Array.isArray(input?.memberIds) ? input.memberIds : []).map(String).filter(Boolean)));
    const customerIds = Array.from(new Set((Array.isArray(input?.customerIds) ? input.customerIds : []).map(String).filter(Boolean)));
    if (!memberIds.length && !customerIds.length) throw new BadRequestException('请选择会员或客户');
    const target: any = this.store.state.promoters.find((row: any) => String(row.id) === targetId && row.active !== false);
    if (!target || (targetType === 'sales' && String(target.type).toLowerCase() !== 'sales') || (targetType === 'member' && String(target.type).toLowerCase() !== 'member')) throw new BadRequestException('关系绑定目标不合法');
    // Validate the entire batch before the first write. runAtomic additionally
    // restores the exact memory snapshot if durable persistence fails.
    if (memberIds.length && targetType !== 'sales') throw new BadRequestException('会员只能绑定到销售人员');
    const memberRows = memberIds.map((memberId) => this.store.state.promoters.find((row: any) => String(row.id) === memberId && String(row.type).toLowerCase() === 'member' && row.active !== false));
    if (memberRows.some((row) => !row)) throw new BadRequestException('选择的会员不存在或已停用');
    const customerRows = customerIds.map((customerId) => this.store.state.customers.find((row: any) => String(row.id) === customerId));
    if (customerRows.some((row) => !row)) throw new BadRequestException('选择的客户不存在');
    if (targetType === 'member' && !this.activeSalesOwner(targetId)) throw new BadRequestException('会员必须先绑定有效销售人员');
    return this.store.runAtomic(async () => {
      const changed: any[] = [];
      for (const memberId of memberIds) {
        this.store.state.promoterMemberships.filter((row: any) => String(row.memberPromoterId) === memberId && row.status === 'active' && String(row.salesPromoterId) !== targetId).forEach((row: any) => { row.status = 'released'; row.releasedAt = this.store.timestamp(); row.reason = reason; });
        const existing = this.store.state.promoterMemberships.find((row: any) => String(row.memberPromoterId) === memberId && String(row.salesPromoterId) === targetId && row.status === 'active');
        if (!existing) { const relation = { id: this.store.newId('membership'), memberPromoterId: memberId, salesPromoterId: targetId, status: 'active', source: input.source || 'admin-assignment', reason, assignedBy: actor.id, createdAt: this.store.timestamp() }; this.store.state.promoterMemberships.unshift(relation); changed.push(relation); }
      }
      for (const customerId of customerIds) changed.push(this.assignRelationship({ promoterId: targetId, customerId, source: input.source || 'admin-assignment', reason }, actor));
      this.store.addAudit(actor.id, actor.role, 'promoter.relation.batch-assign', 'promoter_relation', targetId, { targetType, memberIds, customerIds, reason });
      return { targetId, targetType, changedCount: changed.length, changed };
    });
  }

  async unbindRelation(input: any, actor: Actor) {
    this.allow(actor, ['admin']);
    const kind = String(input?.kind || 'customer'); const id = String(input?.id || ''); const reason = String(input?.reason || '').trim();
    if (!id || !reason) throw new BadRequestException('解除关系需要对象和原因');
    return this.store.runAtomic(async () => {
      if (kind === 'member') {
        const rows = this.store.state.promoterMemberships.filter((row: any) => String(row.memberPromoterId) === id && row.status === 'active');
        rows.forEach((row: any) => { row.status = 'released'; row.releasedAt = this.store.timestamp(); row.reason = reason; });
        this.store.state.customerAttributions.filter((row: any) => String(row.ownerPromoterId) === id && row.active !== false).forEach((row: any) => { row.active = false; row.releasedAt = this.store.timestamp(); row.releaseReason = reason; });
        this.store.state.customers.filter((row: any) => String(row.promoter || row.promoterId || '') === id).forEach((customer: any) => { customer.promoter = 'company'; this.store.state.customerAttributions.push({ id: this.store.newId('attr'), customerId: customer.id, ownerKind: 'company', source: 'unbind', active: true, boundAt: this.store.timestamp(), assignedBy: actor.id }); });
        this.store.addAudit(actor.id, actor.role, 'promoter.membership.unbind', 'promoter_membership', id, { reason });
        return { kind, id, count: rows.length };
      }
      const rows = this.store.state.promoterRelations.filter((row: any) => String(row.customerId) === id && row.active !== false);
      rows.forEach((row: any) => { row.active = false; row.releasedAt = this.store.timestamp(); row.releaseReason = reason; });
      this.store.state.customerAttributions.filter((row: any) => String(row.customerId) === id && row.active !== false).forEach((row: any) => { row.active = false; row.releasedAt = this.store.timestamp(); row.releaseReason = reason; });
      const customer: any = this.store.state.customers.find((row: any) => String(row.id) === id); if (customer) { customer.promoter = 'company'; this.store.state.customerAttributions.push({ id: this.store.newId('attr'), customerId: id, ownerKind: 'company', source: 'unbind', active: true, boundAt: this.store.timestamp(), assignedBy: actor.id }); }
      this.store.addAudit(actor.id, actor.role, 'promoter.customer.unbind', 'customer_attribution', id, { reason });
      return { kind: 'customer', id, count: rows.length };
    });
  }

  salesSummary(actor: Actor) {
    this.allow(actor, ['admin', 'sales', 'member']);
    if (actor.role === 'admin') return this.business.salesOverview('u-demo');
    return this.business.salesOverview(actor.id);
  }

  salesPerformance(query: any = {}, actor: Actor): ListResult<Record<string, unknown>> {
    this.allow(actor, ['admin', 'sales', 'member']);
    const owned = actor.role === 'admin' ? undefined : this.actorPromoterIds(actor);
    const from = query.from ? Date.parse(`${query.from}T00:00:00.000Z`) : undefined;
    const to = query.to ? Date.parse(`${query.to}T23:59:59.999Z`) : undefined;
    const source = this.store.state.performanceLedger.filter((row: any) => {
      const created = Date.parse(String(row.createdAt || ''));
      const promoter = String(row.promoterId || '');
      return row.status !== 'cancelled' && (!owned || owned.has(promoter)) && (!query.promoterId || promoter === String(query.promoterId)) && (!query.period || String(row.period) === String(query.period)) && (from === undefined || created >= from) && (to === undefined || created <= to);
    });
    return this.page(source, query);
  }

  rewardLedger(query: any = {}, actor: Actor): ListResult<Record<string, unknown>> {
    this.allow(actor, ['admin', 'sales', 'member']);
    const owned = actor.role === 'admin' ? undefined : this.actorPromoterIds(actor);
    const source = this.store.state.commissions.filter((row: any) => (!owned || owned.has(String(row.promoterId))) && (!query.status || query.status === 'all' || String(row.status) === String(query.status)) && (!query.promoterId || String(row.promoterId) === String(query.promoterId)));
    return this.page(source, query);
  }

  agentOrderDrafts(query: any = {}, actor: Actor): ListResult<Record<string, unknown>> {
    this.allow(actor, ['admin', 'sales']);
    const ownedPromoterId = actor.role === 'admin' ? undefined : String(actor.id);
    const now = Date.now();
    const source = this.store.state.salesOrderDrafts
      .filter((row: any) => !ownedPromoterId || String(row.promoterId) === ownedPromoterId)
      .map((row: any) => {
        const status = !['paid', 'cancelled', 'customer_confirmed'].includes(String(row.status)) && Date.parse(String(row.expiresAt || '')) < now ? 'expired' : String(row.status || 'sent');
        return { ...row, status, itemCount: Array.isArray(row.items) ? row.items.reduce((sum: number, item: any) => sum + Number(item.quantity || 0), 0) : 0 };
      })
      .filter((row: any) => !query.status || query.status === 'all' || String(row.status) === String(query.status));
    return this.page(source, query);
  }

  createAgentOrderDraft(input: any, actor: Actor) {
    this.allow(actor, ['sales']);
    const customerId = String(input.customerId || '');
    const relation = this.store.state.promoterRelations.find((row: any) => row.active !== false && String(row.promoterId) === String(actor.id) && String(row.customerId) === customerId);
    if (!relation) throw new ForbiddenException('销售人员只能为名下客户创建代客订单');
    if (!Array.isArray(input.items) || input.items.length === 0) throw new BadRequestException('代客订单不能为空');
    const items = input.items.map((line: any) => {
      const product = this.store.findProduct(String(line.productId));
      if (!product || product.category !== 'daily') throw new BadRequestException('代客订单只允许板块二商品');
      const sku = this.store.state.skus.find((row: any) => String(row.id) === String(line.skuId || `${product.id}-default`) && String(row.productId) === String(product.id) && row.active !== false);
      const quantity = Number(line.quantity);
      if (!sku || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) throw new BadRequestException('代客订单商品或数量不合法');
      return { productId: product.id, skuId: sku.id, quantity, name: product.name, skuName: sku.name, unitPriceFen: Number(sku.priceFen || 0) };
    });
    const token = randomBytes(24).toString('base64url');
    const draft: any = { id: this.store.newId('draft'), token, promoterId: actor.id, customerId, items, status: 'sent', expiresAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), createdAt: this.store.timestamp() };
    this.store.state.salesOrderDrafts.unshift(draft);
    this.store.addAudit(actor.id, actor.role, 'sales.agent-order.create', 'sales_order_draft', draft.id, { customerId, itemCount: items.length });
    return draft;
  }

  agentOrderDraft(token: string, actor: Actor) {
    const draft: any = this.store.state.salesOrderDrafts.find((row: any) => row.token === token);
    if (!draft) throw new NotFoundException('代客订单不存在');
    if (Date.parse(String(draft.expiresAt)) < Date.now() && !['paid', 'cancelled'].includes(String(draft.status))) { draft.status = 'expired'; }
    if (actor.id !== draft.customerId && !['admin', 'sales'].includes(actor.role)) throw new ForbiddenException('无代客订单查看权限');
    return draft;
  }

  confirmAgentOrderDraft(token: string, input: any, actor: Actor) {
    const draft: any = this.agentOrderDraft(token, actor);
    if (actor.id !== draft.customerId) throw new ForbiddenException('只有客户本人可以确认代客订单');
    if (draft.status !== 'sent') throw new BadRequestException('代客订单当前不能确认');
    if (!input?.address?.name || !input?.address?.phone || !input?.address?.detail) throw new BadRequestException('请完善收货地址');
    const order = this.business.createOrder({ customerUserId: draft.customerId, items: draft.items, address: input.address, idempotencyKey: `draft:${draft.id}` }, { id: draft.promoterId, role: 'sales', idempotencyKey: `draft:${draft.id}` });
    draft.status = 'customer_confirmed'; draft.orderId = order.id; draft.confirmedAt = this.store.timestamp();
    this.store.addAudit(actor.id, actor.role, 'sales.agent-order.confirm', 'sales_order_draft', draft.id, { orderId: order.id });
    return { draft, order };
  }

  saveArticle(input: any, actor: Actor) {
    this.allow(actor, ['admin']);
    if (!input.title || !String(input.title).trim() || !input.body || !String(input.body).trim()) throw new BadRequestException('文章标题和正文不能为空');
    const category = this.normalizeCategory(input.category || input.tag || 'daily-health');
    if (!category) throw new BadRequestException('文章分类不合法');
    const productIds: string[] = Array.isArray(input.productIds) ? Array.from(new Set(input.productIds.map((id: unknown) => String(id)))) : (Array.isArray((input.id ? this.store.state.articles.find((entry) => entry.id === input.id) as any : undefined)?.productIds) ? Array.from(new Set(((this.store.state.articles.find((entry) => entry.id === input.id) as any).productIds as unknown[]).map((id) => String(id)))) : []);
    productIds.forEach((id) => { if (!this.store.findProduct(id)) throw new BadRequestException(`绑定商品不存在：${id}`); });
    const previous: any = input.id ? this.store.state.articles.find((entry) => entry.id === input.id) : undefined;
    const jumpToShop = input.jumpToShop === undefined ? Boolean(previous?.jumpToShop) : Boolean(input.jumpToShop); const published = input.published === undefined ? Boolean(previous?.published) : input.published === true; const recommended = input.recommended === undefined ? Boolean(previous?.recommended) : Boolean(input.recommended);
    if (recommended && !published) throw new BadRequestException('草稿文章不能设置首页推荐');
    const jumpTarget = input.jumpTarget || (productIds[0] ? `/pages/shop/detail?id=${productIds[0]}` : (['prescription-guide', 'clinic-service'].includes(category) ? '/pages/prescriptions/list' : (jumpToShop ? '/pages/shop/list' : '')));
    if (jumpTarget && !String(jumpTarget).startsWith('/pages/')) throw new BadRequestException('文章跳转目标不合法');
    const coverMode = (input.coverMode || previous?.coverMode) === 'custom' ? 'custom' : 'system';
    const defaultCover = SYSTEM_ARTICLE_COVERS.has(`/assets/articles/generated/${category}.webp`) ? `/assets/articles/generated/${category}.webp` : '/assets/articles/generated/daily-health.webp';
    const previousCoverKey = previous?.coverKey || defaultCover;
    const coverKey = String(input.coverKey || previousCoverKey);
    const coverWidth = Number(input.coverWidth || 1280);
    const coverHeight = Number(input.coverHeight || 720);
    if (coverMode === 'system' && !SYSTEM_ARTICLE_COVERS.has(coverKey)) throw new BadRequestException('系统封面不在允许范围内');
    if (coverMode === 'custom') {
      const file: any = this.store.findFile(coverKey);
      if (!file || file.purpose !== 'article-cover') throw new BadRequestException('文章封面文件不存在或用途不正确');
      if (coverWidth !== 1280 || coverHeight !== 720) throw new BadRequestException('文章封面必须裁剪为16:9，尺寸为1280×720');
    }
    const item = { id: input.id || this.store.newId('article'), title: String(input.title).trim().slice(0, 180), tag: category, category, summary: String(input.summary || '').slice(0, 1000), body: String(input.body), productIds, jumpToShop, jumpTarget, published, recommended, coverMode, coverKey, coverWidth, coverHeight, updatedAt: this.store.timestamp() };
    const index = this.store.state.articles.findIndex((entry) => entry.id === item.id);
    if (index >= 0) this.store.state.articles[index] = { ...this.store.state.articles[index], ...item }; else this.store.state.articles.unshift(item);
    this.store.addAudit(actor.id, actor.role, 'content.article.save', 'article', item.id, { published: item.published, recommended: item.recommended });
    return this.store.state.articles.find((entry) => entry.id === item.id);
  }
  deleteArticle(id: string, actor: Actor) { this.allow(actor, ['admin']); const index = this.store.state.articles.findIndex((entry) => entry.id === id); if (index < 0) throw new NotFoundException('文章不存在'); this.store.state.articles.splice(index, 1); this.store.addAudit(actor.id, actor.role, 'content.article.delete', 'article', id); return { id, deleted: true }; }
  deleteArticles(ids: unknown, actor: Actor) {
    this.allow(actor, ['admin']);
    const requested = Array.isArray(ids) ? Array.from(new Set(ids.map((id) => String(id)).filter(Boolean))) : [];
    if (!requested.length) throw new BadRequestException('请选择要删除的文章');
    const existing = new Set(this.store.state.articles.map((article) => article.id));
    const deletedIds = requested.filter((id) => existing.has(id));
    this.store.state.articles = this.store.state.articles.filter((article) => !deletedIds.includes(String(article.id)));
    this.store.addAudit(actor.id, actor.role, 'content.article.batch-delete', 'article', undefined, { ids: deletedIds, count: deletedIds.length });
    return { deletedIds, count: deletedIds.length };
  }
  banners(actor: Actor) { this.allow(actor, ['admin', 'sales']); return this.store.state.banners; }
  saveBanner(input: any, actor: Actor) {
    this.allow(actor, ['admin']);
    if (!input.title || !String(input.title).trim() || !input.imageKey) throw new BadRequestException('轮播标题和图片不能为空');
    const mode = input.mode === 'default' ? 'default' : 'custom';
    const imageKey = String(input.imageKey);
    if (mode === 'custom' && imageKey.length > 1600000) throw new BadRequestException('轮播图片不能超过1.6MB');
    if (mode === 'custom' && input.width !== undefined && input.height !== undefined) { const width = Number(input.width); const height = Number(input.height); if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || Math.abs(width / height - 16 / 7) > 0.02) throw new BadRequestException('自定义轮播图必须裁剪为16:7比例'); }
    const sort = Number(input.sort ?? 0); if (!Number.isInteger(sort) || sort < 0) throw new BadRequestException('轮播排序不合法');
    const target = String(input.target || '/pages/index/index'); if (!target.startsWith('/pages/')) throw new BadRequestException('轮播跳转目标不合法');
    const item = { id: input.id || this.store.newId('banner'), title: String(input.title).trim().slice(0, 120), imageKey, target, active: input.active !== false, sort, mode, width: mode === 'custom' ? 1280 : input.width, height: mode === 'custom' ? 560 : input.height };
    const index = this.store.state.banners.findIndex((entry) => entry.id === item.id); if (index >= 0) this.store.state.banners[index] = { ...this.store.state.banners[index], ...item }; else this.store.state.banners.push(item);
    this.store.addAudit(actor.id, actor.role, 'content.banner.save', 'banner', item.id, { mode, active: item.active, sort });
    return this.store.state.banners.find((entry) => entry.id === item.id);
  }
  deleteBanner(id: string, actor: Actor) { this.allow(actor, ['admin']); const index = this.store.state.banners.findIndex((entry) => entry.id === id); if (index < 0) throw new NotFoundException('轮播不存在'); this.store.state.banners.splice(index, 1); this.store.addAudit(actor.id, actor.role, 'content.banner.delete', 'banner', id); return { id, deleted: true }; }

  reviewWithdrawal(id: string, input: any, actor: Actor) {
    this.allow(actor, ['admin']);
    const item = this.store.state.withdrawals.find((entry) => entry.id === id); if (!item) throw new NotFoundException('提现记录不存在');
    if (!['pending_review', 'pending'].includes(String(item.status).toLowerCase())) throw new BadRequestException('提现记录已处理');
    if (typeof input?.approved !== 'boolean') throw new BadRequestException('提现审核结果必须明确选择通过或拒绝');
    const reason = String(input?.reason || '').trim();
    if (input.approved === false && !reason) throw new BadRequestException('驳回提现需要填写原因');
    item.amountFen = item.amountFen ?? Math.round(Number(item.amount || 0) * 100);
    item.status = input.approved === true ? 'approved' : 'rejected'; item.statusText = input.approved === true ? '待打款' : '已驳回'; item.reviewNote = reason.slice(0, 500); item.reviewedAt = this.store.timestamp(); item.reviewerId = actor.id;
    this.store.addAudit(actor.id, actor.role, 'withdrawal.review', 'withdrawal', id, { approved: input.approved, reason: item.reviewNote });
    return item;
  }

  aftersales(actor: Actor, query: any = {}): ListResult<Record<string, unknown>> { this.allow(actor, ['admin', 'fulfillment']); const keyword = String(query.keyword || query.q || '').trim().toLowerCase(); const source = this.store.state.aftersales.filter((row: any) => { const order: any = this.store.findOrder(String(row.orderId)); return (!query.status || query.status === 'all' || row.status === query.status) && (!query.orderId || row.orderId === query.orderId) && (!keyword || `${row.orderId} ${row.reason || ''} ${order?.orderNo || ''} ${order?.userId || ''}`.toLowerCase().includes(keyword)); }); return this.page(source, query); }
  aftersaleDetail(id: string, actor: Actor) { this.allow(actor, ['admin', 'fulfillment']); const item: any = this.store.state.aftersales.find((row) => row.id === id); if (!item) throw new NotFoundException('售后记录不存在'); const order = this.store.findOrder(String(item.orderId)); return { ...item, order: order ? { ...order, payment: order.payment ? { ...order.payment, transactionId: order.payment.transactionId } : undefined } : undefined, refund: this.collection('refunds').find((row: any) => row.aftersaleId === id || row.id === item.refundId) }; }
  reviewAftersale(id: string, input: any, actor: Actor) {
    this.allow(actor, ['admin', 'fulfillment']);
    const item: any = this.store.state.aftersales.find((row) => row.id === id); if (!item) throw new NotFoundException('售后记录不存在');
    const order = this.store.findOrder(item.orderId); if (!order) throw new NotFoundException('关联订单不存在');
    if (!['pending_review', 'approved', 'processing'].includes(String(item.status).toLowerCase())) throw new BadRequestException('售后记录已处理');
    const action = String(input.action || '').toLowerCase();
    if (!['approve', 'reject', 'refund'].includes(action)) throw new BadRequestException('售后操作不合法');
    if (action === 'reject') { item.status = 'rejected'; item.statusText = '已驳回'; item.reviewNote = input.reason ? String(input.reason).slice(0, 500) : ''; this.releaseCommissionHold(item); }
    if (action === 'approve') { item.status = 'approved'; item.statusText = '售后通过'; }
    if (action === 'refund') {
      if (item.status !== 'approved') throw new BadRequestException('售后必须先审核通过才能退款');
      const payment: any = order.payment || this.store.state.payments.find((row: any) => row.orderId === order.id && row.status === 'paid');
      const paymentTransactionId = String(payment?.transactionId || '');
      if (!payment || payment.status !== 'paid' || !paymentTransactionId || !input.transactionId || String(input.transactionId) !== paymentTransactionId) throw new BadRequestException('退款支付流水不匹配');
      const paymentAmountFen = Number(payment.amountFen ?? order.totalAmountFen ?? Math.round(order.totalAmount * 100));
      const refundFen = input.refundFen === undefined ? paymentAmountFen : Number(input.refundFen);
      if (!Number.isInteger(paymentAmountFen) || paymentAmountFen <= 0 || !Number.isInteger(refundFen) || refundFen <= 0 || refundFen > paymentAmountFen) throw new BadRequestException('退款金额不合法');
      if (typeof (this.business as any).beginRefund !== 'function') throw new BadRequestException('退款服务暂不可用');
      const refund = (this.business as any).beginRefund(order.id, actor, id, refundFen);
      refund.transactionId = paymentTransactionId;
      item.status = 'processing'; item.statusText = '退款处理中'; item.refundId = refund?.id || input.refundId || this.store.newId('refund');
      const refunds = this.collection('refunds'); const existingRefund = refund && refunds.some((row: any) => row.id === refund.id); if (refund && !existingRefund) refunds.push(refund); else if (!refund && !refunds.some((row: any) => row.id === item.refundId)) refunds.push({ id: item.refundId, orderId: order.id, aftersaleId: id, amountFen: refundFen, transactionId: paymentTransactionId, status: 'processing', createdAt: this.store.timestamp() });
      if (!existingRefund) this.store.state.outbox.unshift({ id: this.store.newId('task'), provider: 'wechat-pay', type: 'refund', referenceId: item.refundId, payload: { orderId: order.id, aftersaleId: id, transactionId: paymentTransactionId, amountFen: refundFen }, mode: 'manual', status: 'pending', createdAt: this.store.timestamp() });
    }
    item.reviewedAt = this.store.timestamp(); item.reviewerId = actor.id;
    this.store.addAudit(actor.id, actor.role, 'aftersale.review', 'aftersale', id, { action, orderId: order.id });
    return item;
  }
  invoices(actor: Actor, query: any = {}): ListResult<Record<string, unknown>> { this.allow(actor, ['admin']); const keyword = String(query.keyword || query.q || '').trim().toLowerCase(); const source = this.store.state.invoices.filter((row: any) => (!query.status || query.status === 'all' || row.status === query.status) && (!query.orderId || row.orderId === query.orderId) && (!keyword || `${row.orderId} ${row.title || ''} ${row.invoiceNo || ''}`.toLowerCase().includes(keyword))); return this.page(source, query); }
  reviewInvoice(id: string, input: any, actor: Actor) {
    this.allow(actor, ['admin']); const invoice: any = this.store.state.invoices.find((row) => row.id === id); if (!invoice) throw new NotFoundException('发票申请不存在');
    if (!['pending', 'processing'].includes(String(invoice.status).toLowerCase())) throw new BadRequestException('发票申请已处理');
    const action = String(input.status || input.action || '').toLowerCase();
    if (action === 'reject' || action === 'rejected') { invoice.status = 'rejected'; invoice.statusText = '已驳回'; invoice.rejectedReason = String(input.reason || ''); }
    else { invoice.status = 'processing'; invoice.statusText = '开票中'; }
    invoice.reviewedAt = this.store.timestamp(); invoice.reviewerId = actor.id; this.store.addAudit(actor.id, actor.role, 'invoice.review', 'invoice', id, { status: invoice.status }); return invoice;
  }
  withdrawals(actor: Actor, query: any = {}): ListResult<Record<string, unknown>> { this.allow(actor, ['admin']); const keyword = String(query.keyword || query.q || '').trim().toLowerCase(); const source = this.store.state.withdrawals.filter((row: any) => (!query.status || query.status === 'all' || row.status === query.status) && (!query.userId || row.userId === query.userId) && (!keyword || `${row.userId} ${row.id} ${row.transactionId || ''}`.toLowerCase().includes(keyword))); return this.page(source, query); }
  commissions(actor: Actor, query: any = {}): ListResult<Record<string, unknown>> { this.allow(actor, ['admin', 'sales']); const source = this.store.state.commissions.filter((row: any) => (!query.status || query.status === 'all' || row.status === query.status) && (actor.role !== 'sales' || row.promoterId === actor.id)); return this.page(source, query); }
  commissionRules(actor: Actor) { this.allow(actor, ['admin', 'sales']); return this.store.state.commissionRules.map((rule: any) => ({ ...rule, rateBps: rule.rateBps ?? Math.round(Number(rule.rate || 0) * 10000), fixedFen: rule.fixedFen ?? Math.round(Number(rule.fixedAmount || 0) * 100) })); }
  settlements(actor: Actor, query: any = {}): ListResult<Record<string, unknown>> { this.allow(actor, ['admin']); const source = this.collection('settlements').filter((row: any) => !query.period || row.period === query.period); return this.page(source, query); }
  transferWithdrawal(id: string, input: any, actor: Actor) {
    this.allow(actor, ['admin']); const item: any = this.store.state.withdrawals.find((row) => row.id === id); if (!item) throw new NotFoundException('提现记录不存在');
    if (item.status === 'paid') return item;
    if (item.status === 'processing') {
      if (input?.confirmed === true) return this.confirmWithdrawal(id, input, actor);
      throw new BadRequestException('提现已提交，请核验凭证后确认');
    }
    if (String(item.status) !== 'approved') throw new BadRequestException('提现记录当前不能打款');
    if (!input.transactionId && !input.manualReference) throw new BadRequestException('未接通支付时必须填写人工打款凭证');
    const reference = String(input.transactionId || input.manualReference); const existingReference = String(item.transactionId || item.manualReference || ''); if (existingReference && existingReference !== reference) throw new BadRequestException('提现记录已绑定其他打款凭证'); if (existingReference === reference) return input.confirmed === true ? this.confirmWithdrawal(id, input, actor) : item;
    item.status = 'processing'; item.statusText = '打款处理中'; item.transferState = 'manual_review'; item.transactionId = input.transactionId || undefined; item.manualReference = input.manualReference || undefined; item.transferredAt = this.store.timestamp();
    this.store.addAudit(actor.id, actor.role, 'withdrawal.transfer', 'withdrawal', id, { manual: !input.transactionId, confirmed: false });
    if (input.confirmed === true) return this.confirmWithdrawal(id, input, actor);
    return item;
  }

  confirmWithdrawal(id: string, input: any, actor: Actor) {
    this.allow(actor, ['admin']);
    const item: any = this.store.state.withdrawals.find((row) => row.id === id); if (!item) throw new NotFoundException('提现记录不存在');
    if (item.status === 'paid') return item;
    if (!['approved', 'processing'].includes(String(item.status))) throw new BadRequestException('提现记录当前不能确认打款');
    if (input?.confirmed !== true) throw new BadRequestException('确认打款必须明确选择已完成');
    const reference = String(input?.transactionId || input?.manualReference || item.transactionId || item.manualReference || '').trim();
    if (!reference) throw new BadRequestException('确认打款必须填写第三方交易凭证');
    if (item.transactionId && item.transactionId !== reference) throw new BadRequestException('提现记录已绑定其他打款凭证');
    item.transactionId = input?.transactionId ? reference : item.transactionId;
    item.manualReference = input?.manualReference ? reference : item.manualReference;
    item.status = 'paid'; item.statusText = '已打款'; item.transferState = 'confirmed'; item.paidAt = this.store.timestamp(); item.confirmedAt = item.paidAt; item.confirmedBy = actor.id;
    this.store.addAudit(actor.id, actor.role, 'withdrawal.paid', 'withdrawal', id, { evidence: reference, manual: !input?.transactionId });
    return item;
  }
  customerTags(id: string, actor: Actor) { this.allow(actor, ['admin', 'sales']); const customer = this.store.state.customers.find((item) => item.id === id); if (!customer) throw new NotFoundException('客户不存在'); if (actor.role === 'sales' && !this.customerBelongsToActor(customer, actor)) throw new ForbiddenException('无客户标签权限'); return customer.tags || []; }
  saveCustomerTag(id: string, input: any, actor: Actor) {
    this.allow(actor, ['admin', 'sales']); const customer: any = this.store.state.customers.find((item) => item.id === id); if (!customer) throw new NotFoundException('客户不存在'); if (actor.role === 'sales' && !this.customerBelongsToActor(customer, actor)) throw new ForbiddenException('无客户标签权限');
    const current = Array.isArray(customer.tags) ? customer.tags.map(String) : [];
    if (Array.isArray(input.tags)) customer.tags = Array.from(new Set(input.tags.map(String).filter(Boolean))).slice(0, 30);
    else if (input.remove === true && input.tag) customer.tags = current.filter((tag) => tag !== String(input.tag));
    else if (input.tag) customer.tags = Array.from(new Set([...current, String(input.tag)])).slice(0, 30);
    else throw new BadRequestException('标签不能为空');
    this.store.addAudit(actor.id, actor.role, 'customer-tag.save', 'customer', id, { tags: customer.tags }); return customer.tags;
  }

  rewardRuleSets(actor: Actor, query: any = {}): ListResult<Record<string, unknown>> {
    this.allow(actor, ['admin', 'sales']);
    const keyword = String(query.keyword || query.q || '').trim().toLowerCase();
    const source = this.store.state.rewardRuleSets.filter((set: any) => {
      const product: any = this.store.findProduct(String(set.productId));
      return (!keyword || `${set.productId} ${product?.name || ''}`.toLowerCase().includes(keyword)) && (query.active === undefined || set.active === !['false', '0', 'off'].includes(String(query.active).toLowerCase()));
    }).map((set: any) => ({ ...set, product: this.store.findProduct(String(set.productId)), tiers: this.store.state.rewardRuleTiers.filter((tier: any) => String(tier.ruleSetId) === String(set.id)) }));
    return this.page(source, query);
  }

  rewardRuleSet(productId: string, actor: Actor) {
    this.allow(actor, ['admin', 'sales']);
    const set: any = this.store.state.rewardRuleSets.find((row: any) => String(row.productId) === String(productId));
    if (!set) return null;
    return { ...set, product: this.store.findProduct(String(productId)), tiers: this.store.state.rewardRuleTiers.filter((row: any) => String(row.ruleSetId) === String(set.id)) };
  }

  async saveRewardRuleSet(input: any, actor: Actor) {
    this.allow(actor, ['admin']);
    const productId = String(input?.productId || ''); if (!productId || !this.store.findProduct(productId)) throw new BadRequestException('奖励规则商品不存在');
    const tiers = Array.isArray(input?.tiers) ? input.tiers : [];
    const required = ['SALES', 'MEMBER', 'COMPANY'];
    if (tiers.length !== 3 || required.some((tier) => !tiers.some((row: any) => String(row.tier).toUpperCase() === tier))) throw new BadRequestException('商品奖励必须配置销售人员、普通会员和公司三档');
    const normalized = tiers.map((row: any) => {
      const tier = String(row.tier || '').toUpperCase(); const method = String(row.method || '').toUpperCase();
      if (!required.includes(tier) || !['PERCENT', 'FIXED'].includes(method)) throw new BadRequestException('奖励档位或计算方式不合法');
      const rateRaw = row.rateBps !== undefined ? Number(row.rateBps) : Number(row.rate || 0) * 10000;
      const fixedRaw = row.fixedFen !== undefined ? Number(row.fixedFen) : Number(row.fixedAmount || 0) * 100;
      const rateBps = rateRaw; const fixedFen = fixedRaw;
      if (method === 'PERCENT' && (!Number.isInteger(rateBps) || rateBps < 0 || rateBps > 10000 || fixedFen !== 0)) throw new BadRequestException('按比例奖励必须只填写比例');
      if (method === 'FIXED' && (!Number.isInteger(fixedFen) || fixedFen < 0 || rateBps !== 0)) throw new BadRequestException('固定金额奖励必须只填写固定金额');
      return { tier, method, rateBps, fixedFen, active: row.active !== false };
    });
    return this.store.runAtomic(async () => {
      let set: any = this.store.state.rewardRuleSets.find((row: any) => String(row.productId) === productId);
      if (!set) { set = { id: this.store.newId('rule-set'), productId, active: input.active !== false, updatedBy: actor.id, createdAt: this.store.timestamp(), updatedAt: this.store.timestamp() }; this.store.state.rewardRuleSets.unshift(set); }
      else { set.active = input.active !== false; set.updatedBy = actor.id; set.updatedAt = this.store.timestamp(); }
      const existingTiers = this.store.state.rewardRuleTiers.filter((row: any) => String(row.ruleSetId) === String(set.id));
      this.store.state.rewardRuleTiers = this.store.state.rewardRuleTiers.filter((row: any) => String(row.ruleSetId) !== String(set.id));
      normalized.forEach((tier) => {
        const existing = existingTiers.find((row: any) => String(row.tier).toUpperCase() === tier.tier);
        this.store.state.rewardRuleTiers.push({ id: existing?.id || `${set.id}:${tier.tier}`, ruleSetId: set.id, ...tier });
      });
      const legacyMap: Record<string, string> = { SALES: 'STAFF', MEMBER: 'ORDINARY_MEMBER', COMPANY: 'COMPANY' };
      this.store.state.commissionRules = this.store.state.commissionRules.filter((row: any) => String(row.productId) !== productId);
      normalized.forEach((tier) => this.store.state.commissionRules.push({ id: this.store.newId('legacy-rule'), productId, promoterType: legacyMap[tier.tier], rateBps: tier.rateBps, fixedFen: tier.fixedFen, rate: tier.rateBps / 10000, fixedAmount: tier.fixedFen / 100, enabled: tier.active }));
      this.store.addAudit(actor.id, actor.role, 'reward-rule-set.save', 'reward_rule_set', set.id, { productId, tiers: normalized.map((row) => row.tier) });
      return this.rewardRuleSet(productId, actor);
    });
  }

  saveCommissionRule(input: any, actor: Actor) {
    this.allow(actor, ['admin']); if (!input.productId || !input.promoterType) throw new BadRequestException('商品和推广类型不能为空');
    if (!this.store.findProduct(String(input.productId))) throw new BadRequestException('奖励规则商品不存在');
    if (!['STAFF', 'ORDINARY_MEMBER', 'SENIOR_MEMBER', 'COMPANY'].includes(String(input.promoterType))) throw new BadRequestException('奖励规则推广类型不合法');
    const sourceTier = String(input.promoterType).toUpperCase() === 'STAFF' || String(input.promoterType).toUpperCase() === 'SENIOR_MEMBER' ? 'SALES' : String(input.promoterType).toUpperCase() === 'COMPANY' ? 'COMPANY' : 'MEMBER';
    const set: any = this.store.state.rewardRuleSets.find((row: any) => String(row.productId) === String(input.productId));
    const current = requiredRewardTiers(set, this.store.state.rewardRuleTiers).map((row: any) => ({ ...row }));
    const tier = current.find((row: any) => row.tier === sourceTier)!;
    if (input.rateBps !== undefined || input.rate !== undefined) { const raw = input.rateBps !== undefined ? Number(input.rateBps) : Number(input.rate) * 10000; if (!Number.isInteger(raw) || raw < 0 || raw > 10000) throw new BadRequestException('奖励比例必须是0到10000之间的整数基点'); tier.method = 'PERCENT'; tier.rateBps = raw; tier.fixedFen = 0; }
    if (input.fixedFen !== undefined || input.fixedAmount !== undefined) { const raw = input.fixedFen !== undefined ? Number(input.fixedFen) : Number(input.fixedAmount) * 100; if (!Number.isInteger(raw) || raw < 0) throw new BadRequestException('固定奖励必须是整数分'); tier.method = 'FIXED'; tier.fixedFen = raw; tier.rateBps = 0; }
    tier.active = input.enabled !== false;
    return this.saveRewardRuleSet({ productId: input.productId, active: set?.active !== false, tiers: current }, actor);
  }

  private collection(name: string): any[] {
    const state: any = this.store.state as any;
    if (!Array.isArray(state[name])) state[name] = [];
    return state[name];
  }

  private page<T>(source: T[], query: any, force = false): ListResult<T> {
    const rawPage = query?.page === undefined ? 1 : Number(query.page); const rawPageSize = query?.pageSize === undefined ? 20 : Number(query.pageSize);
    if (!Number.isInteger(rawPage) || rawPage < 1 || !Number.isInteger(rawPageSize) || rawPageSize < 1 || rawPageSize > 200) throw new BadRequestException('分页参数不合法');
    const page = rawPage; const pageSize = rawPageSize;
    if (!force && query?.page === undefined && query?.pageSize === undefined) return source;
    return { items: source.slice((page - 1) * pageSize, page * pageSize), total: source.length, page, pageSize };
  }

  private integerFen(value: unknown, label: string) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) throw new BadRequestException(`${label}必须是非负整数分`);
    return parsed;
  }

  private amountFen(value: any) {
    if (typeof value === 'number') return Math.round(value * 100);
    if (value && Number.isInteger(Number(value.amountFen))) return Number(value.amountFen);
    return Math.round(Number(value?.amount || 0) * 100);
  }

  private periodKey(date = new Date(), settlementWeekday = 1) {
    const weekday = Number.isInteger(settlementWeekday) && settlementWeekday >= 0 && settlementWeekday <= 6 ? settlementWeekday : 1;
    const day = date.getUTCDay(); const anchor = new Date(date); anchor.setUTCDate(date.getUTCDate() - ((day - weekday + 7) % 7));
    return `settlement-${anchor.toISOString().slice(0, 10)}`;
  }

  private normalizeCategory(value: unknown): string | undefined {
    const raw = String(value || '').trim(); if (!raw) return undefined;
    const aliases: Record<string, string> = { '用药指引': 'prescription-guide', '处方用药指引': 'prescription-guide', '就诊服务': 'clinic-service', '就诊与处方服务': 'clinic-service', '药食同源': 'food-origin', '营养管理': 'nutrition', '保健食品与营养': 'nutrition', '日常管理': 'daily-health', '日常健康管理': 'daily-health', '服务指南': 'service-guide', '订单与服务指南': 'service-guide', '会员分享': 'member-sharing', '健康活动与会员分享': 'member-sharing' };
    const category = aliases[raw] || raw;
    return ARTICLE_CATEGORIES.has(category) ? category : undefined;
  }

  private ensureSettings() {
    const settings: any = this.store.state.settings as any;
    Object.entries(DEFAULT_SETTINGS).forEach(([key, value]) => { if (settings[key] === undefined) settings[key] = value; });
    return settings;
  }

  private decryptFieldSafe(value: unknown) {
    try { return value ? decryptField(String(value)) : undefined; } catch { return undefined; }
  }

  private decryptPhone(item: any) {
    return this.decryptFieldSafe(item.phoneCiphertext) || (item.phone && !/[*•]/.test(String(item.phone)) ? String(item.phone) : item.phoneMasked || item.phone || '');
  }

  private canHandleManualTask(task: any, actor: Actor) {
    if (actor.role === 'admin') return true;
    const type = String(task.type || '').toLowerCase(); const provider = String(task.provider || '').toLowerCase();
    if (actor.role === 'pharmacist') return provider.includes('hospital') || provider.includes('prescription') || type.includes('consult') || type.includes('prescription');
    if (actor.role === 'fulfillment') return provider.includes('logistics') || provider.includes('invoice') || provider.includes('wechat-pay') || type.includes('refund') || type.includes('invoice') || type.includes('shipment') || type.includes('logistics');
    return false;
  }

  private availableStock(productId: string, fallback = 0) {
    const batches = this.collection('inventoryBatches').filter((row: any) => row.productId === productId && row.active !== false && (!row.expiresAt || Date.parse(`${String(row.expiresAt).slice(0, 10)}T23:59:59.999Z`) >= Date.now()));
    if (!batches.length) return Number(fallback || 0);
    return batches.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.quantity || 0) - Number(row.reservedQuantity || 0)), 0);
  }

  private syncProductStock(productId: string) {
    const product: any = this.store.findProduct(productId); if (!product) return;
    const skus = this.collection('skus').filter((row: any) => row.productId === productId && row.active !== false);
    const batches = this.collection('inventoryBatches').filter((row: any) => row.productId === productId && row.active !== false);
    const validBatches = batches.filter((row: any) => !row.expiresAt || Date.parse(`${String(row.expiresAt).slice(0, 10)}T23:59:59.999Z`) >= Date.now());
    const stock = batches.length ? validBatches.reduce((sum: number, row: any) => sum + Math.max(0, Number(row.quantity || 0) - Number(row.reservedQuantity || 0)), 0) : skus.reduce((sum: number, row: any) => sum + Number(row.stock || 0), 0);
    if (batches.length) skus.forEach((sku: any) => { sku.stock = validBatches.filter((batch: any) => batch.skuId === sku.id).reduce((sum: number, batch: any) => sum + Math.max(0, Number(batch.quantity || 0) - Number(batch.reservedQuantity || 0)), 0); });
    product.stock = stock; product.priceFen = product.priceFen ?? Math.round(Number(product.price || 0) * 100); product.price = product.priceFen / 100;
  }

  private releaseCommissionHold(aftersale: any) {
    this.store.state.commissions.filter((commission: any) => commission.holdAftersaleId === aftersale.id && commission.status === 'held').forEach((commission: any) => {
      commission.status = commission.beforeAftersaleStatus || 'pending'; commission.statusText = commission.status === 'eligible' ? '可结算' : commission.status === 'settled' ? '已结算' : '待生效'; delete commission.holdAftersaleId; delete commission.beforeAftersaleStatus;
    });
  }

  reconcilePromoters(actor: Actor) {
    this.allow(actor, ['admin']);
    const nowValue = Date.now(); this.ensureSettings();
    const releaseDays = Number((this.store.state.settings as any).promoterReleaseDays || 183);
    let released = 0;
    let upgraded = 0;
    this.store.state.promoters.filter((item: any) => ['member', 'sales'].includes(String(item.type).toLowerCase()) && item.active !== false).forEach((promoter) => {
      const promoterId = String(promoter.id);
      const promoterIds = new Set([promoterId, String(promoter.userId || '')]);
      const customerIds = new Set(this.store.state.customers.filter((customer: any) => promoterIds.has(String(customer.promoter || customer.promoterId || ''))).map((customer: any) => String(customer.id)));
      this.store.state.customerAttributions.filter((attribution: any) => attribution.active !== false && promoterIds.has(String(attribution.ownerPromoterId))).forEach((attribution: any) => customerIds.add(String(attribution.customerId)));
      this.store.state.promoterRelations.filter((relation: any) => relation.active !== false && promoterIds.has(String(relation.promoterId))).forEach((relation: any) => customerIds.add(String(relation.customerId)));
      const completedOrders = this.store.state.orders.filter((order: any) => order.status === 'completed' && customerIds.has(String(order.userId)));
      const performanceRows = this.store.state.performanceLedger.filter((row: any) => row.status !== 'cancelled' && promoterIds.has(String(row.promoterId)) && !row.selfPurchase);
      const activity = performanceRows.map((row: any) => Date.parse(String(row.createdAt || ''))).filter((value) => Number.isFinite(value));
      const lastActivity = activity.length ? Math.max(...activity) : 0;
      const createdAt = Date.parse(String((promoter as any).createdAt || ''));
      const releaseAnchor = lastActivity || createdAt;
      if (releaseAnchor && nowValue - releaseAnchor > releaseDays * 24 * 60 * 60 * 1000) {
        promoter.active = false;
        (promoter as any).inactiveAt = this.store.timestamp();
        (promoter as any).inactiveReason = '高级会员连续六个月无销售业绩';
        this.store.state.promoterRelations.filter((item) => item.promoterId === promoterId && item.active).forEach((relation) => { relation.active = false; relation.releasedAt = this.store.timestamp(); });
        this.store.state.customerAttributions.filter((item: any) => item.ownerPromoterId === promoterId && item.active !== false).forEach((attribution: any) => { attribution.active = false; attribution.releasedAt = this.store.timestamp(); attribution.releaseReason = '高级会员连续六个月无销售业绩'; });
        this.store.state.customers.filter((customer: any) => String(customer.promoter || '') === promoterId).forEach((customer: any) => { customer.promoter = 'company'; });
        this.store.state.customerAttributions.filter((item: any) => item.customerId && this.store.state.customers.some((customer: any) => String(customer.id) === String(item.customerId) && String(customer.promoter) === 'company') && item.active === false && item.releaseReason === '高级会员连续六个月无销售业绩').forEach((item: any) => {
          if (!this.store.state.customerAttributions.some((row: any) => String(row.customerId) === String(item.customerId) && row.active !== false && row.ownerKind === 'company')) this.store.state.customerAttributions.push({ id: this.store.newId('attr'), customerId: item.customerId, ownerKind: 'company', source: 'inactivity-release', active: true, boundAt: this.store.timestamp(), assignedBy: actor.id });
        });
        this.store.state.promoterMemberships.filter((membership: any) => (String(membership.memberPromoterId) === promoterId || String(membership.salesPromoterId) === promoterId) && membership.status === 'active').forEach((membership: any) => { membership.status = 'released'; membership.releasedAt = this.store.timestamp(); membership.reason = '高级会员停用'; });
        released += 1;
        return;
      }
      // Promotion is application-driven. This maintenance endpoint only
      // releases stale ownership; it never changes a member's level or role.
    });
    this.store.addAudit(actor.id, actor.role, 'promoter.reconcile', 'promoter', undefined, { released, upgraded });
    return { released, upgraded, executedAt: this.store.timestamp() };
  }
}
