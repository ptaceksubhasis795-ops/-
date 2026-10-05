const runtime = require("../config/runtime");

const ERROR_MESSAGES = {
  400: "提交的信息不完整",
  401: "登录已过期，请重新登录",
  403: "当前账号没有操作权限",
  404: "要查看的内容不存在",
  409: "请求正在处理中，请稍后查看状态",
  429: "操作太频繁，请稍后再试",
  500: "服务暂时不可用，请稍后重试",
};

function errorFromResponse(response) {
  const payload = response && response.data;
  const rawMessage = payload && (payload.message || payload.error);
  const message = Array.isArray(rawMessage) ? rawMessage.join("，") : rawMessage;
  const error = new Error(message || ERROR_MESSAGES[response.statusCode] || "网络请求失败");
  error.statusCode = response.statusCode;
  error.code = payload && payload.code;
  error.payload = payload;
  return error;
}

function request(path, options = {}) {
  const retryCount = Number(options.retryCount === undefined ? 1 : options.retryCount);
  const method = options.method || "GET";
  const attempt = (remaining) => new Promise((resolve, reject) => {
    if (runtime.environment === "production" && !/^https:/.test(runtime.apiBaseUrl)) {
      const error = new Error("生产环境必须配置安全的 HTTPS 服务地址");
      error.code = "INVALID_PRODUCTION_API_URL";
      reject(error);
      return;
    }
    if (runtime.demoMode) {
      const error = new Error("当前为开发演示模式");
      error.code = "DEMO_MODE";
      reject(error);
      return;
    }
    const token = wx.getStorageSync("jz_access_token");
    const publicRequest = path.indexOf("/catalog/") === 0 || path.indexOf("/content/") === 0 || path === "/auth/wechat/login" || path === "/health";
    if (!publicRequest && !token) {
      const error = new Error("请先登录");
      error.code = "LOGIN_REQUIRED";
      error.statusCode = 401;
      reject(error);
      return;
    }
    wx.request({
      url: `${runtime.apiBaseUrl}${path}`,
      method,
      data: options.data,
      timeout: runtime.apiTimeout,
      header: Object.assign(
        { "content-type": "application/json" },
        token ? { Authorization: `Bearer ${token}` } : {},
        options.header || {},
      ),
      success: (response) => {
        if (response.statusCode >= 200 && response.statusCode < 300) {
          const value = response.data && response.data.data !== undefined ? response.data.data : response.data;
          resolve(value);
          return;
        }
        const error = errorFromResponse(response);
        if (error.statusCode === 401) {
          wx.removeStorageSync("jz_access_token");
          wx.removeStorageSync("jz_user");
          wx.removeStorageSync("jz_open_id");
        }
        reject(error);
      },
      fail: (reason) => {
        if (remaining > 0 && method === "GET") {
          setTimeout(() => attempt(remaining - 1).then(resolve, reject), 250);
          return;
        }
        const error = new Error("网络连接失败，请检查网络后重试");
        error.code = reason && reason.errMsg;
        reject(error);
      },
    });
  });
  return attempt(retryCount);
}

function requireLogin() {
  if (!wx.getStorageSync("jz_access_token")) {
    const error = new Error("请先登录");
    error.code = "LOGIN_REQUIRED";
    throw error;
  }
}

function uploadFile(filePath, purpose) {
  return new Promise((resolve, reject) => {
    if (runtime.environment === "production" && !/^https:/.test(runtime.apiBaseUrl)) return reject(new Error("生产环境必须配置安全的 HTTPS 服务地址"));
    if (runtime.demoMode) {
      const error = new Error("当前为开发演示模式");
      error.code = "DEMO_MODE";
      reject(error);
      return;
    }
    const token = wx.getStorageSync("jz_access_token");
    if (!token) {
      const error = new Error("请先登录");
      error.code = "LOGIN_REQUIRED";
      reject(error);
      return;
    }
    wx.uploadFile({
      url: `${runtime.apiBaseUrl}/files`,
      filePath,
      name: "file",
      formData: { purpose },
      header: { Authorization: `Bearer ${token}` },
      timeout: runtime.apiTimeout,
      success: (response) => {
        let payload;
        try { payload = JSON.parse(response.data || "{}"); } catch (error) { payload = {}; }
        if (response.statusCode >= 200 && response.statusCode < 300) {
          resolve(payload.data !== undefined ? payload.data : payload);
          return;
        }
        reject(errorFromResponse({ statusCode: response.statusCode, data: payload }));
      },
      fail: () => reject(new Error("文件上传失败，请检查网络后重试")),
    });
  });
}

