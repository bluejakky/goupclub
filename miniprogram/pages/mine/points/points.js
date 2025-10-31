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
    account: { balance: 0, locked: 0, updatedAt: null },
    transactions: [],
    filtered: [],
    last30Change: 0,
    filter: { direction: 'all', type: 'all', days: 30 },
    typeMap: { settlement: '活动结算入账', referral: '邀请奖励', spend: '积分支付', adjust: '调整' }
  },
  onLoad() {
    if (!ensureLogin()) return
    this.init()
  },
  onShow() { ensureLogin() },
  async init() {
    const me = wx.getStorageSync('user') || {}
    const memberId = Number(me.memberId || 0)
    if (!Number.isFinite(memberId) || memberId <= 0) {
      wx.showToast({ title: '用户信息缺失', icon: 'none' })
      return
    }
    try {
      const data = await api.getMemberPoints(memberId)
      const acc = data?.account || { balance: 0, locked: 0 }
      const tx = Array.isArray(data?.recent) ? data.recent : []
      this.setData({ account: acc, transactions: tx }, () => {
        this.applyFilters()
        this.calcLast30Change()
      })
    } catch (e) {
      wx.showToast({ title: '积分账户拉取失败', icon: 'none' })
    }
  },
  onFilterChange(e) {
    const key = e.currentTarget.dataset.key
    const value = e.detail?.value || e.currentTarget.dataset.value
    const next = { ...this.data.filter, [key]: value }
    this.setData({ filter: next }, () => this.applyFilters())
  },
  applyFilters() {
    const { transactions, filter } = this.data
    let list = transactions.slice()
    // 时间筛选
    if (filter.days !== 'all') {
      const days = Number(filter.days || 30)
      const start = Date.now() - days * 24 * 60 * 60 * 1000
      list = list.filter(t => new Date(t.createdAt).getTime() >= start)
    }
    // 收支方向
    if (filter.direction !== 'all') {
      const dir = filter.direction === 'income' ? 'credit' : 'debit'
      list = list.filter(t => t.direction === dir)
    }
    // 类型筛选
    if (filter.type !== 'all') {
      list = list.filter(t => t.type === filter.type)
    }
    this.setData({ filtered: list })
  },
  calcLast30Change() {
    const { transactions } = this.data
    const start = Date.now() - 30 * 24 * 60 * 60 * 1000
    const sum = transactions
      .filter(t => new Date(t.createdAt).getTime() >= start)
      .reduce((acc, t) => acc + (t.direction === 'credit' ? Number(t.amount || 0) : -Number(t.amount || 0)), 0)
    this.setData({ last30Change: sum })
  }
})