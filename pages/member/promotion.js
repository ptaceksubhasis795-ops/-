const api = require('../../services/api')
const runtime = require('../../config/runtime')

const STATUS_TEXT = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已驳回',
}

const CRITERIA_TEXT = {
  monthly: '连续 3 个月每月业绩均达到 ¥100,000',
  total: '最近 3 个月累计业绩达到 ¥300,000',
  none: '连续 3 个月每月业绩均达到 ¥100,000，或最近 3 个月累计达到 ¥300,000',
}

function amountFen(value, fallbackAmount) {
  if (value !== undefined && value !== null && value !== '') return Number(value) || 0
  return Math.round((Number(fallbackAmount) || 0) * 100)
}

function amountText(valueFen) {
  return (Number(valueFen || 0) / 100).toFixed(2)
}

function statusText(status) {
  const normalized = String(status || '').toLowerCase()
  return STATUS_TEXT[normalized] || (status ? String(status) : '未提交')
}

function periodFallback(index) {
  const date = new Date()
  date.setDate(1)
  date.setMonth(date.getMonth() - (2 - index))
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function normalizeMonthly(snapshot) {
  const source = Array.isArray(snapshot && snapshot.monthly) ? snapshot.monthly : []
  const byPeriod = source.reduce((result, item) => {
    const period = String(item.period || '')
    if (period) result[period] = item
    return result
  }, {})
  const periods = Array.isArray(snapshot && snapshot.months) && snapshot.months.length === 3
    ? snapshot.months
    : [0, 1, 2].map(periodFallback)
  return periods.map((period) => {
    const item = byPeriod[period] || {}
    const valueFen = amountFen(item.amountFen, item.amount)
    return {
      period,
      amountFen: valueFen,
      amountText: amountText(valueFen),
      qualified: valueFen >= 10000000,
      qualifiedText: valueFen >= 10000000 ? '已达标' : '未达标',
      gapText: valueFen >= 10000000 ? '—' : amountText(10000000 - valueFen),
    }
  })
}

function normalizeApplication(application) {
  if (!application) return null
  const status = String(application.status || '').toLowerCase()
  return Object.assign({}, application, {
    status,
    statusText: statusText(status),
    criteriaText: CRITERIA_TEXT[application.criteria] || CRITERIA_TEXT.none,
    reviewReasonText: application.reviewReason || application.reason || (status === 'pending' ? '后台正在审核，请耐心等待' : status === 'approved' ? '已成为销售人员（高级会员）' : '本次申请未通过，可在满足条件后重新申请'),
    submittedAtText: application.submittedAt || application.createdAt || '',
    reviewedAtText: application.reviewedAt || '',
  })
}

function normalizeEligibility(payload) {
  const source = payload || {}
  const snapshot = source.snapshot || {}
  const monthly = normalizeMonthly(snapshot)
  const totalAmountFen = amountFen(snapshot.totalAmountFen, snapshot.totalAmount)
  const criteria = String(snapshot.criteria || source.criteria || 'none').toLowerCase()
  const latest = normalizeApplication(source.application)
  const monthlyQualified = source.monthlyQualified !== undefined ? Boolean(source.monthlyQualified) : monthly.every((item) => item.qualified)
  const totalQualified = source.totalQualified !== undefined ? Boolean(source.totalQualified) : totalAmountFen >= 30000000
  const eligible = source.eligible !== undefined ? Boolean(source.eligible) : monthlyQualified || totalQualified
  const canApply = Boolean(source.canApply) && !['pending', 'approved'].includes(String(latest && latest.status))
  return {
    source,
    monthly,
    totalAmountFen,
    totalAmountText: amountText(totalAmountFen),
    monthlyQualified,
    totalQualified,
    eligible,
    canApply: canApply || (eligible && latest && latest.status === 'rejected'),
    criteria,
    criteriaText: CRITERIA_TEXT[criteria] || CRITERIA_TEXT.none,
    eligibilityText: eligible ? '已达到申请条件' : '尚未达到申请条件',
    totalGapText: totalAmountFen >= 30000000 ? '—' : amountText(30000000 - totalAmountFen),
    application: latest,
  }
}

function demoEligibility() {
  const monthly = [
    { period: periodFallback(0), amountFen: 0 },
    { period: periodFallback(1), amountFen: 0 },
    { period: periodFallback(2), amountFen: 0 },
  ]
  return normalizeEligibility({ snapshot: { months: monthly.map((item) => item.period), monthly, totalAmountFen: 0, criteria: 'none' }, canApply: false })
}

Page({
  data: {
    loading: true,
    submitting: false,
    authRequired: false,
    errorMessage: '',
    eligibility: null,
    application: null,
    monthly: [],
    totalAmountText: '0.00',
    criteriaText: CRITERIA_TEXT.none,
    eligibilityText: '正在读取',
    totalGapText: '0.00',
    canApply: false,
  },

  onShow() { this.load() },

  load() {
    this.setData({ loading: true, authRequired: false, errorMessage: '' })
    if (runtime.demoMode) {
      const eligibility = demoEligibility()
      this.setData(Object.assign({ loading: false, application: null, eligibility }, eligibility))
      return
    }
    if (!wx.getStorageSync('jz_access_token')) {
      this.setData({ loading: false, authRequired: true, errorMessage: '请先登录后查看晋升条件' })
      return
    }
    Promise.all([api.getPromotionEligibility(), api.getPromotionApplication()])
      .then(([eligibilityPayload, applicationPayload]) => {
        const eligibility = normalizeEligibility(eligibilityPayload)
        const application = normalizeApplication(applicationPayload || eligibility.application)
        if (application) eligibility.application = application
        const canApply = Boolean(eligibility.canApply) && !['pending', 'approved'].includes(String(application && application.status))
        this.setData(Object.assign({ loading: false, application, canApply, eligibility }, eligibility))
      })
      .catch((error) => {
        if (error && error.statusCode === 401) {
          this.setData({ loading: false, authRequired: true, errorMessage: '登录已过期，请重新登录' })
          return
        }
        this.setData({ loading: false, errorMessage: error.message || '晋升信息加载失败' })
      })
  },

  apply() {
    if (this.data.submitting || !this.data.canApply) return
    if (!wx.getStorageSync('jz_access_token') && !runtime.demoMode) {
      this.openLogin()
      return
    }
    if (runtime.demoMode) {
      const demoApplication = normalizeApplication({ status: 'pending', criteria: this.data.eligibility && this.data.eligibility.criteria, createdAt: new Date().toISOString() })
      this.setData({ application: demoApplication, canApply: false, submitting: false })
      wx.showToast({ title: '申请已提交', icon: 'success' })
      return
    }
    this.setData({ submitting: true })
    api.applyPromotion()
      .then((application) => {
        const normalized = normalizeApplication(application)
        this.setData({ application: normalized, canApply: false, submitting: false })
        wx.showToast({ title: '申请已提交', icon: 'success' })
      })
      .catch((error) => {
        this.setData({ submitting: false })
        wx.showToast({ title: error.message || '申请失败，请稍后重试', icon: 'none' })
      })
  },

  retry() { this.load() },

  openLogin() { wx.navigateTo({ url: '/pages/auth/login' }) },

  openNetwork() { wx.navigateTo({ url: '/pages/sales/network' }) },
})
