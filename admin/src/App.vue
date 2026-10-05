<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { Activity, BarChart3, Bell, BookOpen, Boxes, ChevronRight, FileCheck2, LayoutDashboard, PanelLeftClose, PanelLeftOpen, Settings2, ShoppingBag, Stethoscope, Users, WalletCards } from "lucide-vue-next";
import EnterpriseModules from "./EnterpriseModules.vue";
import ArticleEditor from "./ArticleEditor.vue";
import ProductWorkspace from "./ProductWorkspace.vue";
import SalesWorkspace from "./SalesWorkspace.vue";
import CustomerWorkspace from "./CustomerWorkspace.vue";
import DataWorkspace from "./DataWorkspace.vue";
import SettingsWorkspace from "./SettingsWorkspace.vue";
import { clearAdminToken, getDashboard, getStaffUser, loginStaff } from "./api";

type MenuKey = "overview" | "products" | "orders" | "prescriptions" | "sales" | "customers" | "content" | "settings" | "analytics";
type Dashboard = { orders?: number; paidOrders?: number; salesAmount?: number; prescriptionsPending?: number; withdrawalsPending?: number; newCustomers?: number };
type StaffRole = "admin" | "pharmacist" | "fulfillment" | "sales";

const active = ref<MenuKey>("overview");
const collapsed = ref(false);
// Sales keeps its own expanded state so a second click on the parent can
// collapse the accordion without navigating away from the current page.
const salesAccordionOpen = ref(false);
const dashboard = ref<Dashboard>({});
const notice = ref("");
const authDialog = ref(false);
const authForm = ref({ username: "", password: "" });
const staffRole = ref<StaffRole>(String(getStaffUser().role || "admin").toLowerCase() as StaffRole);
const loading = ref(false);
const route = useRoute();
const router = useRouter();
let noticeTimer: number | undefined;

const menus: Array<{ key: MenuKey; label: string; hint: string; icon: unknown }> = [
  { key: "overview", label: "总览", hint: "运营脉搏", icon: LayoutDashboard },
  { key: "products", label: "商品", hint: "规格与库存", icon: Boxes },
  { key: "orders", label: "订单", hint: "履约与售后", icon: ShoppingBag },
  { key: "prescriptions", label: "处方", hint: "审核与支付", icon: FileCheck2 },
  { key: "sales", label: "销售", hint: "奖励与提现", icon: WalletCards },
  { key: "customers", label: "客户", hint: "档案与授权", icon: Users },
  { key: "content", label: "内容", hint: "科普与首页", icon: BookOpen },
  { key: "settings", label: "设置", hint: "规则与权限", icon: Settings2 },
  { key: "analytics", label: "数据", hint: "报表与导出", icon: BarChart3 },
];
const submenus: Partial<Record<MenuKey, Array<[string, string]>>> = {
  products: [["catalog", "商品列表"], ["skus", "SKU 规格"], ["inventory", "库存批次"], ["rewards", "奖励摘要"]],
  sales: [["overview", "销售概览"], ["promoters", "推广人员"], ["applications", "会员申请"], ["promotion-applications", "会员晋升申请"], ["relations", "关系树"], ["rules", "奖励规则"], ["rewards", "奖励台账"], ["settlements", "周结算"], ["withdrawals", "提现审核"], ["agent-orders", "代客订单"], ["assets", "推广素材"]],
  customers: [["list", "客户列表"], ["profile", "档案详情"], ["tags", "标签管理"], ["export", "导出中心"]],
  analytics: [["sales", "销售业绩"], ["rewards", "奖励统计"], ["settlements", "结算记录"], ["export", "导出中心"]],
  settings: [["promotion", "推广规则"], ["accounts", "后台账号"], ["integrations", "集成状态"]],
};

