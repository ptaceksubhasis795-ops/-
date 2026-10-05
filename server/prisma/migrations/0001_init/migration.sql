-- CreateTable
CREATE TABLE `User` (
    `id` VARCHAR(191) NOT NULL,
    `openId` VARCHAR(191) NOT NULL,
    `phoneCiphertext` VARCHAR(255) NULL,
    `phoneMasked` VARCHAR(32) NULL,
    `nickname` VARCHAR(80) NULL,
    `role` ENUM('CONSUMER', 'MEMBER', 'SENIOR_MEMBER', 'SALES', 'ADMIN', 'PHARMACIST', 'FULFILLMENT') NOT NULL DEFAULT 'CONSUMER',
    `memberLevel` VARCHAR(40) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `User_openId_key`(`openId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Patient` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `idNoCiphertext` VARCHAR(255) NOT NULL,
    `phoneCiphertext` VARCHAR(255) NOT NULL,
    `relation` VARCHAR(32) NOT NULL,
    `allergies` TEXT NULL,
    `medicalHistory` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Address` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `phoneCiphertext` VARCHAR(255) NOT NULL,
    `phoneMasked` VARCHAR(32) NOT NULL,
    `detail` VARCHAR(255) NOT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Product` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `category` ENUM('DAILY', 'PRESCRIPTION') NOT NULL,
    `description` TEXT NULL,
    `active` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ProductSku` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(120) NOT NULL,
    `priceFen` INTEGER NOT NULL,
    `stock` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InventoryBatch` (
    `id` VARCHAR(191) NOT NULL,
    `skuId` VARCHAR(191) NOT NULL,
    `batchNo` VARCHAR(80) NOT NULL,
    `expiresAt` DATETIME(3) NULL,
    `quantity` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InventoryLedger` (
    `id` VARCHAR(191) NOT NULL,
    `batchId` VARCHAR(191) NOT NULL,
    `delta` INTEGER NOT NULL,
    `reason` VARCHAR(80) NOT NULL,
    `referenceId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Prescription` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `patientName` VARCHAR(80) NOT NULL,
    `source` VARCHAR(40) NOT NULL,
    `status` ENUM('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'USED', 'EXPIRED') NOT NULL DEFAULT 'PENDING_REVIEW',
    `validUntil` DATETIME(3) NULL,
    `fileKey` VARCHAR(255) NULL,
    `reviewerId` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Order` (
    `id` VARCHAR(191) NOT NULL,
    `orderNo` VARCHAR(32) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `prescriptionId` VARCHAR(191) NULL,
    `promoterId` VARCHAR(191) NULL,
    `status` ENUM('PENDING_PAYMENT', 'PAID', 'SHIPPED', 'COMPLETED', 'CANCELLED', 'REFUNDING', 'REFUNDED') NOT NULL DEFAULT 'PENDING_PAYMENT',
    `amountFen` INTEGER NOT NULL,
    `freightFen` INTEGER NOT NULL,
    `totalFen` INTEGER NOT NULL,
    `addressSnapshot` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `paidAt` DATETIME(3) NULL,
    `shippedAt` DATETIME(3) NULL,
    `receivedAt` DATETIME(3) NULL,

    UNIQUE INDEX `Order_orderNo_key`(`orderNo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OrderItem` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `skuId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(160) NOT NULL,
    `quantity` INTEGER NOT NULL,
    `unitFen` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(40) NOT NULL,
    `transactionId` VARCHAR(120) NULL,
    `amountFen` INTEGER NOT NULL,
    `status` VARCHAR(40) NOT NULL,
    `rawPayload` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Shipment` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `carrier` VARCHAR(80) NOT NULL,
    `trackingNo` VARCHAR(120) NOT NULL,
    `status` VARCHAR(40) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Aftersale` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `reason` VARCHAR(120) NOT NULL,
    `status` VARCHAR(40) NOT NULL,
    `note` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Invoice` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `type` VARCHAR(20) NOT NULL,
    `title` VARCHAR(160) NOT NULL,
    `taxNo` VARCHAR(80) NULL,
    `fileKey` VARCHAR(255) NULL,
    `status` VARCHAR(40) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PromoterRelation` (
    `id` VARCHAR(191) NOT NULL,
    `promoterId` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `source` VARCHAR(40) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `releasedAt` DATETIME(3) NULL,

    INDEX `PromoterRelation_promoterId_active_idx`(`promoterId`, `active`),
    INDEX `PromoterRelation_customerId_active_idx`(`customerId`, `active`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Promoter` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `type` VARCHAR(32) NOT NULL,
    `level` VARCHAR(40) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Promoter_userId_key`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `MemberApplication` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `phoneMasked` VARCHAR(32) NOT NULL,
    `recommender` VARCHAR(80) NULL,
    `status` VARCHAR(32) NOT NULL,
    `reviewedBy` VARCHAR(191) NULL,
    `reviewedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `MemberApplication_status_createdAt_idx`(`status`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `HealthConsent` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `version` VARCHAR(40) NOT NULL,
    `consentType` VARCHAR(40) NOT NULL,
    `granted` BOOLEAN NOT NULL,
    `grantedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `revokedAt` DATETIME(3) NULL,

    INDEX `HealthConsent_userId_consentType_idx`(`userId`, `consentType`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CustomerTag` (
    `id` VARCHAR(191) NOT NULL,
    `customerId` VARCHAR(191) NOT NULL,
    `tag` VARCHAR(80) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CustomerTag_customerId_tag_key`(`customerId`, `tag`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Article` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(180) NOT NULL,
    `tag` VARCHAR(60) NOT NULL,
    `summary` TEXT NULL,
    `body` LONGTEXT NOT NULL,
    `published` BOOLEAN NOT NULL DEFAULT false,
    `updatedBy` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Banner` (
    `id` VARCHAR(191) NOT NULL,
    `title` VARCHAR(120) NOT NULL,
    `imageKey` VARCHAR(255) NOT NULL,
    `target` VARCHAR(255) NOT NULL,
    `active` BOOLEAN NOT NULL DEFAULT false,
    `sort` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `SystemSetting` (
    `key` VARCHAR(100) NOT NULL,
    `valueJson` JSON NOT NULL,
    `updatedBy` VARCHAR(191) NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `OutboxTask` (
    `id` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(40) NOT NULL,
    `type` VARCHAR(80) NOT NULL,
    `referenceId` VARCHAR(191) NULL,
    `payload` JSON NOT NULL,
    `status` VARCHAR(32) NOT NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `nextRunAt` DATETIME(3) NULL,
    `lastError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `OutboxTask_status_nextRunAt_idx`(`status`, `nextRunAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RewardRule` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `promoterType` VARCHAR(40) NOT NULL,
    `rateBps` INTEGER NULL,
    `fixedFen` INTEGER NULL,
    `active` BOOLEAN NOT NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RewardLedger` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `promoterId` VARCHAR(191) NOT NULL,
    `amountFen` INTEGER NOT NULL,
    `status` ENUM('PENDING', 'ELIGIBLE', 'SETTLED', 'REVERSED', 'VOID') NOT NULL DEFAULT 'PENDING',
    `effectiveAt` DATETIME(3) NULL,
    `settledAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Withdrawal` (
    `id` VARCHAR(191) NOT NULL,
    `promoterId` VARCHAR(191) NOT NULL,
    `amountFen` INTEGER NOT NULL,
    `status` ENUM('PENDING_REVIEW', 'APPROVED', 'PROCESSING', 'PAID', 'REJECTED') NOT NULL DEFAULT 'PENDING_REVIEW',
    `reviewedBy` VARCHAR(191) NULL,
    `paidAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AuditLog` (
    `id` VARCHAR(191) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `action` VARCHAR(100) NOT NULL,
    `resource` VARCHAR(80) NOT NULL,
    `resourceId` VARCHAR(80) NULL,
    `metadata` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Patient` ADD CONSTRAINT `Patient_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Address` ADD CONSTRAINT `Address_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ProductSku` ADD CONSTRAINT `ProductSku_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryBatch` ADD CONSTRAINT `InventoryBatch_skuId_fkey` FOREIGN KEY (`skuId`) REFERENCES `ProductSku`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventoryLedger` ADD CONSTRAINT `InventoryLedger_batchId_fkey` FOREIGN KEY (`batchId`) REFERENCES `InventoryBatch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Prescription` ADD CONSTRAINT `Prescription_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Order` ADD CONSTRAINT `Order_prescriptionId_fkey` FOREIGN KEY (`prescriptionId`) REFERENCES `Prescription`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `OrderItem` ADD CONSTRAINT `OrderItem_skuId_fkey` FOREIGN KEY (`skuId`) REFERENCES `ProductSku`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Shipment` ADD CONSTRAINT `Shipment_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Aftersale` ADD CONSTRAINT `Aftersale_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Invoice` ADD CONSTRAINT `Invoice_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `HealthConsent` ADD CONSTRAINT `HealthConsent_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RewardRule` ADD CONSTRAINT `RewardRule_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `Product`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RewardLedger` ADD CONSTRAINT `RewardLedger_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AuditLog` ADD CONSTRAINT `AuditLog_actorId_fkey` FOREIGN KEY (`actorId`) REFERENCES `User`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
