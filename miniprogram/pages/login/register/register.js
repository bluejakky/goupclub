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
    // 替换：二级联动的地区/国家与国旗
    regions: [
      { region: '亚洲', countries: [
        { name: '中国', code: 'CN' }, { name: '日本', code: 'JP' }, { name: '韩国', code: 'KR' }, { name: '新加坡', code: 'SG' },
        { name: '印度', code: 'IN' }, { name: '泰国', code: 'TH' }, { name: '越南', code: 'VN' }, { name: '马来西亚', code: 'MY' },
        { name: '菲律宾', code: 'PH' }, { name: '印尼', code: 'ID' }, { name: '巴基斯坦', code: 'PK' }, { name: '斯里兰卡', code: 'LK' },
        { name: '孟加拉', code: 'BD' }, { name: '尼泊尔', code: 'NP' }, { name: '哈萨克斯坦', code: 'KZ' }, { name: '乌兹别克斯坦', code: 'UZ' },
        { name: '缅甸', code: 'MM' }, { name: '柬埔寨', code: 'KH' }, { name: '老挝', code: 'LA' }, { name: '蒙古', code: 'MN' },
        { name: '文莱', code: 'BN' }, { name: '马尔代夫', code: 'MV' }
      ]},
      { region: '欧洲', countries: [
        { name: '英国', code: 'GB' }, { name: '法国', code: 'FR' }, { name: '德国', code: 'DE' }, { name: '西班牙', code: 'ES' },
        { name: '意大利', code: 'IT' }, { name: '荷兰', code: 'NL' }, { name: '比利时', code: 'BE' }, { name: '瑞士', code: 'CH' },
        { name: '奥地利', code: 'AT' }, { name: '瑞典', code: 'SE' }, { name: '挪威', code: 'NO' }, { name: '丹麦', code: 'DK' },
        { name: '芬兰', code: 'FI' }, { name: '爱尔兰', code: 'IE' }, { name: '希腊', code: 'GR' }, { name: '葡萄牙', code: 'PT' },
        { name: '波兰', code: 'PL' }, { name: '捷克', code: 'CZ' }, { name: '匈牙利', code: 'HU' }, { name: '罗马尼亚', code: 'RO' },
        { name: '保加利亚', code: 'BG' }, { name: '乌克兰', code: 'UA' }, { name: '俄罗斯', code: 'RU' }, { name: '冰岛', code: 'IS' },
        { name: '卢森堡', code: 'LU' }, { name: '斯洛伐克', code: 'SK' }, { name: '斯洛文尼亚', code: 'SI' }, { name: '克罗地亚', code: 'HR' },
        { name: '塞尔维亚', code: 'RS' }, { name: '立陶宛', code: 'LT' }, { name: '拉脱维亚', code: 'LV' }, { name: '爱沙尼亚', code: 'EE' }
      ]},
      { region: '北美', countries: [ { name: '美国', code: 'US' }, { name: '加拿大', code: 'CA' }, { name: '墨西哥', code: 'MX' }, { name: '古巴', code: 'CU' }, { name: '多米尼加', code: 'DO' }, { name: '牙买加', code: 'JM' }, { name: '巴拿马', code: 'PA' }, { name: '哥斯达黎加', code: 'CR' } ]},
      { region: '南美', countries: [ { name: '巴西', code: 'BR' }, { name: '阿根廷', code: 'AR' }, { name: '智利', code: 'CL' }, { name: '哥伦比亚', code: 'CO' }, { name: '秘鲁', code: 'PE' }, { name: '乌拉圭', code: 'UY' }, { name: '委内瑞拉', code: 'VE' }, { name: '厄瓜多尔', code: 'EC' }, { name: '玻利维亚', code: 'BO' }, { name: '巴拉圭', code: 'PY' } ]},
      { region: '非洲', countries: [ { name: '南非', code: 'ZA' }, { name: '埃及', code: 'EG' }, { name: '尼日利亚', code: 'NG' }, { name: '肯尼亚', code: 'KE' }, { name: '摩洛哥', code: 'MA' }, { name: '加纳', code: 'GH' }, { name: '坦桑尼亚', code: 'TZ' }, { name: '埃塞俄比亚', code: 'ET' }, { name: '阿尔及利亚', code: 'DZ' }, { name: '突尼斯', code: 'TN' }, { name: '安哥拉', code: 'AO' } ]},
      { region: '大洋洲', countries: [ { name: '澳大利亚', code: 'AU' }, { name: '新西兰', code: 'NZ' }, { name: '斐济', code: 'FJ' }, { name: '巴布亚新几内亚', code: 'PG' }, { name: '萨摩亚', code: 'WS' }, { name: '汤加', code: 'TO' } ]},
      { region: '中东', countries: [ { name: '阿联酋', code: 'AE' }, { name: '沙特阿拉伯', code: 'SA' }, { name: '土耳其', code: 'TR' }, { name: '以色列', code: 'IL' }, { name: '卡塔尔', code: 'QA' }, { name: '科威特', code: 'KW' }, { name: '伊朗', code: 'IR' }, { name: '伊拉克', code: 'IQ' }, { name: '约旦', code: 'JO' }, { name: '巴林', code: 'BH' }, { name: '阿曼', code: 'OM' }, { name: '黎巴嫩', code: 'LB' } ]}
    ],
    multiArray: [[], []],
    multiIndex: [0, 0],
    regionName: '',
    flag: '',
    // 搜索弹窗与结果
    searchCountryVisible: false,
    searchQuery: '',
    searchResults: [],
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
  // 新增：国家选择与国旗映射
  codeToFlag(code) {
    const up = String(code || '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(up)) return '';
    const A = 0x1F1E6;
    const chars = [...up].map(c => String.fromCodePoint(A + (c.charCodeAt(0) - 65)));
    return chars.join('');
  },
  // 初始化二级联动的列
  initRegionCountry() {
    const regions = this.data.regions || []
    const firstCountries = regions[0]?.countries || []
    this.setData({
      multiArray: [ regions.map(r => r.region), firstCountries.map(c => c.name) ],
      multiIndex: [0, 0]
    })
  },
  onLoad() {
    this.initRegionCountry()
  },
  // 列变更时更新下一级列表
  onRegionCountryColumnChange(e) {
    const column = Number(e?.detail?.column || 0)
    const value = Number(e?.detail?.value || 0)
    if (column === 0) {
      const regions = this.data.regions || []
      const list = regions[value]?.countries || []
      const names = list.map(c => c.name)
      const idx = this.data.multiIndex || [0,0]
      idx[0] = value
      idx[1] = 0
      this.setData({ multiArray: [ regions.map(r => r.region), names ], multiIndex: idx })
    }
  },
  // 完成选择，设置 nation 与 flag
  onRegionCountryChange(e) {
    const idxs = e?.detail?.value || [0,0]
    const rIdx = Number(idxs[0] || 0)
    const cIdx = Number(idxs[1] || 0)
    const regions = this.data.regions || []
    const region = regions[rIdx]
    const country = region?.countries?.[cIdx]
    if (!region || !country) return
    this.setData({
      multiIndex: [rIdx, cIdx],
      regionName: region.region,
      nation: country.name,
      flag: this.codeToFlag(country.code)
    })
  },
  // 搜索选择国家（弹窗）
  getAllCountries() {
    const regions = this.data.regions || []
    const arr = []
    regions.forEach(r => {
      (r.countries || []).forEach(c => {
        arr.push({ region: r.region, name: c.name, code: c.code, flag: this.codeToFlag(c.code) })
      })
    })
    return arr
  },
  onOpenCountrySearch() {
    const all = this.getAllCountries()
    this.setData({ searchCountryVisible: true, searchQuery: '', searchResults: all.slice(0, 50) })
  },
  onCloseCountrySearch() {
    this.setData({ searchCountryVisible: false, searchQuery: '', searchResults: [] })
  },
  onSearchInput(e) {
    const q = String(e?.detail?.value || '').trim()
    const all = this.getAllCountries()
    const res = q ? all.filter(x => x.name.includes(q) || x.region.includes(q)) : all
    this.setData({ searchQuery: q, searchResults: res.slice(0, 200) })
  },
  onPickCountryFromSearch(e) {
    const region = String(e.currentTarget.dataset.region || '')
    const name = String(e.currentTarget.dataset.name || '')
    const code = String(e.currentTarget.dataset.code || '')
    const regions = this.data.regions || []
    let rIdx = regions.findIndex(r => r.region === region)
    if (rIdx < 0) rIdx = 0
    const countries = regions[rIdx]?.countries || []
    let cIdx = countries.findIndex(c => c.name === name && c.code === code)
    if (cIdx < 0) cIdx = 0
    this.setData({
      searchCountryVisible: false,
      searchQuery: '',
      searchResults: [],
      regionName: region,
      nation: name,
      flag: this.codeToFlag(code),
      multiIndex: [rIdx, cIdx],
      multiArray: [ regions.map(r => r.region), (regions[rIdx]?.countries || []).map(c => c.name) ]
    })
  },
  onAgreementChange(e) {
    const vals = e?.detail?.value || []
    this.setData({
      agreePaymentRules: vals.includes('payment'),
      agreeUserAgreement: vals.includes('user')
    })
  },
  async onSubmit() {
    const { avatarUrl, username, password, confirm, nameEn, gender, age, nation, flag, agreePaymentRules, agreeUserAgreement } = this.data
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
      wx.showToast({ title: '请选择国籍', icon: 'none' })
      return
    }
    try {
      wx.showLoading({ title: '提交中', mask: true })
      // 新增：创建登录账户（用于 /api/admin/login 登录）
      await request({ url: '/admin/register', method: 'POST', data: { username, password } })
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
          flag,
          avatar: avatarRemote,
          language: String(this.data.language || ''),
          occupation: String(this.data.occupation || ''),
          city: String(this.data.city || ''),
          favorite: String(this.data.favorite || '')
        }
      })

      // 绑定登录账户与会员ID（用于后续读取 memberId）
      try {
        await request({ url: '/admin/link-member', method: 'POST', data: { username, memberId: resp.id } })
      } catch (err) {
        console.warn('link-member failed', err)
      }

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