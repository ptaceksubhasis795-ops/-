<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { downloadExport, getAdminSalesRewards, getAnalytics, getRewardSettlements } from "./api";

const route = useRoute();
const router = useRouter();
const subpage = computed(() => String(route.params.subpage || "sales"));
const loading = ref(false);
const errorMessage = ref("");
const data = ref<any>({ summary: {}, productRank: [], promoterRank: [], daily: [] });
const rows = ref<any[]>([]);
const query = ref({ from: "", to: "", promoterId: "", level: "", category: "all" });
const tabs = [["sales", "销售业绩"], ["rewards", "奖励统计"], ["settlements", "结算记录"], ["export", "导出中心"]] as const;

function go(key: string) { router.push(`/data/${key}`); }
function money(value: unknown) { return `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`; }
function dateText(value: string) { return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-"; }
async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    if (subpage.value === "sales") data.value = await getAnalytics(Object.fromEntries(Object.entries(query.value).filter(([, value]) => value)));
    else if (subpage.value === "rewards") rows.value = await getAdminSalesRewards("page=1&pageSize=200");
    else if (subpage.value === "settlements") rows.value = await getRewardSettlements();
  } catch (error: any) { errorMessage.value = error?.message || "数据加载失败"; }
  finally { loading.value = false; }
}
watch(subpage, load);
onMounted(load);
async function exportReport() { try { await downloadExport("/v1/admin/reports/export.xlsx", "sales-report.xlsx"); } catch (error: any) { errorMessage.value = error?.message || "导出失败"; } }
</script>

<template>
  <section class="nested-workspace"><header class="nested-header"><div><p class="eyebrow">运营 / 数据</p><h1>数据报表</h1><p>把销售业绩、奖励、结算和导出拆成独立报表页面。</p></div><button class="ghost-button" type="button" @click="load">刷新</button></header><nav class="nested-tabs"><button v-for="item in tabs" :key="item[0]" :class="{ active: subpage === item[0] }" type="button" @click="go(item[0])">{{ item[1] }}</button></nav><div v-if="loading" class="nested-state">正在加载报表…</div><div v-else-if="errorMessage" class="nested-state error-state">{{ errorMessage }}</div><template v-else><section v-if="subpage === 'sales'" class="nested-panel"><div class="report-filters"><label>开始日期<input v-model="query.from" type="date" /></label><label>结束日期<input v-model="query.to" type="date" /></label><label>推广人编号<input v-model="query.promoterId" placeholder="可选" /></label><label>会员等级<select v-model="query.level"><option value="">全部等级</option><option value="ORDINARY_MEMBER">普通会员</option><option value="SENIOR_MEMBER">高级会员</option><option value="STAFF">销售人员</option></select></label><button class="primary-small" type="button" @click="load">应用筛选</button></div><div class="nested-grid"><article class="nested-card accent-teal"><span>订单金额</span><strong>{{ money(data.summary?.salesAmount) }}</strong><small>{{ data.summary?.orders || 0 }} 笔</small></article><article class="nested-card accent-amber"><span>客户数</span><strong>{{ data.summary?.customers || 0 }}</strong><small>按当前筛选</small></article><article class="nested-card accent-plum"><span>奖励金额</span><strong>{{ money(data.summary?.commissions) }}</strong><small>奖励台账汇总</small></article><article class="nested-card accent-slate"><span>业绩金额</span><strong>{{ money(data.summary?.performance) }}</strong><small>含运费业绩</small></article><div class="nested-panel report-list"><h2>推广人排行</h2><p v-for="row in data.promoterRank || []" :key="row.promoterId">{{ row.name }} · {{ row.level || '未设置' }} · {{ row.orders }} 笔 · {{ money(row.amount) }}</p></div><div class="nested-panel report-list"><h2>商品排行</h2><p v-for="row in data.productRank || []" :key="row.productId">{{ row.name }} · {{ row.quantity }} 件 · {{ money(row.amount) }}</p></div></div></section><section v-else-if="subpage === 'rewards'" class="nested-panel"><div v-for="row in rows" :key="row.id" class="compact-row"><span><b>{{ row.source || row.orderId }}</b><small>{{ row.promoterId }} · {{ dateText(row.date || row.createdAt) }}</small></span><strong>{{ money(row.amountFen !== undefined ? Number(row.amountFen) / 100 : row.amount) }}</strong><em>{{ row.statusText || row.status }}</em></div></section><section v-else-if="subpage === 'settlements'" class="nested-panel"><div v-for="row in rows" :key="row.id" class="compact-row"><span><b>{{ row.period }}</b><small>{{ dateText(row.settledAt) }}</small></span><strong>{{ money(row.totalFen !== undefined ? Number(row.totalFen) / 100 : row.total) }}</strong><em>{{ row.status }}</em></div></section><section v-else class="nested-panel"><div class="empty-state"><h2>导出中心</h2><p>导出当前经营报表，并记录筛选条件和操作人。</p><button class="primary-small" type="button" @click="exportReport">导出销售报表</button></div></section></template></section>
</template>

<style scoped>
.report-filters { display: flex; flex-wrap: wrap; align-items: end; gap: 10px; margin-bottom: 16px; }
.report-filters label { display: flex; min-width: 150px; flex-direction: column; gap: 5px; color: #5d7874; font-size: 10px; }
.report-filters input, .report-filters select { min-height: 34px; padding: 6px 8px; border: 1px solid #d7e4df; border-radius: 8px; background: white; }
.report-list { grid-column: span 2; }
.report-list h2 { margin-bottom: 10px; color: #315954; font-size: 16px; }
.report-list p { padding: 8px 0; border-bottom: 1px solid #edf3f0; color: #59736e; font-size: 11px; }
@media (max-width: 960px) { .report-list { grid-column: span 1; } }
</style>
