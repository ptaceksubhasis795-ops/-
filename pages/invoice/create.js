const api = require("../../services/api");
const runtime = require("../../config/runtime");

const STATUS_TEXT = { pending: "待开票", issued: "已开票", failed: "开票失败" };
function decorateStatus(item) { return item ? Object.assign({}, item, { statusText: item.statusText || STATUS_TEXT[item.status] || "处理中" }) : item }

Page({
  data: { orderId: "", type: "个人", title: "", taxNo: "", submitted: false, loading: false, errorMessage: "", result: null },
  onLoad(options) {
    options = options || {}
    this.setData({ orderId: options.orderId || "" });
    if (!runtime.demoMode && !wx.getStorageSync("jz_access_token")) return this.setData({ errorMessage: "请先登录后申请发票" })
    if (!runtime.demoMode && options.orderId) api.getInvoices(options.orderId).then((items) => { if (items && items[0]) this.setData({ submitted: true, result: decorateStatus(items[0]) }) }).catch((error) => this.setData({ errorMessage: error.message || "发票状态加载失败" }))
  },
  typeChange(event) {
    this.setData({ type: event.detail.value === "1" ? "企业" : "个人" });
  },
  input(event) {
    this.setData({ [event.currentTarget.dataset.field]: event.detail.value });
  },
  submit() {
    if (!this.data.title)
      return wx.showToast({ title: "请填写发票抬头", icon: "none" });
    if (this.data.type === "企业" && !this.data.taxNo) return wx.showToast({ title: "请填写税号", icon: "none" })
    if (!runtime.demoMode) {
      this.setData({ loading: true, errorMessage: "" })
      return api.submitInvoice({ orderId: this.data.orderId, type: this.data.type === "企业" ? "company" : "personal", title: this.data.title, taxNo: this.data.taxNo }).then((result) => this.setData({ submitted: true, result: decorateStatus(result), loading: false })).catch((error) => this.setData({ loading: false, errorMessage: error.message || "提交失败，请稍后重试" }))
    }
    this.setData({ submitted: true, result: { statusText: "待开票" } });
  },
  back() {
    wx.navigateBack();
  },
});
