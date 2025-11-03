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
    filter: 'all',
    items: [],
    displayed: [],
    loading: false,
    cancelingId: null
  },
  onLoad() {
    if (!ensureLogin()) return
    this.refreshStatusList();
  },
  onShow() {
    if (!ensureLogin()) return
    this.refreshStatusList();
  },
  refreshStatusList() {
    this.setData({ loading: true });
    const handle = (list) => {
      const items = Array.isArray(list) ? list : [];
      this.setData({ items, loading: false }, () => this.applyFilter());
    };
    api.getRegistrationStatus()
      .then(handle)
      .catch(() => {
        this.setData({ loading: false });
        wx.showToast({ title: '获取报名状态失败', icon: 'none' });
      });
  },
  onFilterChange(e) {
    const value = e.detail.value || 'all';
    this.setData({ filter: value }, () => this.applyFilter());
  },
  applyFilter() {
    const { filter, items } = this.data;
    let list = items;
    if (filter === 'registered') list = items.filter(i => i.status === '已报名');
    else if (filter === 'waitlist') list = items.filter(i => i.status === '候补');
    this.setData({ displayed: list });
  },
  onCancel(e) {
    const id = Number(e.currentTarget.dataset.id);
    if (!Number.isFinite(id)) return;
    wx.showModal({
      title: '确认取消',
      content: '确认取消该报名吗？',
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ cancelingId: id });
        api.cancelRegistration(id).then(resp => {
          const ok = resp && resp.ok;
          if (ok) {
            wx.showToast({ title: '已取消报名', icon: 'success' });
            const items = (this.data.items || []).map(i => i.id === id ? { ...i, status: '候补' } : i);
            this.setData({ items, cancelingId: null }, () => this.applyFilter());
          } else {
            this.setData({ cancelingId: null });
            wx.showToast({ title: (resp && resp.message) || '取消失败', icon: 'none' });
          }
        }).catch(() => {
          this.setData({ cancelingId: null });
          wx.showToast({ title: '取消失败，请稍后重试', icon: 'none' });
        });
      }
    });
  }
});