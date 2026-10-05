export type IntegrationMode = 'real' | 'manual';

export interface PrescriptionProvider {
  readonly mode: IntegrationMode;
  createConsultation(input: { userId: string; patientId: string }): Promise<{ redirectUrl?: string; externalId?: string }>;
  pullPrescription(externalId: string): Promise<{ status: 'pending' | 'approved' | 'rejected'; itemName?: string; validUntil?: string }>;
}

export interface InvoiceProvider {
  readonly mode: IntegrationMode;
  issue(input: { title: string; taxNo?: string; amountFen: number }): Promise<{ fileKey?: string; externalId?: string }>;
}

export interface LogisticsProvider {
  readonly mode: IntegrationMode;
  track(carrier: string, trackingNo: string): Promise<{ status: string; nodes: Array<{ time: string; text: string }> }>;
}

export interface NotificationProvider {
  readonly mode: IntegrationMode;
  sendTemplate(input: { userId: string; template: string; data: Record<string, string> }): Promise<{ delivered: boolean }>;
}

export interface HealthServiceProvider {
  readonly mode: IntegrationMode;
  pushCustomer(input: { customerId: string; profile: Record<string, unknown> }): Promise<{ accepted: boolean; externalId?: string }>;
}

export interface WeChatAuthProvider {
  readonly mode: IntegrationMode;
  login(code: string): Promise<{ openId: string; sessionKey: string; unionId?: string }>;
}

export interface PaymentProvider {
  readonly mode: IntegrationMode;
  createJsapiOrder(input: { orderNo: string; description: string; amountFen: number; openId: string; notifyUrl: string }): Promise<{ mode: IntegrationMode; prepayId?: string; packageValue?: string }>;
  decryptNotification(input: { ciphertext: string; nonce: string; associatedData: string }): Record<string, unknown>;
  verifyNotification(input: { timestamp?: string; nonce?: string; signature?: string; serialNo?: string; body: string }): boolean;
  refund(input: { transactionId: string; outRefundNo: string; refundFen: number; totalFen: number }): Promise<{ mode: IntegrationMode; refundId?: string }>;
  transfer(input: { outBillNo: string; openId: string; amountFen: number; description: string }): Promise<{ mode: IntegrationMode; state?: string }>;
}
