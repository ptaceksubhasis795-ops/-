const api = require('../../services/api')
const runtime = require('../../config/runtime')

Page({
  data: { loading: true, errorMessage: '', customers: [] },
  onShow() {
    this.setData({ loading: true, errorMessage: '' })
    if (runtime.demoMode) return this.setData({ loading: false, customers: [] })
    api.getSalesSummary().then((summary) => this.setData({ loading: false, customers: (summary.directCustomers || []).map((item) => Object.assign({}, item, { initial: String(item.name || '').slice(0, 1), amountText: Number(item.amount || 0).toFixed(2) })) })).catch((error) => this.setData({ loading: false, errorMessage: error.message || '客户加载失败' }))
  },
  retry() { this.onShow() },
  openLogin() { wx.navigateTo({ url: '/pages/auth/login' }) }
})
