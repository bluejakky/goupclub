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
    showCurrent: false,
    showNew: false,
    showConfirm: false,
    current: '',
    next: '',
    confirm: ''
  },
  onLoad() {
    if (!ensureLogin()) return
  },
  onShow() {
    ensureLogin()
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    const value = e.detail.value
    this.setData({ [field]: value })
  },

  toggle(e) {
    const key = e.currentTarget.dataset.target
    this.setData({ [key]: !this.data[key] })
  },

  async onSubmit() {
    const { current, next, confirm } = this.data
    if (!current || !next || !confirm) {
      wx.showToast({ title: '请填写所有字段', icon: 'none' })
      return
    }
    if (next !== confirm) {
      wx.showToast({ title: '两次输入不一致', icon: 'none' })
      return
    }
    const ok = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,20}$/.test(next)
    if (!ok) {
      wx.showToast({ title: '需8-20位且包含字母与数字', icon: 'none' })
      return
    }

    wx.showLoading({ title: '提交中' })
    try {
      const res = await api.changePassword(current, next)
      if (res.ok) {
        wx.hideLoading()
        wx.showToast({ title: '修改成功', icon: 'success' })
        setTimeout(() => wx.navigateBack({}), 600)
      } else {
        wx.hideLoading()
        wx.showToast({ title: res.message || '修改失败', icon: 'none' })
      }
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '网络错误', icon: 'none' })
    }
  }
  ,
  
})