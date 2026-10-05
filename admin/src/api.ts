export type Dashboard = {
  orders: number;
  paidOrders: number;
  salesAmount: number;
  prescriptionsPending: number;
  withdrawalsPending: number;
  newCustomers: number;
};

export type Analytics = {
  summary: Record<string, number>;
  productRank: Array<Record<string, unknown>>;
  promoterRank: Array<Record<string, unknown>>;
  daily: Array<Record<string, unknown>>;
};

const TOKEN_KEY = "jz_admin_access_token";
const USER_KEY = "jz_admin_staff_user";

export function getAdminToken() { return localStorage.getItem(TOKEN_KEY) || ""; }
export function clearAdminToken() { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); }
export function getStaffUser(): Record<string, any> { try { return JSON.parse(localStorage.getItem(USER_KEY) || "{}"); } catch { return {}; } }

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) { super(message); this.status = status; this.code = code; }
}

type ListPayload<T> = T[] | { items?: T[]; data?: T[]; total?: number; page?: number; pageSize?: number };
export function listItems<T>(payload: ListPayload<T>): T[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload.items)) return payload.items;
  if (Array.isArray(payload.data)) return payload.data;
  return [];
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const token = getAdminToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`/api${path}`, { ...init, headers });
  const contentType = response.headers.get("content-type") || "";
  let payload: any = null;
  if (response.status !== 204 && contentType.includes("application/json")) {
    try { payload = await response.json(); } catch { payload = null; }
  }
  if (!response.ok) {
    if (response.status === 401) clearAdminToken();
    const message = String(payload?.message || payload?.error || `请求失败（${response.status}）`);
    throw new ApiError(response.status, message, payload?.code);
  }
  if (response.status === 204) return undefined as T;
  if (payload === null) return undefined as T;
  return (payload.data ?? payload) as T;
}

async function requestList<T>(path: string, init?: RequestInit) {
  return listItems<T>(await request<ListPayload<T>>(path, init));
}

export async function loginStaff(username: string, password: string) {
  const result = await request<{ token: string; user: Record<string, unknown> }>("/v1/auth/staff/login", { method: "POST", body: JSON.stringify({ username, password }) });
  if (!result?.token) throw new ApiError(500, "登录服务未返回有效会话");
  localStorage.setItem(TOKEN_KEY, result.token);
  localStorage.setItem(USER_KEY, JSON.stringify(result.user || {}));
  return result;
}

export function getDashboard() { return request<Dashboard>("/v1/admin/dashboard"); }

