import { Module } from '@nestjs/common';
import { ManualHealthServiceProvider, ManualInvoiceProvider, ManualLogisticsProvider, ManualNotificationProvider, ManualPrescriptionProvider } from './manual.adapters';
import { WeChatAuthAdapter, WeChatPaymentAdapter } from './wechat.adapters';

@Module({ providers: [ManualPrescriptionProvider, ManualInvoiceProvider, ManualLogisticsProvider, ManualNotificationProvider, ManualHealthServiceProvider, WeChatAuthAdapter, WeChatPaymentAdapter], exports: [ManualPrescriptionProvider, ManualInvoiceProvider, ManualLogisticsProvider, ManualNotificationProvider, ManualHealthServiceProvider, WeChatAuthAdapter, WeChatPaymentAdapter] })
export class IntegrationsModule {}
