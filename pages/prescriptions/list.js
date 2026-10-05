const store = require("../../services/store")
const api = require("../../services/api")
const runtime = require("../../config/runtime")

const PRESCRIPTION_STATUS = { pending_review: "待审核", approved: "审核通过", rejected: "审核拒绝", used: "已占用待支付" }

Page({
  data: { prescriptions: [], patients: [], loading: true, errorMessage: "" },
  normalize(items = []) {
    const today = new Date().toISOString().slice(0, 10)
    return (items || []).map((item) => {
      const productId = item.productId || (runtime.demoMode ? (String(item.itemName || "").includes("商陆") ? "p-shang-lu-guo" : "p-dan-nan-xing") : "")
      return Object.assign({}, item, { productId, statusText: item.statusText || PRESCRIPTION_STATUS[item.status] || "处理中", unavailableReason: item.status === "approved" && !productId ? "后台尚未绑定可购买商品" : "", canPay: item.status === "approved" && Boolean(productId) && Boolean(item.validUntil) && String(item.validUntil).slice(0, 10) >= today })
    })
  },

  async onShow() {
    this.setData({ loading: true, errorMessage: "" })
    try {
      const [prescriptions, patients] = runtime.demoMode ? [store.getState().prescriptions, store.getState().patients] : await Promise.all([api.getPrescriptions(), api.getPatients()])
      this.setData({ prescriptions: this.normalize(prescriptions), patients: patients || [], loading: false })
    } catch (error) { this.setData({ prescriptions: [], patients: [], loading: false, errorMessage: error.message || "处方加载失败" }) }
  },

  retry() { this.onShow() },
  openLogin() { wx.navigateTo({ url: "/pages/auth/login" }) },

  upload() { wx.navigateTo({ url: "/pages/prescriptions/upload" }) },

  consult() { wx.navigateTo({ url: "/pages/prescriptions/upload?mode=consult" }) },

  pay(event) {
    const rx = this.data.prescriptions.find((item) => item.id === event.currentTarget.dataset.id)
    if (!rx) return
    if (!rx.canPay) return wx.showToast({ title: "处方已过期或尚未审核", icon: "none" })
    wx.navigateTo({ url: `/pages/checkout/index?productId=${encodeURIComponent(rx.productId)}&quantity=1&prescriptionId=${encodeURIComponent(rx.id)}&patientId=${encodeURIComponent(rx.patientId || "")}` })
  }
  ,
  viewFile(event) {
    const rx = this.data.prescriptions.find((item) => item.id === event.currentTarget.dataset.id)
    if (!rx || !rx.fileKey) return wx.showToast({ title: "暂无处方凭证", icon: "none" })
    if (runtime.demoMode) return wx.showToast({ title: "开发演示模式没有真实文件", icon: "none" })
    const filePath = `${wx.env && wx.env.USER_DATA_PATH ? wx.env.USER_DATA_PATH : ""}/prescription-${rx.id}.jpg`
    api.downloadFile(rx.fileKey, filePath).then((path) => /\.pdf$/i.test(String(rx.fileName || "")) ? wx.openDocument({ filePath: path, showMenu: true }) : wx.previewImage({ current: path, urls: [path] })).catch((error) => wx.showToast({ title: error.message || "文件打开失败", icon: "none" }))
  }
})
