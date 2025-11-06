const api = require('../../utils/api.js')
const { BASE_URL } = require('../../utils/request.js')
const { formatDateTime } = require('../../utils/ui.js')
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
    // 顶部自定义导航所需高度
    statusBarHeight: 20,
    navHeight: 64,
    // 顶部筛选下拉所需数据（保持 WXML 不报未定义）
    languageOptions: ['汉语', '英语', '小语种'],
    typeOptions: ['志愿', '主题'],
    selectedLanguage: '',
    selectedType: '',
    isLangOpen: false,
    isTypeOpen: false,
    isDropdownMaskVisible: false,
    // 活动列表
    activities: []
  },
  onLoad() {
    try {
      const sys = wx.getSystemInfoSync();
      const statusBarHeight = sys.statusBarHeight || 20;
      const navHeight = statusBarHeight + 44;
      this.setData({ statusBarHeight, navHeight });
    } catch (_) {}
    this.loadActivities()
  },
  onPullDownRefresh() {
    this.loadActivities(true)
  },
  onTap(e) {
    const id = e?.currentTarget?.dataset?.id
    if (!id) return
    wx.navigateTo({ url: `/pages/detail/detail?id=${id}` })
  },
  // 顶部交互方法占位，避免事件未定义错误
  onBack() { try { wx.reLaunch({ url: '/pages/index/index' }) } catch (_) {} },
  onSearch() { wx.showToast({ title: '搜索功能暂未开放', icon: 'none' }) },
  onSearchInput() {},
  toggleLang() { this.setData({ isLangOpen: !this.data.isLangOpen, isTypeOpen: false, isDropdownMaskVisible: !this.data.isLangOpen }) },
  toggleType() { this.setData({ isTypeOpen: !this.data.isTypeOpen, isLangOpen: false, isDropdownMaskVisible: !this.data.isTypeOpen }) },
  closeDropdowns() { this.setData({ isLangOpen: false, isTypeOpen: false, isDropdownMaskVisible: false }) },
  selectLang(e) { const idx = Number(e?.currentTarget?.dataset?.index || -1); const val = this.data.languageOptions[idx] || ''; this.setData({ selectedLanguage: val, isLangOpen: false, isDropdownMaskVisible: false }) },
  selectType(e) { const idx = Number(e?.currentTarget?.dataset?.index || -1); const val = this.data.typeOptions[idx] || ''; this.setData({ selectedType: val, isTypeOpen: false, isDropdownMaskVisible: false }) },
  noop() {},

  loadActivities(force = false) {
    wx.showNavigationBarLoading()
    api.getPublishedActivities({ upcomingOnly: true }).then(rows => {
      const list = Array.isArray(rows) ? rows : (Array.isArray(rows?.items) ? rows.items : [])
      const adapt = (a) => {
        let images = []
        try {
          images = Array.isArray(a.images) ? a.images : (a.images ? JSON.parse(a.images) : [])
        } catch (_) {}
        images = (Array.isArray(images) ? images : []).map(normalizeAssetUrl)
        const main = normalizeAssetUrl(a.mainImage || (images[0] || ''))
        const start = a.start || ''
        return {
          id: a.id,
          title: a.title || '',
          mainImage: main,
          images,
          start,
          place: a.place || '',
          isHot: !!a.isHot,
          isTop: !!a.isTop,
          status: a.status || '',
          signed: Number(a.enrolled || 0),
          max: Number(a.max || 0),
          flags: Array.isArray(a.groups) ? a.groups : [],
          startDisplay: formatDateTime(start)
        }
      }
      // 只保留“已发布/published”的活动，防止后端兼容差异导致泄露未发布
      const items = (Array.isArray(list) ? list.map(adapt) : [])
        .filter(it => /^(已发布|published)$/i.test(String(it.status || '').trim()))
      this.setData({ activities: items })
      wx.stopPullDownRefresh()
    }).catch(() => {
      wx.showToast({ title: '加载失败', icon: 'none' })
    }).finally(() => wx.hideNavigationBarLoading())
  }
})