const api = require('../../services/api')
const runtime = require('../../config/runtime')

Page({
  data: { loading: true, errorMessage: '', token: '', draft: null, addresses: [], address: null, confirming: false },
  onLoad(options) { this.setData({ token: options && options.token ? options.token : '' }); this.loadDraft() },
  onShow() { if (this.data.addresses.length) this.applyStoredAddress() },
  applyStoredAddress() { const id = wx.getStorageSync('jz_checkout_address_id'); if (!id) return; const address = this.data.addresses.find((item) => String(item.id) === String(id)); if (address) this.setData({ address }) },
  async loadDraft() { if (runtime.demoMode) return this.setData({ loading: false, errorMessage: '演示模式不支持代客订单确认' }); try { const [draft, addresses] = await Promise.all([api.getAgentOrderDraft(this.data.token), api.getAddresses()]); const items = (draft.items || []).map((item) => Object.assign({}, item, { totalText: (Number(item.unitPriceFen || 0) * Number(item.quantity || 0) / 100).toFixed(2) })); const addressList = addresses || []; const selectedId = wx.getStorageSync('jz_checkout_address_id'); const address = addressList.find((item) => String(item.id) === String(selectedId)) || addressList.find((item) => item.isDefault) || addressList[0] || null; this.setData({ loading: false, draft: Object.assign({}, draft, { items }), addresses: addressList, address }); } catch (error) { this.setData({ loading: false, errorMessage: error.message || '订单草稿加载失败' }) } },
  chooseAddress() { wx.navigateTo({ url: '/pages/addresses/list?select=1' }) },
  async confirm() { if (!this.data.address) return wx.showToast({ title: '请先选择收货地址', icon: 'none' }); this.setData({ confirming: true }); try { const result = await api.confirmAgentOrderDraft(this.data.token, { address: this.data.address }); wx.removeStorageSync('jz_checkout_address_id'); this.setData({ confirming: false }); wx.redirectTo({ url: `/pages/orders/detail?id=${result.order.id}` }) } catch (error) { this.setData({ confirming: false }); wx.showToast({ title: error.message || '确认失败', icon: 'none' }) } }
})
