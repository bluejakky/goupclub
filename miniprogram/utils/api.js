// API 层：接入真实后端，同时保留部分模拟数据
const { request } = require('./request.js')
const delay = (ms = 400) => new Promise(r => setTimeout(r, ms))

const mock = {
  userProfile: {
    readonly: { gender: '女', age: 28, nationality: '中国', idMasked: '420***********1234' },
    form: { language: '中文', occupation: '产品经理', city: '上海', favorite: '露营/路跑' }
  },
  registrations: [
    { id: 101, title: '城市夜跑·北外滩', cover: 'https://picsum.photos/seed/run/400/300', status: '已报名', timeRange: '10-12 19:30-21:00', place: '上海 北外滩', started: false },
    { id: 102, title: '露营·莫干山星空营地', cover: 'https://picsum.photos/seed/camp/400/300', status: '候补', timeRange: '10-20 14:00-次日10:00', place: '浙江 莫干山', started: false },
    { id: 103, title: '越野徒步·四姑娘山', cover: 'https://picsum.photos/seed/hike/400/300', status: '已报名', timeRange: '09-28 07:30-18:00', place: '四川 阿坝', started: true }
  ],
  refunds: [
    { id: 201, title: '城市夜跑·北外滩', applyTime: '10-11 10:23', originalStatus: '已报名', amount: 39, method: '微信支付原路退回（仅退现金）', voucherReturn: false, status: '成功' },
    { id: 202, title: '露营·莫干山星空营地', applyTime: '10-15 09:12', originalStatus: '候补', amount: 299, method: '支付宝原路退回（仅退现金）', voucherReturn: false, status: '失败' },
    { id: 203, title: '越野徒步·四姑娘山', applyTime: '10-01 18:05', originalStatus: '已报名', amount: 199, method: '仅退现金（积分不退回）', voucherReturn: false, status: '处理中' }
  ],
  vouchers: {
    available: [
      { id: 301, title: '报名立减', amount: 30, expire: '2025-12-31' },
      { id: 302, title: '露营专享', amount: 50, expire: '2025-11-30' }
    ],
    expired: [
      { id: 303, title: '周末路跑券', amount: 20, expire: '2025-09-01' }
    ]
  }
}

module.exports = {
  // 真实登录接口
  async login(username, password) {
    return request({ url: '/admin/login', method: 'POST', data: { username, password } })
  },
  // 获取后端用户信息（昵称、头像等）
  async getMe() {
    return request({ url: '/admin/me', method: 'GET' })
  },

  async getUserProfile() {
    await delay()
    return JSON.parse(JSON.stringify(mock.userProfile))
  },

  async updateUserProfile(payload) {
    await delay(600)
    mock.userProfile.form = { ...mock.userProfile.form, ...payload }
    return { ok: true }
  },

  async getRegistrationStatus() {
    await delay()
    return JSON.parse(JSON.stringify(mock.registrations))
  },

  async cancelRegistration(id) {
    await delay(500)
    const target = mock.registrations.find(a => a.id === Number(id))
    if (!target) return { ok: false, message: '活动不存在' }
    if (target.started) return { ok: false, message: '活动已开始，无法取消' }
    target.status = '候补'
    return { ok: true }
  },

  async getRefundRecords(memberId) {
    // 采用 orders 列表过滤出该会员的退款订单
    // 说明：后端当前未提供专门的退款记录接口，这里使用关键词匹配 memberId + status=refunded 的方式
    return request({ url: `/orders`, method: 'GET', data: { status: 'refunded', keyword: String(memberId), sortBy: 'refundAt', sortOrder: 'desc', page: 1, pageSize: 100 } })
  },

  async getVouchers() {
    await delay()
    return JSON.parse(JSON.stringify(mock.vouchers))
  },

  // 预下单（支持代金券与积分抵扣 + 真实支付附加字段）
  async prepay({ orderId, amount, provider, useVoucher = false, voucherAmount = 0, memberId = null, usePoints = 0, openid = null, description = null, subject = null, returnUrl = null }) {
    return request({ url: '/payments/prepay', method: 'POST', data: { orderId, amount, provider, useVoucher, voucherAmount, memberId, usePoints, openid, description, subject, returnUrl } })
  },
  // 获取微信openid（通过 wx.login 的 code）
  async getWechatOpenId(code) {
    return request({ url: '/wechat/openid', method: 'GET', data: { code } })
  },
  // 仅积分支付（订单需处于 created）
  async payByPoints({ orderId, memberId }) {
    return request({ url: '/payments/points-only', method: 'POST', data: { orderId, memberId } })
  },
  // 查询积分账户余额
  async getPointsAccount(memberId) {
    return request({ url: '/points/account', method: 'GET', data: { memberId } })
  },

  async changePassword(current, next) {
    return request({ url: '/user/change-password', method: 'POST', data: { oldPassword: current, newPassword: next } })
  },
  async getMember(id) {
    return request({ url: `/members/${id}`, method: 'GET' })
  },
  async updateMember(id, payload) {
    return request({ url: `/members/${id}`, method: 'PUT', data: payload })
  },
  async createMember(payload) {
    return request({ url: '/members', method: 'POST', data: payload })
  },
  async linkMember({ username, memberId }) {
    return request({ url: '/admin/link-member', method: 'POST', data: { username, memberId } })
  },
  async getInvitationCode(memberId) {
    return request({ url: `/referral/code/${memberId}`, method: 'GET' })
  },
  async searchActivities({ keyword = '' } = {}) {
    return request({ url: '/activities', method: 'GET', data: { keyword } })
  },
  // 查询成员积分账户与近期流水
  async getMemberPoints(id) {
    return request({ url: `/members/${id}/points`, method: 'GET' })
  },
  // 新增：绑定邀请码（完成注册后）
  async bindReferral({ memberId, invitationCode, channel = 'manual' }) {
    return request({ url: '/referral/bind', method: 'POST', data: { memberId, invitationCode, channel } })
  },
  getCooperateCount(memberId) {
    return request({ url: '/cooperate/count', method: 'GET', data: { memberId } })
  },
  async submitCooperate(payload) {
    return request({ url: '/cooperate', method: 'POST', data: payload })
  },
  // 查询提交次数与提交申请
}