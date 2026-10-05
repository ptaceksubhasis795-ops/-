const api = require('../../services/api')
const runtime = require('../../config/runtime')

Page({
  data: { loading: true, errorMessage: '', promo: null },
  onShow() { this.setData({ loading: true, errorMessage: '' }); if (runtime.demoMode) return this.setData({ loading: false, promo: null }); api.getPromoAssets().then((promo) => this.setData({ loading: false, promo })).catch((error) => this.setData({ loading: false, errorMessage: error.message || '推广素材加载失败' })) },
  copy() { if (!this.data.promo?.sharePath) return wx.showToast({ title: '推广链接暂未生成', icon: 'none' }); wx.setClipboardData({ data: this.data.promo.sharePath, success: () => wx.showToast({ title: '推广链接已复制', icon: 'success' }) }) },
  share() {},
  openLogin() { wx.navigateTo({ url: '/pages/auth/login' }) },
  onShareAppMessage() { return { title: '一起做健康生活的长期伙伴', path: this.data.promo?.sharePath || '/pages/index/index' } }
})
