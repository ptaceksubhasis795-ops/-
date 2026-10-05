const store = require("../../services/store");
const api = require("../../services/api");
const runtime = require("../../config/runtime");

const COMMISSION_STATUS = { pending: "待生效", eligible: "可结算", settled: "已结算", reversed: "售后扣回" };

Page({
  data: {
    user: null,
    commission: [],
    customers: [],
    showWithdraw: false,
    withdrawAmount: "",
    promo: null,
    loading: true,
    errorMessage: "",
    monthlyAmount: 0,
    monthlyAmountText: "0.00",
    performanceAmountText: "0.00",
    pendingAmount: 0,
    pendingAmountText: "0.00",
    withdrawThreshold: 500,
    withdrawals: [],
  },
  async onShow() {
    this.setData({ loading: true, errorMessage: "" })
    try {
      const state = runtime.demoMode ? store.getState() : { user: {} }
      const [promo, overview, withdrawals, profile] = runtime.demoMode ? [null, { balance: state.user.rewardBalance || 0, withdrawThreshold: 500, directCustomers: [], commission: state.commission || [], performance: 0 }, [], state.user] : await Promise.all([api.getPromoAssets(), api.getSalesSummary ? api.getSalesSummary() : api.getSalesOverview(), api.getWithdrawals(), api.getMe().catch(() => ({}))])
      const commission = (overview.commission || []).map((item) => Object.assign({}, item, { status: item.statusText || COMMISSION_STATUS[item.status] || item.status || "处理中", amount: Number(item.amount || 0) }))
      const currentMonth = new Date().toISOString().slice(0, 7)
      const monthlyAmount = commission.filter((item) => String(item.date || item.createdAt || "").slice(0, 7) === currentMonth).reduce((sum, item) => sum + Number(item.amount || 0), 0)
      const pendingAmount = commission.filter((item) => ["pending", "待生效"].includes(item.status) || item.statusText === "待生效").reduce((sum, item) => sum + Number(item.amount || 0), 0)
      const user = Object.assign({}, state.user, profile || {}, { rewardBalance: Number(overview.balance || 0), rewardBalanceText: Number(overview.balance || 0).toFixed(2), customerCount: (overview.directCustomers || []).length })
      this.setData({ loading: false, promo, user, commission: commission.map((item) => Object.assign({}, item, { amountText: Number(item.amount || 0).toFixed(2) })), customers: (overview.directCustomers || []).map((item) => ({ name: item.name, initial: String(item.name || "").slice(0, 1), source: item.lastOrder || "暂无购买记录", amount: `¥${Number(item.amount || 0).toFixed(2)}` })), monthlyAmount, monthlyAmountText: monthlyAmount.toFixed(2), performanceAmountText: Number(overview.performance || overview.performanceAmountFen / 100 || 0).toFixed(2), pendingAmount, pendingAmountText: pendingAmount.toFixed(2), withdrawThreshold: Number(overview.withdrawThreshold || 500), withdrawals: withdrawals || [] })
    } catch (error) { this.setData({ loading: false, errorMessage: error.message || "销售数据加载失败", user: null, commission: [], customers: [] }) }
  },
  showWithdraw() {
    this.setData({ showWithdraw: true });
  },
  closeWithdraw() {
    this.setData({ showWithdraw: false });
  },
  input(event) {
    this.setData({ withdrawAmount: event.detail.value });
  },
  withdraw() {
    const amount = Number(this.data.withdrawAmount);
    if (amount < Number(this.data.withdrawThreshold || 500)) return wx.showToast({ title: `余额满 ${this.data.withdrawThreshold || 500} 元后可提现`, icon: "none" });
    if (!runtime.demoMode) {
      api
        .createWithdrawal({ amount })
        .then(() => {
          wx.showToast({ title: "提现申请已提交", icon: "success" });
          this.closeWithdraw();
        })
        .catch(() => wx.showToast({ title: "提现申请失败", icon: "none" }));
      return;
    }
    wx.showToast({ title: "提现申请已提交", icon: "success" });
    this.closeWithdraw();
  },
  applyMember() {
    wx.navigateTo({ url: "/pages/member/apply" });
  },
  openCustomers() { wx.navigateTo({ url: "/pages/sales/customers" }) },
  openNetwork() { wx.navigateTo({ url: "/pages/sales/network" }) },
  openPerformance() { wx.navigateTo({ url: "/pages/sales/performance" }) },
  openRewards() { wx.navigateTo({ url: "/pages/sales/rewards" }) },
  openWithdrawals() { wx.navigateTo({ url: "/pages/sales/withdrawals" }) },
  openAgentOrder() { wx.navigateTo({ url: "/pages/sales/order-create" }) },
  openLogin() { wx.navigateTo({ url: "/pages/auth/login" }) },
  copyShareLink() {
    if (!this.data.promo || !this.data.promo.sharePath) return wx.showToast({ title: "推广链接暂未生成", icon: "none" })
    const path = this.data.promo
      ? this.data.promo.sharePath
      : "";
    wx.setClipboardData({
      data: path,
      success: () => wx.showToast({ title: "推广链接已复制", icon: "success" }),
    });
  },
  poster() {
    wx.navigateTo({ url: "/pages/sales/promotion" });
  },
  onShareAppMessage() {
    return {
      title: "一起做健康生活的长期伙伴",
      path: this.data.promo?.sharePath || "/pages/index/index",
    };
  },
});