export async function getProducts(query = "") { return requestList<any>(`/v1/admin/products${query ? `?${query}` : ""}`); }
export function searchAdminProducts(filters: { keyword?: string; category?: string; active?: string; page?: number; pageSize?: number } = {}) {
  const query = new URLSearchParams();
  if (filters.keyword) query.set("keyword", filters.keyword);
  if (filters.category && filters.category !== "all") query.set("category", filters.category);
  if (filters.active) query.set("active", filters.active);
  query.set("page", String(filters.page || 1));
  query.set("pageSize", String(filters.pageSize || 8));
  return request<{ items: any[]; total: number; page: number; pageSize: number }>(`/v1/admin/products?${query.toString()}`);
}
export function getProductDetail(id: string) { return request<any>(`/v1/admin/products/${encodeURIComponent(id)}`); }
export async function getProductSkus(id: string) { return requestList<any>(`/v1/admin/products/${encodeURIComponent(id)}/skus`); }
export async function getInventoryBatches(query = "") { return requestList<any>(`/v1/admin/inventory/batches${query ? `?${query}` : ""}`); }
export async function getOrders(filters: Record<string, string> = {}) { const query = new URLSearchParams({ status: "all", ...filters }); return requestList<any>(`/v1/orders?${query.toString()}`); }
export function getOrderDetail(id: string) { return request<any>(`/v1/orders/${encodeURIComponent(id)}`); }
export async function getPrescriptions() { return requestList<any>("/v1/prescriptions"); }
export async function getCustomers(query = "") { return requestList<any>(`/v1/admin/customers${query ? `?${query}` : ""}`); }
export function getCustomerProfile(id: string, sensitive = false, reason = "") { const query = new URLSearchParams(); if (sensitive) query.set("sensitive", "true"); if (reason) query.set("reason", reason); return request<any>(`/v1/admin/customers/${encodeURIComponent(id)}/profile${query.toString() ? `?${query}` : ""}`); }
export function pushCustomerToHealthService(id: string) { return runAction(`/v1/admin/customers/${encodeURIComponent(id)}/health-service/push`); }
export async function getArticles() { return requestList<any>("/v1/content/articles"); }
export async function getAdminArticles(query = "") { return requestList<any>(`/v1/admin/articles${query ? `?${query}` : ""}`); }
export function getAdminArticlesPage(filters: { keyword?: string; category?: string; published?: string; page?: number; pageSize?: number } = {}) {
  const query = new URLSearchParams();
  if (filters.keyword) query.set("keyword", filters.keyword);
  if (filters.category) query.set("category", filters.category);
  if (filters.published) query.set("published", filters.published);
  query.set("page", String(filters.page || 1));
  query.set("pageSize", String(filters.pageSize || 10));
  return request<{ items: any[]; total: number; page: number; pageSize: number }>(`/v1/admin/articles?${query.toString()}`);
}
export function getAdminArticleDetail(id: string) { return request<any>(`/v1/admin/articles/${encodeURIComponent(id)}`); }
export async function getPublicBanners() { return requestList<any>("/v1/content/banners"); }
export async function getMemberApplications(query = "") { return requestList<any>(`/v1/admin/member-applications${query ? `?${query}` : ""}`); }
export async function getPromoters(query = "") { return requestList<any>(`/v1/admin/promoters${query ? `?${query}` : ""}`); }
export function getPromotersPage(filters: Record<string, string | number> = {}) { const query = new URLSearchParams(Object.entries(filters).reduce((acc, [key, value]) => ({ ...acc, [key]: String(value) }), {} as Record<string, string>)); return request<{ items: any[]; total: number; page: number; pageSize: number }>(`/v1/admin/promoters?${query}`); }
export function getMemberApplicationsPage(filters: Record<string, string | number> = {}) { const query = new URLSearchParams(Object.entries(filters).reduce((acc, [key, value]) => ({ ...acc, [key]: String(value) }), {} as Record<string, string>)); return request<{ items: any[]; total: number; page: number; pageSize: number }>(`/v1/admin/member-applications?${query}`); }
export function getMemberApplicationDetail(id: string) { return request<any>(`/v1/admin/member-applications/${encodeURIComponent(id)}`); }
export function getPromoterHistory(id: string, query = "") { return requestList<any>(`/v1/admin/promoters/${encodeURIComponent(id)}/history${query ? `?${query}` : ""}`); }
export function getPromoterHistoryPage(id: string, filters: Record<string, string | number> = {}) { const query = new URLSearchParams(Object.entries(filters).reduce((acc, [key, value]) => ({ ...acc, [key]: String(value) }), {} as Record<string, string>)); return request<{ items: any[]; total: number; page: number; pageSize: number }>(`/v1/admin/promoters/${encodeURIComponent(id)}/history?${query}`); }
export function batchDeletePromoters(ids: string[], reason: string) { return runAction("/v1/admin/promoters/batch-delete", { ids, reason }); }
export async function getPromotionApplications(query = "") { return requestList<any>(`/v1/admin/promotion-applications${query ? `?${query}` : ""}`); }
export function getPromotionApplicationsPage(filters: Record<string, string | number> = {}) { const query = new URLSearchParams(Object.entries(filters).reduce((acc, [key, value]) => ({ ...acc, [key]: String(value) }), {} as Record<string, string>)); return request<{ items: any[]; total: number; page: number; pageSize: number }>(`/v1/admin/promotion-applications?${query}`); }
export function getPromotionApplicationDetail(id: string) { return request<any>(`/v1/admin/promotion-applications/${encodeURIComponent(id)}`); }
export function reviewPromotionApplication(id: string, approved: boolean, reason?: string) { return runAction(`/v1/admin/promotion-applications/${encodeURIComponent(id)}/review`, { approved, reason }); }
export async function getRelationships() { return requestList<any>("/v1/admin/promoter-relations"); }
export async function getCommissionRules() { return requestList<any>("/v1/admin/commission-rules"); }
export async function getCommissions(query = "") { return requestList<any>(`/v1/admin/commissions${query ? `?${query}` : ""}`); }
export async function getRewardSettlements(query = "") { return requestList<any>(`/v1/admin/rewards/settlements${query ? `?${query}` : ""}`); }
export async function getBanners(query = "") { return requestList<any>(`/v1/admin/banners${query ? `?${query}` : ""}`); }
export async function getAftersales() { return requestList<any>("/v1/admin/aftersales"); }
export function getAftersaleDetail(id: string) { return request<any>(`/v1/admin/aftersales/${encodeURIComponent(id)}`); }
export async function getInvoices() { return requestList<any>("/v1/admin/invoices"); }
export async function getAuditLogs() { return requestList<any>("/v1/admin/audit-logs"); }
export function getAnalytics(filters: Record<string, string> = {}) { const query = new URLSearchParams(filters); return request<Analytics>(`/v1/admin/analytics${query.toString() ? `?${query.toString()}` : ""}`); }

