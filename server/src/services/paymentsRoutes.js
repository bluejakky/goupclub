import { query } from '../db.js'
import { wechatJsapiPrepay, alipayWapPay, verifyWechatNotifySignature, decryptWechatResource, verifyAlipayNotify, getConfigFromEnv } from './payments.js'
import { computeDeduction } from './voucher.js'

async function getPointsAccount(memberId) {
  const rows = await query('SELECT balance, locked FROM member_points_accounts WHERE memberId = ?', [memberId])
  return rows[0] || { balance: 0, locked: 0 }
}

export function registerPaymentRoutes(app) {
  // Official prepay route (overrides mock)
  app.post('/api/payments/prepay', async (req, res) => {
    const { orderId, amount, provider, useVoucher, voucherAmount, memberId, pointsToUse, usePoints, openid, description, subject, returnUrl } = req.body || {}
    if (!orderId || !provider) return res.status(400).json({ error: 'orderId/provider required' })
    try {
      const now = new Date()
      let finalPayable = Number(amount || 0)
      let appliedVoucher = 0
      try {
        if (useVoucher && Number(voucherAmount || 0) > 0) {
          const cfgRows = await query('SELECT discountRate, maxDiscount, minAmount FROM voucher_config ORDER BY id DESC LIMIT 1')
          const cfg = cfgRows[0] || {}
          const r = computeDeduction(finalPayable, Number(voucherAmount || 0), cfg)
          appliedVoucher = Number(r.appliedVoucher || 0)
          finalPayable = Number(r.finalPayable || finalPayable)
        }
      } catch {}

      const requestedPoints = Number(pointsToUse != null ? pointsToUse : (usePoints != null ? usePoints : 0)) || 0
      let appliedPoints = 0
      let pointsCashDeduction = 0
      if (requestedPoints > 0) {
        try {
          let available = requestedPoints
          if (memberId) {
            const acc = await getPointsAccount(memberId)
            available = Math.max(Number(acc.balance || 0) - Number(acc.locked || 0), 0)
            available = Math.min(available, requestedPoints)
          }
          pointsCashDeduction = Math.floor(Number(available || 0) / 10000)
          pointsCashDeduction = Math.min(pointsCashDeduction, Math.round(Number(finalPayable || 0)))
          appliedPoints = pointsCashDeduction * 10000
          finalPayable = Math.max(Math.round(Number(finalPayable || 0)) - pointsCashDeduction, 0)
        } catch {}
      }

      finalPayable = Math.round(Number(finalPayable || 0))
      const meta = {
        requestedAt: now.toISOString(),
        appliedVoucher,
        pointsUsage: {
          memberId: memberId || null,
          requestedPoints,
          appliedPoints,
          pointsCashDeduction,
          unitPerCurrency: 10000,
        },
        orderInfo: {
          description: description || null,
          subject: subject || null,
          openid: openid || null,
          returnUrl: returnUrl || null,
        }
      }

      const initResult = await query(
        'INSERT INTO payments (orderId, provider, providerTxnId, status, amount, meta, createdAt) VALUES (?,?,?,?,?, ?, CURRENT_TIMESTAMP)',
        [orderId, provider, null, 'initiated', Number(finalPayable || 0), JSON.stringify(meta)]
      )

      const cfg = getConfigFromEnv()
      let payParams = null
      let payUrl = null
      let prepayId = null

      if (provider === 'wechat') {
        if (!cfg.wechat.appId || !cfg.wechat.mchId || !cfg.wechat.serialNo || !cfg.wechat.privateKeyPem || !cfg.wechat.notifyUrl) {
          return res.status(500).json({ error: 'wechat config missing', fields: ['WECHAT_APP_ID','WECHAT_MCH_ID','WECHAT_SERIAL_NO','WECHAT_PRIVATE_KEY_PEM','WECHAT_NOTIFY_URL'] })
        }
        if (!openid) return res.status(400).json({ error: 'openid required for wechat jsapi' })
        const desc = description || subject || '活动报名支付'
        const totalInCents = Math.max(Math.round(Number(finalPayable || 0) * 100), 0)
        const r = await wechatJsapiPrepay({
          appId: cfg.wechat.appId,
          mchId: cfg.wechat.mchId,
          serialNo: cfg.wechat.serialNo,
          privateKeyPem: cfg.wechat.privateKeyPem,
          notifyUrl: cfg.wechat.notifyUrl,
          description: desc,
          outTradeNo: String(orderId),
          total: totalInCents,
          openid
        })
        prepayId = r.prepayId
        payParams = r.payParams
      } else if (provider === 'alipay') {
        if (!cfg.alipay.appId || !cfg.alipay.privateKeyPem || !cfg.alipay.notifyUrl || !cfg.alipay.returnUrl) {
          return res.status(500).json({ error: 'alipay config missing', fields: ['ALIPAY_APP_ID','ALIPAY_PRIVATE_KEY','ALIPAY_NOTIFY_URL','ALIPAY_RETURN_URL'] })
        }
        const subj = subject || description || '活动报名支付'
        const r = alipayWapPay({
          appId: cfg.alipay.appId,
          privateKeyPem: cfg.alipay.privateKeyPem,
          gateway: cfg.alipay.gateway,
          notifyUrl: cfg.alipay.notifyUrl,
          returnUrl: cfg.alipay.returnUrl,
          subject: subj,
          outTradeNo: String(orderId),
          total: Number(finalPayable || 0)
        })
        payUrl = r.payUrl
        prepayId = `alipay_${orderId}`
      } else {
        return res.status(400).json({ error: 'unsupported provider' })
      }

      await query('UPDATE payments SET providerTxnId = ?, meta = JSON_SET(COALESCE(meta, "{}"), "$.prepayId", ?) WHERE id = ?', [prepayId || null, prepayId || null, initResult.insertId])

      res.json({ ok: true, orderId, amount: Number(finalPayable || 0), prepayId, provider, openid: openid || null, originalAmount: Math.round(Number(amount || 0)), appliedVoucher, pointsUsage: meta.pointsUsage, payParams, payUrl })
    } catch (e) {
      try { await query('INSERT INTO payment_errors (provider, orderId, reason, detail) VALUES (?,?,?,?)', [provider || null, orderId || null, 'prepay_error', e.message]) } catch {}
      res.status(500).json({ error: e.message })
    }
  })

  // Official WeChat notify (v3 signature + resource decrypt)
  app.post('/api/payments/wechat/notify', async (req, res) => {
    try {
      const timestamp = req.headers['wechatpay-timestamp']
      const nonce = req.headers['wechatpay-nonce']
      const signature = req.headers['wechatpay-signature']
      const serial = req.headers['wechatpay-serial']
      const rawBody = req.rawBody || JSON.stringify(req.body || {})
      const { wechat } = getConfigFromEnv()

      const ok = verifyWechatNotifySignature({ timestamp, nonce, body: rawBody, platformPublicKeyPem: wechat.platformPublicKeyPem, signature })
      if (!ok) {
        try { await query('INSERT INTO payment_errors (provider, orderId, reason, detail) VALUES (?,?,?,?)', ['wechat', null, 'invalid_signature', rawBody]) } catch {}
        return res.status(400).json({ error: 'invalid signature' })
      }

      const resource = (req.body || {}).resource || {}
      const decrypted = decryptWechatResource({ apiV3Key: wechat.apiV3Key, associated_data: resource.associated_data, nonce: resource.nonce, ciphertext: resource.ciphertext })

      const orderId = Number(decrypted?.out_trade_no)
      const amountPaid = Number(decrypted?.amount?.payer_total) / 100
      const providerTxnId = String(decrypted?.transaction_id || '')

      const existingPaid = await query("SELECT id FROM orders WHERE id = ? AND status = 'paid'", [orderId])
      if (existingPaid[0]) return res.json({ ok: true, skipped: true })

      const now = new Date()
      const payResult = await query(
        'INSERT INTO payments (orderId, provider, providerTxnId, status, amount, paidAt, meta, createdAt) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)',
        [orderId, 'wechat', providerTxnId || null, 'paid', amountPaid || 0, now, JSON.stringify({ notifiedAt: now.toISOString(), serial }),]
      )
      await query("UPDATE orders SET status='paid', paidAt=? WHERE id=?", [now, orderId])

      try {
        const rows = await query(
          "SELECT id, meta FROM payments WHERE orderId = ? AND status = 'initiated' ORDER BY id DESC LIMIT 1",
          [orderId]
        )
        const pre = rows[0]
        let pointsMemberId = null
        let pointsToDebit = 0
        try {
          const m = pre?.meta ? JSON.parse(pre.meta) : null
          const pu = m?.pointsUsage || null
          pointsMemberId = pu?.memberId || null
          pointsToDebit = Number(pu?.appliedPoints || 0)
        } catch {}
        if (pointsMemberId && pointsToDebit > 0) {
          const exist = await query(
            "SELECT id FROM points_transactions WHERE memberId = ? AND orderId = ? AND type = 'spend' AND direction = 'debit' LIMIT 1",
            [pointsMemberId, orderId]
          )
          if (!exist[0]) {
            await query(
              'INSERT INTO points_transactions (memberId, type, direction, amount, origin, activityId, orderId, meta) VALUES (?,?,?,?,?,?,?,?)',
              [pointsMemberId, 'spend', 'debit', pointsToDebit, 'order_payment', null, orderId, JSON.stringify({ via: 'wechat', notifiedAt: now.toISOString() })]
            )
            await query('UPDATE member_points_accounts SET balance = GREATEST(balance - ?, 0), updatedAt = CURRENT_TIMESTAMP WHERE memberId = ?', [pointsToDebit, pointsMemberId])
          }
        }
      } catch {}

      try {
        const [cfg] = await query('SELECT cashbackRate, cashbackTiers, specialActivities FROM voucher_config ORDER BY id DESC LIMIT 1')
        const orderRows = await query('SELECT memberId, activityId FROM orders WHERE id = ?', [orderId])
        const memberId = orderRows[0]?.memberId
        const activityId = orderRows[0]?.activityId
        if (memberId) {
          let baseRate = Number(cfg?.cashbackRate || 0)
          try {
            const tiers = cfg?.cashbackTiers ? JSON.parse(cfg.cashbackTiers) : []
            if (Array.isArray(tiers) && tiers.length) {
              let chosen = null
              const paid = Number(amountPaid || 0)
              for (const t of tiers) {
                const th = Number(t.threshold || t.min || 0)
                const rt = Number(t.rate || 0)
                if (paid >= th && rt >= 0) {
                  if (!chosen || th > chosen.th) chosen = { th, rt }
                }
              }
              if (chosen) baseRate = chosen.rt
            }
          } catch {}
          let multiplier = 1
          try {
            const specs = cfg?.specialActivities ? JSON.parse(cfg.specialActivities) : []
            if (Array.isArray(specs) && specs.length && activityId) {
              const match = specs.find((s) => Number(s.activityId || s.activityID || s.id) === Number(activityId))
              if (match) multiplier = Number(match.cashbackMultiplier || match.multiplier || 1)
            }
          } catch {}
          const effRate = baseRate * (Number.isFinite(multiplier) ? multiplier : 1)
          const cashbackAmt = Number(((Number(amountPaid || 0) * effRate)).toFixed(2))
          if (cashbackAmt > 0) {
            await query(
              "INSERT INTO member_vouchers (memberId, title, source, orderId, amount, balance, status, expireAt, meta) VALUES (?,?,?,?,?,?, 'available', NULL, ?)",
              [memberId, '报名返券', 'cashback', orderId, cashbackAmt, cashbackAmt, JSON.stringify({ via: 'wechat', paidAt: now.toISOString(), baseRate, multiplier })]
            )
          }
        }
      } catch {}
      res.json({ ok: true, paymentId: payResult.insertId })
    } catch (e) {
      try { await query('INSERT INTO payment_errors (provider, orderId, reason, detail) VALUES (?,?,?,?)', ['wechat', null, 'notify_error', e.message]) } catch {}
      res.status(500).json({ error: e.message })
    }
  })

  // Official Alipay notify (RSA2)
  app.post('/api/payments/alipay/notify', async (req, res) => {
    try {
      const params = req.body || {}
      const { alipay } = getConfigFromEnv()
      if (!verifyAlipayNotify(params, alipay.publicKeyPem)) {
        try { await query('INSERT INTO payment_errors (provider, orderId, reason, detail) VALUES (?,?,?,?)', ['alipay', params?.out_trade_no || null, 'invalid_signature', JSON.stringify(params)]) } catch {}
        return res.status(400).json({ error: 'invalid signature' })
      }
      const orderId = Number(params.out_trade_no)
      const amountPaid = Number(params.total_amount || 0)
      const providerTxnId = String(params.trade_no || '')

      const existingPaid = await query("SELECT id FROM orders WHERE id = ? AND status = 'paid'", [orderId])
      if (existingPaid[0]) return res.json({ ok: true, skipped: true })

      const now = new Date()
      const payResult = await query(
        'INSERT INTO payments (orderId, provider, providerTxnId, status, amount, paidAt, meta, createdAt) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)',
        [orderId, 'alipay', providerTxnId || null, 'paid', amountPaid || 0, now, JSON.stringify({ notifiedAt: now.toISOString() })]
      )
      await query("UPDATE orders SET status='paid', paidAt=? WHERE id=?", [now, orderId])

      try {
        const rows = await query(
          "SELECT id, meta FROM payments WHERE orderId = ? AND status = 'initiated' ORDER BY id DESC LIMIT 1",
          [orderId]
        )
        const pre = rows[0]
        let pointsMemberId = null
        let pointsToDebit = 0
        try {
          const m = pre?.meta ? JSON.parse(pre.meta) : null
          const pu = m?.pointsUsage || null
          pointsMemberId = pu?.memberId || null
          pointsToDebit = Number(pu?.appliedPoints || 0)
        } catch {}
        if (pointsMemberId && pointsToDebit > 0) {
          const exist = await query(
            "SELECT id FROM points_transactions WHERE memberId = ? AND orderId = ? AND type = 'spend' AND direction = 'debit' LIMIT 1",
            [pointsMemberId, orderId]
          )
          if (!exist[0]) {
            await query(
              'INSERT INTO points_transactions (memberId, type, direction, amount, origin, activityId, orderId, meta) VALUES (?,?,?,?,?,?,?,?)',
              [pointsMemberId, 'spend', 'debit', pointsToDebit, 'order_payment', null, orderId, JSON.stringify({ via: 'alipay', notifiedAt: now.toISOString() })]
            )
            await query('UPDATE member_points_accounts SET balance = GREATEST(balance - ?, 0), updatedAt = CURRENT_TIMESTAMP WHERE memberId = ?', [pointsToDebit, pointsMemberId])
          }
        }
      } catch {}

      try {
        const [cfg] = await query('SELECT cashbackRate, cashbackTiers, specialActivities FROM voucher_config ORDER BY id DESC LIMIT 1')
        const orderRows = await query('SELECT memberId, activityId FROM orders WHERE id = ?', [orderId])
        const memberId = orderRows[0]?.memberId
        const activityId = orderRows[0]?.activityId
        if (memberId) {
          let baseRate = Number(cfg?.cashbackRate || 0)
          try {
            const tiers = cfg?.cashbackTiers ? JSON.parse(cfg.cashbackTiers) : []
            if (Array.isArray(tiers) && tiers.length) {
              let chosen = null
              const paid = Number(amountPaid || 0)
              for (const t of tiers) {
                const th = Number(t.threshold || t.min || 0)
                const rt = Number(t.rate || 0)
                if (paid >= th && rt >= 0) {
                  if (!chosen || th > chosen.th) chosen = { th, rt }
                }
              }
              if (chosen) baseRate = chosen.rt
            }
          } catch {}
          let multiplier = 1
          try {
            const specs = cfg?.specialActivities ? JSON.parse(cfg.specialActivities) : []
            if (Array.isArray(specs) && specs.length && activityId) {
              const match = specs.find((s) => Number(s.activityId || s.activityID || s.id) === Number(activityId))
              if (match) multiplier = Number(match.cashbackMultiplier || match.multiplier || 1)
            }
          } catch {}
          const effRate = baseRate * (Number.isFinite(multiplier) ? multiplier : 1)
          const cashbackAmt = Number(((Number(amountPaid || 0) * effRate)).toFixed(2))
          if (cashbackAmt > 0) {
            await query(
              "INSERT INTO member_vouchers (memberId, title, source, orderId, amount, balance, status, expireAt, meta) VALUES (?,?,?,?,?,?, 'available', NULL, ?)",
              [memberId, '报名返券', 'cashback', orderId, cashbackAmt, cashbackAmt, JSON.stringify({ via: 'alipay', paidAt: now.toISOString(), baseRate, multiplier })]
            )
          }
        }
      } catch {}
      res.json({ ok: true, paymentId: payResult.insertId })
    } catch (e) {
      try { await query('INSERT INTO payment_errors (provider, orderId, reason, detail) VALUES (?,?,?,?)', ['alipay', null, 'notify_error', e.message]) } catch {}
      res.status(500).json({ error: e.message })
    }
  })
}