const api = require('../../services/api')
const runtime = require('../../config/runtime')

Page({
  data: { loading: true, errorMessage: '', rows: [] },
  onShow() { this.setData({ loading: true, errorMessage: '' }); if (runtime.demoMode) return this.setData({ loading: false, rows: [] }); api.getWithdrawals().then((rows) => this.setData({ loading: false, rows: (rows || []).map((row) => Object.assign({}, row, { amountText: (Number(row.amountFen || row.amount * 100 || 0) / 100).toFixed(2) })) })).catch((error) => this.setData({ loading: false, errorMessage: error.message || '提现记录加载失败' })) },
  retry() { this.onShow() },
  openLogin() { wx.navigateTo({ url: '/pages/auth/login' }) }
})
