Page({
  data: {
    url: ''
  },
  onLoad(options) {
    const raw = options?.url || ''
    let url = ''
    try { url = decodeURIComponent(raw) } catch (_) { url = raw }
    this.setData({ url })
  },
  onLoadWebview() {
    // 可按需添加加载提示
  },
  onErrorWebview(e) {
    wx.showToast({ title: '页面加载失败', icon: 'none' })
  },
  onMessage(e) {
    try {
      const payload = (e?.detail?.data && e.detail.data[0]) || e?.detail?.data || {}
      const status = payload?.status || payload?.result || ''
      if (payload?.redirectUrl) {
        // H5 主动告知跳转地址时，按照通知跳转
        const target = decodeURIComponent(payload.redirectUrl)
        wx.redirectTo({ url: target })
        return
      }
      if (status === 'success') {
        wx.showToast({ title: '支付成功', icon: 'success' })
        setTimeout(() => wx.navigateBack(), 600)
      } else if (status === 'cancel') {
        wx.showToast({ title: '已取消', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 600)
      } else if (status === 'fail') {
        wx.showToast({ title: '支付失败', icon: 'none' })
      }
    } catch (err) {
      // 忽略消息异常，避免影响页面
    }
  }
})