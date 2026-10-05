import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { AuditLog, MemoryState, Order, Prescription, Product } from './types';
import { PrismaSyncService } from '../infrastructure/prisma-sync.service';

const products: Product[] = [
  { id: 'p-dan-nan-xing', name: '胆南星直服饮片', category: 'prescription', price: 128, stock: 96, unit: '10g × 10袋', badge: '处方商品', rewardRule: '按品种奖励清单', active: true, image: '/assets/products/dan-nan-xing-default.webp', overlay: '/assets/overlays/botanical-linework.webp', subtitle: '凭有效处方购买 · 直服不煎煮', description: '精选道地原料，按规格计价。购买前需绑定就诊人并提交有效处方。', color: '#E6F4F1' },
  { id: 'p-shang-lu-guo', name: '商陆果直服饮片', category: 'prescription', price: 98, stock: 42, unit: '10g × 10袋', badge: '处方商品', rewardRule: '按品种奖励清单', active: true, image: '/assets/products/shang-lu-guo-default.webp', overlay: '/assets/overlays/botanical-linework.webp', subtitle: '凭有效处方购买 · 规格可选', description: '后台按批号与有效期管理库存，实际可购规格以处方和库存为准。', color: '#EEF5E8' },
  { id: 'p-jujube-tea', name: '草本轻养茶', category: 'daily', price: 69, stock: 238, unit: '5g × 20袋', badge: '药食同源', rewardRule: '普通会员 6%', active: true, image: '/assets/products/jujube-tea-default.webp', overlay: '/assets/overlays/amber-orbit.webp', subtitle: '日常饮用 · 清爽无负担', description: '药食同源原料，独立小袋包装，适合办公室与居家饮用。', color: '#FFF2E3', registrationNo: 'SC202609280001' },
  { id: 'p-millet-protein', name: '谷物营养粉', category: 'daily', price: 89, stock: 152, unit: '30g × 15袋', badge: '热销', rewardRule: '普通会员 5%', active: true, image: '/assets/products/millet-protein-default.webp', overlay: '/assets/overlays/amber-orbit.webp', subtitle: '早餐营养 · 独立分装', description: '谷物与植物蛋白组合，冲调方便。本品不能代替药物。', color: '#FFF6DA' }
];

function now() { return new Date().toISOString(); }
function id(prefix: string) { return `${prefix}-${randomUUID()}`; }

