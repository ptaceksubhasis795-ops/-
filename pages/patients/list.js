const store = require("../../services/store")
const api = require("../../services/api")
const runtime = require("../../config/runtime")
const { maskId } = require("../../utils/format")

Page({
  data: { patients: [], loading: true, errorMessage: "" },
  async onShow() {
    this.setData({ loading: true, errorMessage: "" })
    try {
      const patients = runtime.demoMode ? store.getState().patients : await api.getPatients()
      this.setData({ patients: (patients || []).map((item) => Object.assign({}, item, { maskedId: item.maskedId || item.idNoMasked || maskId(item.idNo), phone: item.phone || item.phoneMasked })), loading: false })
    } catch (error) { this.setData({ patients: [], loading: false, errorMessage: error.message || "就诊人加载失败" }) }
  },
  retry() { this.onShow() },
  openLogin() { wx.navigateTo({ url: "/pages/auth/login" }) },
  add() { wx.navigateTo({ url: "/pages/patients/editor" }) },
  edit(event) { wx.navigateTo({ url: `/pages/patients/editor?id=${event.currentTarget.dataset.id}` }) }
})
