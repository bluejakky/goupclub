const api = require('../../utils/api.js')

Page({
  data: {
    keywords: '',
    searchResults: [],
    searching: false
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

  // 快捷跳转：设置预过滤并进入“来玩”
  setPrefilterAndGo(pre) {
    try { wx.setStorageSync('prefilter', pre || {}); } catch (_) {}
    wx.switchTab({ url: '/pages/work/work' });
  },
  // 语言图点击：nihao->汉语，hello->英语，其它->小语种
  onLangTap(e) {
    const key = String(e.currentTarget.dataset.key || '').toLowerCase();
    const lang = key === 'nihao' ? '汉语' : key === 'hello' ? '英语' : '小语种';
    this.setPrefilterAndGo({ lang });
  },
  // 分类图点击：语言跳转为 lang；主题/志愿跳转为 type
  onCategoryTap(e) {
    const cat = String(e.currentTarget.dataset.cat || '');
    if (cat === '主题' || cat === '志愿') {
      this.setPrefilterAndGo({ type: cat });
    } else if (cat === '汉语' || cat === '英语' || cat === '小语种') {
      this.setPrefilterAndGo({ lang: cat });
    } else {
      this.setPrefilterAndGo({});
    }
  }
});
