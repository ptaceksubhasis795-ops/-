const store = require("../../services/store")
const api = require("../../services/api")
const runtime = require("../../config/runtime")
const categories = require("../../config/article-categories")
const categoryOptions = [{ key: "all", name: "全部" }].concat(categories)
const categoryRows = [categoryOptions.slice(0, 3), categoryOptions.slice(3, 6), categoryOptions.slice(6)]

function categoryFor(article) { const legacy = { 健康科普: "daily-health", 用药指引: "prescription-guide", 生活方式: "daily-health" }; const key = legacy[article.category || article.tag] || article.category || article.tag; return categories.find((item) => item.key === key || item.name === key) || categories.find((item) => item.key === "daily-health") }

function filterArticles(articles, categoryFilter, keyword) {
  const normalizedKeyword = String(keyword || "").trim().toLowerCase()
  return (articles || []).filter((article) => {
    const category = article.categoryMeta || categoryFor(article)
    const matchesCategory = categoryFilter === "all" || category.key === categoryFilter
    if (!matchesCategory) return false
    if (!normalizedKeyword) return true
    const searchable = [article.title, article.summary, article.body, article.tag, article.category, category.name, category.shortName].filter(Boolean).join(" ").toLowerCase()
    return searchable.includes(normalizedKeyword)
  })
}

Page({
  data: { articles: [], allArticles: [], categories, categoryRows, categoryFilter: "all", keyword: "", loading: true, errorMessage: "", emptyMessage: "暂无科普文章", hasFilters: false },
  applyFilters() {
    const articles = filterArticles(this.data.allArticles, this.data.categoryFilter, this.data.keyword)
    const hasFilters = this.data.categoryFilter !== "all" || Boolean(String(this.data.keyword || "").trim())
    this.setData({ articles, hasFilters, emptyMessage: hasFilters ? "没有找到匹配文章" : "暂无科普文章" })
  },
  async onShow() {
    this.setData({ loading: true, errorMessage: "" })
    try {
      const articles = runtime.demoMode ? (store.getState().articles || []) : await api.getArticles()
      const allArticles = (articles || []).map((article) => { const categoryMeta = categoryFor(article); return Object.assign({}, article, { categoryMeta, coverImage: article.coverImage || categoryMeta.image }) })
      this.setData({ allArticles, loading: false }, () => this.applyFilters())
    } catch (error) {
      this.setData({ articles: [], allArticles: [], loading: false, errorMessage: error.message || "文章加载失败" })
    }
  },
  chooseCategory(event) { this.setData({ categoryFilter: event.currentTarget.dataset.key }, () => this.applyFilters()) },
  onSearchInput(event) {
    const keyword = event.detail && event.detail.value !== undefined ? event.detail.value : (event.currentTarget.dataset.value || "")
    this.setData({ keyword }, () => this.applyFilters())
  },
  clearFilters() { this.setData({ keyword: "", categoryFilter: "all" }, () => this.applyFilters()) },
  open(event) { wx.navigateTo({ url: `/pages/articles/detail?id=${encodeURIComponent(event.currentTarget.dataset.id)}` }) },
  retry() { this.onShow() }
})
