const api = require('../../utils/api.js')
const { BASE_URL } = require('../../utils/request.js')
const ASSET_HOST = String(BASE_URL || '').replace(/\/api$/, '')
const normalizeAssetUrl = (u) => {
  if (!u) return '';
  const s = String(u).trim();
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('/')) return `${ASSET_HOST}${s}`;
  return `${ASSET_HOST}/${s}`;
}

Page({
  data: {
    statusBarHeight: 20,
    navHeight: 64,
    keywords: '',
    selectedCategory: '',
    // 下拉选项
    languageOptions: ['汉语', '英语', '小语种'],
    typeOptions: ['志愿', '主题'],
    selectedLanguage: '',
    selectedType: '',
    langIndex: 0,
    typeIndex: 0,
    isLangOpen: false,
    isTypeOpen: false,
    isDropdownMaskVisible: false,
    // 旧分类备用（不再在 UI 显示）
    categories: [
      { name: '汉语' },
      { name: '英语' },
      { name: '小语种' },
      { name: '志愿' },
      { name: '主题' }
    ],
    activities: []
  },
  async onLoad() {
    const sys = wx.getSystemInfoSync()
    const statusBarHeight = sys.statusBarHeight || 20
    const navHeight = statusBarHeight + 44
    this.setData({ statusBarHeight, navHeight })
    await this.loadActivities()
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage','shareTimeline'] });
  },
  async loadActivities() {
    wx.showLoading({ title: '加载活动' })
    try {
      const rows = await api.getPublishedActivities({ upcomingOnly: true })
      const items0 = Array.isArray(rows) ? rows : (Array.isArray(rows?.items) ? rows.items : [])
      // 双保险：客户端也过滤仅“已发布”
      const items = items0.filter(a => /^(published|已发布)$/i.test(String(a.status || '').trim()))
      const adapt = (a) => {
        let images = []
        try {
          images = Array.isArray(a.images) ? a.images : (a.images ? JSON.parse(a.images) : [])
        } catch (_) {}
        images = images.map(normalizeAssetUrl)
        const groups = Array.isArray(a.groups) ? a.groups : []
        const catPick = groups.find(g => ['汉语','英语','小语种','志愿','主题'].includes(String(g))) || ''
        return {
          id: a.id,
          title: a.title,
          category: catPick || '',
          start: a.start,
          end: a.end,
          place: a.place,
          signed: Number(a.enrolled || 0),
          max: Number(a.max || 0),
          price: Number(a.price || 0),
          isTop: !!a.isTop,
          isHot: !!a.isHot,
          publishedAt: a.publishedAt || '',
          status: a.status || '',
          mainImage: normalizeAssetUrl(a.mainImage || images[0] || ''),
          images,
          content: a.content || '',
          flags: []
        }
      }
      const sorted = items.map(adapt).sort((a, b) => {
        if ((a.isTop ? 1 : 0) !== (b.isTop ? 1 : 0)) return (b.isTop ? 1 : 0) - (a.isTop ? 1 : 0)
        const ap = a.publishedAt || a.start || ''
        const bp = b.publishedAt || b.start || ''
        return bp.localeCompare(ap)
      })
      this.setData({ activities: sorted, fullActivities: sorted })
    } catch (e) {
      wx.showToast({ title: '加载失败，显示示例数据', icon: 'none' })
      // 回退：示例数据，避免空白
      const fallback = [
        { id: 1, title: '英语角交流', category: '英语', start: '2025-10-10 19:00', end: '2025-10-10 21:00', place: '市图书馆', signed: 12, max: 20, price: 20, isTop: true, isHot: true, publishedAt: '2025-10-01 12:00', mainImage: 'https://picsum.photos/400/225?random=1', images: ['https://picsum.photos/800/450?random=11'], flags: ['🇬🇧','🇺🇸','🇨🇦','🇨🇳','🇦🇺'] },
        { id: 2, title: '志愿者公园清洁', category: '志愿', start: '2025-10-12 09:00', end: '2025-10-12 12:00', place: '城市公园', signed: 35, max: 50, price: 0, isTop: false, isHot: true, publishedAt: '2025-10-05 08:00', mainImage: 'https://picsum.photos/400/225?random=2', images: ['https://picsum.photos/800/450?random=12'], flags: ['🇨🇳','🇨🇳','🇨🇳','🇭🇰','🇲🇴'] },
        { id: 3, title: '西班牙语学习分享', category: '小语种', start: '2025-10-15 19:00', end: '2025-10-15 21:00', place: '社区活动室', signed: 8, max: 25, price: 10, isTop: false, isHot: false, publishedAt: '2025-10-07 18:30', mainImage: 'https://picsum.photos/400/225?random=3', images: ['https://picsum.photos/800/450?random=13'], flags: ['🇪🇸','🇲🇽','🇨🇴','🇦🇷'] }
      ]
      const sorted = fallback.sort((a, b) => {
        if ((a.isTop ? 1 : 0) !== (b.isTop ? 1 : 0)) return (b.isTop ? 1 : 0) - (a.isTop ? 1 : 0)
        const ap = a.publishedAt || a.start || ''
        const bp = b.publishedAt || b.start || ''
        return bp.localeCompare(ap)
      })
      this.setData({ activities: sorted, fullActivities: sorted })
    } finally {
      wx.hideLoading()
    }
  },
  onShow() {
    try {
      const pre = wx.getStorageSync('prefilter');
      if (pre && (pre.lang || pre.type)) {
        const langIdx = this.data.languageOptions.indexOf(pre.lang || '');
        const typeIdx = this.data.typeOptions.indexOf(pre.type || '');
        this.setData({
          selectedLanguage: pre.lang || '',
          selectedType: pre.type || '',
          langIndex: langIdx >= 0 ? langIdx : this.data.langIndex,
          typeIndex: typeIdx >= 0 ? typeIdx : this.data.typeIndex
        }, () => this.applyFilters());
        wx.removeStorageSync('prefilter');
      }
    } catch (e) {}
  },
  onSearchInput(e) {
    this.setData({ keywords: e.detail.value });
  },
  onSearch() {
    this.applyFilters();
  },
  // 旧分类点击保留（不再显示）
  onSelectCategory(e) {
    const name = e.currentTarget.dataset.name;
    this.setData({ selectedCategory: name }, () => this.applyFilters());
  },
  // 新下拉选择事件
  onLangChange(e) {
    const idx = e.detail.value;
    const val = this.data.languageOptions[idx];
    this.setData({ langIndex: idx, selectedLanguage: val }, () => this.applyFilters());
  },
  onTypeChange(e) {
    const idx = e.detail.value;
    const val = this.data.typeOptions[idx];
    this.setData({ typeIndex: idx, selectedType: val }, () => this.applyFilters());
  },
  toggleLang() {
    const next = !this.data.isLangOpen;
    this.setData({
      isLangOpen: next,
      isTypeOpen: false,
      isDropdownMaskVisible: next
    });
  },
  toggleType() {
    const next = !this.data.isTypeOpen;
    this.setData({
      isTypeOpen: next,
      isLangOpen: false,
      isDropdownMaskVisible: next
    });
  },
  closeDropdowns() {
    this.setData({ isLangOpen: false, isTypeOpen: false, isDropdownMaskVisible: false });
  },
  selectLang(e) {
    const idx = e.currentTarget.dataset.index;
    const val = this.data.languageOptions[idx];
    this.setData({ langIndex: idx, selectedLanguage: val, isLangOpen: false, isDropdownMaskVisible: false }, () => this.applyFilters());
  },
  selectType(e) {
    const idx = e.currentTarget.dataset.index;
    const val = this.data.typeOptions[idx];
    this.setData({ typeIndex: idx, selectedType: val, isTypeOpen: false, isDropdownMaskVisible: false }, () => this.applyFilters());
  },
  noop() {},
  applyFilters() {
    const kw = (this.data.keywords || '').trim().toLowerCase();
    const lang = (this.data.selectedLanguage || '').trim();
    const type = (this.data.selectedType || '').trim();
    let list = [...(this.data.fullActivities || this.data.activities || [])];
    if (kw) {
      list = list.filter(a => (a.title || '').toLowerCase().includes(kw) || (a.place || '').toLowerCase().includes(kw));
    }
    // 语言或类型与示例数据中的 category 字段对应，二者为或关系
    if (lang && type) {
      list = list.filter(a => a.category === lang || a.category === type);
    } else if (lang) {
      list = list.filter(a => a.category === lang);
    } else if (type) {
      list = list.filter(a => a.category === type);
    }
    // 保持排序规则
    list = list.sort((a, b) => {
      if ((a.isTop ? 1 : 0) !== (b.isTop ? 1 : 0)) return (b.isTop ? 1 : 0) - (a.isTop ? 1 : 0);
      const ap = a.publishedAt || a.start || '';
      const bp = b.publishedAt || b.start || '';
      return bp.localeCompare(ap);
    });
    this.setData({ activities: list });
  },
  openDetail(e) {
    const id = Number(e.currentTarget.dataset.id);
    // 在进入详情页前缓存当前卡片的完整数据，供详情页使用
    const item = (this.data.fullActivities || []).find(x => Number(x.id) === id) || (this.data.activities || []).find(x => Number(x.id) === id);
    if (item) {
      try { wx.setStorageSync('lastActivityDetail', item); } catch (_) {}
    }
    wx.navigateTo({ url: '/pages/detail/detail?id=' + id });
  },

  onShareAppMessage() {
    return {
      title: 'GoupClub 活动社区',
      path: '/pages/work/work'
    };
  },
  onShareTimeline() {
    return {
      title: 'GoupClub 活动社区',
      query: ''
    };
  },

  onReady() {
  },
  onBack() {
    wx.reLaunch({ url: '/pages/index/index' })
  }
});