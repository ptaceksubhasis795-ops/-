/*
 * In-process regression checks for the operations domain.
 * REPOSITORY_MODE=prisma prevents MemoryStore from reading/writing data/store.json;
 * no API process or developer database is touched.
 * Run from server/: node scripts/check-operations-harness.cjs
 */
process.env.NODE_ENV = 'test';
process.env.REPOSITORY_MODE = 'prisma';
require('reflect-metadata');
require('ts-node/register/transpile-only');

const { MemoryStore } = require('../src/domain/memory.store');
const { BusinessService } = require('../src/domain/business.service');
const { OperationsService } = require('../src/domain/operations.service');

function assert(condition, message) { if (!condition) throw new Error(message); }
async function throws(fn, message) { try { await fn(); } catch { return; } throw new Error(message); }

async function run() {
  const store = new MemoryStore(undefined);
  const business = new BusinessService(store);
  const operations = new OperationsService(store, business);
  const user = { id: 'harness-user', openId: 'harness-openid', nickname: '回归用户', role: 'CONSUMER' };
  store.state.users.push(user);
  const actor = { id: user.id, role: 'consumer' };
  const admin = { id: 'harness-admin', role: 'admin' };

  operations.saveHealthConsent({ version: 'v1', consentType: 'health', granted: true }, actor);
  operations.saveHealthConsent({ version: 'v1', consentType: 'health', granted: false }, actor);
  store.state.customers.push({ id: user.id, name: '回归用户', promoter: '', amountFen: 0, tags: [] });
  assert(operations.healthServiceExport(admin).find((row) => row.customerId === user.id).consent === false, '撤销同意后仍被识别为已授权');

  const patient = operations.savePatient({ name: '回归用户', idNo: '11010119900101123X', phone: '13800001111' }, actor);
  const storedPatient = store.state.patients.find((row) => row.id === patient.id);
  const idCiphertext = storedPatient.idNoCiphertext;
  operations.savePatient({ id: patient.id, name: '回归用户二' }, actor);
  assert(store.state.patients.find((row) => row.id === patient.id).idNoCiphertext === idCiphertext, '编辑就诊人覆盖了已有证件加密值');

  const address = operations.saveAddress({ name: '回归用户', phone: '13800001111', detail: '测试地址' }, actor);
  assert(operations.addresses(actor).find((row) => row.id === address.id).phone === '13800001111', '地址接口没有返回归属用户的明文手机号');

  const app = { id: 'harness-member-application', userId: user.id, name: '回归用户', status: 'pending' };
  store.state.memberApplications.push(app);
  const salesPromoter = { id: 'harness-sales-promoter', userId: 'harness-sales-user', type: 'sales', level: 'STAFF', name: '回归销售', active: true };
  store.state.promoters.push(salesPromoter);
  await throws(() => operations.reviewMember(app.id, {}, admin), '会员审核缺少结果却被默认处理');
  await operations.reviewMember(app.id, { approved: true, salesPromoterId: salesPromoter.id }, admin);
  assert(store.state.promoters.some((row) => row.userId === user.id), '会员审核没有按登录用户建立推广人归属');

  store.state.settings.settlementWeekday = new Date().getUTCDay();
  const emptySettlement = operations.settleRewards(admin);
  assert(emptySettlement.created === false && store.state.settlements.length === 0, '无奖励时生成了零笔结算单');
  const completedOrder = store.state.orders.find((row) => row.status === 'completed');
  store.state.commissions.push({ id: 'harness-commission', orderId: completedOrder.id, promoterId: 'u-demo', amountFen: 100, amount: 1, status: 'eligible', date: completedOrder.createdAt });
  const settlement = operations.settleRewards(admin);
  const repeated = operations.settleRewards(admin);
  assert(settlement.id === repeated.id && store.state.settlements.length === 1, '同一结算周期没有幂等');

  const task = operations.queueManualTask({ provider: 'invoice', type: 'invoice.issue' }, admin);
  throws(() => operations.processManualTask(task.id, { action: 'completed' }, admin), '人工任务未提供凭证却被标记完成');
  operations.processManualTask(task.id, { action: 'complete', confirmed: true, evidence: 'INV-HARNESS-1' }, admin);
  assert(task.status === 'completed', '人工任务确认完成失败');

  console.log('operations harness checks passed');
}

run().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
