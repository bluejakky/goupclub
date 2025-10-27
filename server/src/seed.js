import 'dotenv/config';
import { query, pool } from './db.js';

async function resetTable(name) {
  try {
    await query(`DELETE FROM ${name}`);
    await query(`ALTER TABLE ${name} AUTO_INCREMENT = 1`);
    console.log(`[reset] ${name} cleared`);
  } catch (e) {
    console.error(`[reset] ${name} failed:`, e.message);
    throw e;
  }
}

async function main() {
  try {
    // 清空表，按依赖顺序
    const tables = ['payments', 'orders', 'member_vouchers', 'activities', 'members', 'categories', 'voucher_config'];
    for (const t of tables) {
      await resetTable(t);
    }

    // 基础分类
    const baseCats = [
      { name: '汉语', weight: 10, builtin: 1 },
      { name: '英语', weight: 9, builtin: 1 },
      { name: '小语种', weight: 8, builtin: 1 },
      { name: '志愿', weight: 7, builtin: 1 },
      { name: '主题', weight: 6, builtin: 1 },
    ];
    for (const c of baseCats) {
      await query('INSERT INTO categories (name, weight, builtin) VALUES (?,?,?)', [c.name, c.weight, c.builtin]);
    }
    console.log('[seed] categories inserted');

    // 会员
    const members = [
      { nameEn: 'Alice', gender: '女', age: 24, nation: '中国', flag: '🇨🇳', registeredAt: '2025-09-20', memberGroup: '核心会员', totalParticipations: 12, disabled: 0 },
      { nameEn: 'Bob', gender: '男', age: 29, nation: '美国', flag: '🇺🇸', registeredAt: '2025-08-11', memberGroup: '志愿者', totalParticipations: 5, disabled: 0 },
      { nameEn: 'Carol', gender: '女', age: 22, nation: '英国', flag: '🇬🇧', registeredAt: '2025-09-05', memberGroup: '普通会员', totalParticipations: 2, disabled: 0 },
    ];
    const memberIds = [];
    for (const m of members) {
      const r = await query(
        'INSERT INTO members (nameEn, gender, age, nation, flag, registeredAt, memberGroup, totalParticipations, disabled) VALUES (?,?,?,?,?,?,?,?,?)',
        [m.nameEn, m.gender, m.age, m.nation, m.flag, m.registeredAt, m.memberGroup, m.totalParticipations, m.disabled]
      );
      memberIds.push(r.insertId);
    }
    console.log('[seed] members inserted:', memberIds);

    // 活动（注意 groupTags 列）
    const activities = [
      {
        title: '英语角交流',
        start: '2025-10-10 19:00:00',
        end: '2025-10-10 21:00:00',
        place: '市图书馆',
        lat: null,
        lng: null,
        categoryIds: [2],
        groupTags: ['外国人', '中国人'],
        min: 0,
        max: 20,
        waitlist: 5,
        enrolled: 18,
        price: 20.0,
        status: '已发布',
        isTop: 0,
        isHot: 1,
        publishedAt: '2025-10-01 12:00:00',
        mainImage: '',
        images: [],
        content: '一起练习英语口语交流。',
      },
      {
        title: '主题活动·城市探访',
        start: '2025-10-20 13:00:00',
        end: '2025-10-20 17:00:00',
        place: '市中心集合',
        lat: null,
        lng: null,
        categoryIds: [5],
        groupTags: ['核心会员', '志愿者'],
        min: 5,
        max: 30,
        waitlist: 10,
        enrolled: 10,
        price: 99.0,
        status: '待发布',
        isTop: 1,
        isHot: 0,
        publishedAt: null,
        mainImage: '',
        images: [],
        content: '探访城市文化地标。',
      },
    ];
    const activityIds = [];
    for (const a of activities) {
      const r = await query(
        'INSERT INTO activities (title, start, end, place, lat, lng, categoryIds, groupTags, min, max, waitlist, enrolled, price, status, isTop, isHot, publishedAt, mainImage, images, content) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
        [
          a.title,
          a.start,
          a.end,
          a.place,
          a.lat,
          a.lng,
          JSON.stringify(a.categoryIds || []),
          JSON.stringify(a.groupTags || []),
          a.min || 0,
          a.max || 1,
          a.waitlist || 0,
          a.enrolled || 0,
          a.price || 0,
          a.status || '草稿',
          a.isTop ? 1 : 0,
          a.isHot ? 1 : 0,
          a.publishedAt || null,
          a.mainImage || '',
          JSON.stringify(a.images || []),
          a.content || '',
        ]
      );
      activityIds.push(r.insertId);
    }
    console.log('[seed] activities inserted:', activityIds);

    // 返券配置
    await query('INSERT INTO voucher_config (discountRate, maxDiscount, cashbackRate) VALUES (?,?,?)', [0.2, 50.0, 0.1]);
    console.log('[seed] voucher_config inserted');

    // 会员代金券（账户）
    const nowIso = new Date().toISOString();
    const vouchers = [
      { memberId: memberIds[0], title: '报名返券', source: 'cashback', orderId: null, amount: 20.0, balance: 20.0, status: 'available', expireAt: null, meta: { note: '英语角返券' } },
      { memberId: memberIds[1], title: '活动优惠', source: 'promo', orderId: null, amount: 30.0, balance: 30.0, status: 'available', expireAt: null, meta: { note: '新人券' } },
    ];
    const voucherIds = [];
    for (const v of vouchers) {
      const r = await query(
        'INSERT INTO member_vouchers (memberId, title, source, orderId, amount, balance, status, expireAt, meta) VALUES (?,?,?,?,?,?,?,?,?)',
        [v.memberId, v.title, v.source, v.orderId, v.amount, v.balance, v.status, v.expireAt, JSON.stringify({ ...v.meta, seededAt: nowIso })]
      );
      voucherIds.push(r.insertId);
    }
    console.log('[seed] member_vouchers inserted:', voucherIds);

    // 订单与支付
    // 订单1：Alice 报名英语角（使用 10 元券），状态：paid
    const order1 = await query(
      'INSERT INTO orders (activityId, memberId, amount, currency, status, paymentMethod, transactionId, discountAmount, voucherApplied, createdAt, paidAt, refundAt) VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,?,NULL)',
      [
        activityIds[0],
        memberIds[0],
        10.0, // 原价 20，使用券 10 抵扣
        'CNY',
        'paid',
        'wechat',
        'WX-TXN-001',
        10.0,
        JSON.stringify({ voucherUsage: { voucherId: voucherIds[0], usedAmount: 10.0 } }),
        new Date(),
      ]
    );
    const payment1 = await query(
      'INSERT INTO payments (orderId, provider, providerTxnId, status, amount, paidAt, meta, createdAt) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)',
      [order1.insertId, 'wechat', 'WX-TXN-001', 'paid', 10.0, new Date(), JSON.stringify({ seededAt: nowIso })]
    );
    // 订单2：Bob 报名主题活动，状态：created（未支付）
    const order2 = await query(
      'INSERT INTO orders (activityId, memberId, amount, currency, status, paymentMethod, transactionId, discountAmount, voucherApplied, createdAt, paidAt, refundAt) VALUES (?,?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP,NULL,NULL)',
      [activityIds[1], memberIds[1], 99.0, 'CNY', 'created', null, null, 0.0, null]
    );

    console.log('[seed] orders inserted:', order1.insertId, order2.insertId);
    console.log('[seed] payments inserted:', payment1.insertId);

    // 更新已使用券余额（模拟用券10元）
    await query('UPDATE member_vouchers SET balance = balance - 10 WHERE id = ?', [voucherIds[0]]);

    console.log('\n✅ 数据已重置并写入示例测试数据');
  } catch (e) {
    console.error('❌ 种子数据失败：', e);
    process.exitCode = 1;
  } finally {
    try { await pool.end(); } catch {}
  }
}

main();