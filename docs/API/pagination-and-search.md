# 统一分页与搜索接口契约

本文档定义后端列表数据统一的分页、搜索与筛选参数规范，以及标准响应结构，便于 Admin 与小程序前端一致集成。

## 通用查询参数

- `page`：页码，默认 `1`，范围 `>=1`
- `pageSize`：每页数量，默认 `20`，范围 `1..200`
- `sortBy`：排序字段（例如：`createdAt`、`amount`、`status`、`title`）
- `sortOrder`：`asc` | `desc`，默认 `desc`
- `keyword`：关键字搜索（按标题/用户名/订单号等后端定义的可搜索字段）
- `start` / `end`：时间范围（ISO 字符串），用于过滤创建时间或发生时间
- 领域过滤参数：按列表类型定义，如：
  - 支付错误：`provider`（`wechat|alipay|voucher`）、`status`（`new|triaged|ignored`）
  - 订单/支付记录：`status`（`created|paid|refunded|cancelled`）、`provider`、`type`（`pay|refund`）
  - 活动列表：`categoryId`、`isTop`、`status`（`draft|published|ended|cancelled`）

## 标准响应结构

```json
{
  "total": 1234,
  "items": [
    { "id": "...", "...": "..." }
  ],
  "page": 1,
  "pageSize": 20,
  "hasNext": true
}
```

- `total`：查询条件下的总记录数
- `items`：当前页数据
- `hasNext`：是否存在下一页（可选，前端用于优化翻页逻辑）

## 示例端点契约

### 支付错误列表（已改造）

- `GET /api/payments/errors`
  - 入参：上述通用参数 + `provider`、`keyword`、`start`、`end`
  - 出参：标准响应结构

### 订单列表（建议改造）

- `GET /api/orders`
  - 入参：`page`、`pageSize`、`keyword`（订单号/用户）、`status`、`start`、`end`、`sortBy`、`sortOrder`
  - 出参：标准响应结构；每项包含 `id`、`user`、`activity`、`amount`、`status`、`createdAt`

### 支付记录列表（建议改造）

- `GET /api/payments`
  - 入参：`page`、`pageSize`、`type`、`provider`、`status`、`start`、`end`
  - 出参：标准响应结构；每项包含 `id`、`orderId`、`type`、`provider`、`amount`、`status`、`createdAt`

## 错误与校验

- 对非法 `page`/`pageSize` 返回 `400 { code: 'INVALID_PAGINATION', message }`
- 对不支持的 `sortBy` 返回 `400 { code: 'INVALID_SORT', message }`
- 时间范围需满足 `start <= end`，否则返回 `400 { code: 'INVALID_RANGE', message }`

## 前端集成约定

- Admin 前端统一使用服务端分页与筛选，不再进行大列表全量拉取与本地筛选。
- 翻页变更需触发重新请求；筛选/搜索变更重置到 `page=1`。
- 保持空状态与错误提示一致（显示查询条件与清除按钮）。