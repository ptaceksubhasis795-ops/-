const store = require("../../services/store")
const api = require("../../services/api")
const runtime = require("../../config/runtime")
const notifications = require("../../services/notifications")

Page({
  data: { patients: [], patientIndex: 0, fileName: "", filePath: "", mode: "upload", submitted: false, submitting: false, errorMessage: "" },

  async onLoad(options) {
    options = options || {}
    let patients
    try { patients = runtime.demoMode ? store.getState().patients : await api.getPatients() } catch (error) { return this.setData({ patients: [], mode: options.mode || "upload", errorMessage: error.message || "就诊人加载失败" }) }
    this.setData({ patients: patients || [], mode: options.mode || "upload", errorMessage: "" })
  },

  choosePatient(event) { this.setData({ patientIndex: Number(event.detail.value) }) },

  chooseFile() {
    wx.chooseImage({ count: 1, sizeType: ["compressed"], sourceType: ["album", "camera"], success: (res) => { const path = (res.tempFilePaths || [])[0] || ""; this.setData({ fileName: path ? "处方图片已选择" : "", filePath: path }) }, fail: () => wx.showToast({ title: "未选择处方图片", icon: "none" }) })
  },

  submit() {
    if (!this.data.patients.length) return wx.showModal({ title: "请先添加就诊人", content: "处方需要实名就诊人信息。", confirmText: "去添加", success: (res) => { if (res.confirm) wx.navigateTo({ url: "/pages/patients/editor" }) } })
    if (this.data.mode !== "consult" && !this.data.filePath && !runtime.demoMode) return wx.showToast({ title: "请先选择处方图片", icon: "none" })
    if (!runtime.demoMode) {
      try { api.requireLogin() } catch (error) { return wx.navigateTo({ url: "/pages/auth/login" }) }
    }
    notifications.requestOrderNotifications()
    if (!runtime.demoMode) {
      this.setData({ submitting: true, errorMessage: "" })
      const patient = this.data.patients[this.data.patientIndex]
      const submit = this.data.mode === "consult"
        ? api.submitConsultation({ patientId: patient.id })
        : api.uploadFile(this.data.filePath, "prescription").then((file) => api.submitPrescription({ patientId: patient.id, fileKey: file.id || file.fileKey, source: "offline" }))
      submit.then(() => this.setData({ submitted: true, submitting: false })).catch((error) => this.setData({ submitting: false, errorMessage: error.message || "提交失败，请稍后重试" }))
      return
    }
    const rx = store.submitPrescription({ patientName: this.data.patients[this.data.patientIndex].name, fileName: this.data.fileName })
    this.setData({ submitted: true, submittedId: rx.id })
  },

  viewList() { wx.redirectTo({ url: "/pages/prescriptions/list" }) }
  ,
  openLogin() { wx.navigateTo({ url: "/pages/auth/login" }) }
})
