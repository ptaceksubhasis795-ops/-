const store = require("../../services/store")
const api = require("../../services/api")
const runtime = require("../../config/runtime")
const categories = require("../../config/article-categories")

function categoryFor(article) {
  const legacy = { 健康科普: "daily-health", 用药指引: "prescription-guide", 生活方式: "daily-health" }
  const key = legacy[article.category || article.tag] || article.category || article.tag
  return categories.find((item) => item.key === key || item.name === key) || categories.find((item) => item.key === "daily-health")
}

Page({
  data: { article: null, category: null, relatedProducts: [], loading: true, errorMessage: "", articleId: "" },
  async onLoad(options) {
    options = options || { id: this.data.articleId }
    this.setData({ articleId: options.id || this.data.articleId, loading: true, errorMessage: "" })
    let article
    let products = []
    try {
      if (runtime.demoMode) {
        const state = store.getState()
        article = (state.articles || []).find((item) => item.id === options.id)
        products = store.getProducts({ category: "all" })
      } else {
        const articles = await api.getArticles()
        article = (articles || []).find((item) => item.id === options.id)
        if (article && Array.isArray(article.productIds) && article.productIds.length) {
          try { products = await api.getProducts({ includeInactive: 0 }) } catch (error) { products = [] }
        }
      }
    } catch (error) {
      return this.setData({ article: null, loading: false, errorMessage: error.message || "文章加载失败" })
    }
    if (!article) return this.setData({ article: null, loading: false, errorMessage: "文章不存在或已下架" })
    const category = categoryFor(article)
    const ids = Array.isArray(article.productIds) ? article.productIds : []
    const relatedProducts = ids.length ? products.filter((item) => ids.includes(item.id)) : []
    this.setData({ article: Object.assign({}, article, { coverImage: article.coverImage || category.image }), category, relatedProducts, loading: false })
  },
  retry() { return this.onLoad({ id: this.data.articleId }) },
  share() { wx.showToast({ title: "分享卡片已准备", icon: "none" }) },
  handleArticleAction() {
    if (this.data.relatedProducts.length) return wx.navigateTo({ url: `/pages/shop/detail?id=${this.data.relatedProducts[0].id}` })
    const target = this.data.article && this.data.article.jumpTarget
    if (target && target.indexOf("product:") === 0) return wx.navigateTo({ url: `/pages/shop/detail?id=${encodeURIComponent(target.slice(8))}` })
    if (target && target.indexOf("/pages/") === 0) return target.indexOf("/pages/shop/list") === 0 || target.indexOf("/pages/orders/list") === 0 ? wx.switchTab({ url: target }) : wx.navigateTo({ url: target })
    if (this.data.article && this.data.article.jumpToShop) return wx.switchTab({ url: "/pages/shop/list" })
    if (this.data.category && ["prescription-guide", "clinic-service"].includes(this.data.category.key)) return this.goPrescription()
    wx.showToast({ title: "本文暂无跳转服务", icon: "none" })
  },
  openRelatedProduct(event) {
    const id = event.currentTarget.dataset.id
    if (id) wx.navigateTo({ url: `/pages/shop/detail?id=${encodeURIComponent(id)}` })
  },
  onShareAppMessage() {
    const promoter = wx.getStorageSync("jz_promoter_id")
    const suffix = promoter ? `&promoter=${encodeURIComponent(promoter)}` : ""
    return { title: this.data.article ? this.data.article.title : "九转健康科普", path: `/pages/articles/detail?id=${this.data.article ? this.data.article.id : ""}${suffix}` }
  },
  goPrescription() {
    if (!runtime.demoMode && !wx.getStorageSync("jz_access_token")) return wx.navigateTo({ url: "/pages/auth/login" })
    wx.navigateTo({ url: "/pages/prescriptions/upload?mode=consult" })
  },
  goShop() { wx.switchTab({ url: "/pages/shop/list" }) }
})
