-- GoUp MySQL database 1.0.1

CREATE TABLE IF NOT EXISTS categories (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(64) NOT NULL,
  weight INT DEFAULT 0,
  builtin TINYINT(1) DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Voucher config
CREATE TABLE IF NOT EXISTS voucher_config (
  id INT AUTO_INCREMENT PRIMARY KEY,
  discountRate DECIMAL(5,4) DEFAULT 0, -- 0.0000 ~ 1.0000
  maxDiscount DECIMAL(10,2) DEFAULT 0,
  cashbackRate DECIMAL(8,4) DEFAULT 0, -- 返还比例，如 0.1 表示返10%
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 每个会员的 GoUp 代金券账户明细
CREATE TABLE IF NOT EXISTS member_vouchers (
  id INT AUTO_INCREMENT PRIMARY KEY,
  memberId INT NOT NULL,
  title VARCHAR(100) DEFAULT 'GoUp代金券',
  source VARCHAR(32) DEFAULT 'cashback', -- cashback/promo/refund
  orderId INT DEFAULT NULL, -- 关联发放或使用的订单
  amount DECIMAL(10,2) NOT NULL, -- 面额
  balance DECIMAL(10,2) NOT NULL, -- 剩余可用
  status ENUM('available','used','expired') DEFAULT 'available',
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expireAt DATETIME DEFAULT NULL,
  usedAt DATETIME DEFAULT NULL,
  meta JSON DEFAULT NULL,
  INDEX idx_member (memberId),
  INDEX idx_status (status),
  INDEX idx_expire (expireAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Orders
CREATE TABLE IF NOT EXISTS orders (
  id INT AUTO_INCREMENT PRIMARY KEY,
  activityId INT NULL,
  memberId INT NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(8) DEFAULT 'CNY',
  status VARCHAR(20) DEFAULT 'created', -- created | paid | refunded | canceled
  paymentMethod VARCHAR(20) NULL,      -- wechat | alipay | card
  transactionId VARCHAR(128) NULL,
  discountAmount DECIMAL(10,2) DEFAULT 0,
  voucherApplied TEXT NULL,            -- JSON of voucher details
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  paidAt DATETIME NULL,
  refundAt DATETIME NULL,
  KEY idx_order_status (status),
  KEY idx_order_member (memberId),
  KEY idx_order_activity (activityId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Payments
CREATE TABLE IF NOT EXISTS payments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  orderId INT NOT NULL,
  provider VARCHAR(20) NOT NULL,       -- wechat | alipay | stripe | other
  providerTxnId VARCHAR(128) NULL,
  status VARCHAR(20) DEFAULT 'initiated', -- initiated | paid | refunded | failed
  amount DECIMAL(10,2) NOT NULL,
  paidAt DATETIME NULL,
  refundAt DATETIME NULL,
  meta TEXT NULL,                      -- JSON meta from provider
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_payment_order (orderId),
  KEY idx_payment_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Members
CREATE TABLE IF NOT EXISTS members (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nameEn VARCHAR(128) NOT NULL,
  gender VARCHAR(10) NULL,
  age INT NULL,
  nation VARCHAR(64) NULL,
  avatar VARCHAR(255) NULL,
  flag VARCHAR(8) NULL,
  registeredAt DATE NULL,
  memberGroup VARCHAR(64) NULL,
  totalParticipations INT DEFAULT 0,
  disabled TINYINT(1) DEFAULT 0,
  KEY idx_member_group (memberGroup),
  KEY idx_member_disabled (disabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS activities (
  id INT AUTO_INCREMENT PRIMARY KEY,
  title VARCHAR(128) NOT NULL,
  start DATETIME NULL,
  end DATETIME NULL,
  place VARCHAR(128) NULL,
  lat DOUBLE NULL,
  lng DOUBLE NULL,
  categoryIds TEXT NULL, -- JSON array of category ids
  groupTags TEXT NULL,   -- JSON array of group strings
  min INT DEFAULT 0,
  max INT DEFAULT 1,
  waitlist INT DEFAULT 0,
  enrolled INT DEFAULT 0,
  price DECIMAL(10,2) DEFAULT 0,
  status VARCHAR(20) DEFAULT '草稿',
  isTop TINYINT(1) DEFAULT 0,
  isHot TINYINT(1) DEFAULT 0,
  publishedAt DATETIME NULL,
  mainImage VARCHAR(255) NULL,
  images TEXT NULL,      -- JSON array of image URLs
  content MEDIUMTEXT NULL,
  KEY idx_status (status),
  KEY idx_time (start, end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Points: member accounts (integer points)
CREATE TABLE IF NOT EXISTS member_points_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  memberId INT NOT NULL UNIQUE,
  balance BIGINT NOT NULL DEFAULT 0,
  locked BIGINT NOT NULL DEFAULT 0,
  updatedAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_member_points (memberId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Points transactions log
CREATE TABLE IF NOT EXISTS points_transactions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  memberId INT NOT NULL,
  type VARCHAR(20) NOT NULL,              -- earn | spend | refund | settlement | referral | adjust
  direction ENUM('credit','debit') NOT NULL,
  amount BIGINT NOT NULL,                 -- integer points
  origin VARCHAR(32) NULL,                -- payment | wechat | alipay | referral | manual | job
  activityId INT NULL,
  orderId INT NULL,
  meta TEXT NULL,                         -- JSON string
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_pt_member (memberId),
  INDEX idx_pt_type (type),
  INDEX idx_pt_created (createdAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Points settlement jobs (execution log / idempotency)
CREATE TABLE IF NOT EXISTS points_settlement_jobs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  activityId INT NOT NULL,
  status ENUM('pending','running','done','error') NOT NULL DEFAULT 'pending',
  dryRun TINYINT(1) NOT NULL DEFAULT 0,
  params JSON NULL,
  processed INT NOT NULL DEFAULT 0,
  skipped INT NOT NULL DEFAULT 0,
  errors INT NOT NULL DEFAULT 0,
  startedAt DATETIME NULL,
  finishedAt DATETIME NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_psj_activity (activityId),
  INDEX idx_psj_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Referral: invitation relationship binding
CREATE TABLE IF NOT EXISTS member_invite_codes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  memberId INT NOT NULL UNIQUE,
  code VARCHAR(16) NOT NULL UNIQUE,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS referrals (
  id INT AUTO_INCREMENT PRIMARY KEY,
  inviterId INT NOT NULL,
  inviteeId INT NOT NULL UNIQUE,          -- 每个被邀请者只允许绑定一次
  channel VARCHAR(32) NULL,
  createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_ref_inviter (inviterId),
  INDEX idx_ref_invitee (inviteeId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;