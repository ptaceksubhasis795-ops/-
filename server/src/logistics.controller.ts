import { Controller, Get, Headers, Param } from '@nestjs/common';
import { BusinessService } from './domain/business.service';
import { ManualLogisticsProvider } from './integrations/manual.adapters';
import { AuthService } from './security/auth.service';

@Controller('v1')
export class LogisticsController {
  constructor(private readonly business: BusinessService, private readonly logistics: ManualLogisticsProvider, private readonly auth: AuthService) {}

  @Get('orders/:id/logistics')
  async track(@Param('id') id: string, @Headers() headers: Record<string, string>) {
    const actor = this.auth.verify(headers.authorization?.replace(/^Bearer\s+/i, '')) || { id: headers['x-user-id'] || 'u-demo', role: (headers['x-role'] || 'consumer') as string };
    const order = this.business.store.findOrder(id);
    if (!order || (order.userId !== actor.id && !['admin', 'fulfillment'].includes(actor.role))) return { data: { status: 'manual', nodes: [] } };
    if (!order.shipment) return { data: { status: 'pending', nodes: [] } };
    return { data: await this.logistics.track(order.shipment.carrier, order.shipment.trackingNo) };
  }
}
