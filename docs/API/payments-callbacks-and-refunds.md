# 支付回调与退款通知接口契约

本文档定义微信/支付宝支付回调接口、订单状态幂等更新、退款通知与审计日志的契约，用于后端与前端/小程序集成与测试。

## 术语与目标

- 订单（Order）：活动报名的交易主体，包含 `id`、`userId`、`activityId`、`amount`、`status`。
- 支付（Payment）：一次具体支付或退款流水，包含 `id`、`orderId`、`provider`、`amount`、`type`（`pay`/`refund`）、`status`。
- 幂等：重复回调或重试不产生重复入账/退款，状态更新仅向“前进”方向变更。
- 通知：面向用户或管理员的到账/异常提醒（模板消息/站内/邮件，依据平台能力）。

## 支付预下单（参考现有接口）

- `POST /api/payments/prepay`
  - 入参：`{ orderId: string, amount: number, provider: 'wechat'|'alipay' }`
  - 出参：`{ prepayId: string, signature: string, provider: string, expireAt: string }`
  - 说明：服务端生成预支付信息与签名，小程序/前端据此拉起 SDK。

## 微信支付回调（服务端）

- `POST /api/payments/wechat/notify`
  - 内容类型：`application/xml`（官方回调）或解包后的 JSON
  - 关键字段（示例 JSON 表示）：
    ```json
    {
      "out_trade_no": "ORDER123",
      "transaction_id": "4200000...",
      "total_fee": 19900,
      "time_end": "20250101123000",
      "sign": "...",
      "result_code": "SUCCESS",
      "return_code": "SUCCESS"
    }
    ```
  - 服务端处理：
    - 验签（平台证书/商户密钥）与金额/订单匹配校验。
    - 幂等更新：`orders.status` 由 `created`/`pending` → `paid`；写入 `payments` 流水（`type=pay`）。
    - 失败入库：写入 `payment_errors`（含 `provider='wechat'` 与原始报文）。
  - 返回：微信协议要求的成功/失败响应（XML）。

## 支付宝支付回调（服务端）

- `POST /api/payments/alipay/notify`
  - 内容类型：`application/x-www-form-urlencoded`
  - 关键字段（示例 JSON 表示）：
    ```json
    {
      "out_trade_no": "ORDER123",
      "trade_no": "20250101...",
      "buyer_id": "2088...",
      "total_amount": "199.00",
      "trade_status": "TRADE_SUCCESS",
      "sign": "..."
    }
    ```
  - 服务端处理：
    - 验签（公钥/证书）与金额/订单匹配校验。
    - 幂等更新：`orders.status` → `paid`；写入 `payments`（`type=pay`）。
    - 失败入库：`payment_errors`（`provider='alipay'`）。
  - 返回：`success` 或 `failure` 文本。

## 退款触发与渠道处理

### 用户取消报名退款

- `POST /api/user/activity/cancel`
  - 输入：`{ orderId: string, reason?: string }`
  - 行为：
    - 若活动未开始：允许取消；根据支付方式发起原路退款；积分不退回（仅退现金）。
    - 写 `payments` 流水（`type=refund`），`orders.status` → `refunded`（或 `cancelled_refund_pending` 视渠道异步）。

### 管理员主动退款（已存在）

- `POST /api/orders/:id/refund`（需管理员鉴权）
  - 输入：`{ amount?: number, reason?: string }`
  - 行为：事务内写退款流水、更新订单状态；对于真实渠道需异步确认到账后最终落账。

## 退款回调（渠道通知）

- 形态：不同渠道使用不同回调（可与支付回调共用通知端点区分 `notify_type`）。
- 统一处理：
  - 校验/验签 → 查找 `refund` 流水 → 更新为 `success`/`failed` 与错误原因。
  - 对应更新订单退款状态（例如：`refunded`/`refund_failed`）。

## 通知与审计

- 用户通知：
  - 支付成功 → 报名成功提示；退款到账 → 到账通知；候补转正 → 转正通知。
  - 小程序模板消息或站内消息（具体实现由平台能力决定）。
- 管理员通知：
  - 满员达 90% 提醒；高频退款/异常支付；渠道退款失败。
- 审计日志：记录关键操作（活动配置、退款、权限变更）与请求源信息（IP/UA/设备）。

## 错误与幂等策略

- 幂等键：对 `orderId + provider + type` 建立唯一约束，重复回调只更新状态不重复记账。
- 重试策略：网络或渠道错误时以指数退避重试，超过阈值标记为失败并告警。
- 错误码：统一以 `{ code, message }` 返回，前端根据错误码展示提示。

## 接口安全

- 仅回调端点豁免鉴权；其它管理端操作需 `Authorization: Bearer <token>`。
- 验签与金额/订单匹配是必要前置；拒绝不匹配的请求并记录。

## 开发与测试约定

- 沙箱模式：优先接入渠道沙箱，提供模拟回调工具与固定签名。
- 日志：记录每次回调的原始报文（脱敏）与处理结果，便于排障。