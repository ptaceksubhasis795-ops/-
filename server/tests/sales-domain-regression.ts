import assert from 'node:assert/strict';
import { unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BusinessService } from '../src/domain/business.service';
import { MemoryStore } from '../src/domain/memory.store';
import { OperationsService } from '../src/domain/operations.service';

process.env.REPOSITORY_MODE = 'memory';
process.env.STORE_SNAPSHOT_PATH = join(tmpdir(), `jz-sales-domain-${Date.now()}.json`);

async function main() {
  const store = new MemoryStore();
  const operations = new OperationsService(store, new BusinessService(store));
  const admin = { id: 'admin', role: 'admin' as const };

  const sales = await operations.createPromoter({ name: '回归销售', promoterClass: 'sales' }, admin) as any;
  const member = await operations.createPromoter({ name: '回归会员', promoterClass: 'member' }, admin) as any;
  await operations.batchAssignRelations({ targetType: 'sales', targetId: sales.id, memberIds: [member.id], reason: 'regression' }, admin);
  const beforeFailedBatch = JSON.stringify(store.state.promoterMemberships);
  await assert.rejects(() => operations.batchAssignRelations({ targetType: 'sales', targetId: sales.id, memberIds: [member.id, 'missing'], reason: 'regression' }, admin));
  assert.equal(JSON.stringify(store.state.promoterMemberships), beforeFailedBatch, 'failed relation batch must not partially write');

  const customer = { id: 'regression-customer', name: '回归客户', promoter: '', amount: 0, tags: [] } as any;
  store.state.customers.unshift(customer);
  await operations.batchAssignRelations({ targetType: 'member', targetId: member.id, customerIds: [customer.id], reason: 'regression' }, admin);
  assert.equal(store.state.customers.find((row: any) => row.id === customer.id)?.promoter, member.id);

  const reward = await operations.saveRewardRuleSet({ productId: 'p-jujube-tea', tiers: [
    { tier: 'SALES', method: 'PERCENT', rateBps: 500, fixedFen: 0 },
    { tier: 'MEMBER', method: 'FIXED', rateBps: 0, fixedFen: 120 },
    { tier: 'COMPANY', method: 'PERCENT', rateBps: 100, fixedFen: 0 }
  ] }, admin) as any;
  const tierIds = reward.tiers.map((tier: any) => tier.id).sort().join(',');
  const rewardAgain = await operations.saveRewardRuleSet({ productId: 'p-jujube-tea', tiers: reward.tiers }, admin) as any;
  assert.equal(rewardAgain.tiers.map((tier: any) => tier.id).sort().join(','), tierIds, 'reward tier IDs must be stable');

  const productSearch = operations.products({ keyword: 'p-dan-nan-xing', page: 1, pageSize: 8 }, admin) as any;
  assert.equal(productSearch.total, 1, 'reward editor must find products by product number');
  assert.equal(productSearch.items[0]?.id, 'p-dan-nan-xing', 'product number search must return the matching product');

  store.state.products.push({ id: 'regression-product', name: '规则隔离商品', category: 'daily', price: 10, priceFen: 1000, stock: 1, unit: '件', badge: '测试', active: true } as any);
  const isolated = await operations.saveRewardRuleSet({ productId: 'regression-product', tiers: [
    { tier: 'SALES', method: 'PERCENT', rateBps: 900, fixedFen: 0 },
    { tier: 'MEMBER', method: 'PERCENT', rateBps: 400, fixedFen: 0 },
    { tier: 'COMPANY', method: 'FIXED', rateBps: 0, fixedFen: 50 }
  ] }, admin) as any;
  assert.equal(isolated.productId, 'regression-product', 'a saved rule set must belong to its selected product');
  assert.equal((operations.rewardRuleSet('p-jujube-tea', admin) as any)?.productId, 'p-jujube-tea', 'saving one product must not replace another product rule set');

  const legacyUser: any = { id: 'legacy-member-user', nickname: '老会员', role: 'MEMBER', memberLevel: 'SENIOR_MEMBER' };
  store.state.users.push(legacyUser);
  const legacyPromoter: any = { id: 'legacy-member-promoter', userId: legacyUser.id, type: 'member', level: 'SENIOR_MEMBER', name: legacyUser.nickname, active: true };
  store.state.promoters.push(legacyPromoter);
  const eligibility = operations.promotionEligibility({ id: legacyUser.id, role: 'member' });
  assert.equal((eligibility as any).canApply, true, 'legacy senior member remains eligible to apply');
  const application: any = await operations.applyPromotion({ id: legacyUser.id, role: 'member' });
  await operations.reviewPromotionApplication(application.id, { approved: true }, admin);
  assert.equal(store.state.promoters.find((row: any) => row.id === legacyPromoter.id)?.type, 'sales');

  const deleted = await operations.batchDeletePromoters({ ids: [sales.id], reason: 'regression cleanup' }, admin);
  assert.equal((deleted as any).archived, 1);
  assert.equal(store.state.promoters.some((row: any) => row.id === sales.id), false, 'deleted promoter must leave active table');
  assert.equal(store.state.customers.find((row: any) => row.id === customer.id)?.promoter, member.id, 'customer owned by surviving member must remain with that member');
  assert.ok(store.state.promoterArchives.some((row: any) => row.originalPromoterId === sales.id));

  // A failed durable sales write must restore every in-memory collection.
  const failingSync = { waitForIdle: async () => undefined, syncSalesState: async () => { throw new Error('injected sales transaction failure'); } };
  const previousMode = process.env.REPOSITORY_MODE;
  process.env.REPOSITORY_MODE = 'prisma';
  const rollbackStore = new MemoryStore(failingSync as any);
  const rollbackPromoters = JSON.stringify(rollbackStore.state.promoters);
  await assert.rejects(() => rollbackStore.runAtomic(async () => { rollbackStore.state.promoters.push({ id: 'must-rollback', type: 'member', level: 'ORDINARY_MEMBER', name: '失败写入', active: true }); }));
  assert.equal(JSON.stringify(rollbackStore.state.promoters), rollbackPromoters, 'durable failure must rollback memory');
  process.env.REPOSITORY_MODE = previousMode;

  console.log('sales-domain-regression passed');
  try { unlinkSync(process.env.STORE_SNAPSHOT_PATH); } catch { /* isolated snapshot is best effort */ }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
