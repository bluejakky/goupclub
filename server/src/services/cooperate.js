import { query } from '../db.js'

export async function ensureCooperateRequestsSchema() {
  await query(`
    CREATE TABLE IF NOT EXISTS cooperate_requests (
      id INT AUTO_INCREMENT PRIMARY KEY,
      memberId INT NOT NULL,
      name VARCHAR(64) NOT NULL,
      phone VARCHAR(32) NOT NULL,
      company VARCHAR(128) NULL,
      brief TEXT NULL,
      status ENUM('created','reviewed','contacted','rejected') NOT NULL DEFAULT 'created',
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_member (memberId),
      INDEX idx_status (status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `)
}

export function registerCooperateRoutes(app) {
  // 查询某会员的已提交次数
  app.get('/api/cooperate/count', async (req, res) => {
    try {
      const memberId = Number(req.query.memberId || req.body?.memberId || 0)
      if (!Number.isFinite(memberId) || memberId <= 0) {
        return res.status(400).json({ error: 'bad_request', message: '缺少有效的 memberId' })
      }
      const rows = await query('SELECT COUNT(*) AS cnt FROM cooperate_requests WHERE memberId = ?', [memberId])
      const count = Number(rows?.[0]?.cnt || 0)
      return res.json({ count, remaining: Math.max(0, 2 - count) })
    } catch (e) {
      return res.status(500).json({ error: 'server_error', message: e.message })
    }
  })

  // 提交合作申请
  app.post('/api/cooperate', async (req, res) => {
    try {
      const memberId = Number(req.body?.memberId || 0)
      const name = String(req.body?.name || '').trim()
      const phone = String(req.body?.phone || '').trim()
      const company = String(req.body?.company || '').trim()
      const brief = String(req.body?.brief || '').trim()

      if (!Number.isFinite(memberId) || memberId <= 0) {
        return res.status(400).json({ error: 'bad_request', message: '缺少有效的 memberId' })
      }
      if (!name || name.length < 2) {
        return res.status(400).json({ error: 'bad_request', message: '姓名不合法' })
      }
      if (!phone || phone.length < 6) {
        return res.status(400).json({ error: 'bad_request', message: '电话不合法' })
      }
      if (!company || company.length < 2) {
        return res.status(400).json({ error: 'bad_request', message: '企业名称不合法' })
      }
      if (!brief || brief.length < 5) {
        return res.status(400).json({ error: 'bad_request', message: '合作简介太短' })
      }

      const rows = await query('SELECT COUNT(*) AS cnt FROM cooperate_requests WHERE memberId = ?', [memberId])
      const count = Number(rows?.[0]?.cnt || 0)
      if (count >= 2) {
        return res.status(403).json({ error: 'limit_reached', message: '提交次数已达上限(2次)' })
      }

      await query(
        'INSERT INTO cooperate_requests (memberId, name, phone, company, brief, status) VALUES (?,?,?,?,?,?)',
        [memberId, name, phone, company, brief, 'created']
      )

      return res.json({ ok: true, remaining: Math.max(0, 2 - (count + 1)) })
    } catch (e) {
      return res.status(500).json({ error: 'server_error', message: e.message })
    }
  })
}