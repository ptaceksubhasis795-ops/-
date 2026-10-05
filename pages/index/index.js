const store = require("../../services/store")
const api = require("../../services/api")
const runtime = require("../../config/runtime")

const ARTICLE_CATEGORY_NAMES = { "prescription-guide": "处方用药指引", "clinic-service": "就诊与处方服务", "food-origin": "药食同源", nutrition: "保健食品与营养", "daily-health": "日常健康管理", "service-guide": "订单与服务指南", "member-sharing": "健康活动与会员分享" }

Page({
  data: {
    categories: [
      { title: "处方中药饮片", description: "凭有效处方购买，直服不煎煮", kicker: "处方服务", tone: "prescription", image: "/assets/services/prescription-art.webp", overlay: "/assets/services/prescription-line.webp" },
      { title: "药食同源 · 保健品", description: "精选商品，方便下单配送", kicker: "日常养护", tone: "daily", image: "/assets/services/daily-art.webp", overlay: "/assets/services/daily-line.webp" }
    ],
    articles: [
      { id: "a-01", title: "日常健康管理，从记录开始", tag: "健康科普" },
      { id: "a-02", title: "处方饮片购买流程说明", tag: "用药指引" }
    ],
    featuredProducts: [],
    banners: [], loading: true, errorMessage: ""
  },

  async onShow() {
    this.setData({ loading: true, errorMessage: "" })
    if (runtime.demoMode) {
      store.ensureSeeded()
      const products = store.getProducts({ category: "all" })
      const state = store.getState()
      return this.setData({ featuredProducts: [products[0], products[2]].filter(Boolean), articles: (state.articles || []).map((item) => Object.assign({}, item, { tagText: ARTICLE_CATEGORY_NAMES[item.category || item.tag] || item.tag || "健康科普" })), banners: state.banners || [], loading: false })
    }
    try {
      const [products, articles, banners] = await Promise.all([api.getProducts({ category: "all" }), api.getArticles({ recommended: "1" }), api.getBanners()])
      this.setData({ featuredProducts: (products || []).slice(0, 2), articles: (articles || []).map((item) => Object.assign({}, item, { tagText: ARTICLE_CATEGORY_NAMES[item.category || item.tag] || item.tag || "健康科普" })), banners: (banners || []).map((item) => Object.assign({}, item, { image: item.image || item.imageKey })), loading: false })
    } catch (error) {
      this.setData({ featuredProducts: [], articles: [], banners: [], loading: false, errorMessage: error.message || "首页内容加载失败" })
    }
  },

  handleCategoryTap(event) {
    const title = event.currentTarget.dataset.title
    const category = title.indexOf("处方") >= 0 ? "prescription" : "daily"
    wx.setStorageSync("jz_shop_category", category)
    wx.switchTab({ url: "/pages/shop/list" })
  },

  handleActionTap(event) {
    const label = event.currentTarget.dataset.label
    const routes = {
      搜索: "/pages/shop/list",
      全部分类: "/pages/shop/list",
      问诊开方: "/pages/prescriptions/upload?mode=consult",
      上传处方: "/pages/prescriptions/upload",
      我的订单: "/pages/orders/list",
      更多文章: "/pages/articles/list",
      会员申请: "/pages/member/apply",
      销售中心: "/pages/sales/index"
    }
    if (label === "客服") return wx.makePhoneCall({ phoneNumber: "400-000-0000", fail: () => wx.showToast({ title: "客服电话：400-000-0000", icon: "none" }) })
    if ((label === "问诊开方" || label === "上传处方" || label === "会员申请" || label === "销售中心" || label === "我的订单") && !runtime.demoMode && !wx.getStorageSync("jz_access_token")) return wx.navigateTo({ url: "/pages/auth/login" })
    if (label === "搜索" || label === "全部分类" || label === "我的订单") return wx.switchTab({ url: label === "我的订单" ? "/pages/orders/list" : "/pages/shop/list" })
    if (routes[label]) return wx.navigateTo({ url: routes[label] })
    wx.showToast({ title: "该服务暂未开放", icon: "none" })
  },

  handleArticleTap(event) {
    wx.navigateTo({ url: `/pages/articles/detail?id=${event.currentTarget.dataset.id}` })
  },

  handleProductTap(event) {
    wx.navigateTo({ url: `/pages/shop/detail?id=${event.currentTarget.dataset.id}` })
  },

  handleBannerTap(event) {
    const banner = this.data.banners[event.currentTarget.dataset.index]
    if (!banner || !banner.target || banner.target === "shop") return wx.switchTab({ url: "/pages/shop/list" })
    if (banner.target === "prescription" || banner.target === "consultation") return wx.navigateTo({ url: "/pages/prescriptions/list" })
    if (banner.target.indexOf("article:") === 0) return wx.navigateTo({ url: `/pages/articles/detail?id=${encodeURIComponent(banner.target.slice(8))}` })
    if (banner.target.indexOf("/") === 0) return banner.target.indexOf("/pages/shop/list") === 0 || banner.target.indexOf("/pages/orders/list") === 0 ? wx.switchTab({ url: banner.target }) : wx.navigateTo({ url: banner.target })
    wx.switchTab({ url: "/pages/shop/list" })
  }
})
