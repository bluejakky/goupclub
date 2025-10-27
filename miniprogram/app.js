const ui = require('./utils/ui.js')

App({
  onLaunch() {
    // 可根据需要从 storage 读取设计模式开关
  },
  globalData: {
    // 图标管理（本地优先，未复制则用占位）
    icons: ui
  }
})