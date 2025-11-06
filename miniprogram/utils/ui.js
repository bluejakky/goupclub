// 统一管理小程序 UI 图标与占位符
// 将 UI/slices 下的切片复制到 miniprogram/assets/ 后，按下面的命名使用

const defaultIcons = {
  play: 'https://picsum.photos/seed/play/80/80',
  playActive: 'https://picsum.photos/seed/play-active/80/80',
  mine: 'https://picsum.photos/seed/mine/80/80',
  mineActive: 'https://picsum.photos/seed/mine-active/80/80',
  wechat: 'https://picsum.photos/seed/wechat/80/80',
  alipay: 'https://picsum.photos/seed/alipay/80/80',
  voucher: 'https://picsum.photos/seed/voucher/80/80',
  profile: 'https://picsum.photos/seed/profile/80/80',
  status: 'https://picsum.photos/seed/status/80/80',
  refund: 'https://picsum.photos/seed/refund/80/80',
  password: 'https://picsum.photos/seed/password/80/80',
  arrowRight: 'https://picsum.photos/seed/arrow/80/80'
}

function resolve(path) {
  return `/assets/${path}`
}

// 本地切片映射（复制后即可启用），未复制时将使用默认占位
const localIcons = {
  play: resolve('tab-play.png'),
  playActive: resolve('tab-play-active.png'),
  mine: resolve('tab-mine.png'),
  mineActive: resolve('tab-mine-active.png'),
  wechat: resolve('wechat.png'),
  alipay: resolve('alipay.png'),
  voucher: resolve('voucher.png'),
  profile: resolve('profile.png'),
  status: resolve('calendar-check-line.svg'),
  // 使用 Remix Icon 的线性样式，替换为 ticket-line.svg
  refund: resolve('ticket-line.svg'),
  password: resolve('password.png'),
  arrowRight: resolve('arrow-right.png'),
  logout: resolve('logout.png')
}

function getIcon(key) {
  const img = localIcons[key]
  // 简单判断：如果本地路径不可用，开发工具会报错，这里仍返回默认占位以便界面不空白
  return img || defaultIcons[key] || ''
}

// 新增：中文友好时间格式化（含周几与跨年显示）
function formatDateTime(s) {
  if (!s) return ''
  const mapWeek = ['周日','周一','周二','周三','周四','周五','周六']
  let d = null
  try {
    const iso = String(s).replace(' ', 'T')
    const t = new Date(iso)
    if (!Number.isNaN(t.getTime())) d = t
  } catch {}
  if (!d) {
    try {
      const [datePart, timePart] = String(s).split(' ')
      const [y, m, day] = (datePart || '').split('-').map(Number)
      const [hh, mm] = (timePart || '00:00').split(':').map(Number)
      d = new Date(y, (m || 1) - 1, day || 1, hh || 0, mm || 0, 0)
    } catch {}
  }
  if (!d || Number.isNaN(d.getTime())) return String(s)
  const nowY = new Date().getFullYear()
  const Y = d.getFullYear()
  const M = String(d.getMonth() + 1)
  const D = String(d.getDate())
  const H = String(d.getHours()).padStart(2, '0')
  const Min = String(d.getMinutes()).padStart(2, '0')
  const wd = mapWeek[d.getDay()]
  const prefix = Y !== nowY ? `${Y}年${M}月${D}日` : `${M}月${D}日`
  return `${prefix} ${wd} ${H}:${Min}`
}

module.exports = { getIcon, defaultIcons, localIcons, formatDateTime }