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

module.exports = { getIcon, defaultIcons, localIcons }