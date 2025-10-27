# 积分结算任务接口契约

本文档定义“活动结束后 30 分钟自动结算积分”的任务触发接口、业务规则、字段说明与响应示例。

## 业务规则回顾

- 活动积分：会员每参加活动并完成支付，每 1 元获取 `10000` 积分。
- 裂变积分：被邀请会员每次付费参与活动，推荐人按订单金额每 `1` 元获得 `100` 积分（按订单幂等一次）。
- 入账时间：在“活动结束”后 `30` 分钟，由系统统一结算并入账。
- 取消与退款：活动开始前取消报名的订单不产生活动积分与裂变积分；若订单使用了积分抵扣且已扣减成功，后续取消或退款仅退现金，积分不返还。

## 端点

- `POST /api/points/settlement/run`
  - 鉴权：管理员端，`Authorization: Bearer <token>`。
  - 幂等：按参与记录（`userId + activityId + orderId`）建立唯一结算键；重复触发不重复入账。

## 请求体

```json
{
  "activityId": "ACT-2001",   
  "start": "2025-01-01T00:00:00Z", 
  "end": "2025-01-31T23:59:59Z",   
  "afterEndedMinutes": 30,       
  "batchSize": 200,              
  "dryRun": true                 
}
```

### 字段说明

- `activityId`（可选）：指定活动进行结算；为空则按时间范围批量结算。
- `start`/`end`（可选）：结算窗口的活动结束时间范围（ISO）。
- `afterEndedMinutes`（可选）：距活动结束的最小等待分钟数，默认 `30`。
- `batchSize`（可选）：批处理大小，默认 `200`。
- `dryRun`（可选）：是否仅模拟计算，不落账，默认 `false`。

## 响应

```json
{
  "dryRun": true,
  "matchedActivities": 32,
  "processed": {
    "activityPoints": 1280, 
    "referralPoints": 420
  },
  "skipped": {
    "alreadySettled": 56,
    "cancelled": 12,
    "notReachedWindow": 8
  },
  "errors": [
    { "activityId": "ACT-2009", "code": "ORDER_MISMATCH", "reason": "支付记录缺失或金额不一致" }
  ],
  "settlementId": "SET-20250131-001"
}
```

### 说明

- `processed.activityPoints`：成功入账的活动积分条数（按参与记录计数）。
- `processed.referralPoints`：成功入账的裂变积分条数（按邀请关系与参与记录计数）。
- `skipped.alreadySettled`：已结算的记录跳过。
- `skipped.cancelled`：取消报名（活动开始前）记录跳过。
- `skipped.notReachedWindow`：未达到 `afterEndedMinutes` 等待窗口的记录跳过。

## 错误码

- `UNAUTHORIZED`：缺少或无效的管理员鉴权。
- `INVALID_RANGE`：`start/end` 非法或 `start > end`。
- `ORDER_MISMATCH`：订单与支付金额不一致或缺失，拒绝结算。
- `ACTIVITY_NOT_FOUND`：指定 `activityId` 不存在。

## 幂等与重试

- 幂等键建议：`userId + activityId + orderId + type(activity|referral)`。
- 失败记录允许重试；重复执行仅补齐失败项，不产生重复入账。

## 审计与通知

- 结算任务写入审计日志（触发人、时间范围、dryRun、结果摘要）。
- 可选向管理员推送结算摘要（成功/跳过/错误统计）。