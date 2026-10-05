const api = require('../../services/api')
const runtime = require('../../config/runtime')

function maskPhone(value) {
  const source = String(value || '').replace(/\s+/g, '')
  if (/^1\d{10}$/.test(source)) return `${source.slice(0, 3)}****${source.slice(-4)}`
  if (source.length >= 7) return `${source.slice(0, 3)}****${source.slice(-2)}`
  return '联系方式已保护'
}

function amountText(row) {
  const fen = row && row.amountFen !== undefined && row.amountFen !== null
    ? Number(row.amountFen)
    : Math.round((Number(row && row.amount) || 0) * 100)
  return (Number(fen || 0) / 100).toFixed(2)
}

function personView(row, fallbackClass) {
  const source = row || {}
  return {
    id: source.id || source.promoterId || source.userId || '',
    name: source.name || source.nickname || source.id || '未命名',
    classText: source.promoterClassText || source.classText || fallbackClass,
  }
}

function customerView(row) {
  const source = row || {}
  return {
    id: source.id || source.customerId || '',
    name: source.name || source.nickname || '客户',
    initial: String(source.name || source.nickname || '客').slice(0, 1),
    phoneMasked: source.phoneMasked || maskPhone(source.phone),
    amountText: amountText(source),
    lastOrderText: source.lastOrder || source.lastOrderAt || '暂无购买记录',
  }
}

function normalizeNetwork(payload) {
  const source = payload || {}
  const role = String(source.role || '').toLowerCase() === 'sales' ? 'sales' : 'member'
  const hasPromoter = Boolean(source.promoter)
  const promoter = hasPromoter ? personView(source.promoter, role === 'sales' ? '销售人员（高级会员）' : '会员') : null
  const members = (Array.isArray(source.members) ? source.members : [])
    .map((row) => personView(row, '会员'))
    .filter((row) => role === 'sales' || !promoter || row.id !== promoter.id)
  const sales = (Array.isArray(source.sales) ? source.sales : []).map((row) => personView(row, '销售人员（高级会员）'))
  const customers = (Array.isArray(source.customers) ? source.customers : []).map(customerView)
  return {
    role,
    roleText: role === 'sales' ? '销售人员（高级会员）' : '会员',
    promoter,
    hasPromoter,
    superior: source.superior ? personView(source.superior, '销售人员（高级会员）') : null,
    members,
    sales,
    customers,
    hasMembers: members.length > 0,
    hasSales: sales.length > 0,
    hasCustomers: customers.length > 0,
  }
}

function demoNetwork() {
  return normalizeNetwork({
    role: 'member',
    promoter: { id: 'demo-member', name: '演示会员' },
    superior: { id: 'demo-sales', name: '华南销售组' },
    members: [],
    sales: [],
    customers: [],
  })
}

Page({
  data: {
    loading: true,
    errorMessage: '',
    authRequired: false,
    network: null,
    role: 'member',
    roleText: '会员',
    superior: null,
    members: [],
    sales: [],
    customers: [],
    hasMembers: false,
    hasSales: false,
    hasCustomers: false,
    isSales: false,
    hasPromoter: false,
  },

  onShow() { this.load() },

  load() {
    this.setData({ loading: true, errorMessage: '', authRequired: false })
    if (runtime.demoMode) {
      const network = demoNetwork()
      this.setData(Object.assign({ loading: false, network, isSales: network.role === 'sales' }, network))
      return
    }
    if (!wx.getStorageSync('jz_access_token')) {
      this.setData({ loading: false, authRequired: true, errorMessage: '请先登录后查看关系' })
      return
    }
    api.getSalesNetwork()
      .then((payload) => {
        const network = normalizeNetwork(payload)
        this.setData(Object.assign({ loading: false, network, isSales: network.role === 'sales' }, network))
      })
      .catch((error) => {
        if (error && error.statusCode === 401) {
          this.setData({ loading: false, authRequired: true, errorMessage: '登录已过期，请重新登录' })
          return
        }
        this.setData({ loading: false, errorMessage: error.message || '关系加载失败' })
      })
  },

  retry() { this.load() },

  openLogin() { wx.navigateTo({ url: '/pages/auth/login' }) },

  openMemberApply() { wx.navigateTo({ url: '/pages/member/apply' }) },
})
