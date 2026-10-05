const store = require("../../services/store")
const api = require("../../services/api")
const runtime = require("../../config/runtime")

Page({
  data: {
    category: "all",
    keyword: "",
    products: [],
    cartCount: 0,
    loading: false,
    errorMessage: "",
    tabs: [
      { key: "all", label: "全部" },
      { key: "daily", label: "药食同源" },
      { key: "prescription", label: "处方饮片" }
    ]
  },

  onLoad(options) {
    this.setData({ category: options.category || "all" })
    this.refresh()
  },

  onShow() {
    const pendingCategory = wx.getStorageSync("jz_shop_category")
    if (pendingCategory) {
      wx.removeStorageSync("jz_shop_category")
      this.setData({ category: pendingCategory })
    }
    this.refresh()
  },

  async refresh() {
    this.setData({ loading: true, errorMessage: "" })
    if (runtime.demoMode) {
      return this.setData({ products: store.getProducts({ category: this.data.category, keyword: this.data.keyword }), cartCount: store.getCart().reduce((sum, item) => sum + item.quantity, 0), loading: false })
    }
    try {
      const products = await api.getProducts({ category: this.data.category, keyword: this.data.keyword })
      this.setData({ products: products || [], cartCount: store.getCart().reduce((sum, item) => sum + item.quantity, 0), loading: false })
    } catch (error) {
      this.setData({ products: [], loading: false, errorMessage: error.message || "商品加载失败" })
    }
  },

  switchCategory(event) {
    this.setData({ category: event.currentTarget.dataset.key }, this.refresh)
  },

  onSearchInput(event) {
    this.setData({ keyword: event.detail && event.detail.value !== undefined ? event.detail.value : (event.currentTarget.dataset.value || "") }, this.refresh)
  },

  openProduct(event) {
    wx.navigateTo({ url: `/pages/shop/detail?id=${event.currentTarget.dataset.id}` })
  },

  openCart() {
    wx.navigateTo({ url: "/pages/cart/index" })
  }
})
