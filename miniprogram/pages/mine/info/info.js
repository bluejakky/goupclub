const api = require('../../utils/api.js')

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
    readonly: {
      gender: '女',
      age: 28,
      nationality: '中国',
      idMasked: '420***********1234'
    },
    form: {
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
      const prof = await api.getUserProfile()
      this.setData({ readonly: prof.readonly, form: prof.form })
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

  async onSave() {
    const { language, occupation, city, favorite } = this.data.form
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
      const res = await api.updateUserProfile({ language, occupation, city, favorite })
      if (res && res.ok) {
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