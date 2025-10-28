const api = require('../../utils/api.js')

Page({
  data: {
    navIconProfile: '',
    navIconStatus: '',
    navIconRefund: '',
    navIconVoucher: '',
    navIconPassword: '',
    navArrow: '',
    navIconLogout: '',
    loggedIn: false,
    nickname: '',
    avatarUrl: '',
    // 新增展示字段
    englishName: '',
    account: '',
    inviteCode: '',
    myPoints: 0
  },
  onShow() {
    const icons = getApp().globalData?.icons || null;
    this.setData({
      navIconProfile: icons ? icons.getIcon('profile') : '',
      navIconStatus: icons ? icons.getIcon('status') : '',
      navIconRefund: icons ? icons.getIcon('refund') : '',
      navIconVoucher: icons ? icons.getIcon('voucher') : '',
      navIconPassword: icons ? icons.getIcon('password') : '',
      navArrow: icons ? icons.getIcon('arrowRight') : '',
      navIconLogout: icons ? icons.getIcon('logout') : ''
    })

    const token = wx.getStorageSync('token');
    const loggedIn = !!token;
    this.setData({ loggedIn });
    if (!loggedIn) {
      wx.navigateTo({ url: '/pages/login/login' });
    } else {
      // 读取本地缓存的用户信息（用于初始显示）
      const cached = wx.getStorageSync('user') || null
      if (cached) {
        this.setData({
          nickname: cached.nickname || cached.username || '',
          avatarUrl: cached.avatar || '',
          account: cached.username || '',
          englishName: cached.nickname || cached.username || ''
        })
        const memberId = Number(cached.id || 0)
        if (Number.isFinite(memberId) && memberId > 0) {
          api.getMember(memberId).then(m => {
            if (m && m.nameEn) this.setData({ englishName: m.nameEn })
          }).catch(() => {})
          api.getInvitationCode(memberId).then(r => {
            if (r && r.code) this.setData({ inviteCode: r.code })
          }).catch(() => {})
          api.getPointsAccount(memberId).then(acc => {
            if (acc && typeof acc.balance !== 'undefined') this.setData({ myPoints: Number(acc.balance) || 0 })
          }).catch(() => {})
        }
      }

      // 拉取最新的我的信息，并刷新展示字段
      api.getMe().then(me => {
        if (me) {
          wx.setStorageSync('user', me)
          this.setData({
            nickname: me.nickname || me.username || '',
            avatarUrl: me.avatar || '',
            account: me.username || '',
            englishName: me.nickname || me.username || ''
          })
          const memberId = Number(me.id || 0)
          if (Number.isFinite(memberId) && memberId > 0) {
            api.getMember(memberId).then(m => {
              if (m && m.nameEn) this.setData({ englishName: m.nameEn })
            }).catch(() => {})
            api.getInvitationCode(memberId).then(r => { if (r && r.code) this.setData({ inviteCode: r.code }) }).catch(() => {})
            api.getPointsAccount(memberId).then(acc => {
              if (acc && typeof acc.balance !== 'undefined') this.setData({ myPoints: Number(acc.balance) || 0 })
            }).catch(() => {})
          }
        }
      }).catch(() => {})
    }
  },
  onLogin() {
    wx.navigateTo({ url: '/pages/login/login' })
  },
  onLogout() {
    wx.removeStorageSync('token')
    wx.removeStorageSync('user')
    this.setData({ loggedIn: false, nickname: '', avatarUrl: '', englishName: '', account: '', inviteCode: '' })
    wx.showToast({ title: '已退出登录', icon: 'none' })
    wx.navigateTo({ url: '/pages/login/login' })
  },
  // 复制邀请码
  onCopyInvite() {
    const code = this.data.inviteCode
    if (!code) {
      wx.showToast({ title: '暂无邀请码', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: String(code),
      success: () => wx.showToast({ title: '已复制', icon: 'none' })
    })
  }
})