<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { downloadExport, getCustomerProfile, getCustomers, pushCustomerToHealthService, saveCustomerTag } from "./api";

const route = useRoute();
const router = useRouter();
const subpage = computed(() => String(route.params.subpage || "list"));
const customerId = computed(() => String(route.params.id || ""));
const detailTab = computed(() => String(route.params.tab || "overview"));
const loading = ref(false);
const errorMessage = ref("");
const notice = ref("");
const query = ref("");
const customers = ref<any[]>([]);
const detail = ref<any>(null);
const tagInput = ref("");
const sensitiveLoading = ref(false);
const tabs = [["list", "客户列表"], ["tags", "标签管理"], ["export", "导出中心"]] as const;

function go(path: string) { router.push(`/customers/${path}`); }
function money(value: unknown) { return `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`; }
function dateText(value: string) { return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "-"; }
function toast(message: string) { notice.value = message; window.setTimeout(() => { notice.value = ""; }, 2400); }
const filtered = computed(() => customers.value.filter((row) => !query.value || `${row.name} ${row.id} ${row.promoter || ""} ${(row.tags || []).join(" ")}`.toLowerCase().includes(query.value.toLowerCase())));

async function load() {
  loading.value = true;
  errorMessage.value = "";
  try {
    customers.value = await getCustomers("page=1&pageSize=200");
    if (customerId.value) detail.value = await getCustomerProfile(customerId.value);
  } catch (error: any) {
    errorMessage.value = error?.message || "客户数据加载失败";
  } finally {
    loading.value = false;
  }
}

watch([subpage, customerId, detailTab], load);
onMounted(load);

async function open(row: any) { router.push(`/customers/profile/${encodeURIComponent(String(row.id))}`); }
function goDetail(tab: string) { if (customerId.value) router.push(`/customers/profile/${encodeURIComponent(customerId.value)}/${tab}`); }
async function addTag() {
  if (!customerId.value || !tagInput.value.trim()) return;
  try {
    await saveCustomerTag(customerId.value, tagInput.value.trim());
    tagInput.value = "";
    detail.value = await getCustomerProfile(customerId.value);
    toast("标签已保存");
  } catch (error: any) { toast(error?.message || "标签保存失败"); }
}
async function viewSensitive() {
  if (!customerId.value) return;
  const reason = window.prompt("请填写查看完整健康信息的业务原因");
  if (!reason?.trim()) return;
  sensitiveLoading.value = true;
  try {
    detail.value = await getCustomerProfile(customerId.value, true, reason.trim());
    toast("已记录敏感信息查看审计");
  } catch (error: any) { toast(error?.message || "敏感信息读取失败"); }
  finally { sensitiveLoading.value = false; }
}
async function pushHealthService() {
  if (!customerId.value) return;
  try { await pushCustomerToHealthService(customerId.value); toast("已进入健康服务人工队列"); }
  catch (error: any) { toast(error?.message || "推送失败"); }
}
async function exportCustomers() {
  try { await downloadExport("/v1/admin/customers/export.xlsx", "customers.xlsx"); toast("客户档案导出已开始"); }
  catch (error: any) { toast(error?.message || "导出失败"); }
}
</script>

