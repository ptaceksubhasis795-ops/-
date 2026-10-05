const runtime = require("../config/runtime")

function requestOrderNotifications() {
  const tmplIds = Object.values(runtime.subscribeTemplateIds || {}).filter(Boolean)
  if (!tmplIds.length || !wx.requestSubscribeMessage) return Promise.resolve({ enabled: false })
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds,
      success: (result) => resolve({ enabled: true, result }),
      fail: (error) => resolve({ enabled: true, error })
    })
  })
}

module.exports = { requestOrderNotifications }
