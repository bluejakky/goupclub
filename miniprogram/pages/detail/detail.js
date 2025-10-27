Page({
  data: {
    id: null,
    detail: {
      images: [
        'https://picsum.photos/800/450?random=11',
        'https://picsum.photos/800/450?random=12'
      ],
      title: '英语角交流',
      hot: true,
      top: true,
      start: '2025-10-10 19:00',
      end: '2025-10-10 21:00',
      place: '市图书馆',
      signed: 12,
      max: 20,
      flags: ['🇨🇳','🇺🇸','🇪🇸','🇫🇷'],
      price: 20,
      status: '未满员且可报名',
      content: ['自由交流与口语练习', '主题分享：旅行英语', '报名分组：外国人/中国人']
    },
    ctaText: '报名 ¥20'
  },
  onLoad(query) {
    const id = query?.id || null;
    this.setData({ id });
    this.updateCTA();
  },
  updateCTA() {
    const { detail } = this.data;
    let text = '';
    switch (detail.status) {
      case '未满员且可报名':
        text = detail.price > 0 ? `报名 ¥${detail.price}` : '免费报名';
        break;
      case '满员候补':
        text = detail.price > 0 ? `候补报名 ¥${detail.price}` : '候补报名';
        break;
      case '已报名':
        text = '已报名';
        break;
      default:
        text = '活动已结束';
    }
    this.setData({ ctaText: text });
  },
  onApply() {
    const { detail } = this.data;
    if (detail.status === '已报名' || detail.status === '已结束') return;
    if (detail.status === '满员候补') {
      wx.showModal({ title: '候补报名', content: '进入候补队列，是否继续？', success: (res) => {
        if (res.confirm) this.gotoPay();
      }});
      return;
    }
    this.gotoPay();
  },
  gotoPay() {
    const { id, detail } = this.data;
    const price = detail.price || 0;
    // 缓存活动详情，支付页可作为参数缺失的回退
    try { wx.setStorageSync('lastActivityDetail', detail); } catch (_) {}
    const title = encodeURIComponent(detail.title || '');
    const start = encodeURIComponent(detail.start || '');
    const end = encodeURIComponent(detail.end || '');
    const place = encodeURIComponent(detail.place || '');
    const image = encodeURIComponent((detail.images && detail.images[0]) || '');
    // 从本地用户信息提取 memberId（优先使用 memberId，其次 id）
    let memberIdParam = '';
    try {
      const user = wx.getStorageSync('user');
      const mid = Number(user?.memberId ?? user?.id ?? NaN);
      if (Number.isFinite(mid) && mid > 0) memberIdParam = `&memberId=${mid}`;
    } catch (_) {}
    wx.navigateTo({ url: `/pages/pay/pay?id=${id || ''}&price=${price}&title=${title}&start=${start}&end=${end}&place=${place}&image=${image}${memberIdParam}` });
  },
  onShareAppMessage() {
    const { detail } = this.data;
    return {
      title: detail.title,
      path: `/pages/detail/detail?id=${this.data.id || ''}`,
      imageUrl: detail.images?.[0]
    };
  }
});