export async function runAction<T = any>(path: string, data?: unknown) { return request<T>(path, data === undefined ? { method: "POST" } : { method: "POST", body: JSON.stringify(data) }); }
export function shipOrder(id: string, carrier = "顺丰速运", trackingNo = `SF${Date.now()}`) { return runAction(`/v1/orders/${id}/ship`, { carrier, trackingNo }); }
export function receiveOrder(id: string) { return runAction(`/v1/orders/${id}/receive`); }
export function createOrder(data: Record<string, unknown>) { return runAction("/v1/orders", data); }
export function reviewPrescription(id: string, data: Record<string, unknown>) { return runAction(`/v1/prescriptions/${id}/review`, data); }
export function manualPrescription(data: Record<string, unknown>) { return runAction("/v1/admin/prescriptions/manual", data); }
export function settleRewards() { return runAction("/v1/admin/rewards/settle"); }
export function saveProduct(data: Record<string, unknown>) { return runAction("/v1/admin/products", data); }
export function deleteProduct(id: string) { return runAction(`/v1/admin/products/${encodeURIComponent(id)}/delete`); }
export function updateProductInventory(id: string, stock: number, active = true) { return runAction(`/v1/admin/products/${encodeURIComponent(id)}/inventory`, { stock, active }); }
export function saveProductSku(productId: string, data: Record<string, unknown>) { return runAction(`/v1/admin/products/${encodeURIComponent(productId)}/skus`, data); }
export function saveInventoryBatch(data: Record<string, unknown>) { return runAction("/v1/admin/inventory/batches", data); }
export function adjustInventoryBatch(id: string, data: Record<string, unknown>) { return runAction(`/v1/admin/inventory/batches/${encodeURIComponent(id)}/adjust`, data); }
export function saveArticle(data: Record<string, unknown>) { return runAction("/v1/admin/articles", data); }
export function deleteArticle(id: string) { return runAction(`/v1/admin/articles/${encodeURIComponent(id)}/delete`); }
export function deleteArticles(ids: string[]) { return runAction("/v1/admin/articles/batch-delete", { ids }); }
export function saveBanner(data: Record<string, unknown>) { return runAction("/v1/admin/banners", data); }
export function deleteBanner(id: string) { return runAction(`/v1/admin/banners/${encodeURIComponent(id)}/delete`); }
export function reviewMember(id: string, approved: boolean, data: Record<string, unknown> = {}) { return runAction(`/v1/admin/members/${encodeURIComponent(id)}/review`, { approved, ...data }); }
export function savePromoter(data: Record<string, unknown>) { return runAction(data.id ? `/v1/admin/promoters/${encodeURIComponent(String(data.id))}` : "/v1/admin/promoters", data); }
export function assignRelationship(data: Record<string, unknown>) { return runAction("/v1/admin/promoter-relations", data); }
export function getSalesRelationList(query = "") { return requestList<any>(`/v1/admin/sales/relations/sales${query ? `?${query}` : ""}`); }
export function getSalesRelationListPage(filters: Record<string, string | number> = {}) { const query = new URLSearchParams(Object.entries(filters).reduce((acc, [key, value]) => ({ ...acc, [key]: String(value) }), {} as Record<string, string>)); return request<{ items: any[]; total: number; page: number; pageSize: number }>(`/v1/admin/sales/relations/sales?${query}`); }
export function getSalesRelationTree(salesId: string, query = "") { return request<any>(`/v1/admin/sales/relations/${encodeURIComponent(salesId)}/tree${query ? `?${query}` : ""}`); }
export function batchAssignRelations(data: Record<string, unknown>) { return runAction("/v1/admin/sales/relations/batch-assign", data); }
export function unbindRelation(data: Record<string, unknown>) { return runAction("/v1/admin/sales/relations/unbind", data); }
export function getAgentOrderDrafts(filters: Record<string, string | number> = {}) { const query = new URLSearchParams(Object.entries(filters).reduce((acc, [key, value]) => ({ ...acc, [key]: String(value) }), {} as Record<string, string>)); return request<{ items: any[]; total: number; page: number; pageSize: number }>(`/v1/admin/sales/order-drafts?${query}`); }
export function getPromoAssets() { return request<any>("/v1/sales/promo-assets"); }
export function saveCommissionRule(data: Record<string, unknown>) { return runAction("/v1/admin/commission-rules", data); }
export async function getRewardRuleSets(query = "") { return requestList<any>(`/v1/admin/reward-rule-sets${query ? `?${query}` : ""}`); }
export function getRewardRuleSetsPage(filters: Record<string, string | number> = {}) { const query = new URLSearchParams(Object.entries(filters).reduce((acc, [key, value]) => ({ ...acc, [key]: String(value) }), {} as Record<string, string>)); return request<{ items: any[]; total: number; page: number; pageSize: number }>(`/v1/admin/reward-rule-sets?${query}`); }
export function getRewardRuleSet(productId: string) { return request<any>(`/v1/admin/reward-rule-sets/${encodeURIComponent(productId)}`); }
export function saveRewardRuleSet(data: Record<string, unknown>) { return runAction("/v1/admin/reward-rule-sets", data); }
export function reviewWithdrawal(id: string, approved: boolean, reason = "") { return runAction(`/v1/admin/withdrawals/${encodeURIComponent(id)}/review`, { approved, reason: reason.trim() || undefined }); }
export function transferWithdrawal(id: string, transactionId: string) { return runAction(`/v1/admin/withdrawals/${encodeURIComponent(id)}/transfer`, { action: "record", transactionId }); }
export function confirmWithdrawal(id: string, transactionId: string) { return runAction(`/v1/admin/withdrawals/${encodeURIComponent(id)}/confirm`, { confirmed: true, transactionId: transactionId.trim() }); }
export function reviewAftersale(id: string, action: string, data: Record<string, unknown> = {}) { return runAction(`/v1/admin/aftersales/${encodeURIComponent(id)}/review`, { action, ...data }); }
export function reviewInvoice(id: string, action: string) { return runAction(`/v1/admin/invoices/${encodeURIComponent(id)}/review`, { action }); }
export function uploadInvoice(id: string, fileKey: string, invoiceNo: string) { return runAction(`/v1/admin/invoices/${encodeURIComponent(id)}/file`, { fileKey, invoiceNo }); }
export function saveCustomer(data: Record<string, unknown>) { return runAction("/v1/admin/customers", data); }
export function saveCustomerTag(id: string, tag: string) { return runAction(`/v1/admin/customers/${encodeURIComponent(id)}/tags`, { tag }); }
export async function getWithdrawals() { return requestList<any>("/v1/admin/withdrawals"); }
export function getSalesTree() { return request<any>("/v1/admin/sales/tree"); }
export function getAdminSalesPerformance(query = "") { return requestList<any>(`/v1/admin/sales/performance${query ? `?${query}` : ""}`); }
export function getAdminSalesRewards(query = "") { return requestList<any>(`/v1/admin/sales/rewards${query ? `?${query}` : ""}`); }
export function getSalesSummary() { return request<any>("/v1/sales/summary"); }
export function getSalesPerformance(query = "") { return requestList<any>(`/v1/sales/performance${query ? `?${query}` : ""}`); }
export function getSalesRewards(query = "") { return requestList<any>(`/v1/sales/rewards${query ? `?${query}` : ""}`); }
export function createAgentOrderDraft(data: Record<string, unknown>) { return runAction("/v1/sales/order-drafts", data); }
export function getAgentOrderDraft(token: string) { return request<any>(`/v1/order-drafts/${encodeURIComponent(token)}`); }
export function confirmAgentOrderDraft(token: string, data: Record<string, unknown>) { return runAction(`/v1/order-drafts/${encodeURIComponent(token)}/confirm`, data); }
export function getIntegrationStatus() { return request<Record<string, string>>("/v1/admin/integrations/status"); }
export function getSettings() { return request<Record<string, unknown>>("/v1/admin/settings"); }
export function getStaffAccounts() { return requestList<any>("/v1/admin/staff"); }
export function saveSettings(data: Record<string, unknown>) { return runAction("/v1/admin/settings", data); }

