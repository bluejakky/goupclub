const api = require('../../utils/api.js')
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
    ctaText: '报名 ¥20',
    applyDisabled: false
  },
  onLoad(query) {
    const id = query?.id || null;
    let detail = this.data.detail;
    let cached = null;
    try {
      cached = wx.getStorageSync('lastActivityDetail') || null;
      if (cached && (cached.title || cached.mainImage)) {
        detail = {
          images: Array.isArray(cached.images) && cached.images.length ? cached.images : (cached.mainImage ? [cached.mainImage] : detail.images),
          title: cached.title || detail.title,
          hot: !!cached.isHot,
          top: !!cached.isTop,
          start: cached.start || detail.start,
          end: cached.end || detail.end,
          place: cached.place || detail.place,
          signed: Number(cached.enrolled ?? detail.signed),
          max: Number(cached.max ?? detail.max),
          flags: Array.isArray(cached.groups) ? cached.groups : detail.flags,
          price: Number(cached.price ?? detail.price),
          status: cached.status || detail.status,
          content: Array.isArray(cached.content) ? cached.content : (typeof cached.content === 'string' ? [cached.content] : detail.content)
        };
      }
    } catch (_) {}
    // 去重国旗，避免重复显示
    const flags = Array.isArray(detail.flags) ? detail.flags.filter((f, i, arr) => arr.indexOf(f) === i) : [];
    const hasDetail = !!(cached && (cached.title || cached.mainImage || (Array.isArray(cached.images) && cached.images.length > 0)));
    this.setData({ id, detail: { ...detail, flags }, hasRealData: hasDetail });
    this.updateCTA();
    try {
      wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage', 'shareTimeline'] });
    } catch (_) {}
    // 拉取最新详情，覆盖缓存，确保后台修改能反映
    if (id) {
      wx.showLoading({ title: '加载详情' })
      api.getActivityById(id).then(a => {
        let images = []
        try {
          images = Array.isArray(a.images) ? a.images : (a.images ? JSON.parse(a.images) : [])
        } catch (_) {}
        const flags2 = Array.isArray(a.groups) ? a.groups.filter((f, i, arr) => arr.indexOf(f) === i) : flags
        const fresh = {
          images: images.length ? images : this.data.detail.images,
          title: a.title || this.data.detail.title,
          hot: !!a.isHot,
          top: !!a.isTop,
          start: a.start || this.data.detail.start,
          end: a.end || this.data.detail.end,
          place: a.place || this.data.detail.place,
          signed: Number(a.enrolled ?? this.data.detail.signed),
          max: Number(a.max ?? this.data.detail.max),
          flags: flags2,
          price: Number(a.price ?? this.data.detail.price),
          status: a.status || this.data.detail.status,
          content: Array.isArray(a.content) ? a.content : (typeof a.content === 'string' ? [a.content] : this.data.detail.content)
        }
        this.setData({ detail: fresh, hasRealData: true })
        try { wx.setStorageSync('lastActivityDetail', { ...a, images }) } catch (_) {}
        this.updateCTA()
      }).catch((err) => {
        const msg = String(err && err.message || '')
        if (msg.includes('404')) {
          wx.showToast({ title: '活动不存在或已下线', icon: 'none' })
        } else {
          wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' })
        }
        // 失败时禁用报名，保留缓存展示
        this.setData({ applyDisabled: true, ctaText: '活动已下线' })
      }).finally(() => wx.hideLoading())
    }
  },
  updateCTA() {
    const { detail } = this.data;
    // 兼容解析 YYYY-MM-DD HH:mm 到 Date
    const parse = (s) => {
      if (!s) return null;
      const iso = String(s).replace(' ', 'T');
      const d1 = new Date(iso);
      if (!Number.isNaN(d1.getTime())) return d1;
      try {
        const [datePart, timePart] = String(s).split(' ');
        const [y, m, day] = (datePart || '').split('-').map((n) => Number(n));
        const [hh, mm] = (timePart || '00:00').split(':').map((n) => Number(n));
        return new Date(y, m - 1, day, hh, mm, 0);
      } catch (_) {
        return null;
      }
    };
    const now = new Date();
    const startTime = parse(detail.start);
    const hasStarted = !!(startTime && now >= startTime);

    let text = '';
    let disabled = false;
    if (hasStarted) {
      text = '报名已截止';
      disabled = true;
    } else {
      switch (detail.status) {
        case '未满员且可报名':
          text = detail.price > 0 ? `报名 ¥${detail.price}` : '免费报名';
          break;
        case '满员候补':
          text = detail.price > 0 ? `候补报名 ¥${detail.price}` : '候补报名';
          break;
        case '已报名':
          text = '已报名';
          disabled = true; // 已报名不再重复报名
          break;
        default:
          text = '活动已结束';
          disabled = true;
      }
    }
    this.setData({ ctaText: text, applyDisabled: disabled });
  },
  onApply() {
    if (this.data.applyDisabled) {
      wx.showToast({ title: '报名已截止', icon: 'none' });
      return;
    }
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
    // 从本地用户信息提取 memberId（仅使用 memberId）
    let memberIdParam = '';
    try {
      const user = wx.getStorageSync('user');
      const mid = Number(user?.memberId || NaN);
      if (Number.isFinite(mid) && mid > 0) memberIdParam = `&memberId=${mid}`;
    } catch (_) {}
    wx.navigateTo({ url: `/pages/pay/pay?id=${id || ''}&price=${price}&title=${title}&start=${start}&end=${end}&place=${place}&image=${image}${memberIdParam}` });
  },
  onShareAppMessage() {
    const { detail, hasRealData } = this.data;
    const res = {
      title: hasRealData ? (detail.title || '活动详情') : '活动详情',
      path: `/pages/detail/detail?id=${this.data.id || ''}`
    };
    const img = hasRealData ? (detail.images && detail.images[0]) : undefined;
    if (img) res.imageUrl = img;
    return res;
  },
  onShareTimeline() {
    const { detail, hasRealData } = this.data;
    const res = {
      title: hasRealData ? (detail.title || '活动详情') : '活动详情',
      query: `id=${this.data.id || ''}`
    };
    const img = hasRealData ? (detail.images && detail.images[0]) : undefined;
    if (img) res.imageUrl = img;
    return res;
  }
});