function downloadFile(fileId, filePath) {
  if (runtime.environment === "production" && !/^https:/.test(runtime.apiBaseUrl)) return Promise.reject(new Error("生产环境必须配置安全的 HTTPS 服务地址"));
  const token = wx.getStorageSync("jz_access_token");
  if (!token) return Promise.reject(new Error("请先登录"));
  return new Promise((resolve, reject) => wx.downloadFile({
    url: `${runtime.apiBaseUrl}/files/${encodeURIComponent(fileId)}`,
    filePath,
    header: { Authorization: `Bearer ${token}` },
    timeout: runtime.apiTimeout,
    success: (response) => response.statusCode >= 200 && response.statusCode < 300 ? resolve(response.tempFilePath) : reject(errorFromResponse(response)),
    fail: () => reject(new Error("文件下载失败，请稍后重试")),
  }));
}

function list(path, query) {
  const params = Object.keys(query || {}).filter((key) => query[key] !== undefined && query[key] !== "").map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(query[key])}`).join("&");
  return request(`${path}${params ? `?${params}` : ""}`);
}

function parseQueryString(value) {
  return String(value || "").split("&").filter(Boolean).reduce((result, part) => {
    const separator = part.indexOf("=");
    const key = separator >= 0 ? part.slice(0, separator) : part;
    const raw = separator >= 0 ? part.slice(separator + 1) : "";
    result[decodeURIComponent(key)] = decodeURIComponent(raw);
    return result;
  }, {});
}

module.exports = {
  runtime,
  request,
  requireLogin,
  uploadFile,
  downloadFile,
  getProducts: (query) => list("/catalog/products", typeof query === "string" ? parseQueryString(query) : query),
  getArticles: (query) => list("/content/articles", query),
  getBanners: () => request("/content/banners"),
  getOrders: (query) => list("/orders", query),
  getOrder: (id) => request(`/orders/${encodeURIComponent(id)}`),
  getLogistics: (id) => request(`/orders/${encodeURIComponent(id)}/logistics`),
  previewOrder: (data) => request("/orders/preview", { method: "POST", data }),
  orderAction: (id, action, data) => request(`/orders/${encodeURIComponent(id)}/${action}`, { method: "POST", data }),
  createWechatPayment: (data) => { const payload = Object.assign({}, data || {}); delete payload.openId; delete payload.notifyUrl; return request("/payments/wechat/jsapi", { method: "POST", data: payload }); },
  getPrescriptions: () => request("/prescriptions"),
  submitConsultation: (data) => request("/prescriptions/consultations", { method: "POST", data }),
  getPatients: () => request("/patients"),
  savePatient: (data) => request("/patients", { method: "POST", data }),
  deletePatient: (id) => request(`/patients/${encodeURIComponent(id)}/delete`, { method: "POST" }),
  getAddresses: () => request("/addresses"),
  saveAddress: (data) => request("/addresses", { method: "POST", data }),
  deleteAddress: (id) => request(`/addresses/${encodeURIComponent(id)}/delete`, { method: "POST" }),
  createOrder: (data) => request("/orders", { method: "POST", data, header: { "Idempotency-Key": data.idempotencyKey || `mini-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` } }),
  submitPrescription: (data) => request("/prescriptions", { method: "POST", data }),
  submitAftersale: (data) => request("/aftersales", { method: "POST", data }),
  submitInvoice: (data) => request("/invoices", { method: "POST", data }),
  getInvoices: (orderId) => list("/invoices", orderId ? { orderId } : undefined),
  getAftersales: (orderId) => list("/aftersales", orderId ? { orderId } : undefined),
  getPromoAssets: () => request("/sales/promo-assets"),
  getSalesOverview: () => request("/sales/overview"),
  getSalesSummary: () => request("/sales/summary"),
  getSalesNetwork: () => request("/sales/network"),
  getPromotionEligibility: () => request("/sales/eligibility"),
  getPromotionApplication: () => request("/members/promotion-application"),
  applyPromotion: () => request("/members/promotion-application", { method: "POST" }),
  getSalesPerformance: (query) => list("/sales/performance", query),
  getSalesRewards: (query) => list("/sales/rewards", query),
  bindReferral: (promoterId) => request("/sales/referrals", { method: "POST", data: { promoterId } }),
  createAgentOrderDraft: (data) => request("/sales/order-drafts", { method: "POST", data }),
  getAgentOrderDraft: (token) => request(`/order-drafts/${encodeURIComponent(token)}`),
  confirmAgentOrderDraft: (token, data) => request(`/order-drafts/${encodeURIComponent(token)}/confirm`, { method: "POST", data }),
  createWithdrawal: (data) => request("/withdrawals", { method: "POST", data }),
  getWithdrawals: () => request("/withdrawals"),
  getMemberApplication: () => request("/members/application"),
  applyMember: (data) => request("/members/apply", { method: "POST", data }),
  saveHealthConsent: (data) => request("/consents/health", { method: "POST", data }),
  revokeHealthConsent: (data) => request("/consents/health/revoke", { method: "POST", data }),
  getMe: () => request("/me"),
  bindWechatPhone: (data) => request("/auth/wechat/phone", { method: "POST", data }),
};