@Injectable()
export class MemoryStore implements OnModuleInit {
  /** Tests can point the in-memory repository at an isolated snapshot. */
  private readonly snapshotPath = process.env.STORE_SNAPSHOT_PATH || join(process.cwd(), 'data', 'store.json');
  private atomicDepth = 0;
  private atomicQueue: Promise<void> = Promise.resolve();
  readonly state: MemoryState = {
    users: [{ id: 'u-demo', openId: 'demo-openid', nickname: '体验用户', phone: '138****2048', role: 'MEMBER', memberLevel: 'SENIOR_MEMBER' }],
    promoters: [
      { id: 'u-sales-01', type: 'sales', level: 'STAFF', name: '华南销售组', active: true },
      { id: 'u-demo', type: 'member', level: 'SENIOR_MEMBER', name: '体验用户', active: true }
    ],
    promoterMemberships: [
      { id: 'membership-demo', memberPromoterId: 'u-demo', salesPromoterId: 'u-sales-01', status: 'active', source: 'admin-seed', createdAt: '2026-09-20T09:00:00.000Z' }
    ],
    promoterRelations: [
      { id: 'rel-01', promoterId: 'u-demo', customerId: 'c-01', source: 'qr-code', active: true, createdAt: '2026-09-20T09:00:00.000Z' },
      { id: 'rel-02', promoterId: 'u-demo', customerId: 'c-02', source: 'article-share', active: true, createdAt: '2026-09-21T09:00:00.000Z' }
    ],
    customerAttributions: [
      { id: 'attr-01', customerId: 'c-01', ownerKind: 'member', ownerPromoterId: 'u-demo', source: 'qr-code', active: true, boundAt: '2026-09-20T09:00:00.000Z' },
      { id: 'attr-02', customerId: 'c-02', ownerKind: 'member', ownerPromoterId: 'u-demo', source: 'article-share', active: true, boundAt: '2026-09-21T09:00:00.000Z' }
    ],
    patients: [{ id: 'patient-01', userId: 'u-demo', name: '李女士', idNoMasked: '110***********2321', phone: '138****2048', relation: '本人', allergies: '暂无', history: '' }],
    addresses: [{ id: 'address-01', userId: 'u-demo', name: '李女士', phone: '138****2048', detail: '广东省广州市天河区体育西路 88 号', isDefault: true }],
    products,
    skus: products.map((product) => ({ id: `${product.id}-default`, productId: product.id, name: product.unit, priceFen: Math.round(product.price * 100), price: product.price, stock: product.stock, active: true, createdAt: now(), updatedAt: now() })),
    inventoryBatches: products.map((product) => ({ id: `${product.id}-default-batch`, productId: product.id, skuId: `${product.id}-default`, batchNo: '初始批次', quantity: product.stock, reservedQuantity: 0, active: true, receivedAt: now() })),
    inventoryMovements: [],
    payments: [],
    orders: [
      { id: 'ord-demo-01', orderNo: 'JZ2026092801', userId: 'u-demo', items: [{ productId: 'p-jujube-tea', name: '草本轻养茶', category: 'daily' as const, quantity: 2, unitPrice: 69 }], amount: 138, freight: 8, totalAmount: 146, status: 'paid', statusText: '待发货', address: { name: '王先生', phone: '138****2048', detail: '广东省广州市天河区体育西路 88 号' }, createdAt: new Date().toISOString(), paidAt: new Date().toISOString() },
      { id: 'ord-demo-02', orderNo: 'JZ2026092702', userId: 'u-demo', items: [{ productId: 'p-millet-protein', name: '谷物营养粉', category: 'daily' as const, quantity: 1, unitPrice: 89 }], amount: 89, freight: 8, totalAmount: 97, status: 'completed', statusText: '已完成', address: { name: '陈女士', phone: '139****5621', detail: '广东省广州市越秀区环市东路 12 号' }, createdAt: '2026-09-27T08:18:00.000Z', paidAt: '2026-09-27T08:20:00.000Z', shippedAt: '2026-09-27T12:00:00.000Z', receivedAt: '2026-09-28T09:00:00.000Z' }
    ],
    prescriptions: [
      { id: 'rx-demo', userId: 'u-demo', patientName: '李女士', source: 'offline', status: 'approved', statusText: '审核通过', itemName: '胆南星直服饮片', validUntil: '2026-10-08' },
      { id: 'rx-pending', userId: 'u-demo', patientName: '王先生', source: 'offline', status: 'pending_review', statusText: '待审核', itemName: '待药师确认', validUntil: '' }
    ],
    customers: [
      { id: 'c-01', name: '王先生', promoter: 'u-demo', lastOrder: '草本轻养茶', amount: 138, tags: ['关注睡眠'] },
      { id: 'c-02', name: '陈女士', promoter: 'u-demo', lastOrder: '谷物营养粉', amount: 89, tags: ['日常营养'] }
    ],
    healthConsents: [],
    commissions: [
      { id: 'cm-01', promoterId: 'u-demo', source: '草本轻养茶 × 2', amount: 8.28, status: 'eligible', statusText: '可结算', date: '2026-09-27' },
      { id: 'cm-02', promoterId: 'u-demo', source: '谷物营养粉 × 1', amount: 5.34, status: 'pending', statusText: '待生效', date: '2026-09-26' }
    ],
    performanceLedger: [
      { id: 'perf-demo-01', orderId: 'ord-demo-01', customerId: 'c-01', promoterId: 'u-demo', amountFen: 14600, selfPurchase: false, period: '2026-09', createdAt: '2026-09-28T02:45:53.746Z' },
      { id: 'perf-demo-02', orderId: 'ord-demo-02', customerId: 'c-02', promoterId: 'u-demo', amountFen: 9700, selfPurchase: false, period: '2026-09', createdAt: '2026-09-27T08:18:00.000Z' }
    ],
    rewardWallet: [
      { id: 'wallet-demo-01', promoterId: 'u-demo', kind: 'reward', amountFen: 828, referenceId: 'cm-01', createdAt: '2026-09-28T02:45:53.746Z' }
    ],
    salesOrderDrafts: [],
    commissionRules: [
      { id: 'rule-01', productId: 'p-jujube-tea', promoterType: 'ORDINARY_MEMBER', rate: 0.06, enabled: true },
      { id: 'rule-02', productId: 'p-millet-protein', promoterType: 'ORDINARY_MEMBER', rate: 0.05, enabled: true },
      { id: 'rule-03', productId: 'p-dan-nan-xing', promoterType: 'SENIOR_MEMBER', rate: 0.08, enabled: true }
    ],
    withdrawals: [],
    aftersales: [],
    invoices: [],
    refunds: [],
    settlements: [],
    memberApplications: [],
    promotionApplications: [],
    promoterArchives: [],
    promoterArchiveItems: [],
    rewardRuleSets: [],
    rewardRuleTiers: [],
    articles: [
      { id: 'a-01', tag: '健康科普', title: '日常健康管理，从记录开始', summary: '从记录开始建立长期健康习惯。', body: '健康管理不只是一次购买，记录就诊人、过敏史和日常关注方向，可以帮助后续服务更准确。', published: true, recommended: true },
      { id: 'a-02', tag: '用药指引', title: '处方饮片购买流程说明', summary: '有效处方、药师审核、确认支付。', body: '取得有效处方后，在我的处方中确认并支付，订单由后台审核和发货。', published: true, recommended: false }
    ],
    banners: [
      { id: 'banner-01', title: '秋季轻养计划', subtitle: '把日常健康，交给长期记录', tone: 'teal', image: '/assets/banners/daily-care.webp', overlay: '/assets/overlays/botanical-linework.webp', imageKey: '/assets/banners/daily-care.webp', target: '/pages/shop/list', active: true, sort: 1, mode: 'default' },
      { id: 'banner-02', title: '处方饮片服务', subtitle: '有效处方 · 药师审核 · 直服不煎煮', tone: 'amber', image: '/assets/banners/prescription-care.webp', overlay: '/assets/overlays/amber-orbit.webp', imageKey: '/assets/banners/prescription-care.webp', target: '/pages/prescriptions/list', active: true, sort: 2, mode: 'default' }
    ],
    settings: { shippingFreeThresholdFen: 19900, shippingFeeFen: 800, autoCancelMinutes: 30, autoReceiveDays: 7, withdrawThresholdFen: 50000, companyName: '九转健康', servicePhone: '400-000-0000' },
    outbox: [],
    files: [],
    auditLogs: []
  };