const articleEditorRoute = computed(() => route.path === "/content/articles/new" || /^\/content\/articles\/[^/]+\/edit$/.test(route.path));
const articleEditorId = computed(() => route.params.id ? String(route.params.id) : "");
const routeWorkspace = computed<MenuKey | "overview">(() => {
  if (route.path.startsWith("/products")) return "products";
  if (route.path.startsWith("/sales")) return "sales";
  if (route.path.startsWith("/customers")) return "customers";
  if (route.path.startsWith("/data")) return "analytics";
  if (route.path.startsWith("/settings")) return "settings";
  if (route.path.startsWith("/content")) return "content";
  return "overview";
});
const salesSubpageKeys = new Set(["overview", "promoters", "applications", "promotion-applications", "relations", "rules", "rewards", "settlements", "withdrawals", "agent-orders", "assets"]);
const currentSalesSubpage = computed(() => {
  if (!route.path.startsWith("/sales")) return "";
  const value = String(route.params.subpage || "overview");
  return salesSubpageKeys.has(value) ? value : "overview";
});
const salesSubpageLabels: Record<string, string> = {
  overview: "销售概览",
  promoters: "推广人员",
  applications: "会员申请",
  "promotion-applications": "会员晋升申请",
  relations: "关系树",
  rules: "奖励规则",
  rewards: "奖励台账",
  settlements: "周结算",
  withdrawals: "提现审核",
  "agent-orders": "代客订单",
  assets: "推广素材",
};
const title = computed(() => {
  if (articleEditorRoute.value) return articleEditorId.value ? "编辑科普文章" : "新增科普文章";
  if (active.value === "sales" && currentSalesSubpage.value) return salesSubpageLabels[currentSalesSubpage.value] || "销售中心";
  return menus.find((item) => item.key === active.value)?.label || "总览";
});
const visibleMenus = computed(() => {
  const allowed: Record<StaffRole, MenuKey[]> = {
    admin: menus.map((item) => item.key),
    pharmacist: ["overview", "prescriptions", "customers"],
    fulfillment: ["overview", "products", "orders"],
    sales: ["overview", "sales", "customers"],
  };
  const keys = allowed[staffRole.value] || ["overview"];
  return menus.filter((item) => keys.includes(item.key));
});
const visibleSubmenus = computed(() => {
  const items = submenus[active.value] || [];
  if (staffRole.value === "admin") return items;
  if (active.value === "sales") return items.filter(([key]) => ["overview", "rewards", "assets"].includes(key));
  return [];
});
const roleName = computed(() => ({ admin: "管理员", pharmacist: "药师", fulfillment: "发货员", sales: "销售人员" } as Record<string, string>)[staffRole.value] || "后台用户");
const number = (value: unknown) => Number(value || 0).toLocaleString("zh-CN");
const money = (value: unknown) => `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2 })}`;

function notify(message: string) {
  notice.value = message;
  if (noticeTimer) window.clearTimeout(noticeTimer);
  noticeTimer = window.setTimeout(() => { notice.value = ""; }, 2800);
}

function setActive(key: MenuKey) {
  if (!visibleMenus.value.some((item) => item.key === key)) return;
  if (key === "sales" && active.value === "sales") {
    salesAccordionOpen.value = !salesAccordionOpen.value;
    return;
  }
  active.value = key;
  if (key === "sales") salesAccordionOpen.value = true;
  else salesAccordionOpen.value = false;
  if (key === "content") router.push("/content/articles");
  else if (key === "products") router.push("/products/catalog");
  else if (key === "sales") router.push("/sales/overview");
  else if (key === "customers") router.push("/customers/list");
  else if (key === "analytics") router.push("/data/sales");
  else if (key === "settings") router.push("/settings/promotion");
  else if (route.path !== "/") router.push("/");
}
function setSubmenu(menu: MenuKey, subpage: string) { router.push(`/${menu}/${subpage}`); }

async function loadDashboard() {
  loading.value = true;
  try {
    dashboard.value = await getDashboard();
  } catch (error: any) {
    if (error?.status === 401) authDialog.value = true;
    else notify("总览数据加载失败，请检查服务端");
  } finally {
    loading.value = false;
  }
}

async function login() {
  try {
    const result = await loginStaff(authForm.value.username.trim(), authForm.value.password);
    staffRole.value = String(result.user?.role || "admin").toLowerCase() as StaffRole;
    authDialog.value = false;
    authForm.value.password = "";
    notify("后台登录成功");
    await loadDashboard();
  } catch (error: any) {
    notify(error?.message || "账号或密码错误");
  }
}

