# 裂变关系绑定接口契约

本文档定义通过邀请码建立推荐关系（邀请人/被邀请人）的接口、校验规则与响应示例，支持裂变积分的计算。

## 术语与目标

- 邀请码（InvitationCode）：由系统为每位会员生成，用于绑定推荐关系。
- 邀请人（Inviter）：分享小程序并提供邀请码的会员。
- 被邀请人（Invitee）：使用邀请码注册或绑定的会员。
- 绑定关系：一名被邀请人只允许绑定一次，不支持更改。

## 端点

- `POST /api/referral/bind`
  - 鉴权：`Authorization: Bearer <token>`（当前登录会员为被邀请人）。
  - 幂等：同一被邀请人重复调用不重复建立关系（返回已绑定状态）。

## 请求体

```json
{
  "invitationCode": "INV-ABCD1234",
  "channel": "wechat_share"         
}
```

### 字段说明

- `invitationCode`：邀请人的邀请码（字符串，必填）。
- `channel`：来源渠道（可选），例如：`wechat_share|qr_code|manual`。

## 绑定校验规则

- 邀请码存在且有效（未过期/未禁用）。
- 不允许自我推荐（邀请人与被邀请人为同一人）。
- 被邀请人未绑定过其他邀请人（只允许首次绑定）。
- 邀请人账号可用（未禁用/未封禁）。

## 响应

```json
{
  "status": "bound",
  "inviterUserId": "U100",
  "inviteeUserId": "U777",
  "invitationCode": "INV-ABCD1234",
  "channel": "wechat_share",
  "boundAt": "2025-01-01T12:00:00Z"
}
```

### 状态枚举

- `bound`：本次成功建立绑定关系。
- `already_bound`：被邀请人此前已绑定，返回现有关系信息。

## 错误码

- `UNAUTHORIZED`：缺少或无效的鉴权令牌。
- `CODE_NOT_FOUND`：邀请码不存在或已失效。
- `ALREADY_BOUND`：当前被邀请人已绑定其他邀请人。
- `SELF_REFERRAL`：尝试自我推荐。
- `INVITER_DISABLED`：邀请人账号不可用。
- `RATE_LIMITED`：请求过于频繁，稍后重试。

## 前端/小程序集成约定

- 注册流程：在完成注册后调用本接口；若失败，提示用户检查邀请码或稍后重试。
- 我的页面：显示当前绑定的邀请人信息（如头像/昵称），不可更改；可展示裂变积分明细。
- 分享：生成带邀请码的分享链接或二维码；管理员可查看推荐链路与统计。