import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Headers, Param, Post, Req } from '@nestjs/common';
import { BusinessService } from './domain/business.service';
import { WeChatPaymentAdapter } from './integrations/wechat.adapters';
import { AuthService } from './security/auth.service';
import { Public } from './security/public.decorator';

@Controller('v1')
export class PaymentController {
  constructor(private readonly business: BusinessService, private readonly payment: WeChatPaymentAdapter, private readonly auth: AuthService) {}

  private actor(headers: Record<string, string>) {
    const tokenActor = this.auth.verify(headers.authorization?.replace(/^Bearer\s+/i, ''));
    if (tokenActor) return tokenActor;
    if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_HEADERS === 'true') {
      return { id: headers['x-user-id'] || 'u-demo', role: (headers['x-role'] || 'consumer') as any };
    }
    return { id: 'anonymous', role: 'consumer' as any };
  }

  @Post('payments/wechat/jsapi')
  async jsapi(@Body() body: { orderId: string; openId?: string; notifyUrl?: string }, @Headers() headers: Record<string, string>) {
    const actor = this.actor(headers);
    if (!['consumer', 'member'].includes(String(actor.role))) throw new ForbiddenException('当前账号不能发起微信支付');
    if (body.openId !== undefined || body.notifyUrl !== undefined) throw new BadRequestException('支付用户和回调地址由服务端确定');
    const order = this.business.store.findOrder(body.orderId);
    if (!order || order.userId !== actor.id) throw new BadRequestException('订单不存在或无权限');
    if (order.status !== 'pending_payment') throw new BadRequestException('订单当前不可支付');
    const user = this.business.store.state.users.find((item) => item.id === actor.id);
    const openId = String(user?.openId || '');
    if (!openId) throw new BadRequestException('缺少支付用户标识');
    const notifyUrl = String(process.env.WECHAT_NOTIFY_URL || '');
    if (this.payment.mode === 'real' && (!notifyUrl || !/^https:\/\//i.test(notifyUrl))) throw new BadRequestException('支付回调地址未配置为安全地址');
    const result = await this.payment.createJsapiOrder({ orderNo: order.orderNo, description: order.items.map((item) => item.name).join('、'), amountFen: Number(order.totalAmountFen ?? Math.round(order.totalAmount * 100)), openId, notifyUrl });
    this.business.store.addAudit(actor.id, actor.role, 'payment.create', 'order', order.id, { mode: result.mode });
    return { data: result };
  }

  @Public() @Post('payments/wechat/notify')
  async notify(@Body() body: any, @Headers() headers: Record<string, string>, @Req() request: any) {
    if (!request.rawBody) throw new BadRequestException('支付回调原文缺失');
    const rawBody = request.rawBody.toString('utf8');
    if (!this.payment.verifyNotification({ timestamp: headers['wechatpay-timestamp'], nonce: headers['wechatpay-nonce'], signature: headers['wechatpay-signature'], serialNo: headers['wechatpay-serial'], body: rawBody })) throw new BadRequestException('支付回调验签失败');
    const resource = body.resource;
    if (!resource) throw new BadRequestException('缺少支付通知资源');
    let decrypted: Record<string, unknown>;
    try {
      decrypted = this.payment.decryptNotification({ ciphertext: resource.ciphertext, nonce: resource.nonce, associatedData: resource.associated_data });
    } catch {
      throw new BadRequestException('支付通知解密失败');
    }
    const orderNo = String(decrypted.out_trade_no || '');
    const order = this.business.store.state.orders.find((item) => item.orderNo === orderNo);
    if (!order) throw new BadRequestException('支付订单不存在');
    if (!process.env.WECHAT_MCHID || String(decrypted.mchid || '') !== String(process.env.WECHAT_MCHID)) throw new BadRequestException('支付商户不匹配');
    if (!process.env.WECHAT_APPID || String(decrypted.appid || '') !== String(process.env.WECHAT_APPID)) throw new BadRequestException('支付应用不匹配');
    if (String(decrypted.trade_state || '') !== 'SUCCESS') throw new BadRequestException('支付尚未成功');
    const amount = decrypted.amount as any;
    if (String(amount?.currency || '') !== 'CNY') throw new BadRequestException('支付币种不正确');
    const amountTotal = Number(amount?.total || 0);
    if (!Number.isInteger(amountTotal) || amountTotal <= 0 || amountTotal !== Number(order.totalAmountFen ?? Math.round(order.totalAmount * 100))) throw new BadRequestException('支付金额不匹配');
    const owner: any = this.business.store.state.users.find((item: any) => item.id === order.userId);
    const payerOpenId = String((decrypted.payer as any)?.openid || '');
    if (!payerOpenId || !owner?.openId || payerOpenId !== String(owner.openId)) throw new BadRequestException('支付用户不匹配');
    const transactionId = String(decrypted.transaction_id || '');
    if (!transactionId) throw new BadRequestException('支付流水号缺失');
    const transactionOrder = this.business.store.state.orders.find((item) => item.id !== order.id && (item.payment?.transactionId === transactionId || this.business.store.state.payments.some((payment: any) => payment.orderId === item.id && payment.transactionId === transactionId)));
    if (transactionOrder) throw new BadRequestException('支付流水已绑定其他订单');
    const persistedPayment: any = this.business.store.state.payments.find((item: any) => item.orderId === order.id && item.status === 'paid');
    const existingTransactionId = order.payment?.transactionId || persistedPayment?.transactionId;
    if (existingTransactionId && existingTransactionId !== transactionId) throw new BadRequestException('订单已绑定其他支付流水');
    if (order.status === 'cancelled') {
      const taskKey = `payment-late:${transactionId}`;
      if (!this.business.store.state.outbox.some((task: any) => task.idempotencyKey === taskKey)) {
        this.business.store.state.outbox.unshift({ id: this.business.store.newId('task'), idempotencyKey: taskKey, provider: 'wechat-pay', type: 'payment_late_review', referenceId: order.id, payload: { orderId: order.id, orderNo: order.orderNo, transactionId, amountFen: amountTotal }, mode: 'manual', status: 'pending', createdAt: this.business.store.timestamp() });
        this.business.store.addAudit('wechat:payment', 'admin', 'payment.late_review', 'order', order.id, { transactionId, amountFen: amountTotal });
      }
      // Acknowledge the signed notification after durable manual queuing. The
      // order remains cancelled and is never falsely changed to paid.
      return { code: 'SUCCESS', message: '订单已取消，支付已进入人工处理' };
    }
    if (order.status !== 'pending_payment' && !existingTransactionId) throw new ConflictException('订单支付状态需要人工核对');
    if (order.status === 'pending_payment') {
      this.business.updateOrder(
        order.id,
        'pay',
        { id: order.userId, role: 'consumer' },
        { source: 'payment_callback', provider: 'wechat', transactionId }
      );
    }
    return { code: 'SUCCESS', message: '成功' };
  }

  @Post('payments/refund')
  async refund(@Body() body: { orderId: string; aftersaleId?: string; transactionId: string; refundFen: number }, @Headers() headers: Record<string, string>) {
    const actor = this.actor(headers);
    if (actor.role !== 'admin') throw new BadRequestException('无退款权限');
    const order = this.business.store.findOrder(body.orderId); if (!order) throw new BadRequestException('订单不存在');
    if (!body.aftersaleId) throw new BadRequestException('退款必须关联已批准售后');
    const aftersale: any = this.business.store.state.aftersales.find((item: any) => item.id === body.aftersaleId && item.orderId === order.id);
    if (!aftersale || aftersale.status !== 'approved') throw new BadRequestException('售后尚未批准退款');
    const payment: any = order.payment || this.business.store.state.payments.find((item: any) => item.orderId === order.id && item.status === 'paid');
    const paymentTransactionId = String(payment?.transactionId || '');
    if (!body.transactionId || !paymentTransactionId || String(body.transactionId) !== paymentTransactionId) throw new BadRequestException('退款支付流水不匹配');
    if (!Number.isInteger(Number(body.refundFen)) || Number(body.refundFen) <= 0 || Number(body.refundFen) > Number(payment?.amountFen ?? order.totalAmountFen ?? Math.round(order.totalAmount * 100))) throw new BadRequestException('退款金额不合法');
    if (this.payment.mode !== 'real') throw new BadRequestException('微信退款服务未配置，请转人工售后处理');
    const refund: any = this.business.beginRefund(order.id, actor, body.aftersaleId, body.refundFen);
    if (refund.aftersaleId && String(refund.aftersaleId) !== String(body.aftersaleId)) throw new BadRequestException('订单已有其他售后退款处理中');
    if (String(refund.status) === 'succeeded') {
      return { data: { ...refund, message: '退款已完成' } };
    }
    if (String(refund.status) === 'processing' && refund.providerRefundId) {
      return { data: { ...refund, message: '退款申请已提交，等待微信结果' } };
    }
    try {
      const result = await this.payment.refund({ transactionId: body.transactionId, outRefundNo: String(refund.id), refundFen: Number(refund.amountFen), totalFen: Number(order.totalAmountFen ?? Math.round(order.totalAmount * 100)) });
      if (!result.refundId) throw new Error('退款服务未返回退款编号');
      refund.provider = result.mode;
      refund.providerRefundId = result.refundId;
      this.business.store.addAudit(actor.id, actor.role, 'payment.refund.request', 'refund', String(refund.id), { mode: result.mode, refundFen: refund.amountFen });
      return { data: { ...refund, message: '退款申请已提交，等待微信结果' } };
    } catch (error) {
      this.business.confirmRefund(String(refund.id), actor, { status: 'failed', provider: 'wechat' });
      throw new BadRequestException('退款申请失败，请稍后重试');
    }
  }

  @Public() @Post('payments/wechat/refund-notify')
  async refundNotify(@Body() body: any, @Headers() headers: Record<string, string>, @Req() request: any) {
    if (!request.rawBody) throw new BadRequestException('退款回调原文缺失');
    const rawBody = request.rawBody.toString('utf8');
    if (!this.payment.verifyNotification({ timestamp: headers['wechatpay-timestamp'], nonce: headers['wechatpay-nonce'], signature: headers['wechatpay-signature'], serialNo: headers['wechatpay-serial'], body: rawBody })) throw new BadRequestException('退款回调验签失败');
    const resource = body.resource;
    if (!resource) throw new BadRequestException('缺少退款通知资源');
    let decrypted: Record<string, unknown>;
    try { decrypted = this.payment.decryptNotification({ ciphertext: resource.ciphertext, nonce: resource.nonce, associatedData: resource.associated_data }); } catch { throw new BadRequestException('退款通知解密失败'); }
    if (!process.env.WECHAT_MCHID || String(decrypted.mchid || '') !== String(process.env.WECHAT_MCHID)) throw new BadRequestException('退款支付商户不匹配');
    if (decrypted.appid !== undefined && process.env.WECHAT_APPID && String(decrypted.appid) !== String(process.env.WECHAT_APPID)) throw new BadRequestException('退款支付应用不匹配');
    const amount = decrypted.amount as any;
    if (amount?.currency !== undefined && String(amount.currency) !== 'CNY') throw new BadRequestException('退款币种不正确');
    const refundId = String(decrypted.out_refund_no || '');
    const refund: any = this.business.store.state.refunds.find((item: any) => item.id === refundId);
    if (!refund) throw new BadRequestException('退款记录不存在');
    if (!Number.isInteger(Number(amount?.refund)) || Number(amount?.refund) <= 0 || Number(amount?.refund) !== Number(refund.amountFen)) throw new BadRequestException('退款金额不匹配');
    const transactionId = String(decrypted.transaction_id || '');
    const order = this.business.store.findOrder(String(refund.orderId));
    if (!order || String(decrypted.out_trade_no || '') !== String(order.orderNo)) throw new BadRequestException('退款订单不匹配');
    const expectedTransactionId = String(order?.payment?.transactionId || this.business.store.state.payments.find((item: any) => item.orderId === refund.orderId && item.status === 'paid')?.transactionId || '');
    if (!transactionId || !expectedTransactionId || transactionId !== expectedTransactionId) throw new BadRequestException('退款支付流水不匹配');
    const status = String(decrypted.refund_status || '');
    if (status === 'SUCCESS') this.business.confirmRefund(refund.id, { id: 'wechat:refund', role: 'admin' }, { status: 'succeeded', provider: 'wechat', transactionId });
    else if (['ABNORMAL', 'CLOSED'].includes(status)) this.business.confirmRefund(refund.id, { id: 'wechat:refund', role: 'admin' }, { status: 'failed', provider: 'wechat', transactionId });
    return { code: 'SUCCESS', message: status === 'SUCCESS' ? '成功' : '已记录退款状态' };
  }

  @Post('payments/wechat/withdrawals/:id/transfer')
  async transfer(@Param('id') id: string, @Body() body: { openId: string }, @Headers() headers: Record<string, string>) {
    const actor = this.actor(headers);
    if (actor.role !== 'admin') throw new BadRequestException('无打款权限');
    const item: any = this.business.store.state.withdrawals.find((row) => row.id === id); if (!item) throw new BadRequestException('提现记录不存在');
    if (String(item.status) !== 'approved') throw new BadRequestException('提现记录必须先审核通过');
    const user: any = this.business.store.state.users.find((row: any) => row.id === item.userId);
    const openId = String(user?.openId || '');
    if (!openId || (body.openId && String(body.openId) !== openId)) throw new BadRequestException('提现用户标识不匹配');
    const amountFen = Number(item.amountFen ?? Math.round(Number(item.amount || 0) * 100));
    if (!Number.isInteger(amountFen) || amountFen <= 0) throw new BadRequestException('提现金额不合法');
    if (this.payment.mode !== 'real') {
      const taskKey = `withdrawal:${id}`;
      if (!this.business.store.state.outbox.some((task: any) => task.idempotencyKey === taskKey)) this.business.store.state.outbox.unshift({ id: this.business.store.newId('task'), idempotencyKey: taskKey, provider: 'wechat-transfer', type: 'withdrawal_manual_review', referenceId: id, payload: { withdrawalId: id, amountFen }, mode: 'manual', status: 'pending', createdAt: this.business.store.timestamp() });
      item.amountFen = amountFen; item.status = 'manual_review'; item.statusText = '待人工打款'; item.transferState = 'MANUAL_REVIEW';
      this.business.store.addAudit(actor.id, actor.role, 'withdrawal.transfer.manual', 'withdrawal', id, { amountFen });
      return { data: Object.assign({}, item, { mode: 'manual', state: 'MANUAL_REVIEW', message: '微信打款未配置，已进入人工队列' }) };
    }
    const result = await this.payment.transfer({ outBillNo: id, openId, amountFen, description: '九转健康推广奖励提现' });
    item.amountFen = amountFen; item.status = 'processing'; item.statusText = '打款处理中'; item.transferState = result.state || 'PROCESSING';
    this.business.store.addAudit(actor.id, actor.role, 'withdrawal.transfer', 'withdrawal', id, { mode: result.mode, state: result.state });
    return { data: Object.assign({}, item, result) };
  }
}
