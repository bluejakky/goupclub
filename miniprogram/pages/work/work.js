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
    activities: [
      {
        id: 1,
        title: '英语角交流',
        category: '英语',
        start: '2025-10-10 19:00',
        end: '2025-10-10 21:00',
        place: '市图书馆',
        signed: 12,
        max: 20,
        price: 20,
        isTop: true,
        isHot: true,
        publishedAt: '2025-10-01 12:00',
        mainImage: 'https://picsum.photos/400/225?random=1',
        images: ['https://picsum.photos/800/450?random=11'],
        flags: ['🇬🇧','🇺🇸','🇨🇦','🇨🇳','🇦🇺']
      },
      {
        id: 2,
        title: '志愿者公园清洁',
        category: '志愿',
        start: '2025-10-12 09:00',
        end: '2025-10-12 12:00',
        place: '城市公园',
        signed: 35,
        max: 50,
        price: 0,
        isTop: false,
        isHot: true,
        publishedAt: '2025-10-05 08:00',
        mainImage: 'https://picsum.photos/400/225?random=2',
        images: ['https://picsum.photos/800/450?random=12'],
        flags: ['🇨🇳','🇨🇳','🇨🇳','🇭🇰','🇲🇴']
      },
      {
        id: 3,
        title: '西班牙语学习分享',
        category: '小语种',
        start: '2025-10-15 19:00',
        end: '2025-10-15 21:00',
        place: '社区活动室',
        signed: 8,
        max: 25,
        price: 10,
        isTop: false,
        isHot: false,
        publishedAt: '2025-10-07 18:30',
        mainImage: 'https://picsum.photos/400/225?random=3',
        images: ['https://picsum.photos/800/450?random=13'],
        flags: ['🇪🇸','🇲🇽','🇨🇴','🇦🇷']
      }
    ]
  },
  onLoad() {
    const sys = wx.getSystemInfoSync()
    const statusBarHeight = sys.statusBarHeight || 20
    const navHeight = statusBarHeight + 44
    this.setData({ statusBarHeight, navHeight })
    // 排序：置顶优先，其次按发布时间倒序，其次按开始时间
    const sorted = [...this.data.activities].sort((a, b) => {
      if ((a.isTop ? 1 : 0) !== (b.isTop ? 1 : 0)) return (b.isTop ? 1 : 0) - (a.isTop ? 1 : 0);
      const ap = a.publishedAt || a.start || '';
      const bp = b.publishedAt || b.start || '';
      return bp.localeCompare(ap);
    });
    // 去重国旗，避免重复显示
    const deduped = sorted.map(a => ({
      ...a,
      flags: Array.isArray(a.flags) ? a.flags.filter((f, i, arr) => arr.indexOf(f) === i) : []
    }));
    this.setData({ activities: deduped, fullActivities: deduped });
    wx.showShareMenu({ withShareTicket: true, menus: ['shareAppMessage','shareTimeline'] });
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
    const id = e.currentTarget.dataset.id;
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