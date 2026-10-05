import { PrismaClient, ProductCategory, UserRole } from '@prisma/client';

const prisma = new PrismaClient();

const products = [
  { id: 'p-dan-nan-xing', name: '胆南星直服饮片', category: ProductCategory.PRESCRIPTION, priceFen: 12800, stock: 96, unit: '10g × 10袋', active: true, imageKey: '/assets/products/dan-nan-xing-default.webp' },
  { id: 'p-shang-lu-guo', name: '商陆果直服饮片', category: ProductCategory.PRESCRIPTION, priceFen: 9800, stock: 42, unit: '10g × 10袋', active: true, imageKey: '/assets/products/shang-lu-guo-default.webp' },
  { id: 'p-jujube-tea', name: '草本轻养茶', category: ProductCategory.DAILY, priceFen: 6900, stock: 238, unit: '5g × 20袋', active: true, imageKey: '/assets/products/jujube-tea-default.webp' },
  { id: 'p-millet-protein', name: '谷物营养粉', category: ProductCategory.DAILY, priceFen: 8900, stock: 152, unit: '30g × 15袋', active: true, imageKey: '/assets/products/millet-protein-default.webp' }
];

const articles = [
  { id: 'a-default-prescription', category: 'prescription-guide', title: '处方用药指引', summary: '了解处方有效期、审核流程和购买注意事项。', body: '购买处方商品前，请先绑定实名就诊人并提交有效处方。处方审核通过后，在有效期内完成一次购买。', recommended: true },
  { id: 'a-default-clinic', category: 'clinic-service', title: '就诊与处方服务', summary: '互联网医院问诊和线下处方都可留存。', body: '需要问诊时提交就诊人和资料，线下处方可拍照上传，由药师审核后处理。', recommended: false },
  { id: 'a-default-food', category: 'food-origin', title: '药食同源日常选择', summary: '认识原料，按说明冲泡和食用。', body: '药食同源产品适合日常饮食搭配，请按照产品标签和食用方法使用。', recommended: false },
  { id: 'a-default-nutrition', category: 'nutrition', title: '保健食品与营养', summary: '看清产品标签和营养搭配。', body: '保健食品不能代替药物。选择产品时请查看标签，并根据自身情况合理搭配。', recommended: false },
  { id: 'a-default-daily', category: 'daily-health', title: '日常健康管理，从记录开始', summary: '把饮食、睡眠和运动变成可持续的习惯。', body: '记录每天的饮食、睡眠和运动变化，结合家庭健康习惯，逐步形成适合自己的管理方式。', recommended: true },
  { id: 'a-default-service', category: 'service-guide', title: '订单与服务指南', summary: '配送、售后、发票和会员服务说明。', body: '订单状态、配送进度、售后申请和发票信息都可以在小程序订单详情中查看。', recommended: false },
  { id: 'a-default-member', category: 'member-sharing', title: '健康活动与会员分享', summary: '查看会员活动和健康主题分享。', body: '会员活动以后台发布内容为准，分享健康经验时请保护个人隐私。', recommended: false }
];

const banners = [
  { id: 'banner-default-daily', title: '秋季轻养计划', imageKey: '/assets/banners/daily-care.webp', target: '/pages/shop/list', sort: 1 },
  { id: 'banner-default-prescription', title: '处方饮片服务', imageKey: '/assets/banners/prescription-care.webp', target: '/pages/prescriptions/list', sort: 2 }
];

async function main() {
  const user = await prisma.user.upsert({ where: { openId: 'demo-openid' }, update: {}, create: { openId: 'demo-openid', nickname: '体验用户', role: UserRole.MEMBER, memberLevel: 'SENIOR_MEMBER' } });
  for (const product of products) {
    const row = await prisma.product.upsert({ where: { id: product.id }, update: { name: product.name, category: product.category, active: product.active, imageKey: product.imageKey }, create: { id: product.id, name: product.name, category: product.category, active: product.active, imageKey: product.imageKey } });
    const sku = await prisma.productSku.upsert({ where: { id: `${product.id}-default` }, update: { name: product.unit, priceFen: product.priceFen, stock: product.stock }, create: { id: `${product.id}-default`, productId: row.id, name: product.unit, priceFen: product.priceFen, stock: product.stock } });
    await prisma.rewardRule.upsert({ where: { id: `${product.id}-ordinary` }, update: { rateBps: product.category === ProductCategory.DAILY ? 600 : 0, active: true }, create: { id: `${product.id}-ordinary`, productId: row.id, promoterType: 'ORDINARY_MEMBER', rateBps: product.category === ProductCategory.DAILY ? 600 : 0, active: true } });
    const ruleSet = await prisma.rewardRuleSet.upsert({ where: { productId: row.id }, update: { active: true }, create: { id: `${product.id}-rule-set`, productId: row.id, active: true } });
    for (const tier of [
      { tier: 'SALES', rateBps: 0 },
      { tier: 'MEMBER', rateBps: product.category === ProductCategory.DAILY ? 600 : 0 },
      { tier: 'COMPANY', rateBps: 0 }
    ]) {
      await prisma.rewardRuleTier.upsert({ where: { ruleSetId_tier: { ruleSetId: ruleSet.id, tier: tier.tier } }, update: { method: 'PERCENT', rateBps: tier.rateBps, fixedFen: 0, active: true }, create: { id: `${product.id}-${tier.tier.toLowerCase()}-tier`, ruleSetId: ruleSet.id, tier: tier.tier, method: 'PERCENT', rateBps: tier.rateBps, fixedFen: 0, active: true } });
    }
    await prisma.inventoryBatch.upsert({ where: { id: `${sku.id}-initial` }, update: { quantity: product.stock }, create: { id: `${sku.id}-initial`, skuId: sku.id, batchNo: 'INITIAL', quantity: product.stock } });
  }
  for (const article of articles) {
    await prisma.article.upsert({ where: { id: article.id }, update: { title: article.title, tag: article.category, category: article.category, summary: article.summary, body: article.body, published: true, recommended: article.recommended }, create: { id: article.id, title: article.title, tag: article.category, category: article.category, summary: article.summary, body: article.body, published: true, recommended: article.recommended } });
  }
  for (const banner of banners) {
    await prisma.banner.upsert({ where: { id: banner.id }, update: { title: banner.title, imageKey: banner.imageKey, target: banner.target, sort: banner.sort, active: true, mode: 'default' }, create: { id: banner.id, title: banner.title, imageKey: banner.imageKey, target: banner.target, sort: banner.sort, active: true, mode: 'default' } });
  }
  await prisma.auditLog.create({ data: { actorId: user.id, action: 'seed.initialize', resource: 'system', metadata: { products: products.length } } });
}

main().finally(() => prisma.$disconnect());
