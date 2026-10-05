const store = require("../../services/store")
const api = require("../../services/api")
const runtime = require("../../config/runtime")

Page({
  data: { id: "", name: "", idNo: "", phone: "", relation: "本人", allergies: "", history: "", healthConsent: false, relations: ["本人", "配偶", "父母", "子女", "其他"] },

  async onLoad(options) {
    if (!options.id) return
    try {
      const patient = runtime.demoMode ? store.getState().patients.find((item) => item.id === options.id) : (await api.getPatients()).find((item) => item.id === options.id)
      if (patient) this.setData(Object.assign({}, patient, { idNo: patient.idNo || "" }))
    } catch (error) { wx.showToast({ title: error.message || "就诊人加载失败", icon: "none" }) }
  },

  input(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }) },
  relationChange(event) { this.setData({ relation: this.data.relations[event.detail.value] }) },
  consentChange(event) { this.setData({ healthConsent: Boolean(event.detail.value) }) },

  save() {
    if (!this.data.name || !this.data.idNo || !this.data.phone) return wx.showToast({ title: "请完善实名信息", icon: "none" })
    if (!this.data.healthConsent) return wx.showToast({ title: "请先同意健康信息授权", icon: "none" })
    if (!runtime.demoMode) {
      api.savePatient({ id: this.data.id, name: this.data.name, idNo: this.data.idNo, phone: this.data.phone, relation: this.data.relation, allergies: this.data.allergies, history: this.data.history }).then(() => api.saveHealthConsent({ version: "1.0", consentType: "patient_health", granted: true })).then(() => wx.navigateBack()).catch((error) => wx.showToast({ title: error.message || "保存失败", icon: "none" }))
      return
    }
    store.update((state) => {
      const payload = { id: this.data.id || `patient-${Date.now()}`, name: this.data.name, idNo: this.data.idNo, phone: this.data.phone, relation: this.data.relation, allergies: this.data.allergies, history: this.data.history }
      const index = state.patients.findIndex((item) => item.id === payload.id)
      if (index >= 0) state.patients[index] = payload
      else state.patients.push(payload)
    })
    wx.navigateBack()
  }
})
