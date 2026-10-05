const { products, articles, banners, defaultState } = require("./mock-data")
const runtime = require("../config/runtime")

const STORAGE_KEY = "jz_health_store_v1"

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function nowId(prefix) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000)}`
}

function readState() {
  try {
    const existing = wx.getStorageSync(STORAGE_KEY)
    return existing && existing.user ? existing : clone(defaultState)
  } catch (error) {
    return clone(defaultState)
  }
}

function writeState(state) {
  wx.setStorageSync(STORAGE_KEY, state)
  return state
}

function currentUserKey(state) {
  const user = wx.getStorageSync("jz_user")
  return String((user && user.id) || (runtime.demoMode && state.user && state.user.id) || "anonymous")
}

function cartForState(state) {
  if (!state.cartByUser || typeof state.cartByUser !== "object") state.cartByUser = {}
  const key = currentUserKey(state)
  if (!Array.isArray(state.cartByUser[key])) {
    // 仅把旧版本的演示购物袋迁移给演示账号，避免跨用户共享旧数据。
    state.cartByUser[key] = key === "u-demo" && Array.isArray(state.cart) ? state.cart : []
  }
  return state.cartByUser[key]
}

function ensureSeeded() {
  const current = readState()
  if (!current.articles || current.articles.length === 0) current.articles = clone(articles)
  const existingBanners = Array.isArray(current.banners) ? current.banners : []
  current.banners = clone(banners).map((seed) => {
    const existing = existingBanners.find((item) => item.id === seed.id) || {}
    return Object.assign({}, seed, existing, {
      image: existing.image || seed.image,
      overlay: existing.overlay || seed.overlay
    })
  })
  writeState(current)
}

function getProducts(filters = {}) {
  const keyword = (filters.keyword || "").trim().toLowerCase()
  return products.filter((item) => {
    const categoryMatch = !filters.category || filters.category === "all" || item.category === filters.category
    const keywordMatch = !keyword || `${item.name}${item.subtitle}${item.description}`.toLowerCase().includes(keyword)
    return categoryMatch && keywordMatch
  })
}

function getProduct(id) {
  return products.find((item) => item.id === id) || products[0]
}

function getState() {
  return readState()
}

function update(mutator) {
  const state = readState()
  mutator(state)
  writeState(state)
  return state
}

function getCart() {
  return cartForState(readState())
}

function addToCart(productId, quantity = 1, productOverride, skuOverride) {
  const product = productOverride || getProduct(productId)
  const sku = skuOverride || product.selectedSku || (Array.isArray(product.skus) ? product.skus[0] : null)
  const cartProduct = Object.assign({}, product, sku ? { price: Number(sku.price !== undefined ? sku.price : Number(sku.priceFen || 0) / 100), unit: sku.name || product.unit, selectedSku: sku } : {})
  const state = readState()
  const cart = cartForState(state)
  const item = cart.find((entry) => entry.productId === product.id && String(entry.skuId || "") === String(sku && sku.id || ""))
  if (item) {
    item.quantity += quantity
    item.product = cartProduct
  } else cart.push({ productId: product.id, skuId: sku && sku.id, skuName: sku && sku.name, quantity, product: cartProduct, cartKey: `${product.id}-${sku && sku.id || "default"}` })
  writeState(state)
  return cart
}

function removeFromCart(productId, skuId) {
  const state = readState()
  const cart = cartForState(state).filter((item) => item.productId !== productId || (skuId !== undefined && String(item.skuId || "") !== String(skuId)))
  state.cartByUser[currentUserKey(state)] = cart
  writeState(state)
  return cart
}

function clearCart() {
  const state = readState()
  state.cartByUser[currentUserKey(state)] = []
  writeState(state)
  return state.cartByUser[currentUserKey(state)]
}

function createOrder(input) {
  const state = readState()
  const items = (input.items || []).map((entry) => {
    const product = getProduct(entry.productId)
    const sku = Array.isArray(product.skus) ? product.skus.find((item) => item.id === entry.skuId) : null
    return { productId: product.id, skuId: entry.skuId, name: product.name, quantity: entry.quantity, unitPrice: sku ? Number(sku.price || 0) : product.price, category: product.category }
  })
  const amount = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0)
  const order = {
    id: nowId("JZ"),
    orderNo: `JZ${Date.now().toString().slice(-10)}`,
    items,
    amount,
    freight: amount >= 199 ? 0 : 8,
    totalAmount: amount + (amount >= 199 ? 0 : 8),
    status: "pending_payment",
    statusText: "待支付",
    address: input.address || state.addresses.find((item) => item.isDefault) || null,
    createdAt: new Date().toISOString(),
    promoter: input.promoter || null,
    prescriptionId: input.prescriptionId || null
  }
  state.orders.unshift(order)
  if (input.fromCart) state.cartByUser = Object.assign({}, state.cartByUser, { [currentUserKey(state)]: [] })
  writeState(state)
  return order
}

function updateOrder(id, action) {
  return update((state) => {
    const order = state.orders.find((item) => item.id === id)
    if (!order) return
    if (action === "cancel") { order.status = "cancelled"; order.statusText = "已取消" }
    if (action === "pay") { order.status = "paid"; order.statusText = "待发货"; order.paidAt = new Date().toISOString() }
    if (action === "receive") { order.status = "completed"; order.statusText = "已完成"; order.receivedAt = new Date().toISOString() }
  }).orders.find((item) => item.id === id)
}

function submitPrescription(input) {
  const prescription = {
    id: nowId("RX"),
    patientName: input.patientName,
    source: "线下处方",
    status: "pending_review",
    statusText: "待审核",
    validUntil: "待审核",
    itemName: "待药师确认",
    fileName: input.fileName || "处方图片"
  }
  return update((state) => { state.prescriptions.unshift(prescription) }).prescriptions[0]
}

function applyMember(input) {
  return update((state) => {
    state.memberApplication = {
      id: nowId("MEM"),
      name: input.name,
      phone: input.phone,
      recommender: input.recommender || "无",
      status: "pending",
      statusText: "待审核",
      createdAt: new Date().toISOString()
    }
  }).memberApplication
}

module.exports = {
  STORAGE_KEY,
  ensureSeeded,
  getState,
  getProducts,
  getProduct,
  getCart,
  addToCart,
  removeFromCart,
  clearCart,
  createOrder,
  updateOrder,
  submitPrescription,
  applyMember,
  update
}