function logout() {
  clearAdminToken();
  authDialog.value = true;
  active.value = "overview";
  dashboard.value = {};
}

onMounted(loadDashboard);
watch(() => route.path, () => {
  active.value = routeWorkspace.value as MenuKey;
  if (route.path.startsWith("/sales")) {
    salesAccordionOpen.value = true;
    if (route.path === "/sales" || route.path === "/sales/") void router.replace("/sales/overview");
  }
}, { immediate: true });
</script>

<template>
  <div class="admin-shell" :class="{ 'is-collapsed': collapsed }">
    <aside class="sidebar">
      <div class="brand-lockup"><div class="brand-mark">九</div><div v-if="!collapsed" class="brand-copy"><strong>九转健康</strong><span>运营工作台</span></div></div>
      <div v-if="!collapsed" class="workspace-chip"><span class="status-dot"></span><span>业务工作区</span><small>实时</small></div>
      <nav class="primary-nav" aria-label="后台模块">
        <template v-for="item in visibleMenus" :key="item.key">
          <button type="button" class="nav-item" :class="{ active: active === item.key, 'sales-parent': item.key === 'sales' }" :title="item.label" :aria-expanded="item.key === 'sales' ? salesAccordionOpen : undefined" :data-testid="`nav-${item.key}`" @click="setActive(item.key)"><component :is="item.icon" :size="18" :stroke-width="1.8" /><span v-if="!collapsed" class="nav-copy"><b>{{ item.label }}</b><small>{{ item.hint }}</small></span><ChevronRight v-if="!collapsed && active === item.key" class="nav-chevron" :size="15" :class="{ rotated: item.key === 'sales' && salesAccordionOpen }" /></button>
          <nav v-if="item.key === 'sales' && !collapsed && active === 'sales' && salesAccordionOpen && visibleSubmenus.length" class="secondary-nav sales-secondary-nav" :aria-label="`${title}子栏目`" data-testid="sales-secondary-nav"><button v-for="submenu in visibleSubmenus" :key="submenu[0]" type="button" :class="{ active: currentSalesSubpage === submenu[0] }" :aria-current="currentSalesSubpage === submenu[0] ? 'page' : undefined" :data-testid="`sales-subnav-${submenu[0]}`" @click="setSubmenu('sales', submenu[0])"><span>{{ submenu[1] }}</span><small v-if="currentSalesSubpage === submenu[0]">当前</small></button></nav>
        </template>
      </nav>
      <nav v-if="!collapsed && active !== 'sales' && visibleSubmenus.length" class="secondary-nav" :aria-label="`${title}子栏目`" data-testid="sales-secondary-nav"><button v-for="item in visibleSubmenus" :key="item[0]" type="button" :class="{ active: route.path === `/${active}/${item[0]}` }" :aria-current="route.path === `/${active}/${item[0]}` ? 'page' : undefined" :data-testid="`sales-subnav-${item[0]}`" @click="setSubmenu(active, item[0])"><span>{{ item[1] }}</span><small v-if="route.path === `/${active}/${item[0]}`">当前</small></button></nav>
      <div class="sidebar-bottom"><button class="collapse-button" type="button" :aria-expanded="!collapsed" aria-label="展开或收起侧栏" data-testid="sidebar-collapse" @click="collapsed = !collapsed"><PanelLeftOpen v-if="collapsed" :size="18" /><PanelLeftClose v-else :size="18" /><span v-if="!collapsed">收起导航</span></button><button class="operator" type="button" @click="logout"><div class="operator-avatar">管</div><div v-if="!collapsed" class="operator-copy"><b>{{ roleName }}</b><span>退出登录</span></div></button></div>
    </aside>

    <main class="main-content">
      <div v-if="notice" class="toast" role="status">{{ notice }}</div>
      <header class="topbar"><div class="breadcrumb"><span>工作台</span><ChevronRight :size="14" /><strong>{{ title }}</strong></div><div class="topbar-actions"><div class="last-sync"><Activity :size="14" />数据实时同步</div><button class="icon-button" type="button" title="通知"><Bell :size="18" /></button><button class="operator-button" type="button" @click="logout"><span class="mini-avatar">管</span><span>{{ roleName }}</span><ChevronRight :size="15" /></button></div></header>

      <section v-if="active === 'overview'" class="content-wrap">
        <div class="module-heading"><div><p class="eyebrow">九转健康 / 运营</p><h1>业务总览</h1><p class="hero-subtitle">查看订单、处方、客户和销售数据，及时处理待办事项。</p></div><div class="hero-orbit"><span>九转<br />健康</span></div></div>
        <div v-if="loading" class="empty-list">正在加载总览数据...</div>
        <div v-else class="overview-view"><div class="metric-grid"><article class="metric-panel accent-teal"><div class="metric-panel-head"><span>订单总数</span><ShoppingBag :size="18" /></div><strong>{{ number(dashboard.orders) }}</strong><div class="trend neutral">服务端实时数据</div></article><article class="metric-panel accent-amber"><div class="metric-panel-head"><span>成交金额</span><WalletCards :size="18" /></div><strong>{{ money(dashboard.salesAmount) }}</strong><div class="trend neutral">按已支付订单统计</div></article><article class="metric-panel accent-plum"><div class="metric-panel-head"><span>待审核处方</span><FileCheck2 :size="18" /></div><strong>{{ number(dashboard.prescriptionsPending) }}</strong><div class="trend neutral">需要药师处理</div></article><article class="metric-panel accent-slate"><div class="metric-panel-head"><span>新增客户</span><Users :size="18" /></div><strong>{{ number(dashboard.newCustomers) }}</strong><div class="trend neutral">按服务端统计周期</div></article></div><div class="dashboard-grid"><section class="content-panel priority-panel"><div class="panel-heading"><div><p class="panel-kicker">待办事项</p><h2>今天要处理</h2></div><span class="panel-count">{{ number(Number(dashboard.prescriptionsPending || 0) + Number(dashboard.paidOrders || 0)) }} 项</span></div><button class="priority-row" type="button" @click="setActive('prescriptions')"><span class="priority-icon plum"><Stethoscope :size="18" /></span><span class="priority-copy"><b>处方审核</b><small>{{ number(dashboard.prescriptionsPending) }} 张处方等待药师处理</small></span><ChevronRight :size="15" /></button><button class="priority-row" type="button" @click="setActive('orders')"><span class="priority-icon amber"><Boxes :size="18" /></span><span class="priority-copy"><b>订单发货</b><small>{{ number(dashboard.paidOrders) }} 笔订单等待发货</small></span><ChevronRight :size="15" /></button></section><section class="content-panel priority-panel"><div class="panel-heading"><div><p class="panel-kicker">运营提示</p><h2>服务状态</h2></div></div><div class="content-note">所有数据来自服务端，保存、审核和状态操作成功后会自动刷新。</div></section></div></div>
      </section>

      <ArticleEditor v-if="articleEditorRoute" :article-id="articleEditorId" />
      <ProductWorkspace v-else-if="routeWorkspace === 'products'" />
      <SalesWorkspace v-else-if="routeWorkspace === 'sales'" :role="staffRole" />
      <CustomerWorkspace v-else-if="routeWorkspace === 'customers'" />
      <DataWorkspace v-else-if="routeWorkspace === 'analytics'" />
      <SettingsWorkspace v-else-if="routeWorkspace === 'settings'" />
      <EnterpriseModules v-else :active="active" :role="staffRole" />
    </main>

    <div v-if="authDialog" class="dialog-backdrop auth-backdrop"><form class="dialog-card auth-dialog" @submit.prevent="login"><div class="dialog-head"><div><p class="panel-kicker">安全登录</p><h2>后台登录</h2></div></div><p class="dialog-note">请使用管理员、药师或发货员账号登录。</p><label>账号<input v-model="authForm.username" autocomplete="username" required /></label><label>密码<input v-model="authForm.password" type="password" autocomplete="current-password" required /></label><div class="dialog-actions"><button type="submit" class="primary-small">登录后台</button></div></form></div>
  </div>
</template>
