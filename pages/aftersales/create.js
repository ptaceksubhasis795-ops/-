const api = require("../../services/api");
const runtime = require("../../config/runtime");

const STATUS_TEXT = { pending_review: "待审核", approved: "已同意", rejected: "已拒绝", refunding: "退款处理中", refunded: "已退款", failed: "处理失败" };
function decorateStatus(item) { return item ? Object.assign({}, item, { statusText: item.statusText || STATUS_TEXT[item.status] || "处理中" }) : item }

Page({
  data: {
    orderId: "",
    reason: "",
    reasons: ["未收到货", "商品质量问题", "商品破损", "其他"],
    submitted: false,
    note: "",
    filePath: "",
    loading: false,
    errorMessage: "",
    result: null,
  },
  onLoad(options) {
    options = options || {}
    this.setData({ orderId: options.orderId || "" });
    if (!runtime.demoMode && !wx.getStorageSync("jz_access_token")) return this.setData({ errorMessage: "请先登录后申请售后" })
    if (!runtime.demoMode && options.orderId) api.getAftersales(options.orderId).then((items) => { if (items && items[0]) this.setData({ submitted: true, result: decorateStatus(items[0]) }) }).catch((error) => this.setData({ errorMessage: error.message || "售后状态加载失败" }))
  },
  reasonChange(event) {
    this.setData({ reason: this.data.reasons[event.detail.value] });
  },
  input(event) { this.setData({ [event.currentTarget.dataset.field]: event.detail.value }) },
  chooseImage() { wx.chooseImage({ count: 3, sizeType: ["compressed"], sourceType: ["album", "camera"], success: (res) => this.setData({ filePath: (res.tempFilePaths || [])[0] || "" }), fail: () => wx.showToast({ title: "未选择图片", icon: "none" }) }) },
  submit() {
    if (!this.data.reason)
      return wx.showToast({ title: "请选择售后原因", icon: "none" });
    if (!runtime.demoMode) {
      this.setData({ loading: true, errorMessage: "" })
      const upload = this.data.filePath ? api.uploadFile(this.data.filePath, "aftersale") : Promise.resolve(null)
      return upload.then((file) => api.submitAftersale({ orderId: this.data.orderId, reason: this.data.reason, note: this.data.note, fileKey: file && (file.id || file.fileKey) })).then((result) => this.setData({ submitted: true, result: decorateStatus(result), loading: false })).catch((error) => this.setData({ loading: false, errorMessage: error.message || "提交失败，请稍后重试" }))
    }
    this.setData({ submitted: true, result: { statusText: "待审核" } });
  },
  back() {
    wx.navigateBack();
  },
});
