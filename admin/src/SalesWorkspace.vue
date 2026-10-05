<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  batchAssignRelations,
  batchDeletePromoters,
  confirmWithdrawal,
  getAdminSalesPerformance,
  getAdminSalesRewards,
  getAgentOrderDrafts,
  getBanners,
  getCommissionRules,
  getMemberApplicationDetail,
  getOrderDetail,
  getMemberApplicationsPage,
  getProducts,
  getPromoterHistoryPage,
  getPromotersPage,
  getPromoAssets,
  getPromotionApplicationDetail,
  getPromotionApplicationsPage,
  getRelationships,
  getRewardRuleSet,
  getRewardRuleSetsPage,
  getRewardSettlements,
  getSalesRelationListPage,
  getSalesRelationTree,
  getSalesTree,
  getWithdrawals,
  reviewMember,
  reviewPromotionApplication,
  reviewWithdrawal,
  saveCommissionRule,
  savePromoter,
  saveRewardRuleSet,
  searchAdminProducts,
  settleRewards,
  transferWithdrawal,
  unbindRelation,
} from "./api";
import SalesPageFrame from "./sales/components/SalesPageFrame.vue";
import SalesDrawer from "./sales/components/SalesDrawer.vue";
import SalesState from "./sales/components/SalesState.vue";
import dailyCarePreview from "../../assets/banners/daily-care.webp";
import prescriptionCarePreview from "../../assets/banners/prescription-care.webp";
import OverviewPage from "./sales/pages/OverviewPage.vue";
import PromotersPage from "./sales/pages/PromotersPage.vue";
import MemberApplicationsPage from "./sales/pages/MemberApplicationsPage.vue";
import PromotionApplicationsPage from "./sales/pages/PromotionApplicationsPage.vue";
import RelationsPage from "./sales/pages/RelationsPage.vue";
import RewardRulesPage from "./sales/pages/RewardRulesPage.vue";
import RewardLedgerPage from "./sales/pages/RewardLedgerPage.vue";
import SettlementsPage from "./sales/pages/SettlementsPage.vue";
import WithdrawalsPage from "./sales/pages/WithdrawalsPage.vue";
import AgentOrdersPage from "./sales/pages/AgentOrdersPage.vue";
import PromotionAssetsPage from "./sales/pages/PromotionAssetsPage.vue";

type Page<T = any> = { items: T[]; total: number; page: number; pageSize: number };
type ActionKind = "delete-promoters" | "reject-member" | "reject-promotion" | "bind" | "unbind" | "transfer" | "confirm-transfer" | "review-withdrawal" | "settle";
type SalesSubpage = "overview" | "promoters" | "applications" | "promotion-applications" | "relations" | "rules" | "rewards" | "settlements" | "withdrawals" | "agent-orders" | "assets";
type SalesAsyncState = "idle" | "loading" | "ready" | "empty" | "error" | "forbidden" | "saving" | "success";

const props = defineProps<{ role?: string }>();
const route = useRoute();
const router = useRouter();
const role = computed(() => String(props.role || "admin").toLowerCase());
const isAdmin = computed(() => role.value === "admin");
const salesSubpages: SalesSubpage[] = ["overview", "promoters", "applications", "promotion-applications", "relations", "rules", "rewards", "settlements", "withdrawals", "agent-orders", "assets"];
const subpage = computed<SalesSubpage>(() => {
  const value = String(route.params.subpage || "overview") as SalesSubpage;
  return salesSubpages.includes(value) ? value : "overview";
});

const loading = ref(false);
const notice = ref("");
const errorMessage = ref("");
const query = ref("");
const salesOptions = ref<any[]>([]);

const promoters = ref<any[]>([]);
const promoterPage = ref<Page>({ items: [], total: 0, page: 1, pageSize: 20 });
const promoterKeyword = ref("");
const promoterActiveFilter = ref("true");
const promoterClassFilter = ref("all");
const selectedPromoters = ref<string[]>([]);
const promoterDialog = ref(false);
const promoterSaving = ref(false);
const promoterError = ref("");
const promoterForm = ref<any>({ id: "", name: "", promoterClass: "sales", userId: "", active: true });

const applications = ref<any[]>([]);
const applicationPage = ref<Page>({ items: [], total: 0, page: 1, pageSize: 20 });
const applicationStatus = ref("pending");
const applicationCounts = ref<Record<string, number>>({ pending: 0, approved: 0, rejected: 0 });
const applicationSourceType = ref("all");
const applicationKeyword = ref("");
const applicationApplicant = ref("");
const applicationReferrer = ref("");
const applicationFrom = ref("");
const applicationTo = ref("");
const applicationDetailDialog = ref(false);
const applicationDetailLoading = ref(false);
const applicationDetail = ref<any>(null);
const approvalDialog = ref(false);
const approvalApplicationId = ref("");
const approvalSalesId = ref("");
const approvalReason = ref("");
const approvalError = ref("");
const approvalSaving = ref(false);

const promotionPage = ref<Page>({ items: [], total: 0, page: 1, pageSize: 20 });
const promotionStatus = ref("pending");
const promotionCounts = ref<Record<string, number>>({ pending: 0, approved: 0, rejected: 0 });
const promotionKeyword = ref("");
const promotionSuperiorKeyword = ref("");
const promotionFrom = ref("");
const promotionTo = ref("");
const promotionDetailDialog = ref(false);
const promotionDetailLoading = ref(false);
const promotionDetail = ref<any>(null);

const relationSalesPage = ref<Page>({ items: [], total: 0, page: 1, pageSize: 20 });
const relationKeyword = ref("");
const selectedSalesId = ref("");
const relationDetail = ref<any>(null);
const relationLoading = ref(false);
const relationError = ref("");
const relationSelection = ref({ targetType: "member", targetId: "", memberIds: [] as string[], customerIds: [] as string[] });
const relationBoundKeyword = ref("");
const relationUnboundKeyword = ref("");
const relationMemberKeyword = ref("");
const collapsedMembers = ref<string[]>([]);

const rewardSetsPage = ref<Page>({ items: [], total: 0, page: 1, pageSize: 20 });
const rewardKeyword = ref("");
const rewardProducts = ref<any[]>([]);
const rewardProductKeyword = ref("");
const rewardProductPage = ref<Page>({ items: [], total: 0, page: 1, pageSize: 8 });
const rewardSetForm = ref<any>(null);
const rewardEditorError = ref("");
const rewardSaving = ref(false);

const relationships = ref<any[]>([]);
const tree = ref<any>({ sales: [], members: [], memberships: [], attributions: [], companyCustomers: [] });
const rules = ref<any[]>([]);
const withdrawals = ref<any[]>([]);
const rewards = ref<any[]>([]);
const performance = ref<any[]>([]);
const settlements = ref<any[]>([]);
const agentOrderDrafts = ref<any[]>([]);
const agentOrderPage = ref<Page>({ items: [], total: 0, page: 1, pageSize: 20 });
const agentOrderKeyword = ref("");
const agentOrderStatus = ref("all");
const agentOrderDetail = ref<any>(null);
const agentOrderDetailLoading = ref(false);
const promoAssets = ref<any>(null);
const banners = ref<any[]>([]);
const assetKeyword = ref("");
const assetDetail = ref<any>(null);
const overviewFrom = ref("");
const overviewTo = ref("");
const overviewMetric = ref<"promoters" | "members" | "relations">("promoters");
const overviewPerformance = ref<any[]>([]);

const historyDialog = ref(false);
const historyLoading = ref(false);
const historyPromoter = ref<any>(null);
const historyPage = ref<Page>({ items: [], total: 0, page: 1, pageSize: 20 });
const historyKind = ref("all");
const actionDialog = ref<{ kind: ActionKind; title: string; description: string; required: boolean; payload?: any } | null>(null);
const actionReason = ref("");
const actionError = ref("");
const actionSaving = ref(false);

const tabs = [
  ["overview", "概览"], ["promoters", "推广人"], ["applications", "会员申请"], ["promotion-applications", "会员晋升申请"], ["relations", "关系树"],
  ["rules", "奖励规则"], ["rewards", "奖励台账"], ["settlements", "周结算"], ["withdrawals", "提现审核"], ["agent-orders", "代客订单"], ["assets", "推广素材"],
] as const;
const title = computed(() => tabs.find(([key]) => key === subpage.value)?.[1] || "销售中心");
const pageComponents: Record<SalesSubpage, any> = {
  overview: OverviewPage,
  promoters: PromotersPage,
  applications: MemberApplicationsPage,
  "promotion-applications": PromotionApplicationsPage,
  relations: RelationsPage,
  rules: RewardRulesPage,
  rewards: RewardLedgerPage,
  settlements: SettlementsPage,
  withdrawals: WithdrawalsPage,
  "agent-orders": AgentOrdersPage,
  assets: PromotionAssetsPage,
};
const pageComponent = computed(() => pageComponents[subpage.value]);
const promoterTotalPages = computed(() => Math.max(1, Math.ceil(promoterPage.value.total / promoterPage.value.pageSize)));
const applicationTotalPages = computed(() => Math.max(1, Math.ceil(applicationPage.value.total / applicationPage.value.pageSize)));
const promotionTotalPages = computed(() => Math.max(1, Math.ceil(promotionPage.value.total / promotionPage.value.pageSize)));
const relationTotalPages = computed(() => Math.max(1, Math.ceil(relationSalesPage.value.total / relationSalesPage.value.pageSize)));
const rewardTotalPages = computed(() => Math.max(1, Math.ceil(rewardSetsPage.value.total / rewardSetsPage.value.pageSize)));
const historyTotalPages = computed(() => Math.max(1, Math.ceil(historyPage.value.total / historyPage.value.pageSize)));
const allPromotersSelected = computed(() => promoters.value.filter((row) => row.active !== false).length > 0 && promoters.value.filter((row) => row.active !== false).every((row) => selectedPromoters.value.includes(String(row.id))));
const selectedRewardProduct = computed(() => rewardProducts.value.find((row) => String(row.id) === String(rewardSetForm.value?.productId)) || null);
const directSaleCustomers = computed(() => {
  if (!relationDetail.value) return [];
  const salesId = String(relationDetail.value.sales?.id || selectedSalesId.value);
  const ids = new Set((relationDetail.value.relations || []).filter((row: any) => String(row.promoterId) === salesId).map((row: any) => String(row.customerId)));
  (relationDetail.value.attributions || []).filter((row: any) => String(row.ownerPromoterId) === salesId).forEach((row: any) => ids.add(String(row.customerId)));
  return (relationDetail.value.customers || []).filter((row: any) => ids.has(String(row.id)));
});
const relationMemberRows = computed(() => {
  const rows = Array.isArray(relationDetail.value?.members) ? relationDetail.value.members : [];
  return rows.map((row: any) => ({
    ...row,
    customers: Array.isArray(row.customers) ? row.customers : [],
    expanded: !collapsedMembers.value.includes(String(row.id)),
  }));
});
const visibleRelationMemberRows = computed(() => {
  const keyword = relationMemberKeyword.value.trim().toLowerCase();
  if (!keyword) return relationMemberRows.value;
  return relationMemberRows.value.filter((row: any) => `${row.id} ${row.name || ""} ${row.userId || ""}`.toLowerCase().includes(keyword));
});
const relationBoundCustomers = computed(() => {
  const keyword = relationBoundKeyword.value.trim().toLowerCase();
  const rows = Array.isArray(relationDetail.value?.customers) ? relationDetail.value.customers : [];
  return rows.filter((row: any) => !keyword || `${row.id} ${row.name || ""} ${row.phone || ""} ${customerOwnerLabel(row)}`.toLowerCase().includes(keyword));
});
const relationUnboundCustomers = computed(() => {
  const keyword = relationUnboundKeyword.value.trim().toLowerCase();
  const rows = Array.isArray(relationDetail.value?.unboundCustomers) ? relationDetail.value.unboundCustomers : [];
  return rows.filter((row: any) => !keyword || `${row.id} ${row.name || ""} ${row.phone || ""}`.toLowerCase().includes(keyword));
});
const relationSelectedCount = computed(() => relationSelection.value.memberIds.length + relationSelection.value.customerIds.length);
const relationTreeStats = computed(() => ({
  members: relationMemberRows.value.length,
  bound: Array.isArray(relationDetail.value?.customers) ? relationDetail.value.customers.length : 0,
  unbound: Array.isArray(relationDetail.value?.unboundCustomers) ? relationDetail.value.unboundCustomers.length : 0,
}));

