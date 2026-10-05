const api = require('../../services/api')
const runtime = require('../../config/runtime')

Page({
  data: { loading: true, errorMessage: '', rows: [] },
  onShow() { this.setData({ loading: true, errorMessage: '' }); if (runtime.demoMode) return this.setData({ loading: false, rows: [] }); api.getSalesRewards({ page: 1, pageSize: 100 }).then((payload) => this.setData({ loading: false, rows: (payload.items || payload || []).map((row) => Object.assign({}, row, { amountText: (Number(row.amountFen || 0) / 100).toFixed(2) })) })).catch((error) => this.setData({ loading: false, errorMessage: error.message || '奖励加载失败' })) },
  retry() { this.onShow() },
  openLogin() { wx.navigateTo({ url: '/pages/auth/login' }) }
})
