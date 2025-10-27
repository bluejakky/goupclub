const api = require('../../utils/api.js')
const canvas = require('./canvas-config.js')

Page({
  data: {
    username: '',
    password: '',
    showPassword: false,
    designScale: 1,
    debug: false
  },
  onLoad() {
    try {
      const sys = wx.getSystemInfoSync();
      const w = sys.windowWidth || 375; // 375 作为 iPhone 默认宽度
      const designW = canvas.designW; // 与裁切脚本保持一致
      const designH = canvas.designH;
      const scale = w / designW;
      this.setData({ designScale: scale, designW, designH });
    } catch (e) {}
  },
  onInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },
  togglePassword() {
    this.setData({ showPassword: !this.data.showPassword });
  },
  
  async onSubmit() {
    const { username, password } = this.data;
    if (!username || username.length < 3) {
      wx.showToast({ title: '请输入用户名(至少3位)', icon: 'none' });
      return;
    }
    if (!password || password.length < 6) {
      wx.showToast({ title: '密码至少6位', icon: 'none' });
      return;
    }
    
    wx.showLoading({ title: '登录中' });
    try {
      const res = await api.login(username, password)
      const token = res && res.token
      if (!token) throw new Error('无效登录响应')
      wx.setStorageSync('token', token)
      // 拉取用户信息（昵称与头像）
      try {
        const me = await api.getMe()
        if (me) wx.setStorageSync('user', me)
      } catch {}
      wx.showToast({ title: '登录成功', icon: 'success' });
      setTimeout(() => {
        // 登录成功后统一跳转到“来玩”首页
        wx.switchTab({ url: '/pages/index/index' });
      }, 600);
    } catch (e) {
      const msg = e && e.message ? e.message : '登录失败'
      wx.showToast({ title: msg, icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },
  onRegister() {
    wx.navigateTo({ url: '/pages/login/register/register' })
  },
  onPhoneQuick() {
    wx.showToast({ title: '手机号快捷登录', icon: 'none' });
    // 可替换为实际手机号登录流程
  }
});