export async function uploadFile(file: File, purpose: "prescription" | "product" | "banner" | "article-cover" | "invoice" | "aftersale", ownerId?: string) {
  const form = new FormData();
  form.append("file", file);
  form.append("purpose", purpose);
  if (ownerId) form.append("ownerId", ownerId);
  const headers = new Headers();
  const token = getAdminToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch("/api/v1/files", { method: "POST", headers, body: form });
  let payload: any = null;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) {
    if (response.status === 401) clearAdminToken();
    throw new ApiError(response.status, String(payload?.message || payload?.error || `上传失败（${response.status}）`), payload?.code);
  }
  return (payload?.data ?? payload) as { id: string; fileKey: string; purpose: string; originalName?: string; mimeType?: string };
}

export async function downloadFile(fileKey: string, filename = "处方凭证") {
  const headers = new Headers();
  const token = getAdminToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`/api/v1/files/${encodeURIComponent(fileKey)}`, { headers });
  if (!response.ok) {
    if (response.status === 401) clearAdminToken();
    throw new ApiError(response.status, `文件读取失败（${response.status}）`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}

export async function downloadExport(path: string, filename: string) {
  const headers = new Headers();
  const token = getAdminToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`/api${path}`, { headers });
  if (!response.ok) {
    if (response.status === 401) clearAdminToken();
    throw new ApiError(response.status, `导出失败（${response.status}）`);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = filename; anchor.click();
  URL.revokeObjectURL(url);
}
