<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import { getIntegrationStatus, getSettings, getStaffAccounts, saveSettings } from "./api";

const route = useRoute();
const router = useRouter();
const subpage = computed(() => String(route.params.subpage || "promotion"));
const loading = ref(true);
const notice = ref("");
const settings = ref<any>({});
const integrations = ref<any>({});
const staffAccounts = ref<any[]>([]);
const form = ref<any>({ shippingFreeThreshold: 199, shippingFee: 8, autoCancelMinutes: 30, autoReceiveDays: 7, withdrawThreshold: 500, memberUpgradeThreshold: 300000, promoterReleaseDays: 183 });
const tabs = [["promotion", "推广规则"], ["accounts", "后台账号"], ["integrations", "集成状态"]] as const;

function go(key: string) { router.push(`/settings/${key}`); }
function toast(message: string) { notice.value = message; window.setTimeout(() => { notice.value = ""; }, 2400); }
async function load() {
  loading.value = true;
  try {
    settings.value = await getSettings();
    integrations.value = await getIntegrationStatus();
    staffAccounts.value = await getStaffAccounts();
    form.value = { ...form.value, shippingFreeThreshold: Number(settings.value.shippingFreeThresholdFen || 19900) / 100, shippingFee: Number(settings.value.shippingFeeFen || 800) / 100, autoCancelMinutes: Number(settings.value.autoCancelMinutes || 30), autoReceiveDays: Number(settings.value.autoReceiveDays || 7), withdrawThreshold: Number(settings.value.withdrawThresholdFen || 50000) / 100, memberUpgradeThreshold: Number(settings.value.memberUpgradeThresholdFen || 30000000) / 100, promoterReleaseDays: Number(settings.value.promoterReleaseDays || 183) };
  } finally { loading.value = false; }
}
onMounted(load);
async function save() {
  try {
    await saveSettings({ shippingFreeThresholdFen: Math.round(form.value.shippingFreeThreshold * 100), shippingFeeFen: Math.round(form.value.shippingFee * 100), autoCancelMinutes: Number(form.value.autoCancelMinutes), autoReceiveDays: Number(form.value.autoReceiveDays), withdrawThresholdFen: Math.round(form.value.withdrawThreshold * 100), memberUpgradeThresholdFen: Math.round(form.value.memberUpgradeThreshold * 100), promoterReleaseDays: Number(form.value.promoterReleaseDays) });
    toast("推广规则已保存");
  } catch (error: any) { toast(error?.message || "保存失败"); }
}
</script>

<template>
  <section class="nested-workspace"><header class="nested-header"><div><p class="eyebrow">运营 / 设置</p><h1>规则与权限</h1><p>把推广规则、账号权限和第三方状态分开维护。</p></div></header><nav class="nested-tabs"><button v-for="item in tabs" :key="item[0]" :class="{ active: subpage === item[0] }" type="button" @click="go(item[0])">{{ item[1] }}</button></nav><div v-if="notice" class="toast" role="status">{{ notice }}</div><div v-if="loading" class="nested-state">正在加载设置…</div><section v-else-if="subpage === 'promotion'" class="nested-panel"><div class="dialog-grid"><label>包邮门槛（元）<input v-model.number="form.shippingFreeThreshold" type="number" min="0" /></label><label>基础运费（元）<input v-model.number="form.shippingFee" type="number" min="0" /></label><label>会员晋级累计门槛（元）<input v-model.number="form.memberUpgradeThreshold" type="number" min="0" /></label><label>无业绩解除天数<input v-model.number="form.promoterReleaseDays" type="number" min="1" /></label><label>提现门槛（元）<input v-model.number="form.withdrawThreshold" type="number" min="0" /></label><label>未支付取消（分钟）<input v-model.number="form.autoCancelMinutes" type="number" min="1" /></label><label>自动收货（天）<input v-model.number="form.autoReceiveDays" type="number" min="1" /></label></div><div class="dialog-actions"><button class="primary-small" type="button" @click="save">保存推广规则</button></div></section><section v-else-if="subpage === 'accounts'" class="nested-panel"><div class="panel-heading"><div><p class="panel-kicker">后台账号</p><h2>已配置账号</h2></div></div><div class="nested-table"><div class="nested-table-head"><span>账号</span><span>角色</span><span>状态</span></div><div v-for="row in staffAccounts" :key="row.username" class="nested-row"><span>{{ row.username }}</span><span>{{ row.role }}</span><em>{{ row.active ? '启用' : '停用' }}</em></div><div v-if="!staffAccounts.length" class="empty-state"><p>当前使用开发账号或环境变量未配置账号。</p></div></div></section><section v-else class="nested-panel"><div class="nested-table"><div class="nested-table-head"><span>服务</span><span>状态</span><span>说明</span></div><div v-for="(value, key) in integrations" :key="key" class="nested-row"><span>{{ key }}</span><em>{{ value }}</em><span>由环境配置和适配器决定</span></div></div></section></section>
</template>

<style scoped>
.dialog-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.dialog-grid label { display: flex; flex-direction: column; gap: 6px; color: #5d7874; font-size: 11px; }
.dialog-grid input { min-height: 38px; padding: 8px; border: 1px solid #d7e4df; border-radius: 8px; }
.dialog-actions { display: flex; justify-content: flex-end; margin-top: 20px; }
@media (max-width: 900px) { .dialog-grid { grid-template-columns: 1fr; } }
</style>
