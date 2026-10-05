CREATE TABLE `Settlement` (
    `id` VARCHAR(191) NOT NULL,
    `period` VARCHAR(32) NOT NULL,
    `commissionIds` JSON NOT NULL,
    `totalFen` INTEGER NOT NULL,
    `count` INTEGER NOT NULL,
    `status` VARCHAR(32) NOT NULL,
    `settledAt` DATETIME(3) NOT NULL,
    `actorId` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Settlement_period_status_idx`(`period`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
