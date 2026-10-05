const store = require("../../services/store")
const api = require("../../services/api")
const runtime = require("../../config/runtime")

Page({
  data: { addresses: [], editing: false, selectMode: false, loading: true, errorMessage: "", form: { name: "", phone: "", detail: "", isDefault: true } },
  onLoad(options) { this.setData({ selectMode: options && options.select === "1" }) },
  async onShow() {
    this.setData({ loading: true, errorMessage: "" })
    if (!runtime.demoMode && !wx.getStorageSync("jz_access_token")) return this.setData({ addresses: [], loading: false, errorMessage: "请先登录后管理地址" })
    try { this.setData({ addresses: runtime.demoMode ? (store.getState().addresses || []) : (await api.getAddresses()) || [], loading: false }) }
    catch (error) { this.setData({ addresses: [], loading: false, errorMessage: error.message || "地址加载失败" }) }
  },
  retry() { this.onShow() },
  openLogin() { wx.navigateTo({ url: "/pages/auth/login" }) },
  edit(event) { this.setData({ editing: true, form: Object.assign({}, event.currentTarget.dataset.address, { phone: "" }) }) },
  select(event) {
    if (!this.data.selectMode) return this.edit(event)
    wx.setStorageSync("jz_checkout_address_id", event.currentTarget.dataset.id)
    wx.navigateBack()
  },
  add() { this.setData({ editing: true, form: { name: "", phone: "", detail: "", isDefault: this.data.addresses.length === 0 } }) },
  input(event) { this.setData({ [`form.${event.currentTarget.dataset.field}`]: event.detail.value }) },
  toggleDefault(event) { this.setData({ "form.isDefault": event.detail.value }) },
  cancel() { this.setData({ editing: false }) },
  save() {
    const form = this.data.form
    if (!form.name || !form.phone || !form.detail) return wx.showToast({ title: "请完善地址信息", icon: "none" })
    if (!/^1\d{10}$/.test(String(form.phone || ""))) return wx.showToast({ title: "请输入正确的手机号", icon: "none" })
    if (!runtime.demoMode) return api.saveAddress(form).then(() => { this.setData({ editing: false }); this.onShow() }).catch((error) => wx.showToast({ title: error.message || "保存失败", icon: "none" }))
    store.update((state) => { if (form.isDefault) state.addresses.forEach((item) => { item.isDefault = false }); const index = state.addresses.findIndex((item) => item.id === form.id); const item = Object.assign({}, form, { id: form.id || `address-${Date.now()}` }); if (index >= 0) state.addresses[index] = item; else state.addresses.push(item) })
    this.setData({ editing: false }); this.onShow()
  },
  remove(event) {
    const id = event.currentTarget.dataset.id
    if (!id) return
    wx.showModal({ title: "删除地址", content: "确定删除这个收货地址吗？", confirmText: "删除", success: (result) => {
      if (!result.confirm) return
      if (runtime.demoMode) { store.update((state) => { state.addresses = state.addresses.filter((item) => item.id !== id) }); this.onShow() }
      else api.deleteAddress(id).then(() => this.onShow()).catch((error) => wx.showToast({ title: error.message || "删除失败", icon: "none" }))
    } })
  }
})
