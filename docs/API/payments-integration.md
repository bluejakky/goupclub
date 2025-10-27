# 支付集成替换说明（WeChat v3 / Alipay WAP）

本文档说明如何将当前预下单与支付回调从“模拟”升级为“真实”微信支付 v3（JSAPI）与支付宝 WAP 流程，包含代码替换范围、环境配置、请求与回调示例、幂等与积分规则、联调与排查建议等。

## 目标与范围
- 统一后端预下单入口：`POST /api/payments/prepay`。
- 支持两条真实通道：
  - 微信支付 v3 JSAPI 统一下单（返回 `wx.requestPayment` 所需参数）。
  - 支付宝 WAP 生成带 RSA2 签名的跳转链接。
- 新增/改造支付通知回调：
  - 微信：`POST /api/payments/wechat/notify`（v3 密文解密）。
  - 支付宝：`POST /api/payments/alipay/notify`（RSA2 验签）。
- 保留代金券与积分抵扣逻辑，保证预下单与回调阶段的幂等扣减。
- 缺少真实配置时，自动回退到模拟支付，保证环境可运行。

## 替换步骤与代码定位
所有改动均在 `server/src/index.js` 内完成。

1) 替换预下单端点
- 定位：查找 `app.post('/api/payments/prepay',` 的整块函数，整体替换为“真实优先，模拟回退”的实现。
- 行为：
  - 保留代金券抵扣与积分抵扣（单位：10000 积分 = 1 元，向下取整）。
  - 写入一条 `payments` 记录（`status='initiated'`、记录 `pointsUsage` 与 `prepayId`）。
  - 当满足微信配置且提供 `openid` 时：调用 v3 `POST /v3/pay/transactions/jsapi`，生成并返回 `wx.requestPayment` 参数（`signType='RSA'`）。成功后把真实 `prepay_id` 回写到 `payments.providerTxnId`，并合并到 `meta`。
  - 当满足支付宝配置时：以 `alipay.trade.wap.pay` 生成 RSA2 签名链接，返回 `payUrl`；否则回退到模拟 `payUrl`。
  - 最终响应保留原结构：`{ ok, orderId, amount, prepayId, provider, signature, payParams?, payUrl? }`。

2) 替换微信支付回调
- 定位：查找 `app.post('/api/payments/wechat/notify',` 的整块函数，整体替换为 v3 回调处理：
  - 使用 `WECHAT_API_V3_KEY` 对 `req.body.resource.ciphertext` 执行 AES-256-GCM 解密（`associated_data` 为 AAD，`nonce` 为 IV），解析明文 JSON。
  - 用明文中的 `out_trade_no` 作为 `orderId`、`transaction_id` 作为通道流水号、`amount.total`（分）作为实付金额。
  - 幂等：如 `orders.status='paid'` 已支付则直接返回 `SUCCESS`。
  - 未支付：
    - 插入 `payments` 的 `paid` 记录（`provider='wechat'`，`providerTxnId=transaction_id`，`amount=total/100`，`paidAt=now`）。
    - 更新 `orders.status='paid'`、`orders.paidAt=now`。
    - 根据预下单时记录的 `pointsUsage`（查找 `status='initiated'` 的最新记录），幂等扣减积分并写入 `points_transactions`、更新 `member_points_accounts.balance`。
    - 按 `voucher_config` 发放返券（如有活动乘数与阶梯）。
  - 必须返回纯文本 `SUCCESS` 给微信。

3) 替换支付宝支付回调
- 定位：查找 `app.post('/api/payments/alipay/notify',` 的整块函数，整体替换为 RSA2 验签处理：
  - 确保顶部已启用 `express.urlencoded({ extended: false })`，以便接收 `application/x-www-form-urlencoded`。
  - 从 `req.body` 获取全部字段，剔除 `sign` 与 `sign_type`，按键名升序拼接 `k=v` 的字符串（`&` 连接）作为 `signContent`。
  - 使用 `ALIPAY_PUBLIC_KEY` 对 `signContent` 做 `RSA-SHA256` 验签。
  - 验签通过且 `trade_status` 为 `TRADE_SUCCESS`：
    - 插入 `payments` 的 `paid` 记录（`provider='alipay'`，`providerTxnId` 用回调交易号，`amount` 用 `total_amount`，`paidAt=now`）。
    - 更新 `orders.status='paid'`、`orders.paidAt=now`。
    - 基于预下单的 `pointsUsage` 幂等扣减积分、写入 `points_transactions`、更新 `member_points_accounts`。
  - 必须返回纯文本 `success`（小写）给支付宝。

4) 表单解析中间件（已添加）
- 在 `index.js` 顶部确保存在：`app.use(express.urlencoded({ extended: false }));`，用于支付宝通知表单解析。

## 环境变量配置
- 微信：
  - `WECHAT_APP_ID`（小程序 AppID）
  - `WECHAT_MCH_ID`（商户号）
  - `WECHAT_SERIAL_NO`（平台证书序列号）
  - `WECHAT_PRIVATE_KEY_PEM`（商户私钥 PEM 或其文件路径）
  - `WECHAT_API_V3_KEY`（32 字节 v3 API 密钥）
  - `WECHAT_NOTIFY_URL`（可选；未设则默认 `SERVER_BASE_URL + /api/payments/wechat/notify`）
