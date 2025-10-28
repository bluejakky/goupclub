const { request, BASE_URL } = require('../../../utils/request.js')
const api = require('../../../utils/api.js')
Page({
  data: {
    // 头像相关
    avatarUrl: '',
    defaultAvatar: '../../assets/profile.png',
    // 账户信息
    username: '',
    password: '',
    confirm: '',
    showPassword: false,
    showConfirm: false,
    eyeIcon: '../../assets/password.png',
    // 基本信息
    nameEn: '',
    gender: '女',
    age: '',
    nation: '',
    // 个人资料
    language: '',
    occupation: '',
    city: '',
    favorite: '',
    // 邀码与协议
    inviteCode: '',
    agreePaymentRules: false,
    agreeUserAgreement: false
  },
  // 选择并显示头像
  onChooseAvatar() {
    wx.chooseImage({
      count: 1,
      sizeType: ['compressed'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const path = (res.tempFilePaths && res.tempFilePaths[0]) || (res.tempFiles && res.tempFiles[0] && res.tempFiles[0].tempFilePath) || '';
        if (path) {
          this.setData({ avatarUrl: path });
        } else {
          wx.showToast({ title: '选择失败', icon: 'none' });
        }
      },
      fail: () => {
        wx.showToast({ title: '选择失败', icon: 'none' });
      }
    });
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
  onGenderChange(e) {
    const { value } = e.detail || {}
    this.setData({ gender: value })
  },
  onAgreementChange(e) {
    const vals = e?.detail?.value || []
    this.setData({
      agreePaymentRules: vals.includes('payment'),
      agreeUserAgreement: vals.includes('user')
    })
  },
  async onSubmit() {
    const { avatarUrl, username, password, confirm, nameEn, gender, age, nation, agreePaymentRules, agreeUserAgreement } = this.data
    if (!avatarUrl) {
      wx.showToast({ title: '请上传头像', icon: 'none' })
      return
    }
    if (!username || username.length < 3) {
      wx.showToast({ title: '用户名至少3位', icon: 'none' })
      return
    }
    const pwdOk = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{8,20}$/.test(String(password || ''))
    if (!pwdOk) {
      wx.showToast({ title: '密码需8-20位且含字母与数字', icon: 'none' })
      return
    }
    if (String(confirm || '') !== String(password || '')) {
      wx.showToast({ title: '两次输入的密码不一致', icon: 'none' })
      return
    }
    if (!agreePaymentRules || !agreeUserAgreement) {
      wx.showToast({ title: '请先勾选两个协议', icon: 'none' })
      return
    }
    // 基本信息校验（英文名/性别/年龄/国籍）
    if (!nameEn) {
      wx.showToast({ title: '请填写英文名', icon: 'none' })
      return
    }
    if (!gender) {
      wx.showToast({ title: '请选择性别', icon: 'none' })
      return
    }
    const ageNum = Number(age || 0)
    if (!Number.isFinite(ageNum) || ageNum <= 0) {
      wx.showToast({ title: '请填写正确年龄', icon: 'none' })
      return
    }
    if (!nation) {
      wx.showToast({ title: '请填写国籍', icon: 'none' })
      return
    }
    try {
      wx.showLoading({ title: '提交中', mask: true })
      // 上传头像文件，获取URL
      let avatarRemote = ''
      const uploadRes = await new Promise((resolve, reject) => {
        wx.uploadFile({
          url: `${BASE_URL}/upload/avatar`,
          filePath: avatarUrl,
          name: 'file',
          success: resolve,
          fail: reject
        })
      })
      let uploadData = {}
      try { uploadData = JSON.parse(uploadRes.data || '{}') } catch (e) {}
      const { url: uploadedPath } = uploadData || {}
      if (!uploadedPath) {
        throw new Error('头像上传失败')
      }
      // 组合完整URL（后端返回 /uploads/xxx）
      const apiBase = String(BASE_URL || '')
      const serverBase = apiBase.replace(/\/api$/, '')
      avatarRemote = uploadedPath.startsWith('http') ? uploadedPath : `${serverBase}${uploadedPath}`

      // 创建会员（提交完整基本信息）
      const resp = await request({
        url: '/members',
        method: 'POST',
        data: {
          nameEn,
          gender,
          age: Number(age || 0),
          nation,
          avatar: avatarRemote
        }
      })

      // 若填写了邀请码，则尝试绑定推荐关系
      const code = String(this.data.inviteCode || '').trim()
      let bindTip = ''
      if (code) {
        try {
          const bindRes = await api.bindReferral({ memberId: resp.id, invitationCode: code, channel: 'manual' })
          if (bindRes?.status === 'bound') bindTip = '，邀请码绑定成功'
          else if (bindRes?.status === 'already_bound') bindTip = '，邀请码已绑定'
          else bindTip = ''
        } catch (err) {
          bindTip = '，邀请码绑定失败'
        }
      }

      wx.hideLoading()
      wx.showToast({ title: '注册成功' + bindTip, icon: 'success', duration: 800 })
      setTimeout(() => {
        const stack = getCurrentPages()
        if (stack.length > 1) {
          wx.navigateBack({
            delta: 1,
            fail() {
              wx.redirectTo({ url: '/pages/login/login' })
            }
          })
        } else {
          wx.redirectTo({ url: '/pages/login/login' })
        }
      }, 800)
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: e?.message || '提交失败', icon: 'none' })
    }
  }
})