  constructor(@Optional() private readonly prismaSync?: PrismaSyncService) {
    if (process.env.REPOSITORY_MODE !== 'prisma' && existsSync(this.snapshotPath)) {
      try { Object.assign(this.state, JSON.parse(readFileSync(this.snapshotPath, 'utf8'))); } catch { /* start with seed data when a demo snapshot is corrupt */ }
    }
    this.normalizeState();
    this.state.products.forEach((product) => {
      const seed = products.find((item) => item.id === product.id);
      if (!product.image || String(product.image).endsWith('.svg')) product.image = seed?.image;
      if (!product.overlay) product.overlay = seed?.overlay;
    });
    this.state.banners.forEach((banner: any, index) => {
      if (!banner.imageKey || String(banner.imageKey).startsWith('demo/')) banner.imageKey = index % 2 === 0 ? '/assets/banners/daily-care.webp' : '/assets/banners/prescription-care.webp';
      if (!banner.mode) banner.mode = 'default';
      if (banner.sort === undefined) banner.sort = index + 1;
      if (!banner.subtitle) banner.subtitle = index % 2 === 0 ? '把日常健康，交给长期记录' : '有效处方 · 药师审核 · 直服不煎煮';
    });
    this.state.articles.forEach((article: any) => {
      if (!article.category) article.category = article.tag === '用药指引' ? 'prescription-guide' : 'daily-health';
      if (!article.productIds) article.productIds = [];
      if (article.recommended === undefined) article.recommended = article.id === 'a-01';
      if (!article.coverMode) article.coverMode = 'system';
      if (!article.coverKey) article.coverKey = `/assets/articles/generated/${article.category || 'daily-health'}.webp`;
      if (!article.coverWidth) article.coverWidth = 1280;
      if (!article.coverHeight) article.coverHeight = 720;
    });
  }

