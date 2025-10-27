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
    items: [
      {
        id: 101,
        title: '英语角交流',
        timeRange: '2025-10-10 19:00 - 21:00',
        place: '市图书馆',
        cover: 'https://picsum.photos/220/160?random=21',
        status: '已报名',
        started: false
      },
      {
        id: 102,
        title: '志愿者公园清洁',
        timeRange: '2025-10-12 09:00 - 12:00',
        place: '城市公园',
        cover: 'https://picsum.photos/220/160?random=22',
        status: '候补',
        started: false
      },
      {
        id: 103,
        title: '西班牙语学习分享',
        timeRange: '2025-10-01 19:00 - 20:30',
        place: '社区活动室',
        cover: 'https://picsum.photos/220/160?random=23',
        status: '已报名',
        started: true
      }
    ],
    displayed: []
  },
  onLoad() {
    if (!ensureLogin()) return
    this.applyFilter();
  },
  onShow() {
    ensureLogin()
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
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '确认取消',
      content: '确认取消该报名吗？',
      success: (res) => {
        if (res.confirm) {
          wx.showToast({ title: '已取消报名', icon: 'success' });
          const items = this.data.items.map(i => i.id === id ? { ...i, status: '候补' } : i);
          this.setData({ items }, () => this.applyFilter());
        }
      }
    });
  }
});