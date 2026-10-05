export type Role = 'admin' | 'pharmacist' | 'fulfillment' | 'sales' | 'member' | 'consumer';
export type ProductCategory = 'daily' | 'prescription';
export type OrderStatus = 'pending_payment' | 'paid' | 'shipped' | 'completed' | 'cancelled' | 'refunding' | 'refunded';
export type PrescriptionStatus = 'pending_review' | 'approved' | 'rejected' | 'used' | 'expired';

export interface Product {
  id: string;
  name: string;
  category: ProductCategory;
  price: number;
  /** Integer fen used for all calculations; price is retained for display compatibility. */
  priceFen?: number;
  stock: number;
  unit: string;
  badge: string;
  rewardRule: string;
  active: boolean;
  image?: string;
  overlay?: string;
  subtitle?: string;
  description?: string;
  originalPrice?: number;
  color?: string;
  registrationNo?: string;
}

export interface OrderItem {
  productId: string;
  skuId?: string;
  skuName?: string;
  name: string;
  category: ProductCategory;
  quantity: number;
  unitPrice: number;
  unitPriceFen?: number;
}

export interface Order {
  id: string;
  orderNo: string;
  userId: string;
  items: OrderItem[];
  amount: number;
  freight: number;
  totalAmount: number;
  amountFen?: number;
  freightFen?: number;
  totalAmountFen?: number;
  status: OrderStatus;
  statusText: string;
  address: { name: string; phone: string; detail: string };
  prescriptionId?: string;
  patientId?: string;
  promoterId?: string;
  idempotencyKey?: string;
  payment?: {
    provider: string;
    status: 'created' | 'paid' | 'refunding' | 'refunded' | 'manual_review';
    transactionId?: string;
    amountFen: number;
    paidAt?: string;
  };
  createdAt: string;
  paidAt?: string;
  shippedAt?: string;
  receivedAt?: string;
  shipment?: { carrier: string; trackingNo: string; status: string };
}

export interface Prescription {
  id: string;
  userId: string;
  patientId?: string;
  patientName: string;
  source: 'internet_hospital' | 'offline';
  status: PrescriptionStatus;
  statusText: string;
  itemName?: string;
  productId?: string;
  skuId?: string;
  validUntil?: string;
  fileKey?: string;
  reviewerId?: string;
  reviewedAt?: string;
  usedAt?: string;
}

export interface AuditLog {
  id: string;
  actorId: string;
  actorRole: Role;
  action: string;
  resource: string;
  resourceId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface MemoryState {
  users: Array<Record<string, unknown>>;
  promoters: Array<Record<string, unknown>>;
  promoterRelations: Array<Record<string, unknown>>;
  promoterMemberships: Array<Record<string, unknown>>;
  customerAttributions: Array<Record<string, unknown>>;
  performanceLedger: Array<Record<string, unknown>>;
  rewardWallet: Array<Record<string, unknown>>;
  salesOrderDrafts: Array<Record<string, unknown>>;
  patients: Array<Record<string, unknown>>;
  addresses: Array<Record<string, unknown>>;
  products: Product[];
  skus: Array<Record<string, unknown>>;
  inventoryBatches: Array<Record<string, unknown>>;
  inventoryMovements: Array<Record<string, unknown>>;
  orders: Order[];
  payments: Array<Record<string, unknown>>;
  prescriptions: Prescription[];
  customers: Array<Record<string, unknown>>;
  healthConsents: Array<Record<string, unknown>>;
  commissions: Array<Record<string, unknown>>;
  commissionRules: Array<Record<string, unknown>>;
  withdrawals: Array<Record<string, unknown>>;
  aftersales: Array<Record<string, unknown>>;
  invoices: Array<Record<string, unknown>>;
  refunds: Array<Record<string, unknown>>;
  settlements: Array<Record<string, unknown>>;
  memberApplications: Array<Record<string, unknown>>;
  promotionApplications: Array<Record<string, unknown>>;
  promoterArchives: Array<Record<string, unknown>>;
  promoterArchiveItems: Array<Record<string, unknown>>;
  rewardRuleSets: Array<Record<string, unknown>>;
  rewardRuleTiers: Array<Record<string, unknown>>;
  articles: Array<Record<string, unknown>>;
  banners: Array<Record<string, unknown>>;
  settings: Record<string, unknown>;
  outbox: Array<Record<string, unknown>>;
  auditLogs: AuditLog[];
  files: Array<Record<string, unknown>>;
}
