const store = require('../../services/store')
const api = require('../../services/api')
const runtime = require('../../config/runtime')

const STATUS_TEXT = { pending: '待审核', approved: '已通过', rejected: '已驳回' }

function normalizeApplication(application) {
  if (!application) return null
  const status = String(application.status || '').toLowerCase()
  return Object.assign({}, application, {
    status,
    statusText: application.statusText || STATUS_TEXT[status] || status || '待审核',
    statusHint: status === 'approved' ? '会员申请已通过，可以查看你的关系和销售中心。' : status === 'rejected' ? (application.reviewNote || application.reviewReason || '本次申请未通过，可以修改资料后重新申请。') : '后台正在审核，请耐心等待。',
    sourceText: application.sourceType === 'referral' ? '推广链接/二维码' : '自主申请',
    salesText: application.resolvedSalesPromoterId || '审核后分配',
    canReapply: status === 'rejected',
  })
}

Page({
  data: { name: '', phone: '', recommender: '', referrerPromoterId: '', application: null, loading: true, errorMessage: '', submitting: false, authRequired: false },

  async onShow() {
    this.setData({ referrerPromoterId: wx.getStorageSync('jz_promoter_id') || '', loading: true, errorMessage: '', authRequired: false })
    if (runtime.demoMode) return this.setData({ application: normalizeApplication(store.getState().memberApplication), loading: false })
    if (!wx.getStorageSync('jz_access_token')) return this.setData({ application: null, loading: false, authRequired: true, errorMessage: '请先登录后申请会员' })
    try {
      const application = await api.getMemberApplication()
      this.setData({ application: normalizeApplication(application), loading: false, errorMessage: '' })
    } catch (error) {
      if (error && error.statusCode === 401) this.setData({ loading: false, authRequired: true, errorMessage: '登录已过期，请重新登录' })
      else if (error && error.statusCode === 404) this.setData({ application: null, loading: false, errorMessage: '' })
      else this.setData({ loading: false, errorMessage: error.message || '申请状态加载失败' })
    }
  },

  input(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }) },

  submit() {
    if (this.data.submitting) return
    if (!this.data.name || !this.data.phone) return wx.showToast({ title: '请填写姓名和手机号', icon: 'none' })
    if (this.data.application && this.data.application.status === 'pending') return wx.showToast({ title: '已有待审核申请', icon: 'none' })
    if (!runtime.demoMode && !wx.getStorageSync('jz_access_token')) return this.openLogin()
    const payload = { name: this.data.name, phone: this.data.phone, recommender: this.data.recommender, referrerPromoterId: this.data.referrerPromoterId || this.data.recommender }
    if (runtime.demoMode) {
      this.setData({ application: normalizeApplication(store.applyMember(payload)) })
      return
    }
    this.setData({ submitting: true })
    api.applyMember(payload)
      .then((application) => this.setData({ application: normalizeApplication(application), submitting: false }))
      .catch((error) => { this.setData({ submitting: false }); wx.showToast({ title: error.message || '提交失败，请稍后重试', icon: 'none' }) })
  },

  openLogin() { wx.navigateTo({ url: '/pages/auth/login' }) },
  sales() { wx.navigateTo({ url: '/pages/sales/index' }) },
  network() { wx.navigateTo({ url: '/pages/sales/network' }) },
})
