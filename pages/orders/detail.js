const store = require("../../services/store");
const api = require("../../services/api");
const runtime = require("../../config/runtime");

const ORDER_STATUS = { pending_payment: "待支付", paid: "待发货", shipped: "待收货", completed: "已完成", cancelled: "已取消", refunded: "已退款" };
function localPresentation(productId) { return runtime.demoMode ? (store.getProducts({ category: "all" }).find((product) => product.id === productId) || {}) : {}; }

Page({
  data: { order: null, orderId: "", loading: true, errorMessage: "", aftersales: [], invoices: [] },

  async onLoad(options) {
    options = options || { id: this.data.orderId }
    this.setData({ orderId: options.id || this.data.orderId, loading: true, errorMessage: "" })
    try {
      let order
      if (runtime.demoMode) order = (store.getState().orders || []).find((item) => item.id === options.id)
      else order = await api.getOrder(options.id)
      if (!order) return this.setData({ order: null, loading: false, errorMessage: "订单不存在或无权查看" })
      let aftersales = []
      let invoices = []
      let logistics = null
      if (!runtime.demoMode) {
        aftersales = await api.getAftersales(options.id).catch(() => [])
        invoices = await api.getInvoices(options.id).catch(() => [])
        logistics = await api.getLogistics(options.id).catch(() => null)
      }
      const decorated = this.decorate(order)
      if (logistics && decorated && logistics.nodes) decorated.logistics = logistics
      this.setData({ order: decorated, aftersales, invoices, loading: false })
    } catch (error) {
      this.setData({ order: null, loading: false, errorMessage: error.message || "订单加载失败" })
    }
  },

  retry() { return this.onLoad({ id: this.data.orderId }) },
  openLogin() { wx.navigateTo({ url: "/pages/auth/login" }) },

  decorate(order) {
    if (!order) return null;
    const total = order.totalAmount !== undefined ? Number(order.totalAmount) : Number(order.totalAmountFen || 0) / 100
    const freight = order.freight !== undefined ? Number(order.freight) : Number(order.freightFen || 0) / 100
    return Object.assign({}, order, {
      statusText: order.statusText || ORDER_STATUS[order.status] || "处理中",
      totalText: total.toFixed(2),
      subtotalText: (total - freight).toFixed(2),
      freightText: freight ? `¥${freight.toFixed(2)}` : "包邮",
      items: (order.items || []).map((item) =>
        Object.assign({}, item, {
          cartKey: `${item.productId}-${item.skuId || "default"}`,
          unitPriceText: Number(item.unitPrice !== undefined ? item.unitPrice : Number(item.unitPriceFen || 0) / 100).toFixed(2),
          lineTotalText: (Number(item.unitPrice !== undefined ? item.unitPrice : Number(item.unitPriceFen || 0) / 100) * Number(item.quantity || 0)).toFixed(2),
          image: item.image || localPresentation(item.productId).image,
          overlay: item.overlay || localPresentation(item.productId).overlay,
          color: item.color || localPresentation(item.productId).color,
          category: item.category || localPresentation(item.productId).category,
        }),
      ),
    });
  },

  pay() {
    if (!runtime.demoMode)
      return api.createWechatPayment({ orderId: this.data.order.id }).then((payment) => {
        if (!payment || payment.mode !== "real") throw new Error("微信支付暂未配置，请联系管理员处理")
        return new Promise((resolve, reject) => wx.requestPayment({ timeStamp: payment.timeStamp, nonceStr: payment.nonceStr, package: payment.packageValue, signType: payment.signType || "RSA", paySign: payment.paySign, success: resolve, fail: reject })).then(() => this.onLoad({ id: this.data.order.id }))
      }).catch((error) => wx.showToast({ title: error.errMsg && error.errMsg.indexOf("cancel") >= 0 ? "已取消支付" : (error.message || "支付失败"), icon: "none" }));
    wx.showModal({
      title: "模拟支付",
      content: `本次支付 ¥${this.data.order.totalText}，不会产生真实扣款。`,
      confirmText: "确认支付",
      success: (res) => {
        if (res.confirm) {
          const order = store.updateOrder(this.data.order.id, "pay");
          this.setData({ order: this.decorate(order) });
        }
      },
    });
  },

  cancel() {
    if (!runtime.demoMode)
      return api
        .orderAction(this.data.order.id, "cancel")
        .then((order) => this.setData({ order: this.decorate(order) }))
        .catch(() => wx.showToast({ title: "取消失败", icon: "none" }));
    wx.showModal({
      title: "取消订单",
      content: "确定取消这笔未支付订单吗？",
      confirmText: "取消订单",
      success: (res) => {
        if (res.confirm)
          this.setData({
            order: store.updateOrder(this.data.order.id, "cancel"),
          });
      },
    });
  },

  receive() {
    if (!runtime.demoMode)
      return api
        .orderAction(this.data.order.id, "receive")
        .then((order) => {
          this.setData({ order: this.decorate(order) });
          wx.showToast({ title: "已确认收货", icon: "success" });
        })
        .catch(() => wx.showToast({ title: "操作失败", icon: "none" }));
    const order = store.updateOrder(this.data.order.id, "receive");
    this.setData({ order: this.decorate(order) });
    wx.showToast({ title: "已确认收货", icon: "success" });
  },

  aftersale() {
    wx.navigateTo({
      url: `/pages/aftersales/create?orderId=${this.data.order.id}`,
    });
  },
  invoice() {
    wx.navigateTo({
      url: `/pages/invoice/create?orderId=${this.data.order.id}`,
    });
  },
  backOrders() {
    wx.navigateBack();
  },
});
