import crypto from 'crypto'
import fs from 'fs'

const readPem = (pemOrPath) => {
  if (!pemOrPath) return ''
  try {
    if (pemOrPath.startsWith('/') || pemOrPath.endsWith('.pem') || pemOrPath.endsWith('.key')) {
      return fs.readFileSync(pemOrPath, 'utf8')
    }
  } catch {}
  return pemOrPath
}

// ===== WeChat JSAPI v3 =====
export async function wechatJsapiPrepay({ appId, mchId, serialNo, privateKeyPem, notifyUrl, description, outTradeNo, total, openid }) {
  const urlPath = '/v3/pay/transactions/jsapi'
  const url = `https://api.mch.weixin.qq.com${urlPath}`
  const ts = Math.floor(Date.now() / 1000).toString()
  const nonceStr = crypto.randomBytes(16).toString('hex')
  const bodyObj = {
    appid: appId,
    mchid: mchId,
    description,
    out_trade_no: String(outTradeNo),
    notify_url: notifyUrl,
    amount: { total: Number(total), currency: 'CNY' },
    payer: { openid }
  }
  const body = JSON.stringify(bodyObj)

  const signMessage = `POST\n${urlPath}\n${ts}\n${nonceStr}\n${body}\n`
  const sign = crypto.createSign('RSA-SHA256')
  sign.update(signMessage)
  const signature = sign.sign(privateKeyPem, 'base64')

  const authHeader = `WECHATPAY2-SHA256-RSA2048 mchid="${mchId}",nonce_str="${nonceStr}",timestamp="${ts}",serial_no="${serialNo}",signature="${signature}"`

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': authHeader,
      'Accept': 'application/json'
    },
    body
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    throw new Error(`wechat_prepay_error: ${resp.status} ${JSON.stringify(data)}`)
  }
  const prepayId = data?.prepay_id
  if (!prepayId) throw new Error('wechat_prepay_error: missing prepay_id')

  const payTs = Math.floor(Date.now() / 1000).toString()
  const payNonce = crypto.randomBytes(16).toString('hex')
  const pkg = `prepay_id=${prepayId}`
  const payMsg = `${appId}\n${payTs}\n${payNonce}\n${pkg}\n`
  const paySigner = crypto.createSign('RSA-SHA256')
  paySigner.update(payMsg)
  const paySign = paySigner.sign(privateKeyPem, 'base64')

  return {
    prepayId,
    payParams: {
      timeStamp: payTs,
      nonceStr: payNonce,
      package: pkg,
      signType: 'RSA',
      paySign
    }
  }
}

// Verify WeChat notify signature and decrypt resource
export function verifyWechatNotifySignature({ timestamp, nonce, body, platformPublicKeyPem, signature }) {
  const msg = `${timestamp}\n${nonce}\n${body}\n`
  const verifier = crypto.createVerify('RSA-SHA256')
  verifier.update(msg)
  try {
    return verifier.verify(platformPublicKeyPem, signature, 'base64')
  } catch {
    return false
  }
}

export function decryptWechatResource({ apiV3Key, associated_data, nonce, ciphertext }) {
  const key = Buffer.from(apiV3Key, 'utf8')
  const iv = Buffer.from(nonce, 'utf8')
  const aad = Buffer.from(associated_data || '', 'utf8')
  const enc = Buffer.from(ciphertext, 'base64')
  const tag = enc.subarray(enc.length - 16)
  const data = enc.subarray(0, enc.length - 16)
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(tag)
  if (associated_data) decipher.setAAD(aad)
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
  return JSON.parse(decrypted.toString('utf8'))
}

// ===== Alipay WAP =====
const buildQuery = (params) => Object.keys(params).sort().map(k => `${k}=${encodeURIComponent(params[k])}`).join('&')
const buildSignSource = (params) => Object.keys(params).sort().map(k => `${k}=${params[k]}`).join('&')

export function alipayWapPay({ appId, privateKeyPem, gateway, notifyUrl, returnUrl, subject, outTradeNo, total }) {
  const method = 'alipay.trade.wap.pay'
  const charset = 'utf-8'
  const signType = 'RSA2'
  const timestamp = new Date().toISOString().slice(0,19).replace('T',' ')
  const version = '1.0'
  const biz_content = JSON.stringify({
    subject,
    out_trade_no: String(outTradeNo),
    total_amount: (Number(total)/100).toFixed(2),
    product_code: 'QUICK_WAP_WAY'
  })

  const params = {
    app_id: appId,
    method,
    format: 'JSON',
    charset,
    sign_type: signType,
    timestamp,
    version,
    notify_url: notifyUrl,
    return_url: returnUrl,
    biz_content
  }
  const source = buildSignSource(params)
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(source, 'utf8')
  const sign = signer.sign(privateKeyPem, 'base64')
  const payUrl = `${gateway || 'https://openapi.alipay.com/gateway.do'}?${buildQuery({ ...params, sign })}`
  return { payUrl }
}

export function verifyAlipayNotify(params, alipayPublicKeyPem) {
  const cloned = { ...params }
  const sign = cloned.sign
  const sign_type = cloned.sign_type || 'RSA2'
  delete cloned.sign
  delete cloned.sign_type
  const source = buildSignSource(cloned)
  const verifier = crypto.createVerify(sign_type === 'RSA2' ? 'RSA-SHA256' : 'RSA-SHA1')
  verifier.update(source, 'utf8')
  try {
    return verifier.verify(alipayPublicKeyPem, sign, 'base64')
  } catch {
    return false
  }
}

export function getConfigFromEnv() {
  const env = process.env
  return {
    wechat: {
      appId: env.WECHAT_APP_ID,
      mchId: env.WECHAT_MCH_ID,
      serialNo: env.WECHAT_SERIAL_NO,
      privateKeyPem: readPem(env.WECHAT_PRIVATE_KEY_PEM),
      notifyUrl: env.WECHAT_NOTIFY_URL,
      platformPublicKeyPem: readPem(env.WECHAT_PLATFORM_PUBLIC_KEY_PEM),
      apiV3Key: env.WECHAT_API_V3_KEY
    },
    alipay: {
      appId: env.ALIPAY_APP_ID,
      privateKeyPem: readPem(env.ALIPAY_PRIVATE_KEY),
      publicKeyPem: readPem(env.ALIPAY_PUBLIC_KEY),
      gateway: env.ALIPAY_GATEWAY || 'https://openapi.alipay.com/gateway.do',
      notifyUrl: env.ALIPAY_NOTIFY_URL,
      returnUrl: env.ALIPAY_RETURN_URL
    }
  }
}