const api = require("../../services/api")
const runtime = require("../../config/runtime")

Page({
  data: { phone: "", loading: false, loggedIn: false, phoneLoading: false, user: null, runtime },

  onLoad() {
    const user = wx.getStorageSync("jz_user")
    if (wx.getStorageSync("jz_access_token") && user) this.setData({ loggedIn: true, user, phone: user.phone || "" })
  },

  input(event) { this.setData({ phone: event.detail.value }) },

  login() {
    if (runtime.demoMode) return wx.showToast({ title: "开发演示模式无需登录", icon: "none" })
    if (this.data.phone && !/^1\d{10}$/.test(this.data.phone)) return wx.showToast({ title: "请输入正确的手机号", icon: "none" })
    this.setData({ loading: true })
    wx.login({
      success: (result) => {
        if (!result.code) {
          this.setData({ loading: false })
          return wx.showToast({ title: "微信登录凭证获取失败，请重试", icon: "none" })
        }
        api.request("/auth/wechat/login", { method: "POST", data: { code: result.code, phone: this.data.phone } }).then((payload) => {
          if (payload && payload.token) wx.setStorageSync("jz_access_token", payload.token)
          if (payload && payload.user) wx.setStorageSync("jz_user", payload.user)
          if (payload && payload.openId) wx.setStorageSync("jz_open_id", payload.openId)
          const promoterId = wx.getStorageSync("jz_promoter_id")
          if (promoterId) api.bindReferral(promoterId).catch(() => {})
          this.setData({ loggedIn: true, user: payload && payload.user ? payload.user : null })
          if (payload && payload.user && payload.user.phone) {
            wx.showToast({ title: "登录成功", icon: "success" })
            setTimeout(() => wx.navigateBack(), 450)
          } else wx.showToast({ title: "登录成功，请授权手机号", icon: "none" })
        }).catch((error) => {
          wx.showToast({ title: error.message || "登录失败，请稍后重试", icon: "none" })
        }).finally(() => this.setData({ loading: false }))
      },
      fail: () => { this.setData({ loading: false }); wx.showToast({ title: "登录暂不可用", icon: "none" }) }
    })
  }
  ,
  bindPhone(event) {
    const code = event.detail && event.detail.code
    if (!code) return wx.showToast({ title: "未取得手机号授权", icon: "none" })
    this.setData({ phoneLoading: true })
    api.bindWechatPhone({ code, phone: this.data.phone || undefined }).then((payload) => {
      if (payload && payload.user) wx.setStorageSync("jz_user", payload.user)
      wx.showToast({ title: "手机号已绑定", icon: "success" })
      setTimeout(() => wx.navigateBack(), 450)
    }).catch((error) => wx.showToast({ title: error.message || "手机号绑定失败", icon: "none" })).finally(() => this.setData({ phoneLoading: false }))
  }
})
