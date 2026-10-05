const store = require("../../services/store")
const api = require("../../services/api")
const runtime = require("../../config/runtime")
const notifications = require("../../services/notifications")

Page({
  data: { items: [], address: null, subtotal: 0, freight: 0, total: 0, subtotalText: "0.00", freightText: "包邮", totalText: "0.00", fromCart: false, prescriptionId: "", patientId: "", idempotencyKey: "", demoMode: runtime.demoMode, loading: true, errorMessage: "", paying: false },

  async onLoad(options) {
    options = options || {}
    this.checkoutOptions = options
    if (!runtime.demoMode && !wx.getStorageSync("jz_access_token")) return this.setData({ loading: false, errorMessage: "请先登录后结算" })
    const state = runtime.demoMode ? store.getState() : { addresses: [] }
    if (!runtime.demoMode) {
      try {
        const me = await api.getMe()
        if (!me || !me.phone) return this.setData({ loading: false, errorMessage: "请先绑定手机号后结算" })
      } catch (error) { return this.setData({ loading: false, errorMessage: error.message || "登录状态加载失败" }) }
    }
    let addresses
    try { addresses = runtime.demoMode ? (state.addresses || []) : await api.getAddresses() } catch (error) { return this.setData({ loading: false, errorMessage: error.message || "地址加载失败" }) }
    let items = []
    const fromCart = options.fromCart === "1"
    if (fromCart) items = store.getCart()
    else if (options.productId) {
      try {
        const product = runtime.demoMode ? store.getProduct(options.productId) : await api.request(`/catalog/products/${encodeURIComponent(options.productId)}`)
        const skus = Array.isArray(product.skus) && product.skus.length ? product.skus : [{ id: `${product.id}-default`, name: product.unit, price: product.price, stock: product.stock }]
        const sku = skus.find((item) => String(item.id) === String(options.skuId)) || skus[0]
        items = [{ productId: options.productId, skuId: sku.id, skuName: sku.name, quantity: Number(options.quantity || 1), product: Object.assign({}, product, { selectedSku: sku, price: Number(sku.price !== undefined ? sku.price : Number(sku.priceFen || 0) / 100), unit: sku.name || product.unit }) }]
      } catch (error) { return this.setData({ loading: false, errorMessage: error.message || "商品加载失败" }) }
    }
    if (!items.length) return this.setData({ loading: false, errorMessage: "购物袋中没有商品" })
    items = items.map((item) => Object.assign({}, item, { cartKey: item.cartKey || `${item.productId}-${item.skuId || "default"}` }))
    this.setData({ items, address: addresses.find((item) => item.isDefault) || addresses[0] || null, fromCart, prescriptionId: options.prescriptionId || "", patientId: options.patientId || "", idempotencyKey: `mini-order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` }, () => this.refreshQuote())
  },

  async onShow() {
    if (!this.data.items.length && this.checkoutOptions && !this.data.loading && wx.getStorageSync("jz_access_token")) return this.onLoad(this.checkoutOptions)
    if (!this.data.items.length) return
    let addresses = runtime.demoMode ? (store.getState().addresses || []) : []
    if (!runtime.demoMode) { try { addresses = await api.getAddresses() } catch (error) { return this.setData({ errorMessage: error.message || "地址加载失败" }) } }
    const selectedId = wx.getStorageSync("jz_checkout_address_id")
    if (selectedId) wx.removeStorageSync("jz_checkout_address_id")
    this.setData({ address: (selectedId && addresses.find((item) => item.id === selectedId)) || addresses.find((item) => item.isDefault) || addresses[0] || null }, () => this.refreshQuote())
  },

  async refreshQuote() {
    if (!this.data.items.length) return
    this.setData({ loading: true, errorMessage: "" })
    if (runtime.demoMode) {
      const subtotal = this.data.items.reduce((sum, item) => sum + Number(item.product.price || 0) * Number(item.quantity || 0), 0)
      const freight = subtotal >= 199 || subtotal === 0 ? 0 : 8
      return this.setData({ subtotal, freight, total: subtotal + freight, subtotalText: subtotal.toFixed(2), freightText: freight ? `¥${freight.toFixed(2)}` : "包邮", totalText: (subtotal + freight).toFixed(2), loading: false })
    }
    if (!this.data.address) return this.setData({ loading: false })
    try {
      const quote = await api.previewOrder({ items: this.data.items.map((item) => ({ productId: item.productId, skuId: item.skuId, quantity: item.quantity })), address: this.data.address, prescriptionId: this.data.prescriptionId, patientId: this.data.patientId })
      const amount = quote.amount !== undefined ? Number(quote.amount) : Number(quote.amountFen || 0) / 100
      const freight = quote.freight !== undefined ? Number(quote.freight) : Number(quote.freightFen || 0) / 100
      const total = quote.totalAmount !== undefined ? Number(quote.totalAmount) : Number(quote.totalAmountFen || 0) / 100
      const quoteItems = quote.items || []
      const items = this.data.items.map((item) => { const line = quoteItems.find((entry) => entry.productId === item.productId && (!item.skuId || entry.skuId === item.skuId)) || {}; const unitPrice = line.unitPrice !== undefined ? Number(line.unitPrice) : Number(line.unitPriceFen || item.product.price || 0) / (line.unitPriceFen !== undefined && line.unitPrice === undefined ? 100 : 1); return Object.assign({}, item, line, { skuId: line.skuId || item.skuId, skuName: line.skuName || item.skuName, cartKey: item.cartKey, product: Object.assign({}, item.product, line, { price: unitPrice, unit: line.skuName || item.skuName || item.product.unit }), lineTotalText: (unitPrice * Number(item.quantity || 0)).toFixed(2) }) })
      this.setData({ items, subtotal: amount, freight, total, subtotalText: amount.toFixed(2), freightText: freight ? `¥${freight.toFixed(2)}` : "包邮", totalText: total.toFixed(2), loading: false })
    } catch (error) { this.setData({ loading: false, errorMessage: error.message || "订单金额计算失败" }) }
  },

  retry() { return this.checkoutOptions ? this.onLoad(this.checkoutOptions) : this.refreshQuote() },

  chooseAddress() {
    wx.navigateTo({ url: "/pages/addresses/list?select=1" })
  },
  openLogin() { wx.navigateTo({ url: "/pages/auth/login" }) },

  pay() {
    if (this.data.paying) return
    if (!this.data.address) return wx.showToast({ title: "请先填写收货地址", icon: "none" })
    notifications.requestOrderNotifications()
    if (!runtime.demoMode) {
      this.setData({ paying: true })
      api.createOrder({ items: this.data.items.map((item) => ({ productId: item.productId, skuId: item.skuId, quantity: item.quantity })), address: this.data.address, prescriptionId: this.data.prescriptionId, patientId: this.data.patientId, promoterId: wx.getStorageSync("jz_promoter_id") || undefined, idempotencyKey: this.data.idempotencyKey }).then(async (order) => {
        if (this.data.fromCart) store.clearCart()
        try {
          const payment = await api.createWechatPayment({ orderId: order.id })
          if (!payment || payment.mode !== "real") throw new Error("微信支付暂未配置，请联系管理员处理")
          await new Promise((resolve, reject) => wx.requestPayment({ timeStamp: payment.timeStamp, nonceStr: payment.nonceStr, package: payment.packageValue, signType: payment.signType || "RSA", paySign: payment.paySign, success: resolve, fail: reject }))
          wx.redirectTo({ url: `/pages/orders/detail?id=${order.id}` })
        } catch (error) {
          wx.showToast({ title: error.message || "支付未完成，请在订单中重试", icon: "none" })
          setTimeout(() => wx.redirectTo({ url: `/pages/orders/detail?id=${order.id}` }), 700)
        }
      }).catch((error) => wx.showToast({ title: error.message || "订单提交失败，请重试", icon: "none" })).finally(() => this.setData({ paying: false }))
      return
    }
    const order = store.createOrder({ items: this.data.items, address: this.data.address, fromCart: this.data.fromCart, prescriptionId: this.data.prescriptionId, promoter: wx.getStorageSync("jz_promoter_id") || null })
    wx.showModal({ title: "模拟支付", content: `本次支付 ¥${order.totalAmount.toFixed(2)}，不会产生真实扣款。`, confirmText: "确认支付", success: (res) => {
      if (!res.confirm) return
      store.updateOrder(order.id, "pay")
      wx.redirectTo({ url: `/pages/orders/detail?id=${order.id}&paid=1` })
    } })
  }
})
