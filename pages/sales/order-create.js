const api = require('../../services/api')
const runtime = require('../../config/runtime')

Page({
  data: { loading: true, submitting: false, customers: [], products: [], customerIndex: 0, productIndex: 0, quantity: 1, errorMessage: '', draft: null },
  async onShow() {
    if (runtime.demoMode) return this.setData({ loading: false, errorMessage: '演示模式暂不创建代客订单' })
    try { const [summary, products] = await Promise.all([api.getSalesSummary(), api.getProducts({ category: 'daily' })]); this.setData({ loading: false, customers: summary.directCustomers || [], products: products || [] }) } catch (error) { this.setData({ loading: false, errorMessage: error.message || '代客下单数据加载失败' }) }
  },
  customerChange(event) { this.setData({ customerIndex: Number(event.detail.value) }) },
  productChange(event) { this.setData({ productIndex: Number(event.detail.value) }) },
  quantityChange(event) { const value = Number(event.detail.value || 1); this.setData({ quantity: Math.max(1, Math.min(99, value)) }) },
  create() {
    const customer = this.data.customers[this.data.customerIndex]; const product = this.data.products[this.data.productIndex]
    if (!customer || !product) return wx.showToast({ title: '请选择客户和商品', icon: 'none' })
    this.setData({ submitting: true })
    api.createAgentOrderDraft({ customerId: customer.id, items: [{ productId: product.id, skuId: product.skus && product.skus[0] ? product.skus[0].id : undefined, quantity: this.data.quantity }] }).then((draft) => { this.setData({ draft, submitting: false }); wx.setClipboardData({ data: `/pages/sales/order-draft?token=${draft.token}`, success: () => wx.showToast({ title: '订单草稿已创建，链接已复制', icon: 'success' }) }) }).catch((error) => { this.setData({ submitting: false }); wx.showToast({ title: error.message || '创建失败', icon: 'none' }) })
  }
})
