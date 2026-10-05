const api = require('../../services/api')
const runtime = require('../../config/runtime')

Page({
  data: { loading: true, errorMessage: '', rows: [], total: '0.00' },
  onShow() {
    this.setData({ loading: true, errorMessage: '' })
    if (runtime.demoMode) return this.setData({ loading: false, rows: [], total: '0.00' })
    api.getSalesPerformance({ page: 1, pageSize: 100 }).then((payload) => { const source = payload.items || payload || []; const rows = source.map((row) => Object.assign({}, row, { amountText: (Number(row.amountFen || 0) / 100).toFixed(2), selfPurchaseText: row.selfPurchase ? '本人购买' : '直接客户' })); const total = rows.reduce((sum, row) => sum + Number(row.amountFen || 0) / 100, 0); this.setData({ loading: false, rows, total: total.toFixed(2) }) }).catch((error) => this.setData({ loading: false, errorMessage: error.message || '业绩加载失败' }))
  },
  retry() { this.onShow() },
  openLogin() { wx.navigateTo({ url: '/pages/auth/login' }) }
})
