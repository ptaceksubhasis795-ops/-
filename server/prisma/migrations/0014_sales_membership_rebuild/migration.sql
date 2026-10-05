ALTER TABLE `MemberApplication`
  ADD COLUMN `sourceType` VARCHAR(32) NOT NULL DEFAULT 'direct',
  ADD INDEX `MemberApplication_sourceType_status_createdAt_idx`(`sourceType`, `status`, `createdAt`);

CREATE TABLE `PromotionApplication` (
  `id` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NOT NULL,
  `memberPromoterId` VARCHAR(191) NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
  `criteria` VARCHAR(40) NOT NULL,
  `monthlySnapshot` JSON NOT NULL,
  `totalAmountFen` INT NOT NULL,
  `currentSalesPromoterId` VARCHAR(191) NULL,
  `reviewerId` VARCHAR(191) NULL,
  `reviewReason` VARCHAR(500) NULL,
  `submittedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `reviewedAt` DATETIME(3) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `PromotionApplication_userId_status_createdAt_idx`(`userId`, `status`, `createdAt`),
  INDEX `PromotionApplication_status_submittedAt_idx`(`status`, `submittedAt`),
  INDEX `PromotionApplication_memberPromoterId_status_idx`(`memberPromoterId`, `status`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PromoterArchive` (
  `id` VARCHAR(191) NOT NULL,
  `originalPromoterId` VARCHAR(191) NOT NULL,
  `userId` VARCHAR(191) NULL,
  `type` VARCHAR(32) NOT NULL,
  `level` VARCHAR(40) NOT NULL,
  `name` VARCHAR(80) NOT NULL,
  `deletionReason` VARCHAR(500) NULL,
  `deletedBy` VARCHAR(191) NOT NULL,
  `deletedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `orderCount` INT NOT NULL DEFAULT 0,
  `rewardCount` INT NOT NULL DEFAULT 0,
  `relationCount` INT NOT NULL DEFAULT 0,
  `totalRewardFen` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX `PromoterArchive_originalPromoterId_deletedAt_idx`(`originalPromoterId`, `deletedAt`),
  INDEX `PromoterArchive_userId_deletedAt_idx`(`userId`, `deletedAt`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `PromoterArchiveItem` (
  `id` VARCHAR(191) NOT NULL,
  `archiveId` VARCHAR(191) NOT NULL,
  `kind` VARCHAR(32) NOT NULL,
  `originalId` VARCHAR(191) NULL,
  `amountFen` INT NULL,
  `occurredAt` DATETIME(3) NULL,
  `payload` JSON NOT NULL,
  INDEX `PromoterArchiveItem_archiveId_kind_occurredAt_idx`(`archiveId`, `kind`, `occurredAt`),
  INDEX `PromoterArchiveItem_originalId_idx`(`originalId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `PromoterArchiveItem_archiveId_fkey` FOREIGN KEY (`archiveId`) REFERENCES `PromoterArchive`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RewardRuleSet` (
  `id` VARCHAR(191) NOT NULL,
  `productId` VARCHAR(191) NOT NULL,
  `active` BOOLEAN NOT NULL DEFAULT true,
  `updatedBy` VARCHAR(191) NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  UNIQUE INDEX `RewardRuleSet_productId_key`(`productId`),
  PRIMARY KEY (`id`),
  CONSTRAINT `RewardRuleSet_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `RewardRuleTier` (
  `id` VARCHAR(191) NOT NULL,
  `ruleSetId` VARCHAR(191) NOT NULL,
  `tier` VARCHAR(32) NOT NULL,
  `method` VARCHAR(16) NOT NULL,
  `rateBps` INT NOT NULL DEFAULT 0,
  `fixedFen` INT NOT NULL DEFAULT 0,
  `active` BOOLEAN NOT NULL DEFAULT true,
  UNIQUE INDEX `RewardRuleTier_ruleSetId_tier_key`(`ruleSetId`, `tier`),
  INDEX `RewardRuleTier_tier_active_idx`(`tier`, `active`),
  PRIMARY KEY (`id`),
  CONSTRAINT `RewardRuleTier_ruleSetId_fkey` FOREIGN KEY (`ruleSetId`) REFERENCES `RewardRuleSet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO `RewardRuleSet` (`id`, `productId`, `active`, `createdAt`, `updatedAt`)
SELECT CONCAT('rrs-', `productId`), `productId`, true, CURRENT_TIMESTAMP(3), CURRENT_TIMESTAMP(3)
FROM `RewardRule` GROUP BY `productId`;

INSERT INTO `RewardRuleTier` (`id`, `ruleSetId`, `tier`, `method`, `rateBps`, `fixedFen`, `active`)
SELECT CONCAT('rrt-', `productId`, '-', `tier`), CONCAT('rrs-', `productId`), `tier`,
  CASE WHEN MAX(COALESCE(`fixedFen`, 0)) > 0 THEN 'FIXED' ELSE 'PERCENT' END,
  MAX(COALESCE(`rateBps`, 0)), MAX(COALESCE(`fixedFen`, 0)), MAX(`active`)
FROM (
  SELECT `productId`, `rateBps`, `fixedFen`, `active`,
    CASE WHEN `promoterType` IN ('STAFF', 'SENIOR_MEMBER') THEN 'SALES' WHEN `promoterType` = 'COMPANY' THEN 'COMPANY' ELSE 'MEMBER' END AS `tier`
  FROM `RewardRule`
) AS legacy_rules
GROUP BY `productId`, `tier`;