<template>
  <section class="nested-workspace customer-workspace">
    <header class="nested-header"><div><p class="eyebrow">运营 / 客户</p><h1>客户档案</h1><p>把基本资料、健康授权、就诊人、购买记录和推广归属拆开管理。</p></div><div class="nested-header-actions"><button class="ghost-button" type="button" @click="load">刷新</button></div></header>
    <nav class="nested-tabs" aria-label="客户子栏目"><button v-for="item in tabs" :key="item[0]" :class="{ active: subpage === item[0] }" type="button" @click="go(item[0])">{{ item[1] }}</button></nav>
    <div v-if="notice" class="toast" role="status">{{ notice }}</div>
    <div v-if="loading" class="nested-state">正在加载客户数据…</div>
    <div v-else-if="errorMessage" class="nested-state error-state">{{ errorMessage }}<button class="ghost-button" type="button" @click="load">重新加载</button></div>
    <template v-else>
      <section v-if="subpage === 'list' || subpage === 'tags'" class="nested-panel"><div class="panel-toolbar"><input v-model="query" placeholder="搜索客户、推广人或标签" /><span class="panel-count">{{ filtered.length }} 位客户</span></div><div class="nested-table"><div class="nested-table-head"><span>客户</span><span>推广人</span><span>最近购买</span><span>累计金额</span><span>标签</span><span>操作</span></div><div v-for="row in filtered" :key="row.id" class="nested-row customer-row"><span><b>{{ row.name }}</b><small>{{ row.id }}</small></span><span>{{ row.promoter || '公司归属' }}</span><span>{{ row.lastOrder || '-' }}</span><span>{{ money(row.amount) }}</span><span>{{ (row.tags || []).join('、') || '未设置' }}</span><button class="row-action" type="button" @click="open(row)">查看档案</button></div></div></section>
      <section v-else-if="subpage === 'export'" class="nested-panel"><div class="empty-state"><h2>客户档案导出</h2><p>导出前必须确认健康授权、筛选条件和操作原因。导出动作会写入审计。</p><button class="primary-small" type="button" @click="exportCustomers">导出客户档案</button></div></section>
      <section v-else class="nested-panel"><div class="panel-heading"><div><p class="panel-kicker">客户详情</p><h2>{{ detail?.customer?.name || customerId }}</h2></div><button class="ghost-button" type="button" @click="go('list')">返回列表</button></div><nav class="nested-tabs detail-tabs"><button v-for="tab in [['overview','概览'],['patients','就诊人与健康'],['orders','购买记录'],['prescriptions','处方记录'],['consents','授权记录'],['relations','推广归属']]" :key="tab[0]" :class="{ active: detailTab === tab[0] }" type="button" @click="goDetail(tab[0])">{{ tab[1] }}</button></nav><div v-if="detail" class="customer-detail-grid"><article v-if="detailTab === 'overview'"><h3>档案概览</h3><p>推广人：{{ detail.customer?.promoter || '公司归属' }}</p><p>累计金额：{{ money(detail.customer?.amount) }}</p><p>健康授权：{{ detail.customer?.healthConsent ? '已授权' : '未授权' }}</p><div class="detail-actions"><button class="primary-small" type="button" :disabled="sensitiveLoading" @click="viewSensitive">{{ sensitiveLoading ? '读取中' : '查看完整健康信息' }}</button><button class="ghost-button" type="button" @click="pushHealthService">推送健康服务</button></div></article><article v-if="detailTab === 'overview' || detailTab === 'relations'"><h3>推广归属</h3><p>{{ detail.customer?.promoter || '公司归属' }}</p><p>归属关系和转移原因在销售关系树中管理。</p></article><article v-if="detailTab === 'overview' || detailTab === 'consents'"><h3>授权记录</h3><p v-for="consent in detail.consents || []" :key="`${consent.version}-${consent.consentType}`">{{ consent.consentType }} · {{ consent.version }} · {{ consent.granted ? '已授权' : '已撤回' }} · {{ dateText(consent.grantedAt) }}</p><p v-if="!(detail.consents || []).length">暂无授权记录</p></article><article v-if="detailTab === 'overview' || detailTab === 'patients'"><h3>就诊人与健康信息</h3><p v-for="patient in detail.patients || []" :key="patient.name">{{ patient.name }} · {{ patient.relation }} · {{ patient.allergies || '敏感信息已隐藏' }}</p></article><article v-if="detailTab === 'overview' || detailTab === 'orders'"><h3>购买记录</h3><p v-for="order in detail.orders || []" :key="order.orderNo">{{ order.orderNo }} · {{ money(order.totalAmount) }} · {{ order.status }}</p></article><article v-if="detailTab === 'overview' || detailTab === 'prescriptions'"><h3>处方记录</h3><p v-for="rx in detail.prescriptions || []" :key="rx.id">{{ rx.itemName || '-' }} · {{ rx.status }} · {{ rx.validUntil || '-' }}</p></article><article v-if="detailTab === 'overview'" ><h3>健康标签</h3><div class="tag-editor"><span v-for="tag in detail.customer?.tags || []" :key="tag" class="tag-pill">{{ tag }}</span><input v-model="tagInput" placeholder="输入标签" @keyup.enter="addTag" /><button class="ghost-button" type="button" @click="addTag">保存标签</button></div></article></div></section>
    </template>
  </section>
</template>

<style scoped>
.customer-detail-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 15px; }
.customer-detail-grid article { padding: 17px; border: 1px solid #e1ebe8; border-radius: 11px; background: white; color: #59736e; font-size: 11px; }
.customer-detail-grid h3 { margin-bottom: 10px; color: #315954; font-size: 14px; }
.customer-detail-grid p { margin: 7px 0; line-height: 1.6; }
.tag-editor { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
.tag-editor input { min-height: 31px; width: 120px; padding: 6px; border: 1px solid #d7e4df; border-radius: 7px; }
.tag-pill { padding: 4px 7px; border-radius: 6px; background: #e4f3ee; color: #468176; font-size: 10px; }
.detail-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
@media (max-width: 960px) { .customer-detail-grid { grid-template-columns: 1fr; } }
</style>
