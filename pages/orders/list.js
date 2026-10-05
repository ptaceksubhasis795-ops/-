const store = require("../../services/store")
const api = require("../../services/api")
const runtime = require("../../config/runtime")

const ORDER_STATUS = { pending_payment: "待支付", paid: "待发货", shipped: "待收货", completed: "已完成", cancelled: "已取消", refunded: "已退款" }
function localPresentation(productId) { return runtime.demoMode ? (store.getProducts({ category: "all" }).find((product) => product.id === productId) || {}) : {} }

Page({
  data: { tabs: [{ key: "all", label: "全部" }, { key: "pending_payment", label: "待支付" }, { key: "paid", label: "待发货" }, { key: "shipped", label: "待收货" }], current: "all", orders: [], loading: true, loadingMore: false, hasMore: false, page: 1, pageSize: 20, errorMessage: "" },

  onShow() { this.refresh() },

  async refresh() {
    this.setData({ loading: true, errorMessage: "" })
    if (!runtime.demoMode) {
      try {
        const orders = await api.getOrders(Object.assign({ page: 1, pageSize: this.data.pageSize }, this.data.current === "all" ? {} : { status: this.data.current }))
        this.setData({ orders: (orders || []).map((order) => this.decorate(order)), loading: false, page: 1, hasMore: (orders || []).length >= this.data.pageSize })
        return
      } catch (error) {
        if (error.code === "LOGIN_REQUIRED" || error.statusCode === 401) return this.setData({ orders: [], loading: false, errorMessage: "请先登录后查看订单" })
        return this.setData({ orders: [], loading: false, errorMessage: error.message || "订单加载失败" })
      }
    }
    const source = Array.isArray(store.getState().orders) ? store.getState().orders : []
    this.setData({ orders: source.filter((item) => this.data.current === "all" || item.status === this.data.current).map((order) => this.decorate(order)), loading: false })
  },
  retry() { this.refresh() },
  openLogin() { wx.navigateTo({ url: "/pages/auth/login" }) },

  async onReachBottom() {
    if (runtime.demoMode || this.data.loading || this.data.loadingMore || !this.data.hasMore) return
    this.setData({ loadingMore: true })
    try {
      const nextPage = this.data.page + 1
      const orders = await api.getOrders(Object.assign({ page: nextPage, pageSize: this.data.pageSize }, this.data.current === "all" ? {} : { status: this.data.current }))
      this.setData({ orders: this.data.orders.concat((orders || []).map((order) => this.decorate(order))), page: nextPage, hasMore: (orders || []).length >= this.data.pageSize, loadingMore: false })
    } catch (error) { this.setData({ loadingMore: false }); wx.showToast({ title: error.message || "加载更多失败", icon: "none" }) }
  },

  decorate(order) {
    return Object.assign({}, order, {
      statusText: order.statusText || ORDER_STATUS[order.status] || "处理中",
      totalText: Number(order.totalAmount || 0).toFixed(2),
      itemCount: (order.items || []).reduce((sum, item) => sum + Number(item.quantity || 0), 0),
      items: (order.items || []).map((item) => Object.assign({}, item, {
        cartKey: `${item.productId}-${item.skuId || "default"}`,
        unitPriceText: Number(item.unitPrice !== undefined ? item.unitPrice : Number(item.unitPriceFen || 0) / 100).toFixed(2),
        image: item.image || localPresentation(item.productId).image,
        overlay: item.overlay || localPresentation(item.productId).overlay,
        color: item.color || localPresentation(item.productId).color,
        category: item.category || localPresentation(item.productId).category
      }))
    })
  },

  switchTab(event) {
    this.setData({ current: event.currentTarget.dataset.key }, this.refresh)
  },

  openOrder(event) {
    wx.navigateTo({ url: `/pages/orders/detail?id=${event.currentTarget.dataset.id}` })
  },

  shop() { wx.switchTab({ url: "/pages/shop/list" }) }
})
