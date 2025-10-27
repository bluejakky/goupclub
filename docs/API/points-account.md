# 积分账户查询接口契约

本文档定义会员积分账户查询的接口、字段说明与响应示例，便于后端与前端/小程序集成与测试。

## 术语与目标

- 积分（Points）：系统内用于支付的虚拟值，包含“活动积分”和“裂变积分”。
- 活动积分：会员按支付金额获取的积分（每 1 元 → 10000 积分）。
- 裂变积分：推荐关系下，被邀请会员每次付费参与活动，推荐人按订单金额每 1 元获得 100 积分（按订单幂等一次）。
- 账户余额（balance）：当前可用积分总和（活动积分 + 裂变积分 - 已支付 + 已返还）。

## 端点

- `GET /api/points/account`
  - 鉴权：`Authorization: Bearer <token>`（会员端查询自身）；管理员可查询任意会员。
  - 管理员参数：`userId`（string，必填，用于查询指定会员）。
  - 可选参数：
    - `includeLedger`（boolean，默认 `false`，是否返回积分流水）
    - 结合分页规范使用：`page`、`pageSize`（仅在 `includeLedger=true` 时生效）
    - 时间过滤：`start`、`end`（ISO 字符串，过滤流水范围）

## 响应结构

```json
{
  "userId": "U123",
  "balance": 120000,
  "recent30d": { "earned": 100000, "spent": 30000, "returned": 5000 },
  "sources": {
    "activity": 90000,
    "referral": 30000
  },
  "ledger": {
    "total": 2,
    "items": [
      {
        "id": "LEDG-001",
        "type": "earn",              
        "sourceType": "activity",    
        "amount": 100000,
        "orderId": "ORD-1001",
        "activityId": "ACT-2001",
        "createdAt": "2025-01-01T12:30:00Z",
        "status": "posted"           
      },
      {
        "id": "LEDG-002",
        "type": "spend",             
        "sourceType": "payment",     
        "amount": -30000,
        "orderId": "ORD-1002",
        "activityId": "ACT-2002",
        "createdAt": "2025-01-05T09:00:00Z",
        "status": "posted"
      }
    ],
    "page": 1,
    "pageSize": 20,
    "hasNext": false
  }
}
```

### 字段说明

- `balance`：当前积分余额（正整数）。
- `recent30d`：近 30 天的积分汇总，包含 `earned`（获取）、`spent`（支付）、`returned`（返还）。
- `sources.activity`：累计活动积分（不含已支付与返还的影响）。
- `sources.referral`：累计裂变积分（不含已支付与返还的影响）。
- `ledger.items[].type`：`earn|spend|return|settlement`。
- `ledger.items[].sourceType`：`activity|referral|payment|refund|system`（`payment` 表示订单积分抵扣支出；退款不产生积分返还，`refund` 不用于返还积分）。
- `status`：`pending|posted|reverted`。

## 错误码

- `UNAUTHORIZED`：缺少或无效的鉴权令牌。
- `USER_NOT_FOUND`：管理员查询的 `userId` 不存在。
- `INVALID_RANGE`：`start`/`end` 时间范围非法。

## 前端集成约定

- 会员端：无 `userId` 参数，直接查询当前登录会员的积分账户。
- 管理端：使用 `userId` 查询指定会员；分页与筛选遵循《统一分页与搜索接口契约》。
- 小程序“我的→积分账户”页建议展示余额、近 30 天变化、流水明细（可分页）。

## 响应示例（会员端）

```json
{
  "userId": "U777",
  "balance": 250000,
  "recent30d": { "earned": 200000, "spent": 50000, "returned": 0 },
  "sources": { "activity": 220000, "referral": 30000 }
}
```