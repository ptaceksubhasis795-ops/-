const store = require("./services/store")
const runtime = require("./config/runtime")
const api = require("./services/api")

App({
  globalData: {
    demoMode: runtime.demoMode,
    brand: "九转健康商城",
    largeText: false
  },

  onLaunch(options) {
    // 本地演示模式才初始化浏览器快照；生产页面的数据只能来自服务端。
    if (runtime.demoMode) store.ensureSeeded()
    this.globalData.largeText = Boolean(wx.getStorageSync("jz_large_text"))
    const promoter = options && options.query && options.query.promoter
    if (promoter && !wx.getStorageSync("jz_promoter_id")) {
      wx.setStorageSync("jz_promoter_id", promoter)
      if (!runtime.demoMode && wx.getStorageSync("jz_access_token")) api.bindReferral(promoter).catch(() => {})
    }
  }
})