- 支付宝：
  - `ALIPAY_APP_ID`
  - `ALIPAY_PRIVATE_KEY`（PKCS#1/PKCS#8 PEM）
  - `ALIPAY_PUBLIC_KEY`（用于验签的支付宝公钥 PEM）
  - `ALIPAY_GATEWAY`（默认 `https://openapi-sandbox.dl.alipaydev.com/gateway.do`）
  - `ALIPAY_NOTIFY_URL`（未设则默认 `SERVER_BASE_URL + /api/payments/alipay/notify`）
  - `ALIPAY_RETURN_URL`（前端回跳页面）
- 通用：
  - `SERVER_BASE_URL`（示例 `http://localhost:3000`）

## 请求与回调示例
- 预下单（支付宝）：
  - `curl -s -X POST http://localhost:3000/api/payments/prepay -H "Content-Type: application/json" -d '{"orderId":"10001","amount":99,"provider":"alipay","subject":"测试支付","returnUrl":"http://localhost:3000/alipay/return"}'`
  - 返回：`payUrl`（真实或模拟）。
- 预下单（微信，需 `openid`）：
  - `curl -s -X POST http://localhost:3000/api/payments/prepay -H "Content-Type: application/json" -d '{"orderId":"10002","amount":88,"provider":"wechat","openid":"用户openid","description":"订单测试"}'`
  - 返回：`payParams`（供 `wx.requestPayment`）。
- 回调：
  - 微信需公网地址（如 `ngrok`），回调到 `WECHAT_NOTIFY_URL`；成功返回 `SUCCESS`。
  - 支付宝为表单通知，回调到 `ALIPAY_NOTIFY_URL`；成功返回 `success`。

## 幂等与积分扣减规则
- 订单幂等：回调阶段先查 `orders.status`，已为 `paid` 则不重复执行后续扣减与发券。
- 积分幂等：以 `memberId + orderId` 唯一性在 `points_transactions` 中防重复；仅在首次支付成功时扣减。
- 积分抵扣（预下单阶段）：`10000 积分 = 1 元`，向下取整到整数元；实际扣减在支付成功回调时执行。

## 金额与单位
- 微信 v3：上送金额单位为分（`finalPayable * 100`）。
- 支付宝 WAP：金额为字符串元（两位小数，`Number(finalPayable).toFixed(2)`）。
- 数据库存储金额（`payments.amount`、`orders.amount`）：按元存储，注意换算。

## 联调与排查建议
- Node 版本建议 ≥ 18（内置 `fetch`）；否则需引入 `node-fetch`。
- 微信私钥：`WECHAT_PRIVATE_KEY_PEM` 可为 PEM 内容或本地路径，代码中会自动判断并读取。
- 微信签名：统一下单返回的 `prepay_id` 用于生成 `wx.requestPayment` 参数，`signType='RSA'`。
- 回调返回格式：微信必须 `SUCCESS`（纯文本）；支付宝必须 `success`（纯文本，小写）。
- 日志与审计：失败时插入 `payment_errors`，方便排查密钥与签名问题。

## 前端配合（小程序）
- 在 `miniprogram/utils/api.js` 的预下单请求传入：`provider`、`amount`、`voucher`/`points` 参数，以及微信场景下的 `openid`。
- 在 `miniprogram/pages/pay/pay.js`：
  - 确保 `memberId` 已取得（登录或用户信息里），并随预下单上送。
  - 微信场景先走 `wx.login`，把 `code` 交给后端 `/api/wechat/openid` 获取 `openid`；再调用 `/api/payments/prepay`。
  - 收到 `payParams` 后使用 `wx.requestPayment` 发起支付。

## 回滚与灰度
- 若未设置真实环境变量或调用失败：预下单会自动回退到模拟参数（`payParams`/`payUrl` 仍可联调）。
- 无需额外代码开关，采用“配置驱动”的灰度策略。

## 相关数据表（参考）
- `orders`：`id`、`status`、`amount`、`paidAt` 等。
- `payments`：`orderId`、`provider`、`providerTxnId`、`status`、`amount`、`meta`、`paidAt`。
- `member_points_accounts`：`memberId`、`balance`、`locked`。
- `points_transactions`：积分扣减流水（用于幂等与审计）。
- `payment_errors`：支付失败与验签失败记录。

## 变更清单
- 修改：`server/src/index.js`
  - 替换 `/api/payments/prepay` 实现（真实优先，模拟回退）。
  - 替换 `/api/payments/wechat/notify`（v3 解密）。
  - 替换 `/api/payments/alipay/notify`（RSA2 验签）。
  - 顶部启用：`app.use(express.urlencoded({ extended: false }));`（支付宝通知表单解析）。

## 下一步
- 填写 `.env` 中的微信与支付宝参数，重启服务：`node src/index.js`。
- 使用上述 curl 示例进行预下单联调；
- 打通微信公网回调或使用支付宝通知模拟器验证回调；
- 检查数据库的 `orders`、`payments`、`points_transactions`、`member_points_accounts` 是否按预期更新。