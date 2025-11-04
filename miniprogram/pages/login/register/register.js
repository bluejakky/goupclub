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
    agreeUserAgreement: false,
    docOverlayVisible: false,
    docTitle: '',
    docContent: ''
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
    const lowerQ = q.toLowerCase()
    const all = this.getAllCountries()
    const res = lowerQ
      ? all.filter(x => {
          const name = String(x.name || '').toLowerCase()
          const region = String(x.region || '').toLowerCase()
          const code = String(x.code || '').toLowerCase()
          return name.includes(lowerQ) || region.includes(lowerQ) || code.includes(lowerQ)
        })
      : all
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
  onViewDoc(e) {
    const key = String(e?.currentTarget?.dataset?.key || '')
    const title = key === 'payment' ? '向上GO-UP小程序支付、退款与积分规则' : '向上GO-UP小程序用户使用协议及平台法律规则'
    const fs = wx.getFileSystemManager()
    wx.showLoading({ title: '打开中', mask: true })

    // 构造候选路径：仅使用绝对路径 '/assets/'，并兼容“有空格/无空格”的两种文件名
    const docxBase = key === 'payment'
      ? '向上GO-UP小程序支付、退款与积分规则.docx'
      : '向上GO-UP小程序用户使用协议及平台法律规则.docx'
    const docxBaseWithSpace = key === 'payment'
      ? '向上GO-UP小程序支付、退款与积分规则 .docx'
      : '向上GO-UP小程序用户使用协议及平台法律规则 .docx'

    const txtBase = key === 'payment'
      ? '向上GO-UP小程序支付、退款与积分规则.txt'
      : '向上GO-UP小程序用户使用协议及平台法律规则.txt'
    const txtBaseWithSpace = key === 'payment'
      ? '向上GO-UP小程序支付、退款与积分规则 .txt'
      : '向上GO-UP小程序用户使用协议及平台法律规则 .txt'

    const prefixes = ['/assets/']
    const docxCandidates = [docxBaseWithSpace, docxBase].flatMap(n => prefixes.map(p => p + n))
    const txtCandidates = [txtBaseWithSpace, txtBase].flatMap(n => prefixes.map(p => p + n))

    // 内置文本回退（无法读取代码包时使用）
    const builtinText = {
      payment: `向上GO-UP小程序\n支付、退款与积分规则\n一、支付与退款规则说明\n费用交纳：本小程序的部分服务可能需要支付相应费用，具体费用标准、构成及支付方式将在相关服务页面或活动规则中明确展示。\n支付方式：您可按照小程序内提供的支付方式（如微信支付、支付宝等）支付相关费用。支付完成后，我们将通过小程序消息、短信或邮件等方式向您发送支付成功凭证。\n发票开具：若您需要开具发票，请联系客服人员线下开具相应发票。\n退费说明：若您需要取消活动报名，应在活动规定的取消报名截止时间前通过小程序内指定渠道操作。若您在使用本小程序付费服务过程中，因自身原因需要申请退费的，需在服务有效期内通过小程序内指定退费申请渠道提交书面退费申请，并说明退费理由。​\n退费计算方式：退费金额将根据您实际申请退费的时间与所报名活动的具体开始时间之间的间隔进行计算，具体退费规则请以活动发布时的相关规定为准。活动结束后申请退费的，不予退还任何费用。​\n退费处理周期：我们在收到您的退费申请后，将在【7】天内进行审核。审核通过后，将在【7】天内按照您原支付方式将退费金额退还至您的账户。若审核不通过，我们将向您说明原因。\n不予退费情形：除上述约定外，出现以下情况时，我们有权不予退费：​\n您已享受完所购买的全部服务；​\n因您违反本协议规定导致服务被终止；​\n您以欺诈、虚假信息等不正当手段获取服务后申请退费。\n本规则所述“天”均指自然日，具体退费金额以实际审核结果为准。特殊活动可能有附加退费条款，以活动页面公示为准。\n二、向上GO-UP小程序积分规则\n在小程序中可通过消费累计积分，积分可折抵部分费用，但小程序积分不具备货币属性，不可直接兑换现金。\n积分积累\n- 基础累计比例：  \n- 消费后按比例赢得积分，1元 = 100积分（如报名费99元，可获取9900个积分），积分不可转让、赠送。\n积分使用\n 1. 积分使用基本规则\n积分抵扣比例\n  - 1000积分=1元 \n  - 1000-19999积分区间内，按1000积分=1元比例抵扣 \n- 20000-99999积分区间内每次最多抵扣20元（即最多消耗20000积分抵扣）\n- 积分大于100000时，每次最高可使用50000积分抵扣50元  \n(2) 抵扣对照表\n\n积分过期与回收规则\n- 滚动过期：积分获取后12个月失效（如2023年10月获得的积分，2024年10月1日过期）  \n- 积分一经抵扣不再退回，包含退款或未参加活动等情况\n支付流程\n1. 用户在支付页面可选择“使用积分抵扣”选项，勾选后支付金额将改为抵扣后的实际支付金额；  \n2. 确认支付 → 支付成功后，用于抵扣的积分在用户积分余额中自动扣除 \n3. 积分扣除但未成功抵扣支付金额，用户可联系客服申请退还积分。我们在收到您的申请后，将在【7】天内进行审核。审核通过后，将在【7】天内按照您扣除的积分退还至您的账户。若审核不通过，我们将向您说明原因。`,
      user: `向上GO-UP小程序\n用户使用协议及平台法律规则\n欢迎您使用“向上GO-UP”（以下简称“本小程序”）！\n在使用本小程序之前，请确认您已完全阅读、理解并同意本协议全部内容。本协议内容中以黑体、加粗、下划线、斜体等方式显著标识的条款，请着重阅读。如果您对本协议的任何条款表示异议，您可以选择不使用。\n一、定义与解释\n1、“向上GO-UP”：成立于2023年，是以中外多元化服务及文化艺术交流为核心，融合志愿服务与劳务就业服务的综合性品牌。本小程序是由济南市历下区向上国际文化交流俱乐部（以下简称“我们”）制作拥有和经营的活动平台。该平台提供汉语、外语、志愿服务等活动，以及中外文化策划、展览、翻译、体验、科普宣传等业务，同时也为合作方提供活动发布、报名等服务。\n2、账号：是本小程序向您提供服务的唯一身份标识，您可自行注册本小程序账号并设置密码，使用本小程序账号登录后可以使用本小程序的各项产品功能。\n3、用户：指注册或直接使用本小程序的个人或组织。用户内容包括但不限于用户上传的文字、图片、视频、评论、报名信息等数据。\n二、用户使用规范\n本小程序注册用户应具备完全民事行为能力（中国及各国家地区的用户均需具有合法身份），不符合条件者应立即停止使用。在小程序中发布活动者应为中国大陆地区具有合法开展组织活动或其他业务的法人身份或其他组织或个人。参与活动者如为未成年的，需遵守《未成年人保护法》并获取监护人同意。\n（一）身份核验\n1、在您注册账号时，应根据提示填写正确的姓名、手机号、有效证件号信息，以便核验身份并在必要时与您联系，同时根据提示选择兴趣爱好、年龄段、语言等信息，以便我们为您提供相对应服务。\n2、用户应对在“向上GO UP”平台上注册信息的真实性、合法性、有效性承担全部责任，严禁冒用他人身份或企业信息发布内容，否则“向上GO UP”有权立即停止提供服务，暂停或中止账号，并自行承担相应法律责任。\n3、“向上GO UP”仅对用户提交的信息资料进行形式审查（包括格式审核、必填项检查等基础审核），不对其真实性、准确性、时效性等进行实质性核查。因用户提供信息不实引发的任何纠纷或责任，均由用户自行承担，“向上GO UP”不承担任何责任。\n4、您应对您注册的账号及密码的安全负责。任何使用您账号及密码进行的操作，我们均视为您本人的行为。若您发现账号遭他人非法使用，应立即通知我们，并按照我们的要求采取相应措施。若因黑客行为或您的管理疏忽导致账号、密码外泄，我们不承担责任。\n（二）隐私保护​\n个人信息收集\n我们将依据隐私政策收集、使用和保护您的个人信息。在使用本小程序时，可能会收集身份信息、设备信息、位置信息等必要数据，所有信息处理均在最小必要范围内进行，并采取严格安全保护措施。​\n信息共享与披露\n我们承诺严格保护您的个人信息，仅在以下情况处理您的数据：\n已获得您的明确授权；\n基于法定情形下：根据法律法规的规定、诉讼争议解决需要，或行政、司法等有权机关依法提出的要求。\n我们承诺在必须与合作伙伴共享信息时，所有数据共享行为都将严格遵循相关法律法规，并采取合理措施确保您的信息安全，我们将：\n与合作伙伴签订保密协议\n限定最小必要范围\n如共享目的达成或合作终止，将及时要求合作伙伴删除或匿名化处理相关数据\n隐私政策更新\n我们可能会不时更新隐私政策。更新后的隐私政策将在小程序内公布。您继续使用本小程序即视为您已接受更新后的隐私政策。\n三、基本规则说明\n1、报名信息提交：您参与本小程序发布的活动报名，需符合活动页面明确的报名条件。因您提交的信息不真实、不准确或不完整导致无法正常参与活动、产生纠纷或造成损失的，由您自行承担责任。\n2、报名确认与取消：您提交报名信息后视为报名成功，应按照活动要求准时参与活动，并遵守活动现场的管理规定和纪律。“向上GO-UP”将通过小程序消息、短信或其他约定方式，向用户发送账号注册、活动审核、报名通知、支付信息、活动推荐等相关信息。\n3、活动变更与取消：我们有权根据实际情况对活动的时间、地点、内容、规则等进行变更，或取消活动，并将通过小程序内公告、消息推送、短信等方式及时通知已报名用户。若活动取消或变更导致您无法参与，对于已支付报名费用的用户，我们将全额退还报名费用（扣除已产生的必要费用）。\n4、内容合规： 您承诺在“向上GO-UP”平台上发布或传输、上传的内容需合法合规，不得侵犯他人的著作权、商标、名誉、隐私或其他合法权益，同时符合中华人民共和国法律、行政法规等要求（包括但不限于《中华人民共和国保守国家秘密法》、《中华人民共和国著作权法》、《中华人民共和国计算机信息系统安全保护条例》、《中华人民共和国计算机信息系统安全保护条例》、《信息网络传播权条例》、《互联网直播服务管理规定》等相关规定），应符合网络道德和风俗，您理解并承诺独立自己对“向上GO-UP”平台上的所有行为承担法律责任，不得发布或传输、上传含有以下信息的内容：\n危害国家安全，泄露国家秘密，颠覆国家政权，破坏国家统一的；\n损害国家荣誉和利益的；\n煽动民族仇恨、民族歧视、破坏民族团结的；\n破坏国家宗教政策，宣扬邪教和封建迷信的；\n散布谣言，扰乱社会秩序，破坏社会稳定的；\n煽动非法集会、结社、游行、示威、聚众扰乱社会秩序的；\n散布淫秽、色情、赌博、暴力、凶杀、恐怖或者教唆犯罪的；\n法律、行政法规限制或禁止, 违背社会公序良俗的其他内容。\n 禁止行为：未经我们书面同意，您不得实施以下行为：​\n对本小程序进行反向工程、反编译、反汇编或试图获取本小程序的源代码\n以任何方式对本小程序进行修改、出租、出售、复制、创作衍生品或用于任何商业用途；\n利用本小程序进行任何形式的广告宣传、推广或商业活动，应先行取得我们明确允许；\n擅自使用本小程序的商标、LOGO、服务标记、域名和其他显著品牌特征​\n四、知识产权\n1、 “向上GO-UP”知识产权\n本小程序及其全部内容（包括但不限于文字、图像、音视频、软件代码、界面设计等）均受《中华人民共和国著作权法》《计算机软件保护条例》等法律法规保护。未经我方或相关权利人书面授权，任何单位或个人不得以复制、传播、修改、商业性使用等任何形式侵害上述知识产权。\n2、 合作用户内容原创性\n合作用户在“向上GO-UP”发布的内容应保证原创性或已取得合法授权，保证内容不侵犯任何第三方的合法权益，并同意授予“向上GO-UP”所有上述内容在全球范围内的免费、不可撤销的的使用权许可，用于本小程序的运营、推广及其他合法目的使用。如您通过本小程序上传、发布、传输的任何内容侵犯任何第三方的合法权益，导致任何第三方提出索赔、诉讼或其他法律纠纷，您承担全部法律责任，并赔偿我们及其他相关方因此遭受的损失。我们有权处理违规信息，采取屏蔽、删除、对账户采取停止服务和封号等措施。同时我们有权就您的违法违规行为采取相对应的法律措施，若您的行为造成严重影响，致使“向上GO-UP”卷入公共事件，我们有权向您主张损害赔偿。\n五、活动免责声明\n用户参与活动前应自行评估风险，并建议采取必要的安全防护措施（包括但不限于购买商业保险）。用户因参与活动所产生的人身伤害、财产损失等一切后果均需自行承担，本平台不承担任何直接或间接的法律责任。\n我们不保证本小程序服务将不间断、及时、安全或无错误，不保证因使用本小程序服务而获得的任何结果将符合您的预期。对于因电信系统或互联网网络故障、计算机故障、计算机病毒、黑客攻击、政府行为、不可抗力或其他不可预见、不可避免的原因而导致的任何损失或损害，我们不承担责任。\n本小程序不对合作活动的组织质量、实施效果及安全性作任何形式的担保或承诺。\n六、协议变更​\n我们保留随时修改本协议条款的权利。修改后的协议将在小程序内或其他合适的渠道公布，若您在协议变更后继续使用本小程序，即视为您已接受变更后的协议内容，若您不同意变更后的协议，您应停止使用本小程序。\n七、争议解决​\n1、适用法律：本协议的订立、执行和解释及争议的解决均适用中华人民共和国法律。​\n2、争议解决方式：如双方在本协议履行过程中发生争议，应首先通过友好协商解决；协商不成的，任何一方均有权向开发者所在地人民法院提起诉讼。\n八、其他条款​\n1、若本协议的任何条款被认定为无效或不可执行，不影响其他条款的效力和执行。\n2、“向上GO-UP”对本协议拥有最终解释权。\n\n联系我们：2503010115@qq.com/18660780425\n \n\n\n点击“同意”即表示您已阅读并接受本协议全部内容。`
    }

    const openTxt = (i) => {
      if (i >= txtCandidates.length) {
        const built = builtinText[key]
        if (built) {
          this.setData({ docOverlayVisible: true, docTitle: title, docContent: built })
          wx.hideLoading()
          return
        }
        wx.hideLoading()
        wx.showToast({ title: '未找到文档', icon: 'none' })
        return
      }
      fs.readFile({
        filePath: txtCandidates[i],
        encoding: 'utf-8',
        success: (res) => {
          this.setData({ docOverlayVisible: true, docTitle: title, docContent: String(res.data || '') })
          wx.hideLoading()
        },
        fail: (err) => {
          console.warn('read txt failed:', txtCandidates[i], err)
          openTxt(i + 1)
        }
      })
    }

    const openDocx = (i) => {
      if (i >= docxCandidates.length) {
        // docx 无法读取或不支持时，回退到 txt 弹窗
        openTxt(0)
        return
      }
      const srcPath = docxCandidates[i]

      // 优先尝试直接打开代码包内的 docx 文件
      wx.openDocument({
        filePath: srcPath,
        fileType: 'docx',
        showMenu: true,
        success: () => { wx.hideLoading() },
        fail: (err) => {
          console.warn('direct open docx failed:', srcPath, err)

          // 回退：读入内存 -> 写入用户数据目录 -> 打开
          const baseName = (srcPath.split('/').pop() || '')
          const cleanedName = baseName.replace(/\s+\.(docx|doc)$/i, '.$1')
          const destPath = `${wx.env.USER_DATA_PATH}/${cleanedName}`
          fs.readFile({
            filePath: srcPath, // 不指定 encoding，返回 ArrayBuffer
            success: (res) => {
              fs.writeFile({
                filePath: destPath,
                data: res.data, // 直接写入 ArrayBuffer
                success: () => {
                  const ext = (cleanedName.split('.').pop() || '').toLowerCase()
                  wx.openDocument({
                    filePath: destPath,
                    fileType: ext === 'doc' ? 'doc' : 'docx',
                    showMenu: true,
                    success: () => { wx.hideLoading() },
                    fail: (err2) => {
                      console.warn('open docx failed:', srcPath, destPath, err2)
                      openDocx(i + 1)
                    }
                  })
                },
                fail: (err) => {
                  console.warn('write docx failed:', destPath, err)
                  openDocx(i + 1)
                }
              })
            },
            fail: (err) => {
              console.warn('read docx failed:', srcPath, err)
              openDocx(i + 1)
            }
          })
        }
      })
    }

    openDocx(0)
  },
  onCloseDoc() {
    this.setData({ docOverlayVisible: false, docTitle: '', docContent: '' })
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