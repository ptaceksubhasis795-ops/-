CREATE TABLE `Refund` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `aftersaleId` VARCHAR(191) NULL,
    `amountFen` INTEGER NOT NULL,
    `status` VARCHAR(32) NOT NULL,
    `provider` VARCHAR(40) NOT NULL,
    `transactionId` VARCHAR(120) NULL,
    `idempotencyKey` VARCHAR(160) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Refund_idempotencyKey_key`(`idempotencyKey`),
    INDEX `Refund_orderId_status_idx`(`orderId`, `status`),
    PRIMARY KEY (`id`),
    CONSTRAINT `Refund_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `Order`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `FileAsset` (
    `id` VARCHAR(191) NOT NULL,
    `ownerId` VARCHAR(191) NOT NULL,
    `purpose` VARCHAR(32) NOT NULL,
    `originalName` VARCHAR(255) NOT NULL,
    `mimeType` VARCHAR(120) NOT NULL,
    `size` INTEGER NOT NULL,
    `storageKey` VARCHAR(255) NULL,
    `data` LONGTEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `FileAsset_ownerId_purpose_createdAt_idx`(`ownerId`, `purpose`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `Customer` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(80) NOT NULL,
    `promoterId` VARCHAR(191) NULL,
    `lastOrder` VARCHAR(160) NULL,
    `amountFen` INTEGER NOT NULL DEFAULT 0,
    `tags` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Customer_promoterId_idx`(`promoterId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

