/* Operations API smoke/regression checks.
 * Run after starting the API: `node server/scripts/check-operations.cjs`.
 * The checks use development headers only; production must use a bearer token.
 */
const base = process.env.API_BASE_URL || 'http://127.0.0.1:3002/api';
const admin = { 'content-type': 'application/json', 'x-user-id': 'u-admin-smoke', 'x-role': 'admin' };
const sales = { 'content-type': 'application/json', 'x-user-id': 'u-sales-smoke', 'x-role': 'sales' };

async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, headers: { ...admin, ...(options.headers || {}) } });
  const text = await response.text(); let body; try { body = text ? JSON.parse(text) : undefined; } catch { body = text; }
  return { response, body };
}

function assert(condition, message) { if (!condition) throw new Error(message); }

async function run() {
  const products = await request('/v1/admin/products?page=1&pageSize=10');
  assert(products.response.ok && Array.isArray(products.body?.data?.items), '商品列表分页契约失败');
  const invalidProduct = await request('/v1/admin/products', { method: 'POST', body: JSON.stringify({ name: '', category: 'daily' }) });
  assert(invalidProduct.response.status === 400, '商品空名称未拒绝');

  const invalidRecommendation = await request('/v1/admin/articles', { method: 'POST', body: JSON.stringify({ title: '草稿推荐回归', body: '测试正文', category: 'daily-health', published: false, recommended: true }) });
  assert(invalidRecommendation.response.status === 400, '草稿推荐未拒绝');
  const article = await request('/v1/admin/articles', { method: 'POST', body: JSON.stringify({ title: '运营回归文章', body: '测试正文', category: 'daily-health', published: false, recommended: false }) });
  assert(article.response.ok && article.body?.data?.published === false, '文章草稿保存失败');
  const badArticle = await request('/v1/admin/articles', { method: 'POST', body: JSON.stringify({ title: '错误分类', body: '正文', category: 'invalid-category' }) });
  assert(badArticle.response.status === 400, '文章错误分类未拒绝');

  const settings = await request('/v1/admin/settings', { method: 'POST', body: JSON.stringify({ shippingFeeFen: -1 }) });
  assert(settings.response.status === 400, '负数运费设置未拒绝');
  const sensitive = await request('/v1/admin/customers/c-01/profile?sensitive=true', { headers: sales });
  assert([401, 403, 404].includes(sensitive.response.status), '销售越权读取敏感客户档案');

  const exportResponse = await fetch(`${base}/v1/admin/reports/export.xlsx?from=2026-01-01&to=2026-12-31`, { headers: admin });
  assert(exportResponse.ok && (exportResponse.headers.get('content-type') || '').includes('spreadsheetml'), '报表导出契约失败');
  console.log('operations smoke checks passed');
}

run().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
