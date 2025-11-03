const api = require('../../utils/api.js')

Page({
  data: {
    keywords: '',
    searchResults: [],
    searching: false,
    hotspotDebug: false,
    hsPos: {
      nihao: { left: 21.31, top: 13.61, width: 22, height: 8 },
      hello: { left: 57.98, top: 1.45, width: 22, height: 8 },
      other: { left: 2.89, top: 0.7, width: 22, height: 8 },
      other1: { left: 76.35, top: 10.21, width: 22, height: 8 },
      other2: { left: 25.49, top: 0.77, width: 22, height: 8 },
      '汉语': { left: 4.32, top: 45.42, width: 22, height: 8 },
      '英语': { left: 53.36, top: 46.18, width: 22, height: 8 },
      '小语种': { left: 52.3, top: 59.95, width: 22, height: 8 },
      '主题': { left: 5.65, top: 73.67, width: 26, height: 10 },
      '志愿': { left: 6.26, top: 87.95, width: 26, height: 10 }
    }
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
    api.searchActivities({ keyword: kw })
      .then(list => {
        const items = Array.isArray(list) ? list : (Array.isArray(list?.items) ? list.items : []);
        this.setData({ searchResults: items, searching: false });
        if (!items.length) {
          wx.showToast({ title: '未找到相关活动', icon: 'none' });
          return;
        }
        // 自动跳转到最匹配的一条活动：优先标题完全匹配，其次包含匹配，否则取第一条
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

  // 快捷跳转：设置预过滤并进入“来玩”
  setPrefilterAndGo(pre) {
    try { wx.setStorageSync('prefilter', pre || {}); } catch (_) {}
    wx.switchTab({ url: '/pages/work/work' });
  },
  // 语言图点击：nihao->汉语，hello->英语，其它->小语种
  onLangTap(e) {
    if (this.data.hotspotDebug) { wx.showToast({ title: '调试模式：不跳转', icon: 'none' }); return; }
    const key = String(e.currentTarget.dataset.key || '').toLowerCase();
    const lang = key === 'nihao' ? '汉语' : key === 'hello' ? '英语' : '小语种';
    this.setPrefilterAndGo({ lang });
  },
  // 分类图点击：语言跳转为 lang；主题/志愿跳转为 type
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
