const store = require("../../services/store")
const api = require("../../services/api")
const runtime = require("../../config/runtime")

Page({
  data: { user: null, pendingOrderCount: 0, prescriptionCount: 0, unread: 0, largeText: false, loading: true, errorMessage: "" },
  async onShow() {
    const app = getApp()
    this.setData({ loading: true, errorMessage: "" })
    try {
      if (!runtime.demoMode && !wx.getStorageSync("jz_access_token")) return this.setData({ user: null, loading: false, errorMessage: "请先登录" })
      const state = runtime.demoMode ? store.getState() : {}
      const [user, orders, prescriptions] = runtime.demoMode ? [state.user, state.orders || [], state.prescriptions || []] : await Promise.all([api.getMe(), api.getOrders(), api.getPrescriptions()])
      const profile = user ? Object.assign({}, user, { initial: String(user.nickname || "我").slice(0, 1) }) : null
      this.setData({ user: profile, pendingOrderCount: (orders || []).filter((item) => item.status === "pending_payment").length, prescriptionCount: (prescriptions || []).length, unread: 0, largeText: Boolean(app.globalData.largeText), loading: false })
    } catch (error) { this.setData({ user: null, loading: false, errorMessage: error.message || "个人信息加载失败" }) }
  },
  open(event) {
    const routes = { orders: "/pages/orders/list", prescriptions: "/pages/prescriptions/list", patients: "/pages/patients/list", member: "/pages/member/apply", promotion: "/pages/member/promotion", network: "/pages/sales/network", sales: "/pages/sales/index", articles: "/pages/articles/list", cart: "/pages/cart/index" }
    const url = routes[event.currentTarget.dataset.target]
    if (event.currentTarget.dataset.target === "orders") return wx.switchTab({ url: "/pages/orders/list" })
    if (url) wx.navigateTo({ url })
  },

  openLogin() { wx.navigateTo({ url: "/pages/auth/login" }) },

  toggleLargeText(event) {
    const enabled = event.detail.value
    const app = getApp()
    app.globalData.largeText = enabled
    wx.setStorageSync("jz_large_text", enabled)
    this.setData({ largeText: enabled })
  }
})
