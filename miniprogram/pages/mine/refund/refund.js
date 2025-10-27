const api = require('../../utils/api.js')

function ensureLogin() {
  const token = wx.getStorageSync('token')
  if (!token) {
    wx.navigateTo({ url: '/pages/login/login' })
    return false
  }
  return true
}

Page({
  data: {
    records: []
  },

  async onLoad() {
    if (!ensureLogin()) return
    wx.showLoading({ title: '加载记录' })
    try {
      const list = await api.getRefundRecords()
      this.setData({ records: list })
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  onShow() {
    ensureLogin()
  },

  onView(e) {
    const id = Number(e.currentTarget.dataset.id)
    const record = this.data.records.find(r => r.id === id)
    if (!record) return
    wx.showModal({
      title: '退款详情',
      content: `${record.title}\n金额：¥${record.amount}\n方式：${record.method}\n状态：${record.status}`,
      showCancel: false
    })
  },

  onContact() {
    wx.showActionSheet({
      itemList: ['拨打客服电话', '复制客服微信']
    }).then(res => {
      if (res.tapIndex === 0) {
        wx.showToast({ title: '已拨打 400-000-0000', icon: 'none' })
      } else if (res.tapIndex === 1) {
        wx.setClipboardData({ data: 'GoUpService001' })
      }
    })
  }
})