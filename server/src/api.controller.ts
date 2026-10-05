import { Body, Controller, ForbiddenException, Get, Headers, NotFoundException, Param, Post, Query } from '@nestjs/common';
import { BusinessService } from './domain/business.service';
import { Role } from './domain/types';
import { AuthService } from './security/auth.service';
import { Public } from './security/public.decorator';

@Controller('v1')
export class ApiController {
  constructor(private readonly business: BusinessService, private readonly auth: AuthService) {}

  private actor(headers: Record<string, string | undefined>, fallbackRole: Role = 'consumer') {
    const tokenActor = this.auth.verify(headers.authorization?.replace(/^Bearer\s+/i, ''));
    if (tokenActor) return tokenActor as { id: string; role: Role };
    if (process.env.NODE_ENV !== 'production' && process.env.ALLOW_DEV_HEADERS === 'true') {
      return { id: headers['x-user-id'] || 'u-demo', role: (headers['x-role'] || fallbackRole) as Role };
    }
    return { id: 'anonymous', role: 'consumer' as Role };
  }

  @Public() @Get('health') health() { return this.business.health(); }
  @Public() @Get('catalog/products') products(@Query() query: any) { return { data: this.business.listProducts({ ...query, includeInactive: query.includeInactive === '1' }) }; }
  @Public() @Get('catalog/products/:id') product(@Param('id') id: string) { return { data: this.business.product(id) }; }
  @Get('orders') orders(@Query() query: any, @Headers() headers: Record<string, string>) { const actor = this.actor(headers); return { data: this.business.listOrders({ status: query.status, keyword: query.keyword, from: query.from, to: query.to, userId: actor.role === 'admin' || actor.role === 'fulfillment' ? query.userId : actor.id }) }; }
  @Get('orders/:id') order(@Param('id') id: string, @Headers() headers: Record<string, string>) {
    const actor = this.actor(headers);
    const item = this.business.store.findOrder(id);
    if (!item) throw new NotFoundException('订单不存在');
    if (item.userId !== actor.id && !['admin', 'fulfillment'].includes(actor.role)) throw new ForbiddenException('无订单查看权限');
    return { data: item };
  }
  @Post('orders/preview') previewOrder(@Body() body: any, @Headers() headers: Record<string, string>) { return { data: this.business.previewOrder(body, this.actor(headers)) }; }
  @Post('orders') createOrder(@Body() body: any, @Headers() headers: Record<string, string>) { return { data: this.business.createOrder(body, { ...this.actor(headers), idempotencyKey: headers['idempotency-key'] }) }; }
  @Post('orders/:id/:action') orderAction(@Param('id') id: string, @Param('action') action: string, @Body() body: any, @Headers() headers: Record<string, string>) {
    // Payment confirmation is exclusively owned by the verified WeChat
    // notification handler. A client must never be able to forge `source`.
    if (String(action).toLowerCase() === 'pay') throw new ForbiddenException('支付状态只能由支付通知确认');
    return { data: this.business.updateOrder(id, action, this.actor(headers, 'admin'), body) };
  }
  @Get('prescriptions') prescriptions(@Headers() headers: Record<string, string>) { return { data: this.business.listPrescriptions(this.actor(headers)) }; }
  @Post('prescriptions') createPrescription(@Body() body: any, @Headers() headers: Record<string, string>) { return { data: this.business.createPrescription(body, this.actor(headers)) }; }
  @Post('prescriptions/:id/review') reviewPrescription(@Param('id') id: string, @Body() body: any, @Headers() headers: Record<string, string>) { return { data: this.business.reviewPrescription(id, body, this.actor(headers, 'pharmacist')) }; }
  @Get('sales/overview') salesOverview(@Headers() headers: Record<string, string>) { return { data: this.business.salesOverview(this.actor(headers, 'member').id) }; }
  @Post('sales/referrals') bindReferral(@Body() body: { promoterId?: string }, @Headers() headers: Record<string, string>) { return { data: this.business.bindReferral(body, this.actor(headers)) }; }
  @Post('members/apply') async applyMember(@Body() body: any, @Headers() headers: Record<string, string>) { return { data: await this.business.applyMember(body, this.actor(headers)) }; }
  @Post('withdrawals') withdrawal(@Body() body: any, @Headers() headers: Record<string, string>) { return { data: this.business.createWithdrawal(body, this.actor(headers, 'member')) }; }
  @Get('customers') customers(@Headers() headers: Record<string, string>) { return { data: this.business.customers(this.actor(headers, 'sales')) }; }
  @Public() @Get('content/articles') articles(@Query() query: any) { return { data: this.business.content(query) }; }
  @Public() @Get('content/banners') banners(@Query() query: any) { return { data: this.business.banners(query) }; }
  @Get('admin/dashboard') dashboard(@Headers() headers: Record<string, string>) { return { data: this.business.dashboard(this.actor(headers, 'admin')) }; }
  @Post('admin/jobs/reconcile') reconcile(@Headers() headers: Record<string, string>) { return { data: this.business.reconcileScheduledJobs(this.actor(headers, 'admin')) }; }
  @Get('admin/audit-logs') auditLogs(@Headers() headers: Record<string, string>) { return { data: this.business.auditLogs(this.actor(headers, 'admin')) }; }
}