  /** Keep snapshots from older demo builds usable without allowing a missing
   * collection to turn a valid request into a runtime TypeError. */
  private normalizeState() {
    const collections: Array<keyof MemoryState> = [
      'users', 'promoters', 'promoterRelations', 'patients', 'addresses', 'products', 'skus', 'inventoryBatches', 'inventoryMovements',
      'promoterMemberships', 'customerAttributions', 'performanceLedger', 'rewardWallet', 'salesOrderDrafts',
      'orders', 'payments', 'prescriptions', 'customers', 'healthConsents', 'commissions',
      'commissionRules', 'withdrawals', 'aftersales', 'invoices', 'refunds', 'settlements', 'memberApplications',
      'articles', 'banners', 'outbox', 'files', 'auditLogs', 'promotionApplications', 'promoterArchives', 'promoterArchiveItems', 'rewardRuleSets', 'rewardRuleTiers'
    ];
    collections.forEach((key) => {
      if (!Array.isArray(this.state[key])) (this.state as any)[key] = [];
    });
    if (this.state.rewardRuleSets.length === 0 && this.state.commissionRules.length) {
      const grouped = new Map<string, any>();
      this.state.commissionRules.forEach((row: any) => {
        const productId = String(row.productId || ''); if (!productId) return;
        let set = grouped.get(productId); if (!set) { set = { id: `rule-set-${productId}`, productId, active: true, createdAt: now(), updatedAt: now() }; grouped.set(productId, set); this.state.rewardRuleSets.push(set); }
        const raw = String(row.promoterType || '').toUpperCase(); const tier = raw === 'STAFF' || raw === 'SENIOR_MEMBER' ? 'SALES' : raw === 'COMPANY' ? 'COMPANY' : 'MEMBER';
        const existing = this.state.rewardRuleTiers.find((item: any) => item.ruleSetId === set.id && item.tier === tier);
        if (existing && raw === 'STAFF' && String(existing.migrationSource || '') === 'SENIOR_MEMBER') set.migrationNeedsReview = true;
        if (!existing) this.state.rewardRuleTiers.push({ id: `rule-tier-${productId}-${tier}`, ruleSetId: set.id, tier, method: Number(row.fixedFen || 0) > 0 ? 'FIXED' : 'PERCENT', rateBps: Number(row.rateBps ?? Number(row.rate || 0) * 10000), fixedFen: Number(row.fixedFen ?? Number(row.fixedAmount || 0) * 100), active: row.enabled !== false, migrationSource: raw });
      });
      const legacyByProduct = new Map<string, Set<string>>();
      this.state.commissionRules.forEach((row: any) => { const p = String(row.productId || ''); const raw = String(row.promoterType || '').toUpperCase(); if (!p) return; const set = legacyByProduct.get(p) || new Set<string>(); set.add(raw); legacyByProduct.set(p, set); });
      this.state.rewardRuleSets.forEach((set: any) => { const raw = legacyByProduct.get(String(set.productId)); if (raw?.has('STAFF') && raw.has('SENIOR_MEMBER')) set.migrationNeedsReview = true; });
    }
    // Rule sets are canonical projections: always materialise all three stable
    // tiers, even for products which only had one legacy row.
    this.state.rewardRuleSets.forEach((set: any) => {
      for (const tier of ['SALES', 'MEMBER', 'COMPANY']) {
        if (!this.state.rewardRuleTiers.some((row: any) => String(row.ruleSetId) === String(set.id) && String(row.tier).toUpperCase() === tier)) this.state.rewardRuleTiers.push({ id: `${set.id}:${tier}`, ruleSetId: set.id, tier, method: 'PERCENT', rateBps: 0, fixedFen: 0, active: true });
      }
    });
    // Rebuild the legacy projection for every canonical set on each hydrate
    // so restarts cannot retain stale one-off RewardRule rows or lose a newly
    // added tier when the old collection was empty.
    const canonicalProducts = new Set(this.state.rewardRuleSets.map((set: any) => String(set.productId)));
    this.state.commissionRules = this.state.commissionRules.filter((row: any) => !canonicalProducts.has(String(row.productId)));
    this.state.rewardRuleSets.forEach((set: any) => this.state.rewardRuleTiers.filter((tier: any) => String(tier.ruleSetId) === String(set.id)).forEach((tier: any) => this.state.commissionRules.push({ id: `${set.id}:${tier.tier}`, productId: set.productId, promoterType: tier.tier === 'SALES' ? 'STAFF' : tier.tier === 'COMPANY' ? 'COMPANY' : 'ORDINARY_MEMBER', rate: Number(tier.rateBps || 0) / 10000, fixedAmount: Number(tier.fixedFen || 0) / 100, rateBps: Number(tier.rateBps || 0), fixedFen: Number(tier.fixedFen || 0), enabled: set.active !== false && tier.active !== false })));
    if (!this.state.settings || typeof this.state.settings !== 'object') this.state.settings = {};
    this.state.orders = this.state.orders.filter(Boolean).map((order: any) => ({
      ...order,
      amount: Number(order.amount || 0),
      freight: Number(order.freight || 0),
      totalAmount: Number(order.totalAmount ?? Number(order.amount || 0) + Number(order.freight || 0)),
      amountFen: Number(order.amountFen ?? Math.round(Number(order.amount || 0) * 100)),
      freightFen: Number(order.freightFen ?? Math.round(Number(order.freight || 0) * 100)),
      totalAmountFen: Number(order.totalAmountFen ?? Math.round(Number(order.totalAmount ?? Number(order.amount || 0) + Number(order.freight || 0)) * 100)),
      items: (Array.isArray(order.items) ? order.items : []).map((item: any) => ({
        ...item,
        unitPrice: Number(item.unitPrice || 0),
        unitPriceFen: Number(item.unitPriceFen ?? Math.round(Number(item.unitPrice || 0) * 100))
      })),
      statusText: order.statusText || order.status || '未知'
    }));
    this.state.products = this.state.products.filter(Boolean).map((product: any) => ({
      ...product,
      price: Number(product.price ?? Number(product.priceFen || 0) / 100),
      priceFen: Number(product.priceFen ?? Math.round(Number(product.price || 0) * 100))
    }));
    if (this.state.skus.length === 0) this.state.products.forEach((product) => this.state.skus.push({ id: `${product.id}-default`, productId: product.id, name: product.unit, priceFen: product.priceFen, price: product.price, stock: product.stock, active: true, createdAt: now(), updatedAt: now() }));
    if (this.state.inventoryBatches.length === 0) this.state.products.forEach((product) => this.state.inventoryBatches.push({ id: `${product.id}-default-batch`, productId: product.id, skuId: `${product.id}-default`, batchNo: '初始批次', quantity: product.stock, reservedQuantity: 0, active: true, receivedAt: now() }));
    this.state.prescriptions = this.state.prescriptions.filter(Boolean).map((item: any) => ({
      ...item,
      statusText: item.statusText || item.status || '未知'
    }));
  }

