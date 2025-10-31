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
    memberId: null,
    remaining: 2,
    name: '',
    phone: '',
    company: '',
    brief: ''
  },
  onLoad() {
    if (!ensureLogin()) return
    this.initMember()
  },
  async initMember() {
    try {
      const cached = wx.getStorageSync('user') || null
      let mid = Number(cached?.memberId || 0)
      if (!Number.isFinite(mid) || mid <= 0) {
        // 兜底拉取用户信息（避免登录后异步写入 user 导致缺失）
        try {
          const me = await api.getMe()
          if (me) {
            wx.setStorageSync('user', me)
            mid = Number(me?.memberId || 0)
          }
        } catch (_) {}
      }
      if (Number.isFinite(mid) && mid > 0) {
        this.setData({ memberId: mid })
        try {
          const r = await api.getCooperateCount(mid)
          const cnt = Number(r?.count || 0)
          this.setData({ remaining: Math.max(0, 2 - cnt) })
        } catch (_) {}
      } else {
        wx.showToast({ title: '用户信息缺失，请重新登录', icon: 'none' })
      }
    } catch (_) {}
  },
  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({ [field]: e.detail.value })
  },
  validate() {
    const { name, phone, company, brief } = this.data
    if (!name || name.trim().length < 2) { wx.showToast({ title: '请输入姓名', icon: 'none' }); return false }
    const p = String(phone || '').trim()
    const phoneOk = /^1[3-9]\d{9}$/.test(p) || /^\+?\d{6,20}$/.test(p)
    if (!phoneOk) { wx.showToast({ title: '请输入有效手机号', icon: 'none' }); return false }
    if (!company || company.trim().length < 2) { wx.showToast({ title: '请输入企业名称', icon: 'none' }); return false }
    if (!brief || brief.trim().length < 5) { wx.showToast({ title: '请填写合作简介(不少于5字)', icon: 'none' }); return false }
    return true
  },
  async onSubmit() {
    const { memberId, name, phone, company, brief, remaining } = this.data
    if (remaining <= 0) { wx.showToast({ title: '已达提交上限', icon: 'none' }); return }
    if (!Number.isFinite(Number(memberId)) || Number(memberId) <= 0) { wx.showToast({ title: '用户信息缺失', icon: 'none' }); return }
    if (!this.validate()) return
    wx.showLoading({ title: '提交中' })
    try {
      const res = await api.submitCooperate({ memberId, name, phone, company, brief })
      const left = Number(res?.remaining ?? remaining - 1)
      this.setData({ remaining: Math.max(0, left) })
      wx.showToast({ title: '提交成功', icon: 'success' })
      this.setData({ name: '', phone: '', company: '', brief: '' })
    } catch (e) {
      const msg = e?.message || '提交失败'
      wx.showToast({ title: msg, icon: 'none' })
    } finally {
      wx.hideLoading()
    }
  }
})