function emptyPage<T = any>(pageSize = 20): Page<T> { return { items: [], total: 0, page: 1, pageSize }; }
function normalizePage<T = any>(value: any, pageSize = 20): Page<T> {
  if (Array.isArray(value)) return { items: value, total: value.length, page: 1, pageSize: value.length || pageSize };
  return { items: Array.isArray(value?.items) ? value.items : Array.isArray(value?.data) ? value.data : [], total: Number(value?.total || 0), page: Number(value?.page || 1), pageSize: Number(value?.pageSize || pageSize) };
}
function toast(message: string) { notice.value = message; window.setTimeout(() => { if (notice.value === message) notice.value = ""; }, 2800); }
async function copyText(value: unknown, label = "内容") { const text = String(value || ""); if (!text) { toast(`${label}为空`); return; } try { await navigator.clipboard.writeText(text); } catch { const input = document.createElement("textarea"); input.value = text; input.style.position = "fixed"; input.style.opacity = "0"; document.body.appendChild(input); input.select(); document.execCommand("copy"); input.remove(); } toast(`${label}已复制`); }
function copyDraftToken(token: string) { void copyText(token, "客户确认码"); }
function money(value: unknown) { return `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`; }
function dateText(value: string) { return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-"; }
function levelText(value: string) { return ({ STAFF: "销售人员（高级会员）", SENIOR_MEMBER: "销售人员（高级会员）", ORDINARY_MEMBER: "会员", COMPANY: "公司" } as Record<string, string>)[String(value || "").toUpperCase()] || value || "未设置"; }
function promoterClassText(row: any) { return row.promoterClassText || (String(row.type || "").toLowerCase() === "sales" || String(row.level || "").toUpperCase() === "STAFF" ? "销售人员（高级会员）" : "会员"); }
function applicationStatusText(value: string) { return ({ pending: "待审批", pending_review: "待审批", approved: "已审批", rejected: "已驳回" } as Record<string, string>)[value] || value || "未知"; }
function statusText(value: string) { return ({ pending: "待生效", eligible: "可结算", settled: "已结算", reversed: "已扣回", pending_review: "待审核", approved: "待打款", processing: "打款中", paid: "已打款", rejected: "已驳回", sent: "待客户确认", customer_confirmed: "客户已确认", expired: "已过期", cancelled: "已取消" } as Record<string, string>)[value] || value || "未知"; }
function initials(value: unknown) { const text = String(value || "?").trim(); return text.slice(0, 1).toUpperCase() || "?"; }
function maskPhone(value: unknown) { const text = String(value || ""); return text.length >= 7 ? `${text.slice(0, 3)}****${text.slice(-4)}` : text || "未填写手机号"; }
function customerMember(row: any) { return relationMemberRows.value.find((member: any) => member.customers.some((customer: any) => String(customer.id) === String(row?.id))) || null; }
function customerOwnerLabel(row: any) { const member = customerMember(row); return member?.name || (String(row?.promoter || "") === String(relationDetail.value?.sales?.id || selectedSalesId.value) ? relationDetail.value?.sales?.name : row?.promoter) || "已绑定"; }
function customerTargetId(row: any) { return String(customerMember(row)?.id || relationDetail.value?.sales?.id || selectedSalesId.value); }
function toggleMember(memberId: string) { const id = String(memberId); collapsedMembers.value = collapsedMembers.value.includes(id) ? collapsedMembers.value.filter((item) => item !== id) : [...collapsedMembers.value, id]; }
function selectAllRelationCustomers(kind: "bound" | "unbound", checked: boolean) { const rows = kind === "bound" ? relationBoundCustomers.value : relationUnboundCustomers.value; const ids = rows.map((row: any) => String(row.id)); relationSelection.value.customerIds = checked ? Array.from(new Set([...relationSelection.value.customerIds, ...ids])) : relationSelection.value.customerIds.filter((id) => !ids.includes(id)); }
function allRelationCustomersSelected(kind: "bound" | "unbound") { const rows = kind === "bound" ? relationBoundCustomers.value : relationUnboundCustomers.value; return rows.length > 0 && rows.every((row: any) => relationSelection.value.customerIds.includes(String(row.id))); }
function go(key: string) { router.push(`/sales/${key}`); }
function pageParams(extra: Record<string, string | number | undefined>): Record<string, string | number> { return Object.fromEntries(Object.entries(extra).filter(([, value]) => value !== undefined && String(value) !== "")) as Record<string, string | number>; }

async function loadPromoters() {
  promoterPage.value = normalizePage(await getPromotersPage(pageParams({ page: promoterPage.value.page, pageSize: promoterPage.value.pageSize, keyword: promoterKeyword.value, active: promoterActiveFilter.value, class: promoterClassFilter.value })), promoterPage.value.pageSize);
  promoters.value = promoterPage.value.items;
  selectedPromoters.value = selectedPromoters.value.filter((id) => promoters.value.some((row) => String(row.id) === id));
}
async function loadApplications() {
  const filters = pageParams({ page: applicationPage.value.page, pageSize: applicationPage.value.pageSize, status: applicationStatus.value, sourceType: applicationSourceType.value, keyword: applicationKeyword.value, applicantKeyword: applicationApplicant.value, referrerKeyword: applicationReferrer.value, from: applicationFrom.value, to: applicationTo.value });
  const countFilters = { sourceType: applicationSourceType.value, keyword: applicationKeyword.value, applicantKeyword: applicationApplicant.value, referrerKeyword: applicationReferrer.value, from: applicationFrom.value, to: applicationTo.value, page: 1, pageSize: 1 };
  const [page, pending, approved, rejected] = await Promise.all([
    getMemberApplicationsPage(filters),
    getMemberApplicationsPage({ ...countFilters, status: "pending" }),
    getMemberApplicationsPage({ ...countFilters, status: "approved" }),
    getMemberApplicationsPage({ ...countFilters, status: "rejected" }),
  ]);
  applicationPage.value = normalizePage(page, applicationPage.value.pageSize); applications.value = applicationPage.value.items;
  applicationCounts.value = { pending: normalizePage(pending).total, approved: normalizePage(approved).total, rejected: normalizePage(rejected).total };
}
async function loadPromotionApplications() {
  const filters = pageParams({ page: promotionPage.value.page, pageSize: promotionPage.value.pageSize, status: promotionStatus.value, keyword: promotionKeyword.value, superiorKeyword: promotionSuperiorKeyword.value, from: promotionFrom.value, to: promotionTo.value });
  const countFilters = { keyword: promotionKeyword.value, superiorKeyword: promotionSuperiorKeyword.value, from: promotionFrom.value, to: promotionTo.value, page: 1, pageSize: 1 };
  const [page, pending, approved, rejected] = await Promise.all([
    getPromotionApplicationsPage(filters),
    getPromotionApplicationsPage({ ...countFilters, status: "pending" }),
    getPromotionApplicationsPage({ ...countFilters, status: "approved" }),
    getPromotionApplicationsPage({ ...countFilters, status: "rejected" }),
  ]);
  promotionPage.value = normalizePage(page, promotionPage.value.pageSize);
  promotionCounts.value = { pending: normalizePage(pending).total, approved: normalizePage(approved).total, rejected: normalizePage(rejected).total };
}
async function loadRelations() {
  relationSalesPage.value = normalizePage(await getSalesRelationListPage(pageParams({ page: relationSalesPage.value.page, pageSize: relationSalesPage.value.pageSize, keyword: relationKeyword.value })), relationSalesPage.value.pageSize);
  if (selectedSalesId.value && !relationSalesPage.value.items.some((row) => String(row.id) === selectedSalesId.value)) selectedSalesId.value = "";
  if (!selectedSalesId.value && relationSalesPage.value.items[0]) await selectSales(String(relationSalesPage.value.items[0].id));
}
async function loadRewardSets() {
  rewardSetsPage.value = normalizePage(await getRewardRuleSetsPage(pageParams({ page: rewardSetsPage.value.page, pageSize: rewardSetsPage.value.pageSize, keyword: rewardKeyword.value })), rewardSetsPage.value.pageSize);
}
async function loadAgentOrders() {
  agentOrderPage.value = normalizePage(await getAgentOrderDrafts({ page: agentOrderPage.value.page, pageSize: agentOrderPage.value.pageSize }), agentOrderPage.value.pageSize);
  agentOrderDrafts.value = agentOrderPage.value.items;
}
async function loadAssets() {
  const [assetResult, bannerResult] = await Promise.all([getPromoAssets(), getBanners()]);
  promoAssets.value = assetResult;
  banners.value = Array.isArray(bannerResult) ? bannerResult : [];
}
async function load() {
  loading.value = true; errorMessage.value = "";
  try {
    if (isAdmin.value && subpage.value === "promoters") await loadPromoters();
    else if (isAdmin.value && subpage.value === "applications") await loadApplications();
    else if (isAdmin.value && subpage.value === "promotion-applications") await loadPromotionApplications();
    else if (isAdmin.value && subpage.value === "relations") await loadRelations();
    else if (isAdmin.value && subpage.value === "rules") { await loadRewardSets(); if (!rewardProducts.value.length) rewardProducts.value = await getProducts("includeInactive=1"); }
    else if (subpage.value === "rewards") rewards.value = await getAdminSalesRewards("page=1&pageSize=100");
    // Performance remains available to older deep links while the redesigned
    // navigation exposes it through the overview and ledger pages.
    else if (isAdmin.value && String(subpage.value) === "performance") performance.value = await getAdminSalesPerformance("page=1&pageSize=100");
    else if (isAdmin.value && subpage.value === "settlements") settlements.value = await getRewardSettlements("page=1&pageSize=100");
    else if (isAdmin.value && subpage.value === "withdrawals") withdrawals.value = await getWithdrawals();
    else if (isAdmin.value && subpage.value === "agent-orders") await loadAgentOrders();
    else if (subpage.value === "assets") await loadAssets();
    else if (isAdmin.value && subpage.value === "overview") {
      const [promoterResult, applicationResult, relationshipResult, withdrawalResult] = await Promise.all([getPromotersPage({ page: 1, pageSize: 1 }), getMemberApplicationsPage({ page: 1, pageSize: 1, status: "pending" }), getRelationships(), getWithdrawals()]);
      promoterPage.value = normalizePage(promoterResult, 20); applicationPage.value = normalizePage(applicationResult, 20); applications.value = applicationPage.value.items; relationships.value = relationshipResult; withdrawals.value = withdrawalResult;
      try { overviewPerformance.value = await getAdminSalesPerformance("page=1&pageSize=200"); } catch { overviewPerformance.value = []; }
    }
  } catch (error: any) { errorMessage.value = error?.message || "销售数据加载失败"; }
  finally { loading.value = false; }
}
watch(subpage, () => { if (!rewardSetForm.value) void load(); });
onMounted(load);

function setPromoterPage(page: number) { promoterPage.value.page = Math.min(Math.max(1, page), promoterTotalPages.value); void loadPromoters().catch((error: any) => { errorMessage.value = error?.message || "推广人加载失败"; }); }
function togglePromoterSelection(id: string, checked: boolean) { selectedPromoters.value = checked ? Array.from(new Set([...selectedPromoters.value, id])) : selectedPromoters.value.filter((item) => item !== id); }
function toggleAllPromoters(checked: boolean) { selectedPromoters.value = checked ? promoters.value.filter((row) => row.active !== false).map((row) => String(row.id)) : []; }
function openPromoter(row?: any) {
  promoterError.value = "";
  promoterForm.value = row ? { id: row.id, name: row.name || "", promoterClass: String(row.type || "").toLowerCase() === "sales" || String(row.level || "").toUpperCase() === "STAFF" ? "sales" : "member", userId: row.userId || "", active: row.active !== false } : { id: "", name: "", promoterClass: "sales", userId: "", active: true };
  promoterDialog.value = true;
}
async function savePromoterForm() {
  promoterSaving.value = true; promoterError.value = "";
  try { const saved = await savePromoter({ ...promoterForm.value, promoterClass: promoterForm.value.promoterClass, type: promoterForm.value.promoterClass }); promoterDialog.value = false; toast(`推广人已保存，编号 ${saved?.id || "已由服务端生成"}`); await loadPromoters(); }
  catch (error: any) { promoterError.value = error?.message || "保存失败"; }
  finally { promoterSaving.value = false; }
}
function openDeleteDialog() { if (!selectedPromoters.value.length) { toast("请先选择推广人"); return; } actionReason.value = ""; actionError.value = ""; actionDialog.value = { kind: "delete-promoters", title: "批量归档推广人", description: `将归档 ${selectedPromoters.value.length} 位推广人，解除其有效关系并保留历史记录。`, required: true }; }
function openReasonAction(kind: ActionKind, title: string, description: string, payload?: any, required = true) { actionReason.value = ""; actionError.value = ""; actionDialog.value = { kind, title, description, payload, required }; }
async function confirmAction() {
  if (!actionDialog.value) return;
  if (actionDialog.value.required && !actionReason.value.trim()) { actionError.value = "请填写原因后继续"; return; }
  actionSaving.value = true; actionError.value = "";
  try {
    const action = actionDialog.value;
    if (action.kind === "delete-promoters") { await batchDeletePromoters(selectedPromoters.value, actionReason.value.trim()); selectedPromoters.value = []; toast("推广人已归档，历史记录已保留"); await loadPromoters(); }
    else if (action.kind === "reject-member") { await reviewMember(String(action.payload.id), false, { reason: actionReason.value.trim() }); toast("会员申请已驳回"); await loadApplications(); }
    else if (action.kind === "reject-promotion") { await reviewPromotionApplication(String(action.payload.id), false, actionReason.value.trim()); toast("晋升申请已驳回"); await loadPromotionApplications(); }
    else if (action.kind === "bind") { const payload = action.payload; await batchAssignRelations({ ...payload, reason: actionReason.value.trim(), source: "admin-assignment" }); toast("关系绑定成功"); relationSelection.value.memberIds = []; relationSelection.value.customerIds = []; await selectSales(selectedSalesId.value); }
    else if (action.kind === "unbind") { await unbindRelation({ kind: action.payload.kind, id: action.payload.id, reason: actionReason.value.trim() }); toast("关系已解除"); await selectSales(selectedSalesId.value); }
    else if (action.kind === "transfer") { await transferWithdrawal(String(action.payload.id), actionReason.value.trim()); toast("已记录打款凭证，请核验后确认到账"); await load(); }
    else if (action.kind === "confirm-transfer") { await confirmWithdrawal(String(action.payload.id), actionReason.value.trim()); toast("已确认到账"); await load(); }
    else if (action.kind === "review-withdrawal") { await reviewWithdrawal(String(action.payload.id), Boolean(action.payload.approved), actionReason.value); toast(action.payload.approved ? "提现已审核，等待打款" : "提现已驳回"); await load(); }
    else if (action.kind === "settle") { await settleRewards(); toast("本周奖励已结算"); await load(); }
    actionDialog.value = null;
  } catch (error: any) { actionError.value = error?.message || "操作失败，表单内容已保留"; }
  finally { actionSaving.value = false; }
}
async function openHistory(row: any) { historyPromoter.value = row; historyPage.value = emptyPage(20); historyKind.value = "all"; historyDialog.value = true; await loadHistory(); }
async function loadHistory() { if (!historyPromoter.value) return; historyLoading.value = true; try { historyPage.value = normalizePage(await getPromoterHistoryPage(String(historyPromoter.value.id), pageParams({ page: historyPage.value.page, pageSize: historyPage.value.pageSize, kind: historyKind.value })), historyPage.value.pageSize); } catch (error: any) { toast(error?.message || "历史记录加载失败"); } finally { historyLoading.value = false; } }

async function openApplication(row: any) { applicationDetail.value = row; applicationDetailDialog.value = true; applicationDetailLoading.value = true; try { applicationDetail.value = await getMemberApplicationDetail(String(row.id)); } catch (error: any) { toast(error?.message || "申请详情加载失败"); } finally { applicationDetailLoading.value = false; } }
async function openApproval(row: any) { approvalApplicationId.value = String(row.id); approvalSalesId.value = String(row.resolvedSalesPromoterId || ""); approvalReason.value = ""; approvalError.value = ""; approvalDialog.value = true; try { const page = normalizePage(await getPromotersPage({ page: 1, pageSize: 200, class: "sales", active: "true" }), 200); salesOptions.value = page.items; } catch (error: any) { approvalError.value = error?.message || "销售人员加载失败"; } }
function rejectApplication(row: any) { openReasonAction("reject-member", "驳回会员申请", "驳回后申请记录仍会保留，必须填写驳回理由。", row, true); }
async function submitMemberApproval() { if (!approvalSalesId.value) { approvalError.value = "请选择归属销售人员"; return; } approvalSaving.value = true; approvalError.value = ""; try { await reviewMember(approvalApplicationId.value, true, { salesPromoterId: approvalSalesId.value, reason: approvalReason.value.trim() || undefined }); approvalDialog.value = false; toast("会员申请已审批通过"); await loadApplications(); } catch (error: any) { approvalError.value = error?.message || "审批失败，已保留选择"; } finally { approvalSaving.value = false; } }
function openPromotion(row: any) { promotionDetail.value = row; promotionDetailDialog.value = true; promotionDetailLoading.value = true; void getPromotionApplicationDetail(String(row.id)).then((value) => { promotionDetail.value = value; }).catch((error: any) => toast(error?.message || "晋升详情加载失败")).finally(() => { promotionDetailLoading.value = false; }); }
function approvePromotion(row: any) { openReasonAction("reject-promotion", "驳回会员晋升申请", "驳回后记录保留，必须填写驳回理由。", row, true); }
async function approvePromotionDirect(row: any) { try { await reviewPromotionApplication(String(row.id), true); toast("晋升申请已审批通过"); await loadPromotionApplications(); } catch (error: any) { toast(error?.message || "晋升审批失败"); } }

async function selectSales(id: string) { selectedSalesId.value = String(id); relationLoading.value = true; relationError.value = ""; relationBoundKeyword.value = ""; relationUnboundKeyword.value = ""; relationMemberKeyword.value = ""; collapsedMembers.value = []; relationSelection.value.memberIds = []; relationSelection.value.customerIds = []; try { relationDetail.value = await getSalesRelationTree(String(id)); relationSelection.value.targetType = "member"; relationSelection.value.targetId = ""; } catch (error: any) { relationDetail.value = null; relationError.value = error?.message || "关系树加载失败"; } finally { relationLoading.value = false; } }
function dragStart(kind: string, id: string, event: DragEvent) { event.dataTransfer?.setData("application/json", JSON.stringify({ kind, id })); event.dataTransfer?.setData("text/plain", JSON.stringify({ kind, id })); }
function openBindDialog(payload: any) { openReasonAction("bind", "绑定关系", "绑定成功后，关系会写入归属树并刷新当前销售人员。", payload, true); }
function dropTo(targetType: string, targetId: string, event: DragEvent) { event.preventDefault(); try { const raw = event.dataTransfer?.getData("application/json") || event.dataTransfer?.getData("text/plain"); const item = raw ? JSON.parse(raw) : null; if (!item?.id) return; openBindDialog({ targetType, targetId, memberIds: item.kind === "member" ? [String(item.id)] : [], customerIds: item.kind === "customer" ? [String(item.id)] : [] }); } catch { toast("拖动数据无效，请改用勾选绑定"); } }
function beginBatchBind() { if (!relationSelection.value.targetId) { toast("请选择绑定目标"); return; } if (!relationSelection.value.memberIds.length && !relationSelection.value.customerIds.length) { toast("请选择会员或客户"); return; } if (relationSelection.value.targetType === "member" && relationSelection.value.memberIds.length) { toast("会员只能绑定到销售人员"); return; } openBindDialog({ ...relationSelection.value }); }
function onTargetTypeChange() { relationSelection.value.targetId = ""; if (relationSelection.value.targetType === "member") relationSelection.value.memberIds = []; }
function openUnbind(kind: string, id: string) { openReasonAction("unbind", "解除关系", "解除后客户会回到公司待分配状态，会员会解除当前销售归属。", { kind, id }, true); }

async function searchRewardProductsPage() { try { rewardProductPage.value = normalizePage(await searchAdminProducts({ keyword: rewardProductKeyword.value, page: rewardProductPage.value.page, pageSize: rewardProductPage.value.pageSize }), rewardProductPage.value.pageSize); rewardProducts.value = rewardProductPage.value.items; } catch (error: any) { rewardEditorError.value = error?.message || "商品搜索失败"; } }
function defaultTiers() { return ["SALES", "MEMBER", "COMPANY"].map((tier) => ({ tier, method: "PERCENT", ratePercent: 0, fixedYuan: 0, active: true })); }
function toEditorTiers(set: any) { return ["SALES", "MEMBER", "COMPANY"].map((tier) => { const row = (set?.tiers || []).find((item: any) => String(item.tier).toUpperCase() === tier) || {}; return { tier, method: String(row.method || "PERCENT").toUpperCase(), ratePercent: Number(row.rateBps || 0) / 100, fixedYuan: Number(row.fixedFen || 0) / 100, active: row.active !== false }; }); }
async function openRuleSet(set?: any) { rewardEditorError.value = ""; let source = set; if (set?.productId) { try { source = await getRewardRuleSet(String(set.productId)) || set; } catch { /* list snapshot remains usable */ } } rewardSetForm.value = { productId: source?.productId || "", active: source?.active !== false, tiers: source ? toEditorTiers(source) : defaultTiers() }; rewardProductKeyword.value = ""; rewardProductPage.value.page = 1; await searchRewardProductsPage(); }
function selectRewardProduct(product: any) { if (!rewardSetForm.value) return; rewardSetForm.value.productId = String(product.id); rewardEditorError.value = ""; }
function tierName(tier: string) { return tier === "SALES" ? "销售人员（高级会员）" : tier === "MEMBER" ? "普通会员" : "公司兜底"; }
function tierSummary(set: any, tier: string) { const row = (set.tiers || []).find((item: any) => item.tier === tier); if (!row) return "未配置"; return String(row.method).toUpperCase() === "FIXED" ? `固定 ${money(Number(row.fixedFen || 0) / 100)}` : `比例 ${(Number(row.rateBps || 0) / 100).toFixed(2)}%`; }
async function saveRewardSetForm() { if (!rewardSetForm.value || rewardSaving.value) return; rewardEditorError.value = ""; const tiers = rewardSetForm.value.tiers.map((tier: any) => { const method = String(tier.method).toUpperCase(); const ratePercent = Number(tier.ratePercent); const fixedYuan = Number(tier.fixedYuan); if (method === "PERCENT") tier.fixedYuan = 0; else tier.ratePercent = 0; return { tier: tier.tier, method, rateBps: method === "PERCENT" ? Math.round(ratePercent * 100) : 0, fixedFen: method === "FIXED" ? Math.round(fixedYuan * 100) : 0, active: tier.active !== false }; }); if (!rewardSetForm.value.productId) { rewardEditorError.value = "请选择商品"; return; } if (tiers.some((tier: any) => tier.method === "PERCENT" ? tier.rateBps < 0 || tier.rateBps > 10000 : tier.fixedFen < 0 || !Number.isInteger(tier.fixedFen))) { rewardEditorError.value = "比例需在 0%–100% 之间，固定金额需为有效分值"; return; } rewardSaving.value = true; try { await saveRewardRuleSet({ productId: rewardSetForm.value.productId, active: rewardSetForm.value.active, tiers }); rewardSetForm.value = null; toast("整套奖励规则已保存"); await loadRewardSets(); } catch (error: any) { rewardEditorError.value = error?.message || "保存失败，已保留表单内容"; } finally { rewardSaving.value = false; } }

function reviewWithdrawalItem(id: string, approved: boolean) { openReasonAction("review-withdrawal", approved ? "通过提现申请" : "驳回提现申请", approved ? "确认后提现进入待打款状态，可继续记录第三方凭证。" : "驳回后申请记录保留，必须填写驳回原因。", { id, approved }, !approved); }
function recordTransfer(row: any) { openReasonAction("transfer", "记录打款凭证", "请输入第三方打款凭证或流水号，保存后进入打款中；核验凭证后再确认到账。", row, true); }
function confirmTransfer(row: any) { openReasonAction("confirm-transfer", "确认到账", "请核验第三方打款凭证后确认到账；确认后提现进入已打款状态。", row, true); }
function runSettlement() { openReasonAction("settle", "确认执行本周结算", "结算会把当前可结算奖励标记为已结算，并写入结算批次。重复执行同一周期不会重复发放。", undefined, false); }

const filteredRewards = computed(() => rewards.value.filter((row) => !query.value || `${row.source} ${row.promoterId} ${row.orderId}`.toLowerCase().includes(query.value.toLowerCase())));
const filteredBanners = computed(() => banners.value.filter((row) => !assetKeyword.value.trim() || `${row.title || ""} ${row.target || ""} ${row.imageKey || ""}`.toLowerCase().includes(assetKeyword.value.trim().toLowerCase())));
const filteredAgentOrders = computed(() => agentOrderDrafts.value.filter((row) => {
  const keyword = agentOrderKeyword.value.trim().toLowerCase();
  const textMatch = !keyword || `${row.id || ""} ${row.promoterId || ""} ${row.customerId || ""} ${row.orderId || ""}`.toLowerCase().includes(keyword);
  return textMatch && (agentOrderStatus.value === "all" || String(row.status || "") === agentOrderStatus.value);
}));
const overviewTrend = computed(() => {
  const source = overviewPerformance.value.filter((row) => {
    const date = String(row.createdAt || row.date || row.period || "").slice(0, 10);
    return (!overviewFrom.value || date >= overviewFrom.value) && (!overviewTo.value || date <= overviewTo.value);
  });
  const counts = new Map<string, number>();
  source.forEach((row) => { const date = String(row.createdAt || row.date || row.period || "").slice(0, 10) || "未标记"; counts.set(date, (counts.get(date) || 0) + Number(row.amountFen || row.amount || 1)); });
  return Array.from(counts.entries()).slice(-14).map(([date, value]) => ({ date, value }));
});
const bannerPreviewMap: Record<string, string> = {
  "/assets/banners/daily-care.webp": dailyCarePreview,
  "/assets/banners/prescription-care.webp": prescriptionCarePreview,
  "/assets/banners/daily-care.png": dailyCarePreview,
  "/assets/banners/prescription-care.png": prescriptionCarePreview,
};
function bannerImage(row: any) {
  const key = String(row?.image || row?.imageKey || "");
  if (bannerPreviewMap[key]) return bannerPreviewMap[key];
  if (row?.imageUrl) return row.imageUrl;
  if (key.startsWith("data:")) return key;
  // Admin banner responses keep uploaded images as a file key. The public
  // image endpoint resolves that key without exposing the file contents in
  // the admin response, so custom assets remain visible and inspectable.
  if (key.startsWith("file-")) return `/api/v1/content/banners/${encodeURIComponent(key)}/image`;
  return row?.image || "";
}
function openAssetDetail(row: any) { assetDetail.value = row; }
async function openAgentOrderDetail(row: any) {
  agentOrderDetailLoading.value = true;
  agentOrderDetail.value = row;
  try { if (row?.orderId) agentOrderDetail.value = { draft: row, order: await getOrderDetail(String(row.orderId)) }; }
  catch (error: any) { toast(error?.message || "订单详情加载失败"); }
  finally { agentOrderDetailLoading.value = false; }
}
const visualState = computed<SalesAsyncState>(() => {
  if (loading.value) return "loading";
  if (errorMessage.value) return "error";
  if (promoterSaving.value || approvalSaving.value || actionSaving.value || rewardSaving.value) return "saving";
  const empty = subpage.value === "promoters" ? !promoters.value.length
    : subpage.value === "applications" ? !applications.value.length
      : subpage.value === "promotion-applications" ? !promotionPage.value.items.length
        : subpage.value === "relations" ? !relationDetail.value
          : subpage.value === "rules" ? (!rewardSetForm.value && !rewardSetsPage.value.items.length)
            : subpage.value === "rewards" ? !filteredRewards.value.length
              : subpage.value === "settlements" ? !settlements.value.length
                : subpage.value === "withdrawals" ? !withdrawals.value.length
                  : subpage.value === "agent-orders" ? !agentOrderDrafts.value.length
                    : subpage.value === "assets" ? !banners.value.length && !promoAssets.value
                      : false;
  return empty ? "empty" : "ready";
});
</script>

<template>
  <SalesPageFrame :route="`/sales/${subpage}`" :state="visualState" :testid="`sales-page-${subpage}`">
    <component :is="pageComponent" :state="visualState">
      <template #actions><button class="ghost-button" type="button" data-testid="sales-refresh" @click="load">刷新</button><button v-if="subpage === 'settlements' && isAdmin" class="primary-small" type="button" data-testid="sales-settle" @click="runSettlement">执行本周结算</button></template>
    <div v-if="notice" class="toast" role="status">{{ notice }}</div>
    <SalesState v-if="loading" state="loading" message="正在加载销售数据…" testid="sales-state-loading" />
    <SalesState v-else-if="errorMessage" state="error" :message="errorMessage" testid="sales-state-error"><button class="ghost-button" type="button" @click="load">重新加载</button></SalesState>
    <template v-else>
      <section v-if="subpage === 'overview'" class="sales-overview-page" data-visual-state="ready">
        <div class="overview-toolbar"><div class="overview-date-range"><label>开始日期<input v-model="overviewFrom" type="date" @change="load" /></label><span>至</span><label>结束日期<input v-model="overviewTo" type="date" @change="load" /></label></div><select v-model="overviewMetric" class="filter-select" aria-label="趋势指标"><option value="promoters">推广业绩</option><option value="members">新增会员</option><option value="relations">新增关系</option></select></div>
        <div class="nested-grid overview-metrics"><article class="nested-card accent-teal"><span>推广人</span><strong>{{ promoterPage.total }}</strong><small>销售人员与会员</small></article><article class="nested-card accent-amber"><span>待审会员</span><strong>{{ applicationPage.total }}</strong><small>需要管理员处理</small></article><article class="nested-card accent-plum"><span>待审提现</span><strong>{{ withdrawals.filter((row) => row.status === 'pending_review').length }}</strong><small>审核后进入打款</small></article><article class="nested-card accent-slate"><span>关系记录</span><strong>{{ relationships.length }}</strong><small>客户与会员归属</small></article></div>
        <div class="overview-content-grid"><section class="content-panel overview-chart-panel"><div class="panel-heading"><div><p class="panel-kicker">近 30 天趋势</p><h2>{{ overviewMetric === 'promoters' ? '推广业绩' : overviewMetric === 'members' ? '新增会员' : '新增关系' }}</h2></div><span class="panel-count">{{ overviewTrend.length }} 个数据点</span></div><div v-if="overviewTrend.length" class="overview-bars"><div v-for="point in overviewTrend" :key="point.date" class="overview-bar" :style="{ '--bar-size': `${Math.max(8, Math.min(100, point.value / Math.max(...overviewTrend.map((item) => item.value), 1) * 100))}%` }"><span></span><small>{{ point.date.slice(5) }}</small></div></div><div v-else class="empty-state compact-state">暂无趋势数据</div></section><section class="content-panel overview-todo-panel"><div class="panel-heading"><div><p class="panel-kicker">优先处理事项</p><h2>待办任务</h2></div></div><button class="priority-row" type="button" @click="go('applications')"><span class="priority-icon amber">审</span><span class="priority-copy"><b>待审核会员申请</b><small>{{ applicationPage.total }} 条申请等待处理</small></span><strong>{{ applicationPage.total }}</strong></button><button class="priority-row" type="button" @click="go('withdrawals')"><span class="priority-icon plum">¥</span><span class="priority-copy"><b>待审核提现</b><small>{{ withdrawals.filter((row) => row.status === 'pending_review').length }} 条提现等待处理</small></span><strong>{{ withdrawals.filter((row) => row.status === 'pending_review').length }}</strong></button></section></div>
      </section>

      <section v-else-if="subpage === 'promoters'" class="nested-panel">
        <div class="panel-toolbar promoter-toolbar"><div class="toolbar-filters"><input v-model="promoterKeyword" placeholder="搜索名称、编号或用户" @keyup.enter="promoterPage.page = 1; loadPromoters()" /><select v-model="promoterActiveFilter" @change="promoterPage.page = 1; loadPromoters()"><option value="true">正常推广人</option><option value="false">已归档推广人</option><option value="all">全部状态</option></select><select v-model="promoterClassFilter" @change="promoterPage.page = 1; loadPromoters()"><option value="all">全部身份</option><option value="sales">销售人员（高级会员）</option><option value="member">会员</option></select></div><div class="toolbar-actions"><span class="toolbar-count">共 {{ promoterPage.total }} 条</span><button v-if="isAdmin" class="danger-small" type="button" :disabled="!selectedPromoters.length" @click="openDeleteDialog">批量归档</button><button v-if="isAdmin" class="primary-small" type="button" @click="openPromoter()">新增推广人</button></div></div>
        <div class="nested-table"><div class="nested-table-head promoter-grid"><span><input type="checkbox" :checked="allPromotersSelected" @change="toggleAllPromoters(($event.target as HTMLInputElement).checked)" /> 名称</span><span>身份</span><span>用户编号</span><span>状态</span><span>操作</span></div><div v-for="row in promoters" :key="row.id" class="nested-row promoter-grid"><span><label class="row-check"><input type="checkbox" :checked="selectedPromoters.includes(String(row.id))" :disabled="row.active === false" @change="togglePromoterSelection(String(row.id), ($event.target as HTMLInputElement).checked)" /><b>{{ row.name || '未命名推广人' }}</b><small>{{ row.id }}</small></label></span><span>{{ promoterClassText(row) }}</span><span>{{ row.userId || '-' }}</span><em>{{ row.active === false ? '已归档' : '正常' }}</em><span class="row-actions"><button v-if="row.active !== false" class="row-action" type="button" @click="openPromoter(row)">编辑</button><button class="row-action" type="button" @click="openHistory(row)">历史</button></span></div><div v-if="!promoters.length" class="empty-state">暂无符合条件的推广人</div></div>
        <div class="pager"><button class="ghost-button" type="button" :disabled="promoterPage.page <= 1" @click="setPromoterPage(promoterPage.page - 1)">上一页</button><span>第 {{ promoterPage.page }} / {{ promoterTotalPages }} 页</span><button class="ghost-button" type="button" :disabled="promoterPage.page >= promoterTotalPages" @click="setPromoterPage(promoterPage.page + 1)">下一页</button></div>
      </section>

      <section v-else-if="subpage === 'applications'" class="nested-panel">
        <div class="panel-heading"><div><p class="panel-kicker">会员申请</p><h2>审批、归属和历史记录</h2></div></div>
        <nav class="status-tabs"><button v-for="status in [['pending','待审批'],['approved','已审批'],['rejected','已驳回']]" :key="status[0]" type="button" :class="{ active: applicationStatus === status[0] }" @click="applicationStatus = status[0]; applicationPage.page = 1; loadApplications()">{{ status[1] }} <b>{{ applicationCounts[status[0]] || 0 }}</b></button></nav>
        <div class="filter-grid"><label>申请人<input v-model="applicationApplicant" placeholder="姓名或编号" @keyup.enter="applicationPage.page = 1; loadApplications()" /></label><label>推荐人<input v-model="applicationReferrer" placeholder="姓名或编号" @keyup.enter="applicationPage.page = 1; loadApplications()" /></label><label>关键词<input v-model="applicationKeyword" placeholder="申请记录关键词" @keyup.enter="applicationPage.page = 1; loadApplications()" /></label><label>申请类型<select v-model="applicationSourceType" @change="applicationPage.page = 1; loadApplications()"><option value="all">全部类型</option><option value="direct">自主申请</option><option value="referral">推荐申请</option></select></label><label>开始日期<input v-model="applicationFrom" type="date" @change="applicationPage.page = 1; loadApplications()" /></label><label>结束日期<input v-model="applicationTo" type="date" @change="applicationPage.page = 1; loadApplications()" /></label></div>
        <div class="nested-table"><div class="nested-table-head application-grid"><span>申请人</span><span>类型 / 推荐人</span><span>时间</span><span>状态</span><span>操作</span></div><button v-for="row in applications" :key="row.id" class="nested-row application-grid row-button" type="button" @click="openApplication(row)"><span><b>{{ row.name || row.userId }}</b><small>{{ row.userId }}</small></span><span>{{ row.sourceType === 'referral' ? '推荐申请' : '自主申请' }} · {{ row.referrerPromoterId || row.recommender || '无推荐人' }}</span><span>{{ dateText(row.createdAt) }}</span><em>{{ applicationStatusText(row.status) }}</em><span class="row-actions" @click.stop><button v-if="row.status === 'pending' || row.status === 'pending_review'" class="row-action" type="button" @click="openApproval(row)">通过</button><button v-if="row.status === 'pending' || row.status === 'pending_review'" class="row-action danger-text" type="button" @click="rejectApplication(row)">驳回</button></span></button><div v-if="!applications.length" class="empty-state">暂无此状态的申请</div></div>
        <div class="pager"><button class="ghost-button" type="button" :disabled="applicationPage.page <= 1" @click="applicationPage.page--; loadApplications()">上一页</button><span>第 {{ applicationPage.page }} / {{ applicationTotalPages }} 页</span><button class="ghost-button" type="button" :disabled="applicationPage.page >= applicationTotalPages" @click="applicationPage.page++; loadApplications()">下一页</button></div>
      </section>

      <section v-else-if="subpage === 'promotion-applications'" class="nested-panel">
        <div class="panel-heading"><div><p class="panel-kicker">会员晋升申请</p><h2>高级会员晋升销售人员</h2></div></div>
        <nav class="status-tabs"><button v-for="status in [['pending','待审批'],['approved','已审批'],['rejected','已驳回']]" :key="status[0]" type="button" :class="{ active: promotionStatus === status[0] }" @click="promotionStatus = status[0]; promotionPage.page = 1; loadPromotionApplications()">{{ status[1] }} <b>{{ promotionCounts[status[0]] || 0 }}</b></button></nav>
        <div class="filter-grid"><label>申请人 / 编号<input v-model="promotionKeyword" placeholder="搜索申请人或推广人" @keyup.enter="promotionPage.page = 1; loadPromotionApplications()" /></label><label>当前上级<input v-model="promotionSuperiorKeyword" placeholder="销售人员" @keyup.enter="promotionPage.page = 1; loadPromotionApplications()" /></label><label>开始日期<input v-model="promotionFrom" type="date" @change="promotionPage.page = 1; loadPromotionApplications()" /></label><label>结束日期<input v-model="promotionTo" type="date" @change="promotionPage.page = 1; loadPromotionApplications()" /></label></div>
        <div class="nested-table"><div class="nested-table-head promotion-grid"><span>会员</span><span>当前上级</span><span>三个月业绩</span><span>命中条件</span><span>操作</span></div><button v-for="row in promotionPage.items" :key="row.id" class="nested-row promotion-grid row-button" type="button" @click="openPromotion(row)"><span><b>{{ row.applicantName || row.userId }}</b><small>{{ row.promoterName || row.memberPromoterId }}</small></span><span>{{ row.salesName || row.currentSalesPromoterId || '待归属' }}</span><span>{{ money(Number(row.totalAmountFen || 0) / 100) }}</span><span>{{ row.criteria === 'monthly' ? '连续三个月每月达标' : row.criteria === 'total' ? '三个月累计达标' : '未标记' }}</span><span class="row-actions" @click.stop><button v-if="row.status === 'pending'" class="row-action" type="button" @click="approvePromotionDirect(row)">通过</button><button v-if="row.status === 'pending'" class="row-action danger-text" type="button" @click="openReasonAction('reject-promotion', '驳回晋升申请', '驳回后记录保留，必须填写驳回理由。', row, true)">驳回</button></span></button><div v-if="!promotionPage.items.length" class="empty-state">暂无此状态的晋升申请</div></div>
        <div class="pager"><button class="ghost-button" type="button" :disabled="promotionPage.page <= 1" @click="promotionPage.page--; loadPromotionApplications()">上一页</button><span>第 {{ promotionPage.page }} / {{ promotionTotalPages }} 页</span><button class="ghost-button" type="button" :disabled="promotionPage.page >= promotionTotalPages" @click="promotionPage.page++; loadPromotionApplications()">下一页</button></div>
      </section>

      <section v-else-if="subpage === 'relations'" class="nested-panel">
        <div class="relation-page-heading">
          <div><p class="panel-kicker">关系树 / 归属工作台</p><h2>公司 → 销售人员 → 会员 → 客户</h2><p>先选择销售人员，再在树上拖动或通过下方列表批量分配。所有绑定与解除都必须填写原因。</p></div>
          <div class="relation-heading-actions"><span class="relation-help-pill">拖动卡片即可分配</span><button class="ghost-button" type="button" @click="selectedSalesId ? selectSales(selectedSalesId) : loadRelations()">刷新关系树</button></div>
        </div>
        <div class="relation-workbench">
          <aside class="relation-sales-sidebar">
            <div class="relation-sidebar-head"><div><span class="relation-overline">销售人员</span><strong>{{ relationSalesPage.total }}</strong></div><span class="relation-count-label">分页列表</span></div>
            <label class="relation-search-field"><span>⌕</span><input v-model="relationKeyword" placeholder="搜索姓名、编号或用户" @keyup.enter="relationSalesPage.page = 1; loadRelations()" /></label>
            <div class="relation-sales-items">
              <button v-for="row in relationSalesPage.items" :key="row.id" type="button" class="relation-sales-card" :class="{ active: String(selectedSalesId) === String(row.id) }" @click="selectSales(String(row.id))" @dragover.prevent @drop="dropTo('sales', String(row.id), $event)">
                <span class="relation-avatar relation-avatar-sales">{{ initials(row.name) }}</span><span class="relation-sales-meta"><b>{{ row.name || '未命名销售人员' }}</b><small>{{ row.id }} · {{ row.userId || '未绑定用户' }}</small></span><span class="relation-sales-arrow">›</span>
              </button>
              <div v-if="!relationSalesPage.items.length" class="relation-empty compact-state">暂无可管理的销售人员</div>
            </div>
            <div class="relation-sidebar-tip"><b>操作提示</b><span>把会员拖到销售人员卡片，把客户拖到会员卡片；也可以在下方列表勾选后批量绑定。</span></div>
            <div class="pager relation-pager"><button class="ghost-button" type="button" :disabled="relationSalesPage.page <= 1" @click="relationSalesPage.page--; loadRelations()">上一页</button><span>{{ relationSalesPage.page }} / {{ relationTotalPages }}</span><button class="ghost-button" type="button" :disabled="relationSalesPage.page >= relationTotalPages" @click="relationSalesPage.page++; loadRelations()">下一页</button></div>
          </aside>

          <section class="relation-detail">
            <div v-if="relationLoading" class="relation-state-card"><span class="relation-spinner"></span><b>正在加载关系树</b><small>正在读取销售人员、会员和客户归属…</small></div>
            <div v-else-if="relationError" class="nested-state error-state compact-state"><span>{{ relationError }}</span><button class="ghost-button" type="button" @click="selectSales(selectedSalesId)">重新加载</button></div>
            <div v-else-if="relationDetail" class="relation-content">
              <div class="relation-summary-bar"><div class="relation-summary-person"><span class="relation-avatar relation-avatar-sales">{{ initials(relationDetail.sales.name) }}</span><div><span class="relation-overline">当前销售人员</span><b>{{ relationDetail.sales.name }}</b><small>{{ relationDetail.sales.id }} · {{ relationDetail.sales.userId || '未绑定用户' }}</small></div></div><div class="relation-summary-stats"><span><b>{{ relationTreeStats.members }}</b>会员</span><span><b>{{ relationTreeStats.bound }}</b>已绑定客户</span><span><b>{{ relationTreeStats.unbound }}</b>待分配客户</span></div><div class="relation-summary-drop" @dragover.prevent @drop="dropTo('sales', String(relationDetail.sales.id), $event)">将会员或客户拖到这里绑定销售人员</div></div>

              <div class="relation-tree-card">
                <div class="relation-section-heading"><div><span class="relation-overline">层级视图</span><h3>可视化关系树 <small>{{ visibleRelationMemberRows.length }}/{{ relationTreeStats.members }} 位会员</small></h3></div><div class="relation-tree-tools"><label class="relation-tree-search"><span>⌕</span><input v-model="relationMemberKeyword" placeholder="搜索会员" /></label><div class="relation-legend"><span><i class="legend-dot legend-sales"></i>销售人员</span><span><i class="legend-dot legend-member"></i>会员</span><span><i class="legend-dot legend-customer"></i>客户</span></div></div></div>
                <div class="relation-tree-canvas">
                  <div class="relation-tree-company"><span class="relation-avatar relation-avatar-company">司</span><div><b>公司</b><small>公司归属与待分配客户</small></div></div>
                  <div class="relation-tree-stem"></div>
                  <div class="relation-tree-sales relation-drop-target" @dragover.prevent @drop="dropTo('sales', String(relationDetail.sales.id), $event)"><span class="relation-avatar relation-avatar-sales">{{ initials(relationDetail.sales.name) }}</span><div><b>{{ relationDetail.sales.name }}</b><small>{{ relationDetail.sales.id }} · {{ relationDetail.members?.length || 0 }} 位会员</small></div><span class="relation-drag-hint">可接收会员 / 客户</span></div>
                  <div v-if="directSaleCustomers.length" class="relation-sales-customer-branch"><div v-for="customer in directSaleCustomers" :key="'sales-customer-' + customer.id" class="relation-customer-node" draggable="true" @dragstart="dragStart('customer', String(customer.id), $event)"><span class="relation-avatar relation-avatar-customer">{{ initials(customer.name) }}</span><div class="relation-node-copy"><b>{{ customer.name || '未命名客户' }}</b><small>{{ customer.id }} · {{ maskPhone(customer.phone) }}</small></div><span class="relation-owner-tag">直属客户</span><button class="relation-node-action" type="button" @click.stop="openUnbind('customer', String(customer.id))">解除</button></div></div>
                  <div class="relation-tree-stem relation-tree-stem-short"></div>
                  <div v-if="visibleRelationMemberRows.length" class="relation-member-grid">
                    <article v-for="member in visibleRelationMemberRows" :key="member.id" class="relation-member-branch">
                      <div class="relation-member-card relation-drop-target" draggable="true" @dragstart="dragStart('member', String(member.id), $event)" @dragover.prevent @drop="dropTo('member', String(member.id), $event)"><button class="relation-expand" type="button" :aria-label="member.expanded ? '收起客户' : '展开客户'" @click.stop="toggleMember(String(member.id))">{{ member.expanded ? '−' : '+' }}</button><span class="relation-avatar relation-avatar-member">{{ initials(member.name) }}</span><div class="relation-node-copy"><b>{{ member.name || '未命名会员' }}</b><small>{{ member.id }} · {{ member.customers.length }} 位客户</small></div><button class="relation-node-action" type="button" @click.stop="openUnbind('member', String(member.id))">解除</button></div>
                      <div v-if="member.expanded" class="relation-customer-branch"><div v-for="customer in member.customers" :key="customer.id" class="relation-customer-node" draggable="true" @dragstart="dragStart('customer', String(customer.id), $event)"><span class="relation-avatar relation-avatar-customer">{{ initials(customer.name) }}</span><div class="relation-node-copy"><b>{{ customer.name || '未命名客户' }}</b><small>{{ customer.id }} · {{ maskPhone(customer.phone) }}</small></div><button class="relation-node-action" type="button" @click.stop="openUnbind('customer', String(customer.id))">解除</button></div><div v-if="!member.customers.length" class="relation-empty relation-empty-tree">暂无客户，拖动客户到会员卡片</div></div>
                    </article>
                  </div>
                  <div v-else class="relation-empty relation-empty-tree">{{ relationMemberKeyword ? '没有匹配的会员，请调整搜索条件。' : '当前销售人员暂无下属会员，请从下方列表选择会员后批量绑定。' }}</div>
                </div>
              </div>

              <div class="relation-resource-grid">
                <section class="relation-resource-card">
                  <div class="relation-resource-head"><div><span class="relation-overline">客户池</span><h3>已绑定客户 <b>{{ relationBoundCustomers.length }}<small>/{{ relationTreeStats.bound }}</small></b></h3></div><span class="relation-status-dot relation-status-bound">已绑定</span></div>
                  <label class="relation-search-field"><span>⌕</span><input v-model="relationBoundKeyword" placeholder="搜索客户姓名、编号或手机号" /></label>
                  <label class="relation-check-all"><input type="checkbox" :checked="allRelationCustomersSelected('bound')" @click.stop @change="selectAllRelationCustomers('bound', ($event.target as HTMLInputElement).checked)" /><span>全选当前筛选</span><small>{{ relationSelection.customerIds.length }} 已选</small></label>
                  <div class="relation-resource-list"><label v-for="customer in relationBoundCustomers" :key="customer.id" class="relation-resource-row" draggable="true" @dragstart="dragStart('customer', String(customer.id), $event)"><input v-model="relationSelection.customerIds" type="checkbox" :value="String(customer.id)" @click.stop /><span class="relation-avatar relation-avatar-customer">{{ initials(customer.name) }}</span><span class="relation-resource-copy"><b>{{ customer.name || '未命名客户' }}</b><small>{{ customer.id }} · {{ maskPhone(customer.phone) }}</small></span><span class="relation-owner-tag">{{ customerOwnerLabel(customer) }}</span></label><div v-if="!relationBoundCustomers.length" class="relation-empty">暂无符合条件的已绑定客户</div></div>
                </section>
                <section class="relation-resource-card relation-resource-unbound">
                  <div class="relation-resource-head"><div><span class="relation-overline">公司待分配</span><h3>未绑定客户 <b>{{ relationUnboundCustomers.length }}<small>/{{ relationTreeStats.unbound }}</small></b></h3></div><span class="relation-status-dot relation-status-unbound">待分配</span></div>
                  <label class="relation-search-field"><span>⌕</span><input v-model="relationUnboundKeyword" placeholder="搜索姓名、编号或手机号" /></label>
                  <label class="relation-check-all"><input type="checkbox" :checked="allRelationCustomersSelected('unbound')" @click.stop @change="selectAllRelationCustomers('unbound', ($event.target as HTMLInputElement).checked)" /><span>全选当前筛选</span><small>{{ relationSelection.customerIds.length }} 已选</small></label>
                  <div class="relation-resource-list"><label v-for="customer in relationUnboundCustomers" :key="customer.id" class="relation-resource-row" draggable="true" @dragstart="dragStart('customer', String(customer.id), $event)" @dragover.prevent @drop="dropTo('sales', String(relationDetail.sales.id), $event)"><input v-model="relationSelection.customerIds" type="checkbox" :value="String(customer.id)" @click.stop /><span class="relation-avatar relation-avatar-customer relation-avatar-unbound">{{ initials(customer.name) }}</span><span class="relation-resource-copy"><b>{{ customer.name || '未命名客户' }}</b><small>{{ customer.id }} · {{ maskPhone(customer.phone) }}</small></span><span class="relation-owner-tag relation-owner-company">公司</span></label><div v-if="!relationUnboundCustomers.length" class="relation-empty">暂无符合条件的未绑定客户</div></div>
                </section>
              </div>

              <div class="relation-bind-bar relation-bind-bar-modern"><div class="relation-selected-summary"><span class="relation-selected-count">{{ relationSelectedCount }}</span><span>项已选择</span><small>会员 {{ relationSelection.memberIds.length }} · 客户 {{ relationSelection.customerIds.length }}</small></div><span class="relation-bind-arrow">绑定到</span><select v-model="relationSelection.targetType" @change="onTargetTypeChange"><option value="member">会员</option><option value="sales">销售人员</option></select><select v-model="relationSelection.targetId"><option value="">选择目标节点</option><template v-if="relationSelection.targetType === 'member'"><option v-for="row in relationDetail.members" :key="row.id" :value="row.id">{{ row.name }}（会员）</option></template><option v-else :value="relationDetail.sales.id">{{ relationDetail.sales.name }}（销售人员）</option></select><button class="primary-small" type="button" :disabled="!relationSelection.targetId || !relationSelectedCount" @click="beginBatchBind">批量绑定 {{ relationSelectedCount ? '(' + relationSelectedCount + ')' : '' }}</button></div>
            </div>
            <div v-else class="relation-state-card relation-state-empty"><span class="relation-empty-illustration">⌘</span><b>请选择左侧销售人员</b><small>选择销售人员后，这里会展示公司 → 销售人员 → 会员 → 客户的完整关系树。</small></div>
          </section>
        </div>
      </section>
      <section v-else-if="subpage === 'rules' && rewardSetForm" class="nested-panel rule-editor-page"><div class="panel-heading"><div><p class="panel-kicker">奖励规则编辑</p><h2>商品整套奖励规则</h2><p>一个商品只能有一套规则，销售人员、普通会员、公司三档分别选择比例或固定金额。</p></div><button class="ghost-button" type="button" @click="rewardSetForm = null">返回规则列表</button></div><div class="rule-editor-layout"><div><label>搜索商品<input v-model="rewardProductKeyword" placeholder="商品编号或名称" @keyup.enter="rewardProductPage.page = 1; searchRewardProductsPage()" /></label><div class="product-search-results"><button v-for="product in rewardProducts" :key="product.id" type="button" :class="{ active: String(rewardSetForm.productId) === String(product.id) }" @click="selectRewardProduct(product)"><b>{{ product.name }}</b><small>{{ product.id }}</small></button><div v-if="!rewardProducts.length" class="empty-state compact-state">输入编号或名称搜索商品</div></div><div class="pager"><button class="ghost-button" type="button" :disabled="rewardProductPage.page <= 1" @click="rewardProductPage.page--; searchRewardProductsPage()">上一页</button><span>{{ rewardProductPage.page }} / {{ Math.max(1, Math.ceil(rewardProductPage.total / rewardProductPage.pageSize)) }}</span><button class="ghost-button" type="button" :disabled="rewardProductPage.page >= Math.max(1, Math.ceil(rewardProductPage.total / rewardProductPage.pageSize))" @click="rewardProductPage.page++; searchRewardProductsPage()">下一页</button></div></div><div class="product-preview"><h3>商品预览</h3><div v-if="selectedRewardProduct || rewardSetForm.productId" class="preview-card"><b>{{ selectedRewardProduct?.name || rewardSetForm.productId }}</b><small>编号：{{ selectedRewardProduct?.id || rewardSetForm.productId }}</small><small>分类：{{ selectedRewardProduct?.category || '-' }} · SKU：{{ selectedRewardProduct?.skuCount ?? selectedRewardProduct?.skus?.length ?? '-' }}</small><small>价格：{{ selectedRewardProduct?.priceFen !== undefined ? money(Number(selectedRewardProduct.priceFen) / 100) : selectedRewardProduct?.price !== undefined ? money(selectedRewardProduct.price) : '-' }}</small></div><div v-else class="empty-state compact-state">先选择一个商品</div></div></div><div v-for="tier in rewardSetForm.tiers" :key="tier.tier" class="reward-tier-editor"><strong>{{ tierName(tier.tier) }}</strong><select v-model="tier.method" @change="tier.method === 'PERCENT' ? tier.fixedYuan = 0 : tier.ratePercent = 0"><option value="PERCENT">按比例</option><option value="FIXED">固定金额</option></select><label v-if="tier.method === 'PERCENT'">比例（%）<input v-model.number="tier.ratePercent" type="number" min="0" max="100" step="0.01" /></label><label v-else>固定金额（元）<input v-model.number="tier.fixedYuan" type="number" min="0" step="0.01" /></label><span class="tier-help">{{ tier.method === 'PERCENT' ? `保存为 ${Math.round(Number(tier.ratePercent || 0) * 100)} 个基点` : `保存为 ${Math.round(Number(tier.fixedYuan || 0) * 100)} 分` }}</span></div><label class="dialog-check"><input v-model="rewardSetForm.active" type="checkbox" /> 启用规则</label><p v-if="rewardEditorError" class="form-error">{{ rewardEditorError }}</p><div class="dialog-actions"><button class="primary-small" type="button" :disabled="rewardSaving" @click="saveRewardSetForm">{{ rewardSaving ? '保存中…' : '保存整套规则' }}</button></div></section>
      <section v-else-if="subpage === 'rules'" class="nested-panel"><div class="panel-toolbar"><div><p class="panel-kicker">商品奖励清单</p><h2>一商品一规则，三档统一维护</h2></div><div class="toolbar-actions"><input v-model="rewardKeyword" placeholder="搜索商品编号或名称" @keyup.enter="rewardSetsPage.page = 1; loadRewardSets()" /><button v-if="isAdmin" class="primary-small" type="button" @click="openRuleSet()">新增商品规则</button></div></div><div class="nested-table"><div class="nested-table-head reward-grid"><span>商品</span><span>销售人员</span><span>普通会员</span><span>公司兜底</span><span>操作</span></div><div v-for="set in rewardSetsPage.items" :key="set.id" class="nested-row reward-grid"><span><b>{{ set.product?.name || set.productId }}</b><small>{{ set.productId }} · {{ set.product?.category || '-' }}</small></span><span>{{ tierSummary(set, 'SALES') }}</span><span>{{ tierSummary(set, 'MEMBER') }}</span><span>{{ tierSummary(set, 'COMPANY') }}</span><button class="row-action" type="button" @click="openRuleSet(set)">编辑整套</button></div><div v-if="!rewardSetsPage.items.length" class="empty-state">暂无商品奖励规则</div></div><div class="pager"><button class="ghost-button" type="button" :disabled="rewardSetsPage.page <= 1" @click="rewardSetsPage.page--; loadRewardSets()">上一页</button><span>第 {{ rewardSetsPage.page }} / {{ rewardTotalPages }} 页</span><button class="ghost-button" type="button" :disabled="rewardSetsPage.page >= rewardTotalPages" @click="rewardSetsPage.page++; loadRewardSets()">下一页</button></div></section>

      <section v-else-if="subpage === 'rewards'" class="nested-panel"><div class="panel-toolbar"><div><p class="panel-kicker">奖励台账</p><h2>待生效、可结算和扣回</h2></div><input v-model="query" placeholder="搜索订单或推广人" /></div><div class="nested-table"><div class="nested-table-head reward-ledger-grid"><span>订单</span><span>推广人</span><span>来源</span><span>金额</span><span>状态</span></div><div v-for="row in filteredRewards" :key="row.id" class="nested-row reward-ledger-grid"><span>{{ row.orderId || '-' }}</span><span>{{ row.promoterId || '公司' }}</span><span>{{ row.source || '-' }}</span><span>{{ money(row.amountFen !== undefined ? Number(row.amountFen) / 100 : row.amount) }}</span><em>{{ statusText(row.status) }}</em></div><div v-if="!filteredRewards.length" class="empty-state">暂无奖励台账</div></div></section>
      <section v-else-if="subpage === 'settlements'" class="nested-panel settlement-panel"><div class="panel-heading"><div><p class="panel-kicker">周结算</p><h2>结算批次</h2><p class="panel-description">先确认可结算奖励，再生成当周批次；重复执行同一周期不会重复发放。</p></div></div><div class="settlement-note"><span class="status-pill teal">每周一结算</span><span>售后观察期结束且状态为“可结算”的奖励才会进入批次。</span></div><div class="nested-table"><div class="nested-table-head reward-ledger-grid"><span>周期</span><span>笔数</span><span>总额</span><span>时间</span><span>状态</span></div><div v-for="row in settlements" :key="row.id" class="nested-row reward-ledger-grid"><span>{{ row.period }}</span><span>{{ row.count }}</span><span>{{ money(row.totalFen !== undefined ? Number(row.totalFen) / 100 : row.total) }}</span><span>{{ dateText(row.settledAt) }}</span><em>{{ row.status }}</em></div><div v-if="!settlements.length" class="empty-state">暂无结算批次</div></div></section>
      <section v-else-if="subpage === 'withdrawals'" class="nested-panel"><div class="panel-heading"><div><p class="panel-kicker">提现审核</p><h2>审核、打款和凭证</h2></div></div><div class="nested-table"><div class="nested-table-head reward-ledger-grid"><span>推广人</span><span>金额</span><span>申请时间</span><span>状态</span><span>操作</span></div><div v-for="row in withdrawals" :key="row.id" class="nested-row reward-ledger-grid"><span>{{ row.userId || row.promoterId }}</span><span>{{ money(row.amountFen !== undefined ? Number(row.amountFen) / 100 : row.amount) }}</span><span>{{ dateText(row.createdAt) }}</span><em>{{ statusText(row.status) }}</em><span class="row-actions"><button v-if="row.status === 'pending_review'" class="row-action" type="button" @click="reviewWithdrawalItem(row.id, true)">通过</button><button v-if="row.status === 'pending_review'" class="row-action danger-text" type="button" @click="reviewWithdrawalItem(row.id, false)">驳回</button><button v-if="row.status === 'approved'" class="row-action" type="button" @click="recordTransfer(row)">记录打款</button><button v-if="row.status === 'processing'" class="row-action" type="button" @click="confirmTransfer(row)">确认到账</button></span></div><div v-if="!withdrawals.length" class="empty-state">暂无提现申请</div></div></section>
      <section v-else-if="subpage === 'agent-orders'" class="nested-panel agent-order-panel">
        <div class="panel-heading"><div><p class="panel-kicker">代客订单</p><h2>草稿与客户确认</h2><p class="panel-description">销售人员在小程序创建草稿，客户确认地址后才会生成正式订单。</p></div><button class="ghost-button" type="button" @click="loadAgentOrders">刷新草稿</button></div>
        <div class="agent-order-flow"><span>销售创建草稿</span><i>→</i><span>客户确认地址</span><i>→</i><span>生成订单</span></div>
        <div class="agent-order-filter"><input v-model="agentOrderKeyword" placeholder="搜索草稿、销售或客户" /><select v-model="agentOrderStatus"><option value="all">全部状态</option><option value="sent">待客户确认</option><option value="customer_confirmed">客户已确认</option><option value="expired">已过期</option><option value="cancelled">已取消</option></select><span>共 {{ filteredAgentOrders.length }} 条</span></div>
        <div class="nested-table"><div class="nested-table-head agent-order-grid"><span>草稿</span><span>商品数</span><span>状态</span><span>有效期</span><span>操作</span></div><div v-for="draft in filteredAgentOrders" :key="draft.id" class="nested-row agent-order-grid"><span><b>{{ draft.id }}</b><small>销售：{{ draft.promoterId }} · 客户：{{ draft.customerId }}</small></span><span>{{ draft.itemCount || 0 }}</span><em>{{ statusText(draft.status) }}</em><span>{{ dateText(draft.expiresAt) }}</span><span class="row-actions"><button class="row-action" type="button" @click="copyDraftToken(draft.token)">复制确认码</button><button class="row-action" type="button" @click="openAgentOrderDetail(draft)">查看详情</button></span></div><div v-if="!filteredAgentOrders.length" class="empty-state"><h2>暂无代客订单草稿</h2><p>创建入口在销售人员小程序端，后台会在客户确认后同步状态。</p></div></div>
        <SalesDrawer :open="Boolean(agentOrderDetail)" title="代客订单详情" testid="agent-order-drawer" @close="agentOrderDetail = null"><div v-if="agentOrderDetailLoading" class="sales-state sales-state-loading">正在加载订单详情…</div><dl v-else class="detail-grid"><div><dt>草稿编号</dt><dd>{{ agentOrderDetail?.draft?.id || agentOrderDetail?.id || '-' }}</dd></div><div><dt>订单状态</dt><dd>{{ statusText(agentOrderDetail?.order?.status || agentOrderDetail?.draft?.status) }}</dd></div><div><dt>客户</dt><dd>{{ agentOrderDetail?.draft?.customerId || agentOrderDetail?.customerId || '-' }}</dd></div><div><dt>正式订单</dt><dd>{{ agentOrderDetail?.order?.id || agentOrderDetail?.draft?.orderId || '尚未生成' }}</dd></div><div><dt>确认地址</dt><dd>{{ agentOrderDetail?.order?.address?.detail || agentOrderDetail?.order?.shippingAddress?.detail || '等待客户确认' }}</dd></div><div><dt>有效期</dt><dd>{{ dateText(agentOrderDetail?.draft?.expiresAt) }}</dd></div></dl></SalesDrawer>
      </section>
      <section v-else-if="subpage === 'assets'" class="nested-panel asset-panel">
        <div class="panel-heading"><div><p class="panel-kicker">推广素材</p><h2>分享路径与素材配置</h2><p class="panel-description">统一查看推广链接、二维码参数和首页轮播素材，复制后可用于销售分享。</p></div><div class="panel-actions"><input v-model="assetKeyword" class="asset-filter" placeholder="搜索标题或跳转路径" /><button class="ghost-button" type="button" @click="loadAssets">刷新素材</button></div></div>
        <div v-if="promoAssets" class="asset-summary-grid"><article><span>首页分享路径</span><b>{{ promoAssets.sharePath || '-' }}</b><button class="row-action" type="button" @click="copyText(promoAssets.sharePath, '首页分享路径')">复制路径</button></article><article><span>文章分享路径</span><b>{{ promoAssets.articleSharePath || '-' }}</b><button class="row-action" type="button" @click="copyText(promoAssets.articleSharePath, '文章分享路径')">复制路径</button></article><article><span>二维码参数</span><b>{{ promoAssets.qrPayload?.scene || '-' }}</b><small>{{ promoAssets.poster?.status === 'ready' ? '海报模板已就绪' : '海报待配置' }}</small></article></div>
        <div class="asset-gallery"><article v-for="banner in filteredBanners" :key="banner.id" class="asset-card"><img :src="bannerImage(banner)" :alt="banner.title" @error="($event.target as HTMLImageElement).style.display = 'none'" /><div><b>{{ banner.title || '未命名素材' }}</b><small>{{ banner.subtitle || '首页推广素材' }}</small><small class="asset-path">{{ banner.imageKey || banner.image || '未设置图片路径' }}</small></div><div class="asset-card-actions"><button class="row-action" type="button" @click="copyText(banner.target || '', '跳转路径')">复制跳转</button><button class="row-action" type="button" @click="openAssetDetail(banner)">查看详情</button></div></article><div v-if="!filteredBanners.length" class="empty-state">暂无符合条件的推广素材</div></div>
        <SalesDrawer :open="Boolean(assetDetail)" title="推广素材详情" testid="promo-asset-drawer" @close="assetDetail = null"><dl v-if="assetDetail" class="detail-grid"><div><dt>素材标题</dt><dd>{{ assetDetail.title || '-' }}</dd></div><div><dt>审核状态</dt><dd>{{ assetDetail.active === false ? '已停用' : '已启用' }}</dd></div><div><dt>图片路径</dt><dd>{{ assetDetail.imageKey || assetDetail.image || '-' }}</dd></div><div><dt>跳转路径</dt><dd>{{ assetDetail.target || '-' }}</dd></div><div><dt>排序</dt><dd>{{ assetDetail.sort || 0 }}</dd></div><div><dt>素材模式</dt><dd>{{ assetDetail.mode || 'custom' }}</dd></div></dl></SalesDrawer>
      </section>
      <section v-else class="nested-panel"><div class="empty-state"><h2>销售入口</h2><p>请选择上方销售子栏目继续操作。</p></div></section>
    </template>

    <div v-if="promoterDialog" class="dialog-backdrop" @click.self="promoterDialog = false"><form class="dialog-card" @submit.prevent="savePromoterForm"><div class="dialog-head"><div><p class="panel-kicker">推广人档案</p><h2>{{ promoterForm.id ? '编辑推广人' : '新增推广人' }}</h2></div><button type="button" class="icon-button" @click="promoterDialog = false">×</button></div><p class="dialog-note">编号由服务端生成并保证唯一，新增后不可在此修改。</p><label>名称<input v-model="promoterForm.name" required maxlength="80" /></label><label>身份<select v-model="promoterForm.promoterClass"><option value="sales">销售人员（高级会员）</option><option value="member">会员</option></select></label><label>绑定用户编号<input v-model="promoterForm.userId" :disabled="Boolean(promoterForm.id)" placeholder="可选，绑定后可进入关系树" /></label><label class="dialog-check"><input v-model="promoterForm.active" type="checkbox" /> 启用</label><p v-if="promoterError" class="form-error">{{ promoterError }}</p><div class="dialog-actions"><button type="button" class="ghost-button" @click="promoterDialog = false">取消</button><button class="primary-small" type="submit" :disabled="promoterSaving">{{ promoterSaving ? '保存中…' : '保存' }}</button></div></form></div>

    <SalesDrawer :open="historyDialog" title="推广人历史档案" testid="promoter-history-drawer" @close="historyDialog = false"><div class="dialog-head"><div><p class="panel-kicker">{{ historyPromoter?.name }}</p><h2>推广人历史档案</h2></div><button type="button" class="icon-button" @click="historyDialog = false">×</button></div><div class="panel-toolbar"><span class="dialog-note">归档后关系、订单、奖励和提现只读保留</span><select v-model="historyKind" @change="historyPage.page = 1; loadHistory()"><option value="all">全部记录</option><option value="relation">关系</option><option value="membership">会员关系</option><option value="order">订单</option><option value="reward">奖励</option><option value="wallet">钱包流水</option><option value="withdrawal">提现</option></select></div><div v-if="historyLoading" class="nested-state compact-state">正在加载历史…</div><div v-else class="nested-table"><div class="nested-table-head history-grid"><span>类型</span><span>原记录</span><span>金额</span><span>发生时间</span><span>快照</span></div><div v-for="row in historyPage.items" :key="row.id" class="nested-row history-grid"><span>{{ row.kind }}</span><span>{{ row.originalId || '-' }}</span><span>{{ row.amountFen !== undefined ? money(Number(row.amountFen) / 100) : '-' }}</span><span>{{ dateText(row.occurredAt) }}</span><span class="snapshot-text">{{ row.payload?.status || row.payload?.reason || '-' }}</span></div><div v-if="!historyPage.items.length" class="empty-state">暂无历史记录</div></div><div class="pager"><button class="ghost-button" type="button" :disabled="historyPage.page <= 1" @click="historyPage.page--; loadHistory()">上一页</button><span>第 {{ historyPage.page }} / {{ historyTotalPages }} 页</span><button class="ghost-button" type="button" :disabled="historyPage.page >= historyTotalPages" @click="historyPage.page++; loadHistory()">下一页</button></div></SalesDrawer>

    <SalesDrawer :open="applicationDetailDialog" title="会员申请详情" testid="member-application-drawer" @close="applicationDetailDialog = false"><div class="dialog-head"><div><p class="panel-kicker">会员申请详情</p><h2>{{ applicationDetail?.name || applicationDetail?.userId }}</h2></div><button type="button" class="icon-button" @click="applicationDetailDialog = false">×</button></div><div v-if="applicationDetailLoading" class="nested-state compact-state">正在加载详情…</div><dl v-else class="detail-grid"><div><dt>申请人</dt><dd>{{ applicationDetail?.name || '-' }}（{{ applicationDetail?.userId || '-' }}）</dd></div><div><dt>推荐人</dt><dd>{{ applicationDetail?.referrerPromoterId || applicationDetail?.recommender || '无' }}</dd></div><div><dt>来源</dt><dd>{{ applicationDetail?.sourceType === 'referral' ? '推荐申请' : '自主申请' }}</dd></div><div><dt>状态</dt><dd>{{ applicationStatusText(applicationDetail?.status) }}</dd></div><div><dt>申请时间</dt><dd>{{ dateText(applicationDetail?.createdAt) }}</dd></div><div><dt>审核时间</dt><dd>{{ dateText(applicationDetail?.reviewedAt) }}</dd></div><div><dt>审核人</dt><dd>{{ applicationDetail?.reviewerId || '-' }}</dd></div><div><dt>审核意见</dt><dd>{{ applicationDetail?.reviewNote || '无' }}</dd></div></dl><div v-if="applicationDetail?.status === 'pending' || applicationDetail?.status === 'pending_review'" class="dialog-actions"><button class="ghost-button" type="button" @click="openApproval(applicationDetail)">通过</button><button class="danger-small" type="button" @click="rejectApplication(applicationDetail)">驳回</button></div></SalesDrawer>

    <SalesDrawer :open="promotionDetailDialog" title="晋升申请详情" testid="promotion-application-drawer" @close="promotionDetailDialog = false"><div class="dialog-head"><div><p class="panel-kicker">晋升申请详情</p><h2>{{ promotionDetail?.applicantName || promotionDetail?.userId }}</h2></div><button type="button" class="icon-button" @click="promotionDetailDialog = false">×</button></div><div v-if="promotionDetailLoading" class="nested-state compact-state">正在加载详情…</div><template v-else><dl class="detail-grid"><div><dt>当前上级</dt><dd>{{ promotionDetail?.salesName || promotionDetail?.currentSalesPromoterId || '待归属' }}</dd></div><div><dt>命中条件</dt><dd>{{ promotionDetail?.criteria === 'monthly' ? '连续三个月每月达标' : '三个月累计达标' }}</dd></div><div><dt>三个月累计业绩</dt><dd>{{ money(Number(promotionDetail?.totalAmountFen || 0) / 100) }}</dd></div><div><dt>申请状态</dt><dd>{{ applicationStatusText(promotionDetail?.status) }}</dd></div></dl><div class="snapshot-months"><div v-for="month in (promotionDetail?.monthlySnapshot || [])" :key="month.period"><b>{{ month.period }}</b><span>{{ money(Number(month.amountFen || 0) / 100) }}</span></div></div><div v-if="promotionDetail?.status === 'pending'" class="dialog-actions"><button class="primary-small" type="button" @click="approvePromotionDirect(promotionDetail); promotionDetailDialog = false">通过</button><button class="danger-small" type="button" @click="openReasonAction('reject-promotion', '驳回晋升申请', '驳回后记录保留，必须填写驳回理由。', promotionDetail, true); promotionDetailDialog = false">驳回</button></div></template></SalesDrawer>

    <div v-if="approvalDialog" class="dialog-backdrop" @click.self="approvalDialog = false"><form class="dialog-card" @submit.prevent="submitMemberApproval"><div class="dialog-head"><div><p class="panel-kicker">会员申请审批</p><h2>确认通过并绑定销售</h2></div><button type="button" class="icon-button" @click="approvalDialog = false">×</button></div><p class="dialog-note">会员通过后进入固定层级“销售人员 → 会员 → 客户”。</p><label>归属销售人员<select v-model="approvalSalesId" required><option value="">请选择销售人员</option><option v-for="row in salesOptions" :key="row.id" :value="row.id">{{ row.name }}（{{ row.id }}）</option></select></label><label>审批备注<textarea v-model="approvalReason" rows="3" maxlength="500" placeholder="可选"></textarea></label><p v-if="approvalError" class="form-error">{{ approvalError }}</p><div class="dialog-actions"><button type="button" class="ghost-button" @click="approvalDialog = false">取消</button><button class="primary-small" type="submit" :disabled="approvalSaving">{{ approvalSaving ? '提交中…' : '确认通过' }}</button></div></form></div>

    <div v-if="actionDialog" class="dialog-backdrop" @click.self="actionDialog = null"><form class="dialog-card" @submit.prevent="confirmAction"><div class="dialog-head"><div><p class="panel-kicker">需要记录操作</p><h2>{{ actionDialog.title }}</h2></div><button type="button" class="icon-button" @click="actionDialog = null">×</button></div><p class="dialog-note">{{ actionDialog.description }}</p><label>{{ actionDialog.kind === 'transfer' || actionDialog.kind === 'confirm-transfer' ? '打款凭证 / 流水号' : '操作原因' }}<textarea v-model="actionReason" rows="4" maxlength="500" :placeholder="actionDialog.required ? '必填，最多 500 字' : '可选'" :required="actionDialog.required"></textarea></label><p v-if="actionError" class="form-error">{{ actionError }}</p><div class="dialog-actions"><button type="button" class="ghost-button" @click="actionDialog = null">取消</button><button class="primary-small" type="submit" :disabled="actionSaving">{{ actionSaving ? '提交中…' : '确认操作' }}</button></div></form></div>
    </component>
  </SalesPageFrame>
</template>

<style scoped>
.nested-workspace { max-width: 1480px; margin: 0 auto; padding: 32px 44px 64px; }
.nested-header { display: flex; align-items: flex-end; justify-content: space-between; gap: 22px; margin-bottom: 18px; }
.nested-header h1 { margin-top: 7px; color: #173b3c; font-family: "Noto Serif SC", serif; font-size: 30px; }
.nested-header p { color: #78908c; font-size: 12px; }.nested-header-actions,.toolbar-actions { display: flex; align-items: center; gap: 9px; }
.nested-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 13px; }.nested-card { display: flex; min-height: 125px; flex-direction: column; justify-content: space-between; padding: 18px; border-radius: 14px; background: #f2f8f5; color: #4f7771; }.nested-card strong { color: #234b48; font-size: 30px; }.nested-card small { color: #91a49f; font-size: 10px; }.accent-amber { background: #fff4e3; }.accent-plum { background: #f1e8f0; }.accent-slate { background: #eef2f3; }
.nested-panel { padding: 20px; border: 1px solid #dce7e4; border-radius: 15px; background: #f9fcfa; }.panel-toolbar,.panel-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 16px; }.panel-heading h2 { margin-top: 4px; color: #193d3e; font-family: "Noto Serif SC", serif; font-size: 20px; }.panel-toolbar input,.panel-toolbar select,.toolbar-filters input,.toolbar-filters select { min-height: 36px; padding: 8px 10px; border: 1px solid #d7e4df; border-radius: 8px; background: white; }.toolbar-filters { display: flex; flex-wrap: wrap; gap: 8px; }.nested-table { overflow: hidden; border: 1px solid #e0ebe8; border-radius: 11px; background: white; }.nested-table-head,.nested-row { display: grid; align-items: center; gap: 12px; padding: 12px 15px; }.nested-table-head { color: #86a09b; font-size: 10px; background: #f2f8f5; }.nested-row { min-height: 55px; border-top: 1px solid #edf3f0; color: #486b66; font-size: 11px; }.nested-row span:first-child { display: flex; flex-direction: column; gap: 3px; }.nested-row small { color: #9aadaa; font-size: 9px; }.nested-row em { color: #4b8a7e; font-style: normal; }.promoter-grid { grid-template-columns: 1.5fr 1.3fr 1.3fr .8fr 1fr; }.application-grid { grid-template-columns: 1.25fr 1.4fr 1.2fr .8fr 1.2fr; }.promotion-grid { grid-template-columns: 1.3fr 1.3fr 1.1fr 1.35fr 1.2fr; }.reward-grid { grid-template-columns: 1.4fr 1fr 1fr 1fr .9fr; }.reward-ledger-grid { grid-template-columns: 1.4fr 1.2fr 1.4fr 1fr 1fr; }.history-grid { grid-template-columns: .9fr 1.3fr 1fr 1.4fr 1.3fr; }.row-check { display: flex; align-items: center; gap: 8px; }.row-button { width: 100%; border: 0; text-align: left; cursor: pointer; }.row-button:hover { background: #f4faf7; }.row-actions { display: flex; align-items: center; gap: 8px; }.row-action { border: 0; background: none; color: #147b73; cursor: pointer; font-size: 11px; padding: 2px; }.danger-text { color: #a0554d; }.pager { display: flex; align-items: center; justify-content: center; gap: 14px; margin-top: 15px; color: #728a85; font-size: 11px; }.toolbar-count { color: #78908c; font-size: 11px; }.danger-small,.primary-small,.ghost-button { min-height: 34px; padding: 0 13px; border-radius: 8px; cursor: pointer; }.danger-small { border: 1px solid #e1bdb6; background: #fff8f6; color: #a0554d; }.primary-small { border: 1px solid #0f766e; background: #0f766e; color: white; }.ghost-button { border: 1px solid #d7e4df; background: white; color: #57756f; }.danger-small:disabled,.primary-small:disabled,.ghost-button:disabled { cursor: not-allowed; opacity: .45; }
.nested-state { display: flex; min-height: 340px; align-items: center; justify-content: center; gap: 12px; color: #819894; }.compact-state { min-height: 100px; }.error-state { flex-direction: column; color: #9a5f57; }.empty-state { padding: 55px 20px; color: #829894; text-align: center; }.empty-state h2 { margin-bottom: 9px; color: #355a55; font-size: 18px; }.empty-state p { font-size: 11px; }.status-tabs { display: flex; gap: 8px; margin-bottom: 16px; }.status-tabs button { padding: 8px 13px; border: 1px solid #dce7e4; border-radius: 8px; background: white; color: #6d8983; cursor: pointer; }.status-tabs button.active { border-color: #0f766e; background: #0f766e; color: white; }.status-tabs b { margin-left: 4px; font-size: 10px; }.filter-grid { display: grid; grid-template-columns: repeat(3, minmax(130px, 1fr)); gap: 9px; margin-bottom: 16px; }.filter-grid label,.rule-editor-page label { display: flex; flex-direction: column; gap: 5px; color: #5d7d77; font-size: 11px; }.filter-grid input,.filter-grid select,.rule-editor-page input,.rule-editor-page select,.dialog-card input,.dialog-card select,.dialog-card textarea { box-sizing: border-box; width: 100%; min-height: 34px; padding: 7px 9px; border: 1px solid #d7e4df; border-radius: 8px; background: white; color: #365d58; }.dialog-card textarea { resize: vertical; }.dialog-check { display: flex !important; flex-direction: row !important; align-items: center; gap: 8px; }.dialog-check input { width: auto; min-height: auto; }.dialog-backdrop { position: fixed; z-index: 20; inset: 0; display: grid; place-items: center; padding: 22px; background: rgba(18, 47, 47, .35); }.dialog-card { width: min(470px, 100%); max-height: calc(100vh - 44px); overflow: auto; padding: 23px; border: 1px solid #d7e4df; border-radius: 15px; background: #f9fcfa; box-shadow: 0 24px 70px rgba(16, 55, 52, .18); }.large-dialog { width: min(920px, 100%); }.dialog-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 16px; }.dialog-head h2 { color: #173b3c; font-family: "Noto Serif SC", serif; font-size: 21px; }.dialog-card > label { display: flex; flex-direction: column; gap: 6px; margin: 13px 0; color: #5d7d77; font-size: 11px; }.dialog-note { color: #89a09c; font-size: 11px; line-height: 1.6; }.form-error { margin: 8px 0; color: #a0554d; font-size: 11px; }.dialog-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }.icon-button { border: 0; background: none; color: #64807b; font-size: 20px; cursor: pointer; }.detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin: 0; }.detail-grid div { padding: 10px; border: 1px solid #e2ece9; border-radius: 9px; background: white; }.detail-grid dt { color: #8ba39e; font-size: 10px; }.detail-grid dd { margin: 5px 0 0; color: #355a55; font-size: 12px; }.snapshot-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.snapshot-months { display: flex; gap: 9px; margin-top: 15px; }.snapshot-months div { flex: 1; padding: 12px; border: 1px solid #e2ece9; border-radius: 9px; background: white; }.snapshot-months b,.snapshot-months span { display: block; }.snapshot-months b { color: #78908c; font-size: 10px; }.snapshot-months span { margin-top: 5px; color: #234b48; font-size: 14px; }
.relation-manager { display: grid; grid-template-columns: 250px 1fr; gap: 18px; }.relation-sales-list { display: flex; flex-direction: column; gap: 8px; }.relation-sales-list input { min-height: 35px; border: 1px solid #d7e4df; border-radius: 8px; padding: 7px 9px; }.relation-sales-list > button { display: flex; flex-direction: column; gap: 3px; padding: 11px; border: 1px solid #dce7e4; border-radius: 9px; background: white; color: #355a55; text-align: left; cursor: pointer; }.relation-sales-list > button.active { border-color: #0f766e; background: #edf8f4; }.relation-sales-list small,.relation-root small { color: #91a5a1; font-size: 9px; }.relation-detail { min-width: 0; }.relation-root { display: flex; flex-direction: column; gap: 4px; margin-bottom: 14px; padding: 14px; border: 1px solid #b9ddd2; border-radius: 10px; background: #edf8f4; color: #2e625b; }.relation-columns { display: grid; grid-template-columns: 1fr 1.25fr; gap: 18px; }.relation-columns h3 { margin: 0 0 8px; color: #547772; font-size: 13px; }.select-row { display: flex; align-items: center; gap: 7px; min-height: 42px; padding: 7px; border-bottom: 1px solid #edf3f0; color: #486b66; font-size: 12px; }.select-row > span { display: flex; min-width: 0; flex-direction: column; gap: 2px; }.select-row small { color: #9aadaa; font-size: 9px; }.select-row .row-action { margin-left: auto; }.section-gap { margin-top: 18px !important; }.mini-row { display: flex; justify-content: space-between; padding: 7px; border-bottom: 1px solid #edf3f0; color: #486b66; font-size: 11px; }.mini-row small { color: #9aadaa; }.relation-bind-bar { display: flex; gap: 8px; align-items: center; margin-top: 16px; padding-top: 14px; border-top: 1px solid #e4ecea; }.relation-bind-bar select { min-height: 34px; border: 1px solid #d7e4df; border-radius: 8px; padding: 6px; }.rule-editor-page { min-height: 420px; }.rule-editor-layout { display: grid; grid-template-columns: 1.25fr 1fr; gap: 18px; margin-bottom: 18px; }.rule-editor-page > .rule-editor-layout label { margin: 0; }.product-search-results { min-height: 140px; max-height: 240px; overflow: auto; margin-top: 9px; padding: 5px; border: 1px solid #e2ece9; border-radius: 9px; background: white; }.product-search-results button { display: flex; width: 100%; flex-direction: column; gap: 3px; padding: 9px; border: 0; border-bottom: 1px solid #edf3f0; background: transparent; color: #355a55; text-align: left; cursor: pointer; }.product-search-results button.active { background: #edf8f4; }.product-search-results small { color: #91a5a1; font-size: 9px; }.product-preview { padding: 14px; border: 1px solid #e2ece9; border-radius: 9px; background: white; }.product-preview h3 { margin: 0 0 10px; color: #547772; font-size: 13px; }.preview-card { display: flex; flex-direction: column; gap: 8px; color: #355a55; }.preview-card small { color: #849b96; font-size: 10px; }.reward-tier-editor { display: grid; grid-template-columns: 1.4fr 120px 1fr 1.3fr; gap: 10px; align-items: center; margin: 10px 0; padding: 11px; border: 1px solid #e2ece9; border-radius: 8px; background: white; }.reward-tier-editor label { margin: 0; }.tier-help { color: #92a7a2; font-size: 10px; }
@media (max-width: 1120px) { .nested-workspace { padding: 28px; }.nested-grid { grid-template-columns: repeat(2, 1fr); }.relation-manager,.rule-editor-layout { grid-template-columns: 1fr; }.filter-grid { grid-template-columns: repeat(2, minmax(130px, 1fr)); } }
@media (max-width: 720px) { .nested-workspace { padding: 18px; }.nested-header { align-items: flex-start; flex-direction: column; }.nested-grid,.filter-grid,.relation-columns,.detail-grid { grid-template-columns: 1fr; }.nested-table { overflow-x: auto; }.nested-table-head,.nested-row { min-width: 760px; }.toolbar-filters { width: 100%; }.toolbar-filters input { flex: 1; }.panel-toolbar { align-items: stretch; flex-direction: column; }.relation-bind-bar { align-items: stretch; flex-direction: column; }.reward-tier-editor { grid-template-columns: 1fr; }.snapshot-months { flex-direction: column; } }

/* Relation tree workbench */
.relation-page-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; margin-bottom: 20px; }
.relation-page-heading h2 { margin: 4px 0 7px; color: #153f40; font-family: "Noto Serif SC", serif; font-size: clamp(21px, 2.2vw, 29px); letter-spacing: -.02em; }
.relation-page-heading p:not(.panel-kicker) { max-width: 650px; margin: 0; color: #72908a; font-size: 12px; line-height: 1.7; }
.relation-heading-actions { display: flex; align-items: center; gap: 9px; flex-shrink: 0; }
.relation-help-pill { padding: 8px 11px; border: 1px solid #c9e5dc; border-radius: 99px; background: #f2fbf7; color: #27796c; font-size: 11px; }
.relation-workbench { display: grid; grid-template-columns: 276px minmax(0, 1fr); gap: 18px; align-items: start; }
.relation-sales-sidebar { position: sticky; top: 16px; display: flex; min-height: 620px; flex-direction: column; gap: 12px; padding: 17px; border: 1px solid #dbe9e4; border-radius: 16px; background: #fbfefd; box-shadow: 0 14px 36px rgba(32, 83, 76, .06); }
.relation-sidebar-head { display: flex; align-items: flex-end; justify-content: space-between; padding-bottom: 3px; }
.relation-sidebar-head > div { display: flex; align-items: baseline; gap: 9px; }
.relation-sidebar-head strong { color: #168579; font-size: 28px; line-height: 1; }
.relation-count-label { color: #9aafaa; font-size: 10px; }
.relation-overline { display: block; color: #91aaa4; font-size: 10px; letter-spacing: .08em; text-transform: uppercase; }
.relation-search-field { display: flex; align-items: center; min-height: 38px; gap: 8px; padding: 0 11px; border: 1px solid #d8e8e2; border-radius: 10px; background: white; color: #6ca29a; }
.relation-search-field:focus-within { border-color: #64b7aa; box-shadow: 0 0 0 3px rgba(75, 170, 154, .11); }
.relation-search-field > span { font-size: 17px; line-height: 1; }
.relation-search-field input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: #305956; font-size: 11px; }
.relation-search-field input::placeholder { color: #a0b6b0; }
.relation-sales-items { display: flex; min-height: 280px; flex-direction: column; gap: 7px; overflow: auto; padding-right: 2px; }
.relation-sales-card { display: flex; align-items: center; min-height: 61px; gap: 9px; padding: 9px 10px; border: 1px solid transparent; border-radius: 11px; background: transparent; color: #315a56; text-align: left; cursor: pointer; transition: border-color .18s ease, background .18s ease, transform .18s ease; }
.relation-sales-card:hover { border-color: #cbe4dc; background: #f2faf7; transform: translateX(2px); }
.relation-sales-card.active { border-color: #64c2b2; background: linear-gradient(100deg, #e8f8f3, #f6fcfa); box-shadow: inset 3px 0 #168d80; }
.relation-sales-meta { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 4px; }
.relation-sales-meta b { overflow: hidden; color: #2c5652; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.relation-sales-meta small { overflow: hidden; color: #98ada8; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.relation-sales-arrow { color: #8cb9b0; font-size: 21px; line-height: 1; }
.relation-avatar { display: inline-flex; width: 34px; height: 34px; flex: 0 0 34px; align-items: center; justify-content: center; border-radius: 50%; color: #fff; font-size: 12px; font-weight: 700; box-shadow: inset 0 0 0 2px rgba(255,255,255,.6); }
.relation-avatar-sales { background: linear-gradient(135deg, #1a9b8b, #126c78); }
.relation-avatar-company { background: linear-gradient(135deg, #57b9a4, #218a86); }
.relation-avatar-member { background: linear-gradient(135deg, #edb978, #bd6b43); }
.relation-avatar-customer { width: 29px; height: 29px; flex-basis: 29px; background: #74a8d4; font-size: 10px; }
.relation-avatar-unbound { background: #9caebb; }
.relation-sidebar-tip { display: flex; flex-direction: column; gap: 5px; margin-top: auto; padding: 11px 12px; border: 1px dashed #c4e0d7; border-radius: 11px; background: #f1faf7; color: #6f918b; font-size: 10px; line-height: 1.6; }
.relation-sidebar-tip b { color: #367c71; font-size: 11px; }
.relation-pager { margin-top: 1px; }
.relation-pager .ghost-button { padding: 5px 7px; font-size: 10px; }
.relation-detail { min-width: 0; }
.relation-content { display: flex; flex-direction: column; gap: 16px; }
.relation-summary-bar { display: grid; grid-template-columns: minmax(190px, 1.05fr) minmax(260px, 1.25fr) minmax(180px, .9fr); align-items: center; gap: 14px; padding: 15px 17px; border: 1px solid #d7e9e2; border-radius: 15px; background: linear-gradient(115deg, #f4fcf9, #fff); }
.relation-summary-person { display: flex; min-width: 0; align-items: center; gap: 10px; }
.relation-summary-person > div { display: flex; min-width: 0; flex-direction: column; gap: 3px; }
.relation-summary-person b { overflow: hidden; color: #214c49; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
.relation-summary-person small { color: #8da7a1; font-size: 9px; }
.relation-summary-stats { display: flex; justify-content: center; gap: clamp(12px, 3vw, 28px); }
.relation-summary-stats span { display: flex; flex-direction: column; gap: 4px; color: #809b95; font-size: 10px; text-align: center; }
.relation-summary-stats b { color: #19796f; font-size: 22px; line-height: 1; }
.relation-summary-drop { padding: 10px 11px; border: 1px dashed #75c9b8; border-radius: 10px; background: #f0fbf7; color: #4e8e83; font-size: 10px; line-height: 1.45; text-align: center; }
.relation-tree-card, .relation-resource-card { border: 1px solid #dbe9e4; border-radius: 15px; background: #fff; box-shadow: 0 10px 28px rgba(35, 80, 75, .045); }
.relation-tree-card { overflow: hidden; }
.relation-section-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 18px 13px; border-bottom: 1px solid #edf4f1; }
.relation-section-heading h3, .relation-resource-head h3 { margin: 4px 0 0; color: #315b56; font-size: 14px; }
.relation-section-heading h3 small { margin-left: 5px; color: #9aafaa; font-size: 10px; font-weight: 400; }
.relation-tree-tools { display: flex; align-items: center; gap: 12px; }
.relation-tree-search { display: flex; width: 132px; align-items: center; gap: 5px; padding: 5px 7px; border: 1px solid #dcebe5; border-radius: 7px; background: #fbfefd; color: #78a69d; }
.relation-tree-search span { font-size: 13px; line-height: 1; }.relation-tree-search input { width: 100%; min-width: 0; border: 0; outline: 0; background: transparent; color: #426b64; font-size: 10px; }.relation-tree-search input::placeholder { color: #a1b7b1; }
.relation-legend { display: flex; align-items: center; gap: 12px; color: #879f99; font-size: 10px; }
.relation-legend span { display: inline-flex; align-items: center; gap: 4px; }
.legend-dot { width: 7px; height: 7px; border-radius: 50%; }
.legend-sales { background: #188e85; }.legend-member { background: #d98b57; }.legend-customer { background: #6e9fd0; }
.relation-tree-canvas { position: relative; min-height: 390px; overflow: auto; padding: 24px 18px 30px; background: radial-gradient(circle at 50% 0%, rgba(226, 249, 242, .76), transparent 48%), linear-gradient(180deg, #fbfefd, #f6fbf9); }
.relation-tree-company, .relation-tree-sales { position: relative; z-index: 1; display: flex; align-items: center; width: min(315px, 100%); min-height: 66px; gap: 10px; margin: 0 auto; padding: 11px 13px; border: 1px solid #cfe6de; border-radius: 13px; background: #fff; box-shadow: 0 8px 18px rgba(42, 100, 90, .08); }
.relation-tree-company { width: min(250px, 100%); border-color: #a6d4c7; background: #f4fcf9; }
.relation-tree-company > div, .relation-tree-sales > div { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 4px; }
.relation-tree-company b, .relation-tree-sales b { color: #295d57; font-size: 13px; }.relation-tree-company small, .relation-tree-sales small { color: #90aaa3; font-size: 9px; }
.relation-tree-stem { width: 1px; height: 27px; margin: 0 auto; background: #8dc8b9; }.relation-tree-stem-short { height: 22px; }
.relation-tree-sales { border-color: #58bfb1; box-shadow: 0 0 0 4px rgba(89, 193, 174, .13), 0 10px 24px rgba(31, 129, 115, .1); }
.relation-drag-hint { padding: 5px 7px; border-radius: 7px; background: #eefaf6; color: #4b9a8d; font-size: 9px; white-space: nowrap; }
.relation-drop-target { transition: border-color .18s ease, box-shadow .18s ease, background .18s ease; }.relation-drop-target:hover { border-color: #49b9a8; background: #f1fbf8; box-shadow: 0 0 0 3px rgba(75, 181, 161, .13); }
.relation-sales-customer-branch { display: flex; max-width: 430px; flex-wrap: wrap; justify-content: center; gap: 7px; margin: 13px auto 0; padding: 10px 12px 0; border-top: 1px dashed #b7d9d0; }
.relation-sales-customer-branch .relation-customer-node { min-width: 190px; flex: 1 1 190px; }
.relation-member-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 30px 14px; }
.relation-member-branch { position: relative; min-width: 0; }.relation-member-branch::before { position: absolute; top: -22px; left: 50%; width: 1px; height: 22px; background: #b0d4ca; content: ""; }
.relation-member-card, .relation-customer-node { display: flex; align-items: center; min-height: 57px; gap: 8px; padding: 9px 10px; border: 1px solid #eaded3; border-radius: 11px; background: #fffdfa; cursor: grab; }
.relation-member-card:active, .relation-customer-node:active, .relation-resource-row:active { cursor: grabbing; }
.relation-member-card { border-color: #edcdb7; }.relation-customer-node { min-height: 47px; border-color: #d9e6ef; background: #fbfdff; }
.relation-expand { display: inline-flex; width: 20px; height: 20px; flex: 0 0 20px; align-items: center; justify-content: center; border: 1px solid #e0b899; border-radius: 6px; background: #fff8f2; color: #ad6941; cursor: pointer; font-size: 14px; }
.relation-node-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 3px; }.relation-node-copy b { overflow: hidden; color: #4b5f5a; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.relation-node-copy small { overflow: hidden; color: #9aadaa; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }
.relation-node-action { border: 0; background: transparent; color: #a38a85; cursor: pointer; font-size: 10px; opacity: 0; transition: opacity .16s ease; }.relation-member-card:hover .relation-node-action, .relation-customer-node:hover .relation-node-action { opacity: 1; }.relation-node-action:hover { color: #bb5c55; }
.relation-customer-branch { display: flex; flex-direction: column; gap: 7px; margin: 11px 5px 0 21px; padding-left: 14px; border-left: 1px dashed #b7d9d0; }.relation-customer-branch .relation-customer-node { position: relative; }.relation-customer-branch .relation-customer-node::before { position: absolute; top: 50%; left: -15px; width: 14px; border-top: 1px dashed #b7d9d0; content: ""; }
.relation-empty-tree { min-height: 43px; padding: 10px; border: 1px dashed #cfe2dc; border-radius: 9px; background: rgba(255,255,255,.5); }
.relation-resource-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.relation-resource-card { min-width: 0; padding: 15px; }.relation-resource-unbound { border-color: #e4e3cf; background: #fffefa; }.relation-resource-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 11px; }.relation-resource-head h3 { font-size: 13px; }.relation-resource-head h3 b { margin-left: 4px; color: #1c8b7c; font-size: 16px; }.relation-resource-head h3 small { margin-left: 3px; color: #9eafaa; font-size: 10px; font-weight: 400; }.relation-status-dot { padding: 4px 7px; border-radius: 99px; font-size: 9px; }.relation-status-bound { background: #e8f8f2; color: #298b7d; }.relation-status-unbound { background: #fff5dc; color: #aa7d39; }
.relation-check-all { display: flex; align-items: center; min-height: 34px; gap: 7px; color: #7c9891; font-size: 10px; }.relation-check-all small { margin-left: auto; color: #a5b6b1; }.relation-resource-list { min-height: 110px; max-height: 250px; overflow: auto; margin-top: 2px; padding-right: 2px; }.relation-resource-row { display: flex; align-items: center; min-height: 47px; gap: 7px; padding: 6px 4px; border-bottom: 1px solid #eef3f1; cursor: grab; }.relation-resource-row:hover { background: #f8fcfa; }.relation-resource-copy { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 3px; }.relation-resource-copy b { overflow: hidden; color: #4e6963; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.relation-resource-copy small { color: #9aadaa; font-size: 9px; }.relation-owner-tag { max-width: 88px; overflow: hidden; padding: 4px 6px; border-radius: 6px; background: #eef8f5; color: #5a9388; font-size: 9px; text-overflow: ellipsis; white-space: nowrap; }.relation-owner-company { background: #fff5df; color: #a67d3d; }
.relation-bind-bar-modern { display: flex; align-items: center; gap: 9px; margin-top: 1px; padding: 11px 13px; border: 1px solid #cce5dc; border-radius: 13px; background: linear-gradient(105deg, #f0faf6, #fff); }.relation-selected-summary { display: flex; min-width: 145px; align-items: center; gap: 5px; color: #557971; font-size: 11px; }.relation-selected-count { display: inline-flex; width: 25px; height: 25px; align-items: center; justify-content: center; border-radius: 8px; background: #168d80; color: white; font-size: 12px; font-weight: 700; }.relation-selected-summary small { display: block; margin-left: 6px; color: #91a9a3; font-size: 9px; }.relation-bind-arrow { color: #8da59f; font-size: 10px; }.relation-bind-bar-modern select { min-height: 35px; border: 1px solid #d3e5df; border-radius: 8px; background: white; color: #466d66; font-size: 11px; }.relation-bind-bar-modern select:last-of-type { min-width: 185px; flex: 1; }.relation-bind-bar-modern .primary-small { white-space: nowrap; }
.relation-state-card { display: flex; min-height: 500px; align-items: center; justify-content: center; flex-direction: column; gap: 8px; border: 1px dashed #c5ded6; border-radius: 16px; background: linear-gradient(150deg, #f7fcfa, #fff); color: #5c8279; }.relation-state-card small { color: #9aafaa; font-size: 10px; }.relation-state-empty { padding: 30px; }.relation-empty-illustration { display: inline-flex; width: 52px; height: 52px; align-items: center; justify-content: center; border-radius: 16px; background: #e9f8f3; color: #3d9a8b; font-size: 26px; }.relation-spinner { width: 24px; height: 24px; border: 3px solid #cfeae2; border-top-color: #168d80; border-radius: 50%; animation: relation-spin .8s linear infinite; }@keyframes relation-spin { to { transform: rotate(360deg); } }
@media (max-width: 1160px) { .relation-workbench { grid-template-columns: 235px minmax(0, 1fr); }.relation-summary-bar { grid-template-columns: 1fr 1fr; }.relation-summary-drop { grid-column: 1 / -1; }.relation-bind-bar-modern { flex-wrap: wrap; }.relation-selected-summary { flex: 1; } }
@media (max-width: 820px) { .relation-page-heading { flex-direction: column; }.relation-heading-actions { width: 100%; justify-content: space-between; }.relation-workbench { grid-template-columns: 1fr; }.relation-sales-sidebar { position: static; min-height: auto; }.relation-sales-items { max-height: 280px; }.relation-resource-grid { grid-template-columns: 1fr; }.relation-summary-bar { grid-template-columns: 1fr; }.relation-summary-stats { justify-content: flex-start; }.relation-summary-drop { grid-column: auto; }.relation-member-grid { grid-template-columns: repeat(auto-fit, minmax(205px, 1fr)); } }
@media (max-width: 560px) { .relation-section-heading, .relation-resource-head { align-items: flex-start; flex-direction: column; }.relation-tree-tools { width: 100%; align-items: flex-start; flex-direction: column; }.relation-tree-search { width: 100%; box-sizing: border-box; }.relation-legend { flex-wrap: wrap; }.relation-tree-sales, .relation-tree-company { width: 100%; }.relation-bind-bar-modern { align-items: stretch; flex-direction: column; }.relation-bind-bar-modern select, .relation-bind-bar-modern select:last-of-type, .relation-bind-bar-modern .primary-small { width: 100%; }.relation-selected-summary { min-width: 0; }.relation-member-grid { grid-template-columns: 1fr; }.relation-summary-stats { gap: 20px; } }
.panel-description { margin-top: 6px; color: #78918d; font-size: 11px; line-height: 1.6; }
.settlement-note { display: flex; align-items: center; gap: 10px; margin: 0 0 16px; padding: 11px 13px; border: 1px solid #dcebe5; border-radius: 10px; background: #f1f9f5; color: #65827c; font-size: 11px; }
.agent-order-flow { display: flex; align-items: center; justify-content: center; gap: 15px; margin: 0 0 17px; padding: 13px; border: 1px solid #dcebe4; border-radius: 11px; background: #f3f9f6; color: #3e7068; font-size: 11px; }.agent-order-flow span { padding: 8px 11px; border-radius: 8px; background: white; }.agent-order-flow i { color: #8eb2aa; font-style: normal; }.agent-order-grid { grid-template-columns: 1.45fr .7fr .9fr 1.25fr 1.25fr; }.agent-order-grid span:first-child { min-width: 0; }.agent-order-grid small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }.asset-summary-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-bottom: 17px; }.asset-summary-grid article { display: flex; min-height: 105px; flex-direction: column; justify-content: space-between; padding: 14px; border: 1px solid #dce9e4; border-radius: 12px; background: #f4faf7; }.asset-summary-grid span { color: #7b9690; font-size: 10px; }.asset-summary-grid b { overflow: hidden; color: #315c55; font-family: ui-monospace, monospace; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }.asset-summary-grid small { color: #7a9991; font-size: 10px; }.asset-gallery { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 13px; }.asset-card { overflow: hidden; border: 1px solid #dce9e4; border-radius: 12px; background: white; }.asset-card img { display: block; width: 100%; height: 145px; object-fit: cover; background: #edf7f3; }.asset-card > div { display: flex; flex-direction: column; gap: 4px; padding: 11px 12px 4px; }.asset-card b { color: #315c55; font-size: 12px; }.asset-card small { color: #8ba29d; font-size: 10px; }.asset-card .row-action { margin: 0 12px 11px; }
@media (max-width: 900px) { .asset-summary-grid,.asset-gallery { grid-template-columns: 1fr 1fr; } }
@media (max-width: 640px) { .asset-summary-grid,.asset-gallery { grid-template-columns: 1fr; }.agent-order-flow { align-items: stretch; flex-direction: column; }.agent-order-flow i { text-align: center; transform: rotate(90deg); } }
</style>
