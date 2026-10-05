const store = require("../../services/store");
const api = require("../../services/api");
const runtime = require("../../config/runtime");

Page({
  data: {
    product: null,
    quantity: 1,
    hasPrescription: false,
    prescriptionId: "",
    selectedPatient: null,
    loading: true,
    errorMessage: "",
    productId: "",
    skus: [],
    selectedSkuId: "",
    selectedSku: null,
    skuNameText: "",
  },

  async onLoad(options) {
    options = options || { id: this.data.productId }
    this.setData({ productId: options.id || this.data.productId })
    this.setData({ loading: true, errorMessage: "" })
    const state = runtime.demoMode ? store.getState() : { patients: [] }
    let product
    let prescriptions = []
    try {
      if (runtime.demoMode) {
        product = store.getProduct(options.id)
        prescriptions = state.prescriptions || []
      } else {
        product = await api.request(`/catalog/products/${encodeURIComponent(options.id)}`)
        if (product && product.category === "prescription" && wx.getStorageSync("jz_access_token")) prescriptions = await api.getPrescriptions()
      }
    } catch (error) {
      return this.setData({ product: null, loading: false, errorMessage: error.message || "商品加载失败" })
    }
    const today = new Date().toISOString().slice(0, 10)
    const validPrescription = prescriptions.find((item) => item.status === "approved" && item.validUntil && String(item.validUntil).slice(0, 10) >= today)
    const configuredSkus = Array.isArray(product.skus) && product.skus.length ? product.skus.filter((item) => item.active !== false) : null
    const skus = configuredSkus || [{ id: `${product.id}-default`, name: product.unit || "默认规格", price: Number(product.price || 0), priceFen: Number(product.priceFen || Math.round(Number(product.price || 0) * 100)), stock: Number(product.stock || 0), active: true }]
    const selectedSku = skus[0] || null
    this.setData({
      product: Object.assign({}, product, { skus, selectedSku, displayPrice: selectedSku ? Number(selectedSku.price !== undefined ? selectedSku.price : Number(selectedSku.priceFen || 0) / 100).toFixed(2) : Number(product.price || 0).toFixed(2), displayStock: selectedSku ? Number(selectedSku.stock || 0) : 0, displayStockText: selectedSku ? String(Number(selectedSku.stock || 0)) : "暂无可售规格", registrationId: String(product.id || "").slice(-1) }),
      skus,
      selectedSkuId: selectedSku ? selectedSku.id : "",
      selectedSku,
      skuNameText: selectedSku ? selectedSku.name : product.unit || "暂无规格",
      hasPrescription: Boolean(validPrescription),
      prescriptionId: validPrescription ? validPrescription.id : "",
      selectedPatient: (state.patients || [])[0] || null,
      loading: false,
    });
  },

  retry() { return this.onLoad({ id: this.data.productId }) },

  changeQuantity(event) {
    const delta = Number(event.currentTarget.dataset.delta);
    const stockLimit = this.data.selectedSku && Number(this.data.selectedSku.stock) > 0 ? Number(this.data.selectedSku.stock) : 99;
    const next = Math.max(1, Math.min(this.data.quantity + delta, Math.min(99, stockLimit)));
    this.setData({ quantity: next });
  },

  chooseSku(event) {
    const skuId = event.currentTarget.dataset.id
    const selectedSku = this.data.skus.find((item) => String(item.id) === String(skuId))
    if (!selectedSku) return
    const product = Object.assign({}, this.data.product, { selectedSku, displayPrice: Number(selectedSku.price !== undefined ? selectedSku.price : Number(selectedSku.priceFen || 0) / 100).toFixed(2), displayStock: Number(selectedSku.stock || 0), displayStockText: String(Number(selectedSku.stock || 0)) })
    this.setData({ selectedSkuId: selectedSku.id, selectedSku, skuNameText: selectedSku.name, product, quantity: Math.min(this.data.quantity, Math.max(1, Number(selectedSku.stock || 1))) })
  },

  addCart() {
    if (!this.data.product) return wx.showToast({ title: "商品信息未加载", icon: "none" })
    if (!runtime.demoMode) {
      try { api.requireLogin() } catch (error) { return wx.navigateTo({ url: "/pages/auth/login" }) }
    }
    if (
      this.data.product.category === "prescription" &&
      !this.data.hasPrescription
    ) {
      return wx.showModal({
        title: "需要有效处方",
        content: "请先上传线下处方或进入问诊开方。",
        confirmText: "去上传",
        success: (res) => {
          if (res.confirm)
            wx.navigateTo({ url: "/pages/prescriptions/upload" });
        },
      });
    }
    if (!this.data.selectedSku || !this.data.selectedSku.id || Number(this.data.selectedSku.stock || 0) < this.data.quantity) return wx.showToast({ title: "所选规格暂不可购买", icon: "none" })
    store.addToCart(this.data.product.id, this.data.quantity, this.data.product, this.data.selectedSku);
    wx.showToast({ title: "已加入购物车", icon: "success" });
  },

  buyNow() {
    if (!this.data.product) return wx.showToast({ title: "商品信息未加载", icon: "none" })
    if (!runtime.demoMode) {
      try { api.requireLogin() } catch (error) { return wx.navigateTo({ url: "/pages/auth/login" }) }
    }
    if (
      this.data.product.category === "prescription" &&
      !this.data.hasPrescription
    ) {
      return wx.navigateTo({ url: "/pages/prescriptions/upload" });
    }
    if (!this.data.selectedSku || !this.data.selectedSku.id || Number(this.data.selectedSku.stock || 0) < this.data.quantity) return wx.showToast({ title: "所选规格暂不可购买", icon: "none" })
    wx.navigateTo({
      url: `/pages/checkout/index?productId=${encodeURIComponent(this.data.product.id)}&skuId=${encodeURIComponent(this.data.selectedSku.id)}&quantity=${this.data.quantity}&prescriptionId=${encodeURIComponent(this.data.prescriptionId || "")}`,
    });
  },

  openPrescription() {
    wx.navigateTo({ url: "/pages/prescriptions/list" });
  },

  onShareAppMessage() {
    const promoter = wx.getStorageSync("jz_promoter_id")
    const suffix = promoter ? `&promoter=${encodeURIComponent(promoter)}` : ""
    return {
      title: this.data.product ? this.data.product.name : "九转健康商品",
      path: `/pages/shop/detail?id=${this.data.product ? this.data.product.id : ""}${suffix}`,
    };
  },
});
