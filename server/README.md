# GoUp Server Payments Guide

This document summarizes payment-related configuration and API parameters for integrating WeChat Pay and Alipay with the GoUp server.

## Environment Variables

Populate `.env` using `.env.example` as a reference. Key fields:

- WeChat
  - `WECHAT_APP_ID`: WeChat Mini Program AppID
  - `WECHAT_APP_SECRET`: App Secret (used for `jscode2session`)
  - `WECHAT_MCH_ID`: Merchant ID
  - `WECHAT_KEY`: Sandbox/dev signing key (used by current mock signature)
  - Optional for real payments: `WECHAT_API_V3_KEY`, `WECHAT_SERIAL_NO`, `WECHAT_PRIVATE_KEY_PEM`, `WECHAT_NOTIFY_URL`

- Alipay
  - `ALIPAY_APP_ID`: App ID
  - `ALIPAY_PUBLIC_KEY`: Alipay public key (PEM)
  - `ALIPAY_PRIVATE_KEY`: Merchant private key (PEM)
  - `ALIPAY_KEY`: Sandbox/dev signing key (used by current mock signature)
  - Optional for real payments: `ALIPAY_GATEWAY`, `ALIPAY_NOTIFY_URL`, `ALIPAY_RETURN_URL`

## Endpoints

- `GET /api/wechat/openid?code=...`
  - Exchanges WeChat `wx.login` code for `openid`.
  - Requires: `WECHAT_APP_ID`, `WECHAT_APP_SECRET`.
  - Response: `{ openid, unionid?, session_key? }` or `{ error, detail? }`.

- `POST /api/payments/prepay`
  - Pre-order calculation with voucher and points, and returns payment params/URL.
  - Request body (selected fields):
    - `orderId`: number
    - `amount`: number (yuan)
    - `provider`: `wechat` | `alipay`
    - `useVoucher`: boolean, `voucherAmount`: number
    - `memberId`: number, `usePoints`: integer (points)
    - For WeChat: `openid` (required for real payments), `description` (order description)
    - For Alipay: `subject` (order subject), `returnUrl` (optional)
  - Response includes:
    - `amount` (final payable after deductions), `prepayId`, `originalAmount`, `appliedVoucher`, `pointsUsage`
    - `payParams` (WeChat mock) or `payUrl` (Alipay mock), `payload`, `signature`

## Frontend (Mini Program)

- Obtain `openid` via `wx.login` + `GET /api/wechat/openid` before calling WeChat prepay.
- Pass new fields in `api.prepay`:
  - WeChat: `{ openid, description }`
  - Alipay: `{ subject, returnUrl }`

## Notes

- Current implementation returns mock `payParams`/`payUrl` for demonstration. To enable real payments, implement provider SDK calls and verify callbacks using configured notify URLs.
- Use `orderId` as idempotent `out_trade_no`. Update `payments` and `orders` status upon successful callback.