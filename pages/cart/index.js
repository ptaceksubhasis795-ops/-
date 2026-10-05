const store = require("../../services/store")

Page({
  data: { items: [], total: 0, freight: 0, subtotalText: "0.00", freightText: "包邮", totalText: "0.00", shippingGapText: "0.00" },

  onShow() {
    const items = store.getCart().map((item) => Object.assign({}, item, { cartKey: item.cartKey || `${item.productId}-${item.skuId || "default"}`, lineTotalText: (item.product.price * item.quantity).toFixed(2) }))
    const total = items.reduce((sum, item) => sum + item.product.price * item.quantity, 0)
    const freight = total >= 199 || total === 0 ? 0 : 8
    this.setData({ items, total, freight, subtotalText: total.toFixed(2), freightText: freight ? `¥${freight.toFixed(2)}` : "包邮", totalText: (total + freight).toFixed(2), shippingGapText: Math.max(0, 199 - total).toFixed(2) })
  },

  remove(event) {
    store.removeFromCart(event.currentTarget.dataset.id, event.currentTarget.dataset.skuId)
    this.onShow()
  },

  checkout() {
    if (!this.data.items.length) return wx.showToast({ title: "购物袋还是空的", icon: "none" })
    wx.navigateTo({ url: "/pages/checkout/index?fromCart=1" })
  },

  shop() {
    wx.switchTab({ url: "/pages/shop/list" })
  }
})
