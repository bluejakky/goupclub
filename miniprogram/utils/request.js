// 统一封装请求，自动附带 token，并在 401 时清理并跳转登录
const BASE_URL = 'https://www.goupclub.com/api'

function request({ url, method = 'GET', data = {}, header = {} }) {
  return new Promise((resolve, reject) => {
    const token = wx.getStorageSync('token')
    const headers = { 'Content-Type': 'application/json', ...header }
    if (token) headers['Authorization'] = `Bearer ${token}`
    wx.request({
      url: `${BASE_URL}${url.startsWith('/') ? url : '/' + url}`,
      method,
      data,
      header: headers,
      success(res) {
        const { statusCode, data } = res
        if (statusCode === 200) return resolve(data)
        if (statusCode === 401) {
          wx.removeStorageSync('token')
          wx.showToast({ title: '登录状态已过期，请重新登录', icon: 'none' })
          setTimeout(() => {
            wx.navigateTo({ url: '/pages/login/login' })
          }, 300)
          return reject(new Error('unauthorized'))
        }
        const msg = (data && (data.error || data.message)) || `请求失败(${statusCode})`
        wx.showToast({ title: String(msg), icon: 'none' })
        reject(new Error(msg))
      },
      fail(err) {
        wx.showToast({ title: '网络错误，请稍后重试', icon: 'none' })
        reject(err)
      }
    })
  })
}

module.exports = { request, BASE_URL }