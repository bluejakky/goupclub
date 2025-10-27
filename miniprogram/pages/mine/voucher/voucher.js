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
    tab: 'available',
    available: [
      { id: 9001, amount: 50, title: '新用户赠送', expire: '2025-12-31' },
      { id: 9002, amount: 30, title: '活动返利', expire: '2025-11-30' }
    ],
    expired: [
      { id: 9101, amount: 20, title: '节日优惠', expire: '2025-09-01' }
    ],
    totalAvailable: 0
  },
  onLoad() {
    if (!ensureLogin()) return
    this.updateTotal();
  },
  onShow() {
    ensureLogin()
  },
  onTab(e) {
    const tab = e.currentTarget.dataset.tab || 'available';
    this.setData({ tab });
  },
  updateTotal() {
    const total = (this.data.available || []).reduce((sum, v) => sum + Number(v.amount || 0), 0);
    this.setData({ totalAvailable: total });
  }
});