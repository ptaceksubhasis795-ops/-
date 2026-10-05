const configuration = {
  // Development connects to the local API so admin content changes appear in the mini program.
  // Point apiBaseUrl to the production HTTPS domain before release.
  environment: "development",
  demoMode: false,
  apiBaseUrl: "http://127.0.0.1:3002/api/v1",
  productionApiBaseUrl: "",
  apiTimeout: 8000,
  subscribeTemplateIds: {
    orderStatus: "",
    prescriptionStatus: "",
    shippingStatus: ""
  }
}

let wechatEnvironment = "develop"
try {
  if (typeof wx !== "undefined" && typeof wx.getAccountInfoSync === "function") wechatEnvironment = wx.getAccountInfoSync().miniProgram.envVersion
} catch (error) { wechatEnvironment = "develop" }
const production = configuration.environment === "production" || wechatEnvironment === "release" || wechatEnvironment === "trial"

module.exports = Object.assign({}, configuration, {
  environment: production ? "production" : "development",
  demoMode: production ? false : configuration.demoMode,
  apiBaseUrl: production ? configuration.productionApiBaseUrl : configuration.apiBaseUrl
})
