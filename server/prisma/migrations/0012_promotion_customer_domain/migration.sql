-- Promotion, customer attribution, performance, wallet and agent-order contracts.
DROP INDEX `Customer_promoterId_idx` ON `customer`;

ALTER TABLE `memberapplication`
  ADD COLUMN `needsAttributionReview` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `referrerPromoterId` VARCHAR(191) NULL,
  ADD COLUMN `resolvedSalesPromoterId` VARCHAR(191) NULL,
  ADD COLUMN `reviewNote` VARCHAR(500) NULL;

ALTER TABLE `promoter`
  ADD COLUMN `inactiveAt` DATETIME(3) NULL,
  ADD COLUMN `inactiveReason` VARCHAR(255) NULL,
  ADD COLUMN `upgradedAt` DATETIME(3) NULL;

ALTER TABLE `rewardledger`
  ADD COLUMN `baseAmountFen` INTEGER NULL,
  ADD COLUMN `beneficiaryKind` VARCHAR(20) NULL,
  ADD COLUMN `customerId` VARCHAR(191) NULL,
  ADD COLUMN `holdUntil` DATETIME(3) NULL,
  ADD COLUMN `orderItemId` VARCHAR(191) NULL,
  ADD COLUMN `reversedAmountFen` INTEGER NULL,
  ADD COLUMN `ruleId` VARCHAR(191) NULL,
  ADD COLUMN `selfPurchase` BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN `settlementId` VARCHAR(191) NULL;

ALTER TABLE `withdrawal`
  ADD COLUMN `failureReason` VARCHAR(255) NULL,
  ADD COLUMN `manualReference` VARCHAR(160) NULL,
  ADD COLUMN `reservedFen` INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN `transactionId` VARCHAR(120) NULL;

CREATE TABLE `PromoterMembership` (
  `id` VARCHAR(191) NOT NULL,
  `memberPromoterId` VARCHAR(191) NOT NULL,
  `salesPromoterId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(32) NOT NULL,
  `source` VARCHAR(40) NOT NULL,
  `reason` VARCHAR(255) NULL,
  `assignedBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `releasedAt` DATETIME(3) NULL,
  INDEX `PromoterMembership_memberPromoterId_status_idx`(`memberPromoterId`, `status`),
  INDEX `PromoterMembership_salesPromoterId_status_idx`(`salesPromoterId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `CustomerAttribution` (
  `id` VARCHAR(191) NOT NULL,
  `customerId` VARCHAR(191) NOT NULL,
  `ownerKind` ENUM('COMPANY', 'SALES', 'MEMBER') NOT NULL,
  `ownerPromoterId` VARCHAR(191) NULL,
  `source` VARCHAR(40) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `boundAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `releasedAt` DATETIME(3) NULL,
  `releaseReason` VARCHAR(255) NULL,
  `assignedBy` VARCHAR(191) NULL,
  INDEX `CustomerAttribution_customerId_active_idx`(`customerId`, `active`),
  INDEX `CustomerAttribution_ownerPromoterId_active_idx`(`ownerPromoterId`, `active`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PerformanceLedger` (
  `id` VARCHAR(191) NOT NULL,
  `orderId` VARCHAR(191) NOT NULL,
  `customerId` VARCHAR(191) NOT NULL,
  `promoterId` VARCHAR(191) NULL,
  `amountFen` INTEGER NOT NULL,
  `selfPurchase` BOOLEAN NOT NULL DEFAULT false,
  `kind` ENUM('DIRECT', 'SELF') NOT NULL DEFAULT 'DIRECT',
  `period` VARCHAR(7) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `PerformanceLedger_promoterId_period_idx`(`promoterId`, `period`),
  INDEX `PerformanceLedger_customerId_createdAt_idx`(`customerId`, `createdAt`),
  UNIQUE INDEX `PerformanceLedger_orderId_promoterId_key`(`orderId`, `promoterId`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RewardWalletEntry` (
  `id` VARCHAR(191) NOT NULL,
  `promoterId` VARCHAR(191) NOT NULL,
  `kind` ENUM('EARN', 'REVERSAL', 'WITHDRAWAL_HOLD', 'WITHDRAWAL_RELEASE', 'WITHDRAWAL_PAID') NOT NULL,
  `amountFen` INTEGER NOT NULL,
  `referenceId` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `RewardWalletEntry_promoterId_createdAt_idx`(`promoterId`, `createdAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `SalesOrderDraft` (
  `id` VARCHAR(191) NOT NULL,
  `token` VARCHAR(120) NOT NULL,
  `promoterId` VARCHAR(191) NOT NULL,
  `customerId` VARCHAR(191) NOT NULL,
  `items` JSON NOT NULL,
  `status` ENUM('SENT', 'CUSTOMER_CONFIRMED', 'PAID', 'EXPIRED', 'CANCELLED') NOT NULL DEFAULT 'SENT',
  `orderId` VARCHAR(191) NULL,
  `expiresAt` DATETIME(3) NOT NULL,
  `confirmedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE INDEX `SalesOrderDraft_token_key`(`token`),
  INDEX `SalesOrderDraft_promoterId_status_idx`(`promoterId`, `status`),
  INDEX `SalesOrderDraft_customerId_status_idx`(`customerId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
