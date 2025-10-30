const api = require('../../utils/api.js')
const canvas = require('./canvas-config.js')

Page({
  data: {
    username: '',
    password: '',
    showPassword: false,
    designScale: 1,
    debug: false,
    backIcon: '',
    statusBarHeight: 20
  },
  onLoad() {
    try {
      const sys = wx.getSystemInfoSync();
      const w = sys.windowWidth || 375; // 375 作为 iPhone 默认宽度
      const designW = canvas.designW; // 与裁切脚本保持一致
      const designH = canvas.designH;
      const scale = w / designW;
      const icons = getApp().globalData?.icons || null;
      const statusBarHeight = sys.statusBarHeight || 20;
      this.setData({ designScale: scale, designW, designH, backIcon: icons ? icons.getIcon('arrowRight') : '', statusBarHeight });
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
      // 拉取用户信息（昵称与头像）——后台异步，不阻塞跳转
      api.getMe().then(me => { if (me) wx.setStorageSync('user', me); }).catch(() => {});
      wx.showToast({ title: '登录成功', icon: 'success' });
      // 登录成功后跳转到 index 主页
      wx.reLaunch({ url: '/pages/index/index' });

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
  },
onBack() {
  wx.showModal({
    title: '提示',
    content: '是否退出小程序？',
    confirmText: '退出',
    cancelText: '取消',
    // 避免用户误触背景关闭，强制通过按钮操作
    showCancel: true,
    cancelColor: '#666', // 取消按钮颜色（可选，增强视觉区分）
    confirmColor: '#e63946', // 确认按钮颜色（可选，突出重要操作）
    success(res) {
      if (res.confirm) {
        // 确保 exitMiniProgram 方法存在（兼容旧版本基础库）
        if (wx.exitMiniProgram) {
          wx.exitMiniProgram({
            success: () => {
              console.log('退出小程序成功');
            },
            fail: (err) => {
              console.error('退出小程序失败', err);
              // 失败时可做降级处理，例如返回上一页
              wx.navigateBack();
            }
          });
        } else {
          // 基础库版本过低不支持 exitMiniProgram 时的降级方案
          wx.showToast({
            title: '请手动关闭小程序',
            icon: 'none',
            duration: 2000
          });
        }
      }
    },
    fail(err) {
      console.error('弹窗调用失败', err);
    }
  });
},
});
