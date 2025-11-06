const api = require('../../utils/api.js')

Page({
  data: {
    keywords: '',
    searchResults: [],
    searching: false,
    hotspotDebug: false,
    showDebugControls: false,
    mainImageSrc: '/assets/mainpage.png',
    hsPos: {
      nihao: { left: 11.49, top: 10.04, width: 37.39, height: 13.37 },
      hello: { left: 53.64, top: 0.65, width: 41.8, height: 7.99 },
      other: { left: 1.61, top: 0.7, width: 22, height: 8 },
      other1: { left: 74.3, top: 9.47, width: 21.74, height: 14.55 },
      other2: { left: 25.13, top: 0.7, width: 26.83, height: 8.68 },
      other3: { left: 3.07, top: 10.76, width: 7.54, height: 13.25 },
      other4: { left: 53.68, top: 19.73, width: 42.12, height: 4.16 },
      '汉语': { left: 3.15, top: 44.6, width: 44.46, height: 26.5 },
      '英语': { left: 52.38, top: 44.21, width: 42.59, height: 12.08 },
      '小语种': { left: 53.27, top: 58.16, width: 42.62, height: 12.53 },
      '主题': { left: 3.89, top: 73.13, width: 92.19, height: 12.34 },
      '志愿': { left: 4.47, top: 87.8, width: 89.2, height: 11 }
    },
  },
  onSearchInput(e) {
    this.setData({ keywords: e.detail.value });
  },
  onSearchConfirm() {
    const kw = (this.data.keywords || '').trim();
    if (!kw) {
      wx.showToast({ title: '请输入关键词', icon: 'none' });
      return;
    }
    this.setData({ searching: true });
    wx.showToast({ title: '搜索中', icon: 'none' });
    // 仅检索已发布活动，避免展示草稿/下线等状态
    api.getPublishedActivities({ keyword: kw, upcomingOnly: 1 })
      .then(list => {
        const items = Array.isArray(list) ? list : (Array.isArray(list?.items) ? list.items : []);
        this.setData({ searchResults: items, searching: false });
        if (!items.length) {
          wx.showToast({ title: '未找到相关活动', icon: 'none' });
          return;
        }
        const lowerkw = kw.toLowerCase();
        const exact = items.find(x => String(x.title || '').toLowerCase() === lowerkw);
        const contains = items.find(x => String(x.title || '').toLowerCase().includes(lowerkw)) || items.find(x => String(x.place || '').toLowerCase().includes(lowerkw));
        const target = exact || contains || items[0];
        const id = Number(target?.id);
        if (Number.isFinite(id) && id > 0) {
          try { wx.setStorageSync('lastActivityDetail', target); } catch (_) {}
          wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
        } else {
          wx.showToast({ title: '数据异常，无法打开活动', icon: 'none' });
        }
      })
      .catch(() => {
        this.setData({ searching: false });
        wx.showToast({ title: '搜索失败，请稍后重试', icon: 'none' });
      });
  },
  onOpenDetail(e) {
    const id = Number(e.currentTarget.dataset.id);
    const item = (this.data.searchResults || []).find(x => Number(x.id) === id);
    if (item) {
      try { wx.setStorageSync('lastActivityDetail', item); } catch (_) {}
    }
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` });
  },
  onNeedworkTap() {
    wx.navigateTo({ url: '/pages/cooperate/cooperate' })
  },
  onLoad() {
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage','shareTimeline'] });
  },
  onShow() {},
  onGoPlay() {
    wx.switchTab({ url: '/pages/work/work' });
  },
  goWork() {
    wx.switchTab({ url: '/pages/work/work' });
  },
  goMine() {
    wx.switchTab({ url: '/pages/mine/mine' });
  },
  toggleHotspotDebug() {
    this.setData({ hotspotDebug: !this.data.hotspotDebug });
    wx.showToast({ title: this.data.hotspotDebug ? '热点调试已开启' : '热点调试已关闭', icon: 'none' });
  },
  onImageLoad() {
    this.measureMain();
  },
  // 新增：主图加载失败时的路径回退（本地预览使用相对路径）
  onMainImageError() {
    const current = String(this.data.mainImageSrc || '')
    if (current !== '../../assets/mainpage.png') {
      this.setData({ mainImageSrc: '../../assets/mainpage.png' })
    }
  },
  measureMain() {
    const q = wx.createSelectorQuery();
    q.select('.main-image').boundingClientRect(rect => {
      this._wrapRect = rect || { width: 0, height: 0, left: 0, top: 0 };
    }).exec();
  },
  onHsTouchStart(e) {
    if (!this.data.hotspotDebug) return;
    const id = String(e.currentTarget.dataset.id || '');
    const t = (e.touches || [])[0];
    if (!id || !t) return;
    const pos = this.data.hsPos[id];
    this._drag = {
      id,
      startX: t.pageX,
      startY: t.pageY,
      startLeft: Number(pos?.left) || 0,
      startTop: Number(pos?.top) || 0
    };
  },
  onHsTouchMove(e) {
    if (!this.data.hotspotDebug || !this._drag || !this._wrapRect?.width) return;
    const t = (e.touches || [])[0];
    if (!t) return;
    const dx = t.pageX - this._drag.startX;
    const dy = t.pageY - this._drag.startY;
    const dxPct = dx / this._wrapRect.width * 100;
    const dyPct = dy / this._wrapRect.height * 100;
    const id = this._drag.id;
    const pos = this.data.hsPos[id] || {};
    const width = Number(pos.width) || 0;
    const height = Number(pos.height) || 0;
    let left = this._drag.startLeft + dxPct;
    let top = this._drag.startTop + dyPct;
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    left = clamp(left, 0, 100 - width);
    top = clamp(top, 0, 100 - height);
    this.setData({
      [`hsPos.${id}.left`]: Number(left.toFixed(2)),
      [`hsPos.${id}.top`]: Number(top.toFixed(2))
    });
  },
  onHsTouchEnd() {
    if (!this.data.hotspotDebug || !this._drag) return;
    const id = this._drag.id;
    const pos = this.data.hsPos[id] || {};
    wx.showToast({ title: `${id}: L${pos.left}% T${pos.top}%`, icon: 'none' });
    this._drag = null;
  },

  /* 新增：热点缩放（宽高可调） */
  onHsResizeStart(e) {
    if (!this.data.hotspotDebug) return;
    const id = String(e.currentTarget.dataset.id || '');
    const t = (e.touches || [])[0];
    if (!id || !t) return;
    const pos = this.data.hsPos[id] || {};
    this._resize = {
      id,
      startX: t.pageX,
      startY: t.pageY,
      startWidth: Number(pos.width) || 0,
      startHeight: Number(pos.height) || 0,
      left: Number(pos.left) || 0,
      top: Number(pos.top) || 0,
    };
  },
  onHsResizeMove(e) {
    if (!this.data.hotspotDebug || !this._resize || !this._wrapRect?.width) return;
    const t = (e.touches || [])[0];
    if (!t) return;
    const dx = t.pageX - this._resize.startX;
    const dy = t.pageY - this._resize.startY;
    const dxPct = dx / this._wrapRect.width * 100;
    const dyPct = dy / this._wrapRect.height * 100;
    const id = this._resize.id;
    let width = this._resize.startWidth + dxPct;
    let height = this._resize.startHeight + dyPct;
    const minW = 6, minH = 4; // 最小尺寸，避免过小难以点击
    const maxW = 100 - this._resize.left;
    const maxH = 100 - this._resize.top;
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    width = clamp(width, minW, maxW);
    height = clamp(height, minH, maxH);
    this.setData({
      [`hsPos.${id}.width`]: Number(width.toFixed(2)),
      [`hsPos.${id}.height`]: Number(height.toFixed(2))
    });
  },
  onHsResizeEnd() {
    if (!this.data.hotspotDebug || !this._resize) return;
    const id = this._resize.id;
    const pos = this.data.hsPos[id] || {};
    wx.showToast({ title: `${id}: W${pos.width}% H${pos.height}%`, icon: 'none' });
    try { wx.setStorageSync('hsPosOverride', this.data.hsPos); } catch (_) {}
    this._resize = null;
  },

  copyHotspotConfig() {
    if (!this.data.hotspotDebug) return;
    try {
      const txt = JSON.stringify(this.data.hsPos, null, 2);
      wx.setClipboardData({ data: txt });
      wx.showToast({ title: '坐标已复制', icon: 'none' });
    } catch (e) {
      wx.showToast({ title: '复制失败', icon: 'none' });
    }
  },

  onLoad() {
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage','shareTimeline'] });
    // 新增：加载本地存储的覆盖坐标，便于调试持久化
    try {
      const override = wx.getStorageSync('hsPosOverride');
      if (override && typeof override === 'object') {
        this.setData({ hsPos: override });
      }
    } catch (_) {}
  },
  setPrefilterAndGo(pre) {
    try { wx.setStorageSync('prefilter', pre || {}); } catch (_) {}
    wx.switchTab({ url: '/pages/work/work' });
  },
  onLangTap(e) {
    if (this.data.hotspotDebug) { wx.showToast({ title: '调试模式：不跳转', icon: 'none' }); return; }
    const key = String(e.currentTarget.dataset.key || '').toLowerCase();
    const lang = key === 'nihao' ? '汉语' : key === 'hello' ? '英语' : '小语种';
    this.setPrefilterAndGo({ lang });
  },
  onCategoryTap(e) {
    if (this.data.hotspotDebug) { wx.showToast({ title: '调试模式：不跳转', icon: 'none' }); return; }
    const cat = String(e.currentTarget.dataset.cat || '');
    if (cat === '主题' || cat === '志愿') {
      this.setPrefilterAndGo({ type: cat });
    } else if (cat === '汉语' || cat === '英语' || cat === '小语种') {
      this.setPrefilterAndGo({ lang: cat });
    } else {
      this.setPrefilterAndGo({});
    }
  },

  onShareAppMessage() {
    return {
      title: 'GoupClub 活动社区',
      path: '/pages/index/index'
    };
  },
  onShareTimeline() {
    return {
      title: 'GoupClub 活动社区',
      query: ''
    };
  }
});
