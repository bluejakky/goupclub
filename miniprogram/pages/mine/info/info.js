const api = require('../../../utils/api.js')

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
    form: {
      gender: '',
      language: '',
      occupation: '',
      city: '',
      favorite: ''
    }
  },

  async onLoad() {
    if (!ensureLogin()) return
    wx.showLoading({ title: '加载资料' })
    try {
      const me = await api.getMe()
      let memberId = Number(me?.memberId || 0)
      let m = null
      if (!Number.isFinite(memberId) || memberId <= 0) {
        const baseName = me?.nickname || me?.username || 'Member'
        const created = await api.createMember({ nameEn: baseName })
        if (created && created.id) {
          await api.linkMember({ username: me?.username, memberId: created.id })
          memberId = created.id
        }
      }
      m = await api.getMember(memberId)
      this.setData({
        memberId,
        member: m || null,
        form: {
          gender: m?.gender || '',
          language: m?.language || '',
          occupation: m?.occupation || '',
          city: m?.city || '',
          favorite: m?.favorite || ''
        }
      })
    } catch (e) {
      wx.showToast({ title: '加载失败', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  },

  onShow() {
    ensureLogin()
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({ [`form.${field}`]: value })
  },

  onGenderChange(e) {
    const value = e.detail.value
    this.setData({ 'form.gender': value })
  },

  async onSave() {
    const { gender, language, occupation, city, favorite } = this.data.form
    const mid = Number(this.data.memberId || 0)
    if (!Number.isFinite(mid) || mid <= 0) {
      wx.showToast({ title: '未绑定会员ID', icon: 'none' })
      return
    }
    if (!language || !occupation || !city) {
      wx.showToast({ title: '请完善信息', icon: 'none' })
      return
    }
    if (favorite && favorite.length > 60) {
      wx.showToast({ title: '喜好字数过长', icon: 'none' })
      return
    }
    wx.showLoading({ title: '保存中' })
    try {
      const m = this.data.member || {}
      const res = await api.updateMember(mid, { ...m, gender, language, occupation, city, favorite })
      if (res && res.id) {
        wx.showToast({ title: '修改成功', icon: 'success' })
      } else {
        wx.showToast({ title: '保存失败', icon: 'none' })
      }
    } catch (e) {
      wx.showToast({ title: '网络错误', icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  }
})