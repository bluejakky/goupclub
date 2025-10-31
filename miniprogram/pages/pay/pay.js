const api = require('../../utils/api.js')
Page({
  data: {
    id: null,
    price: 0,
    pointsBalance: 0,
    pointsOptions: [],
    selectedIndex: -1,
    selectedDeductYuan: 0,
    requiredPoints: 0,
    cashPayable: 0,
    canPointsOnly: false,
    icons: null,
    iconWechat: '',
    iconAlipay: '',
    iconVoucher: '',
    memberId: null,
    prepayDetails: null,
    // 新增：缓存 openid，避免重复获取
    openid: null,
    // 新增：用于 picker 的展示文案
    pointsLabels: [],
    enableAlipay: false,
    paymentMethod: 'wechat',
    radioIconChosen: '/assets/chosen.png',
    radioIconUnchosen: '/assets/unchosen.png',
    radioFallbackIcon: '/assets/status.png',
    // 新增：活动信息
    activityTitle: '',
    activityStart: '',
    activityEnd: '',
    activityPlace: '',
    activityImage: '',
    activityTimeRange: '',
    // 新增：积分查询失败标记，避免重复弹 toast
    pointsLoadFailed: false
  },
  onLoad(query) {
    const price = Math.round(Number(query?.price || 0));
    const id = query?.id || null;
    const fromQueryMemberId = Number(query?.memberId || NaN);
    const user = wx.getStorageSync('user') || null;
    const storedMemberId = user ? Number(user.memberId || NaN) : NaN;
    const memberId = Number.isFinite(fromQueryMemberId) ? fromQueryMemberId : (Number.isFinite(storedMemberId) ? storedMemberId : null);

    const icons = getApp().globalData?.icons || null;
    const iconWechat = icons ? icons.getIcon('wechat') : '';
    const iconAlipay = icons ? icons.getIcon('alipay') : '';
    const iconVoucher = icons ? icons.getIcon('voucher') : '';

    const pointsOptions = [
      { points: 10000, deductYuan: 1, canUse: false },
      { points: 50000, deductYuan: 5, canUse: false },
      { points: 100000, deductYuan: 10, canUse: false },
      { points: 150000, deductYuan: 15, canUse: false },
      { points: 200000, deductYuan: 20, canUse: false },
      { points: 500000, deductYuan: 50, canUse: false }
    ];

    // 新增：从 query 接收活动信息（安全解码）
    const decode = (s) => { try { return typeof s === 'string' ? decodeURIComponent(s) : s } catch (_) { return s || '' } };
    let activityTitle = decode(query?.title) || '';
    let activityStart = decode(query?.start) || '';
    let activityEnd = decode(query?.end) || '';
    let activityPlace = decode(query?.place) || '';
    let activityImage = decode(query?.image) || '';
    if (!activityTitle && !activityStart && !activityEnd && !activityPlace && !activityImage) {
      const last = wx.getStorageSync('lastActivityDetail') || null;
      if (last) {
        activityTitle = last.title || activityTitle;
        activityStart = last.start || activityStart;
        activityEnd = last.end || activityEnd;
        activityPlace = last.place || activityPlace;
        activityImage = (last.images && last.images[0]) || activityImage;
      }
    }
    const activityTimeRange = (activityStart && activityEnd)
      ? `${activityStart} - ${activityEnd}`
      : (activityStart || activityEnd || '');

    this.setData({
      id,
      price,
      pointsBalance: 0,
      pointsOptions,
      icons,
      iconWechat,
      iconAlipay,
      iconVoucher,
      memberId,
      openid: null,
      pointsLabels: [],
      radioIconChosen: '/assets/chosen.png',
      radioIconUnchosen: '/assets/unchosen.png',
      radioFallbackIcon: '/assets/status.png',
      activityTitle,
      activityStart,
      activityEnd,
      activityPlace,
      activityImage,
      activityTimeRange
    }, () => {
      this.loadPointsBalance();
      this.refreshOptionsCanUse();
      this.recalc();
    });
  },

  refreshOptionsCanUse() {
    const { pointsBalance, pointsOptions, selectedIndex, price } = this.data;
    // 基础 6 档更新可用性
    const base = pointsOptions.filter(opt => !opt.full);
    const updatedBase = base.map(opt => ({ ...opt, canUse: pointsBalance >= opt.points }));
    // 追加第 7 档：全部用积分抵扣
    const fullOption = { points: price * 10000, deductYuan: price, canUse: pointsBalance >= (price * 10000), full: true };
    const updated = [...updatedBase, fullOption];
    this.setData({ pointsOptions: updated }, () => {
      const valid = selectedIndex >= 0 && this.data.pointsOptions[selectedIndex] && this.data.pointsOptions[selectedIndex].canUse;
      if (!valid) {
        this.setData({ selectedIndex: -1 });
      }
      this.buildPointsLabels();
      this.recalc();
    });
  },

  // 新增：为 picker 构建展示文案
  buildPointsLabels() {
    const { pointsOptions } = this.data;
    const labels = pointsOptions.map(opt => {
      const suffix = opt.canUse ? '' : (opt.full ? ' [不可用]' : ' [积分不足]');
      if (opt.full) {
        return `全部用积分抵扣（需 ${opt.points} 积分，抵 ¥${opt.deductYuan}）${suffix}`;
      }
      return `需 ${opt.points} 积分，抵 ¥${opt.deductYuan}${suffix}`;
    });
    this.setData({ pointsLabels: labels });
  },

  async loadPointsBalance() {
    const { memberId } = this.data;
    if (!memberId) return;
    try {
      const acc = await api.getPointsAccount(memberId);
      const pointsBalance = Math.max(0, Math.round(Number(acc?.balance || 0)));
      this.setData({ pointsBalance, pointsLoadFailed: false }, () => this.refreshOptionsCanUse());
    } catch (e) {
      if (!this.data.pointsLoadFailed) {
        wx.showToast({ title: '积分账户查询失败', icon: 'none' });
      }
      this.setData({ pointsBalance: 0, pointsLoadFailed: true }, () => this.refreshOptionsCanUse());
    }
  },

  // 旧的点击选择保留，但界面已改为下拉
  onSelectPoints(e) {
    const index = Number(e.currentTarget.dataset.index);
    const opt = this.data.pointsOptions[index];
    if (!opt || !opt.canUse) {
      wx.showToast({ title: '积分不足，无法选择该档位', icon: 'none' });
      return;
    }
    this.setData({ selectedIndex: index }, () => this.recalc());
  },

  // 新增：picker 下拉选择处理
  onPickerChange(e) {
    const index = Number(e.detail.value);
    const opt = this.data.pointsOptions[index];
    if (!opt || !opt.canUse) {
      wx.showToast({ title: opt?.full ? '可用积分不足以全额抵扣' : '积分不足，无法选择该档位', icon: 'none' });
      this.setData({ selectedIndex: -1 }, () => this.recalc());
      return;
    }
    this.setData({ selectedIndex: index }, () => this.recalc());
  },

  recalc() {
    const { price, selectedIndex, pointsOptions } = this.data;
    let selectedDeductYuan = 0;
    let requiredPoints = 0;
    if (selectedIndex >= 0 && pointsOptions[selectedIndex]?.canUse) {
      selectedDeductYuan = pointsOptions[selectedIndex].deductYuan;
      requiredPoints = pointsOptions[selectedIndex].points;
    }
    const cashPayable = Math.max(price - selectedDeductYuan, 0);
    const canPointsOnly = selectedDeductYuan >= price && requiredPoints > 0;
    this.setData({ selectedDeductYuan, requiredPoints, cashPayable, canPointsOnly });
  },

  // 新增：选择支付方式
  onSelectMethod(e) {
    const method = e.currentTarget.dataset.method;
    if (!method) return;
    if (method === 'alipay' && !this.data.enableAlipay) {
      wx.showToast({ title: '审核版仅支持微信支付', icon: 'none' });
      return;
    }
    this.setData({ paymentMethod: method });
  },

  // 新增：确认支付
  onConfirmPay() {
    const { cashPayable } = this.data;
    if (cashPayable <= 0) {
      this.payPointsOnly();
      return;
    }
    const method = this.data.paymentMethod;
    if (method === 'alipay' && !this.data.enableAlipay) {
      wx.showToast({ title: '审核版仅支持微信支付', icon: 'none' });
      this.setData({ paymentMethod: 'wechat' });
    }
    if (this.data.paymentMethod === 'wechat') {
      this.payWechat();
    } else if (this.data.paymentMethod === 'alipay') {
      this.payAlipay();
    }
  },

  // 新增：取消支付（优先返回上一页，回退跳详情）
  onCancelPay() {
    const pages = getCurrentPages();
    const prev = pages && pages[pages.length - 2];
    if (prev && prev.route === 'pages/detail/detail') {
      wx.navigateBack({ delta: 1 });
      return;
    }
    const id = this.data.id || '';
    if (id) {
      wx.redirectTo({ url: `/pages/detail/detail?id=${id}` });
    } else {
      wx.navigateBack({ delta: 1 });
    }
  },

  // 新增：确保获取 openid
  async ensureWechatOpenId() {
    if (this.data.openid) return this.data.openid;
    try {
      const loginRes = await new Promise((resolve, reject) => wx.login({ success: resolve, fail: reject }))
      const code = loginRes?.code || ''
      if (!code) throw new Error('微信登录失败')
      const obj = await api.getWechatOpenId(code)
      const openid = obj?.openid || null
      if (!openid) throw new Error('未获取到 openid')
      this.setData({ openid })
      return openid
    } catch (e) {
      wx.showToast({ title: e?.message || '获取 openid 失败', icon: 'none' })
      throw e
    }
  },

  async payWechat() {
    const { cashPayable, selectedIndex, id, price, requiredPoints } = this.data;
    // 准备 memberId
    let memberId = this.data.memberId
    if (!memberId) {
      try {
        const me = await api.getMe()
        if (me && me.memberId) {
          memberId = me.memberId
          this.setData({ memberId })
        }
      } catch {}
    }
    // 获取 openid
    let openid = this.data.openid
    try {
      openid = await this.ensureWechatOpenId()
    } catch { return }

    wx.showLoading({ title: '微信预下单中' });
    try {
      const description = `订单支付 ${id}`
      const res = await api.prepay({ orderId: id, amount: price, provider: 'wechat', useVoucher: false, voucherAmount: 0, memberId, usePoints: requiredPoints, openid, description, subject: null, returnUrl: null })
      const finalPayable = Math.round(Number(res?.amount || cashPayable))
      const prepayId = res?.prepayId || null
      const details = {
        originalAmount: Math.round(Number(res?.originalAmount || price)),
        appliedVoucher: Math.round(Number(res?.appliedVoucher || 0)),
        appliedPoints: Math.round(Number(res?.pointsUsage?.appliedPoints || 0)),
        pointsCashDeduction: Math.round(Number(res?.pointsUsage?.pointsCashDeduction || 0)),
        finalPayable
      }
      this.setData({ cashPayable: finalPayable, prepayId, prepayDetails: details })
      if (res?.payParams) {
        wx.showLoading({ title: '拉起微信支付' })
        try {
          await new Promise((resolve, reject) => {
            wx.requestPayment({ ...res.payParams, success: resolve, fail: reject })
          })
          wx.hideLoading();
          this.toResult('success');
          return;
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: '支付未完成：' + (err?.errMsg || '失败'), icon: 'none' })
        }
      }
      // 回退：未返回支付参数时使用模拟流程
      wx.showLoading({ title: '微信支付中' })
      setTimeout(() => {
        wx.hideLoading();
        this.toResult('success');
      }, 600);
    } catch (e) {
      wx.hideLoading();
      const msg = e && e.message ? e.message : '预下单失败'
      wx.showToast({ title: msg, icon: 'none' })
    }
  },
  async payAlipay() {
    const { cashPayable, selectedIndex, id, price, requiredPoints } = this.data;
    // 准备 memberId
    let memberId = this.data.memberId
    if (!memberId) {
      try {
        const me = await api.getMe()
        if (me && me.memberId) {
          memberId = me.memberId
          this.setData({ memberId })
        }
      } catch {}
    }
    wx.showLoading({ title: '支付宝预下单中' });
    try {
      const subject = `订单支付 ${id}`
      const res = await api.prepay({ orderId: id, amount: price, provider: 'alipay', useVoucher: false, voucherAmount: 0, memberId, usePoints: requiredPoints, openid: null, description: null, subject, returnUrl: null })
      const finalPayable = Math.round(Number(res?.amount || cashPayable))
      const prepayId = res?.prepayId || null
      const details = {
        originalAmount: Math.round(Number(res?.originalAmount || price)),
        appliedVoucher: Math.round(Number(res?.appliedVoucher || 0)),
        appliedPoints: Math.round(Number(res?.pointsUsage?.appliedPoints || 0)),
        pointsCashDeduction: Math.round(Number(res?.pointsUsage?.pointsCashDeduction || 0)),
        finalPayable
      }
      this.setData({ cashPayable: finalPayable, prepayId, prepayDetails: details })
      if (res?.payUrl) {
        wx.showModal({ title: '支付宝支付', content: '将打开外部支付页面，请在该页面完成支付', showCancel: false })
        wx.navigateTo({ url: '/pages/webview/webview?url=' + encodeURIComponent(res.payUrl) })
        return;
      }
      // 回退：未返回支付链接时使用模拟流程
      wx.showLoading({ title: '支付宝支付中' })
      setTimeout(() => {
        wx.hideLoading();
        this.toResult('success');
      }, 600);
    } catch (e) {
      wx.hideLoading();
      const msg = e && e.message ? e.message : '预下单失败'
      wx.showToast({ title: msg, icon: 'none' })
    }
  },
  async payPointsOnly() {
    const { canPointsOnly, selectedIndex, id } = this.data;
    if (selectedIndex < 0) {
      wx.showToast({ title: '请先选择一个积分抵扣档位', icon: 'none' });
      return;
    }
    if (!canPointsOnly) {
      wx.showToast({ title: '当前抵扣不足以全额支付', icon: 'none' });
      return;
    }
    // 准备 memberId
    let memberId = this.data.memberId
    if (!memberId) {
      try {
        const me = await api.getMe()
        if (me && me.memberId) {
          memberId = me.memberId
          this.setData({ memberId })
        }
      } catch {}
    }
    wx.showLoading({ title: '积分支付中' });
    try {
      const res = await api.payByPoints({ orderId: id, memberId })
      wx.hideLoading();
      wx.showToast({ title: '积分支付成功', icon: 'success' });
      setTimeout(() => {
        this.toResult('success');
      }, 600);
    } catch (e) {
      wx.hideLoading();
      const msg = e && e.message ? e.message : '积分支付失败'
      wx.showToast({ title: msg, icon: 'none' });
    }
  },

  toResult(status) {
    // 支付成功后返回详情或首页，真实项目中应跳转到报名状态页
    wx.navigateBack();
  },
  onRadioIconError(e) {
    const kind = e.currentTarget.dataset.kind;
    const fallback = this.data.radioFallbackIcon || '/assets/status.png';
    if (kind === 'chosen') {
      this.setData({ radioIconChosen: fallback });
    } else {
      this.setData({ radioIconUnchosen: fallback });
    }
  },
});