  async onModuleInit() {
    if (process.env.REPOSITORY_MODE === 'prisma' && this.prismaSync) await this.prismaSync.hydrate(this.state);
  }

  private persist() {
    if (process.env.REPOSITORY_MODE === 'prisma') { void this.prismaSync?.syncState(this.state).catch(() => undefined); return; }
    try {
      const snapshot = JSON.parse(JSON.stringify(this.state));
      snapshot.users?.forEach((user: any) => { delete user.sessionKey; delete user.phone; });
      snapshot.patients?.forEach((patient: any) => { delete patient.idNo; delete patient.phone; });
      snapshot.addresses?.forEach((address: any) => { delete address.phone; });
      snapshot.orders?.forEach((order: any) => { if (order.address?.phone) order.address.phone = maskPhone(order.address.phone); });
      mkdirSync(join(process.cwd(), 'data'), { recursive: true });
      writeFileSync(this.snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
    } catch { /* demo persistence must not block requests */ }
  }

  /**
   * Serialize a domain mutation and make its snapshot durable before releasing
   * the next mutation.  Domain code uses this for operations which touch
   * several collections (archive/delete, relation assignment, reviews).
   * JSON snapshots are intentional here: MemoryState is a wire-shaped object
   * and this also gives us a reliable rollback boundary for failed writes.
   */
  async runAtomic<T>(mutation: () => T | Promise<T>): Promise<T> {
    let release!: () => void;
    const previous = this.atomicQueue;
    this.atomicQueue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    // Let any already queued full snapshot finish before taking the mutation
    // snapshot. This prevents a stale full sync from racing a sales delete.
    if (process.env.REPOSITORY_MODE === 'prisma') await this.prismaSync?.waitForIdle();
    const backup = JSON.parse(JSON.stringify(this.state));
    this.atomicDepth += 1;
    try {
      const result = await mutation();
      if (process.env.REPOSITORY_MODE === 'prisma') await this.prismaSync?.syncSalesState(this.state);
      else this.persist();
      return result;
    } catch (error) {
      Object.assign(this.state, backup);
      throw error;
    } finally {
      this.atomicDepth -= 1;
      release();
    }
  }

  addAudit(actorId: string, actorRole: any, action: string, resource: string, resourceId?: string, metadata?: Record<string, unknown>) {
    const log: AuditLog = { id: id('audit'), actorId, actorRole, action, resource, resourceId, metadata, createdAt: now() };
    this.state.auditLogs.unshift(log);
    if (this.atomicDepth === 0) this.persist();
    return log;
  }

  newId(prefix: string) { return id(prefix); }
  timestamp() { return now(); }
  saveFile(input: { ownerId: string; purpose: string; originalName: string; mimeType: string; size: number; data: string }) {
    const item = {
      id: this.newId('file'),
      ownerId: input.ownerId,
      purpose: input.purpose,
      originalName: input.originalName,
      mimeType: input.mimeType,
      size: input.size,
      data: input.data,
      createdAt: this.timestamp()
    };
    this.state.files.unshift(item);
    this.persist();
    return item;
  }
  findProduct(productId: string) { return this.state.products.find((item) => item.id === productId); }
  findOrder(orderId: string) { return this.state.orders.find((item) => item.id === orderId); }
  findPrescription(idValue: string) { return this.state.prescriptions.find((item) => item.id === idValue); }
  findFile(fileId: string) { return this.state.files.find((item) => String(item.id) === fileId); }
  findActiveProducts() { return this.state.products.filter((item) => item.active); }
}

function maskPhone(value: string) {
  return value.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
}
