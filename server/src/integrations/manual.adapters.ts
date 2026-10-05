import { Injectable } from '@nestjs/common';
import { HealthServiceProvider, InvoiceProvider, LogisticsProvider, NotificationProvider, PrescriptionProvider } from './contracts';

@Injectable()
export class ManualPrescriptionProvider implements PrescriptionProvider {
  readonly mode = 'manual' as const;
  async createConsultation() { return {}; }
  async pullPrescription() { return { status: 'pending' as const }; }
}

@Injectable()
export class ManualInvoiceProvider implements InvoiceProvider {
  readonly mode = 'manual' as const;
  async issue() { return {}; }
}

@Injectable()
export class ManualLogisticsProvider implements LogisticsProvider {
  readonly mode = 'manual' as const;
  async track(carrier: string, trackingNo: string) { return { status: 'manual', nodes: [{ time: new Date().toISOString(), text: `${carrier} ${trackingNo} 已录入，待接入物流轨迹服务` }] }; }
}

@Injectable()
export class ManualNotificationProvider implements NotificationProvider {
  readonly mode = 'manual' as const;
  async sendTemplate() { return { delivered: false }; }
}

@Injectable()
export class ManualHealthServiceProvider implements HealthServiceProvider {
  readonly mode = 'manual' as const;
  async pushCustomer() { return { accepted: false }; }
}
