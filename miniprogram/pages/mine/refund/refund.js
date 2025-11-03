const api = require('../../../utils/api.js')

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
    this.loadRecords()
  },

  onShow() {
    ensureLogin()
  },

  async loadRecords() {
    const me = wx.getStorageSync('user') || {}
    const memberId = Number(me.memberId || 0)
    if (!Number.isFinite(memberId) || memberId <= 0) {
      wx.showToast({ title: '用户信息缺失', icon: 'none' })
      return
    }
    wx.showLoading({ title: '加载记录' })
    try {
      const res = await api.getRefundRecords(memberId)
      const list = Array.isArray(res?.items) ? res.items.map(r => this.mapRefundRecord(r)) : (Array.isArray(res) ? res.map(r => this.mapRefundRecord(r)) : [])
      this.setData({ records: list })
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
      if (wx.stopPullDownRefresh) wx.stopPullDownRefresh()
    }
  },

  mapRefundRecord(r) {
    const providerMap = { wechat: '微信支付原路退回（仅退现金）', alipay: '支付宝原路退回（仅退现金）', internal: '仅退现金（积分不退回）', points: '仅退现金（积分不退回）' }
    const statusMap = { refunded: '成功', success: '成功', failed: '失败', pending: '处理中', processing: '处理中' }
    const amount = typeof r.amountCents === 'number' ? (r.amountCents / 100) : Number(r.amount || 0)
    const appliedAt = r.refundAt || r.appliedAt || r.createdAt
    let applyTime = ''
    try {
      applyTime = appliedAt ? new Date(appliedAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).replace(/\//g, '-') : ''
    } catch {}
    // 原状态：后端暂无原始报名状态字段，这里根据订单状态做近似展示
    const originalStatus = r.status === 'refunded' ? '已报名' : (r.originalStatus || '已报名')
    return {
      id: r.id,
      title: r.activityTitle || r.title || `订单 #${r.orderId || r.id}`,
      applyTime,
      originalStatus,
      amount,
      method: r.method || providerMap[r.provider || r.paymentMethod] || '仅退现金（积分不退回）',
      status: statusMap[r.status] || r.status || '处理中'
    }
  },

  onPullDownRefresh() {
    this.loadRecords()
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