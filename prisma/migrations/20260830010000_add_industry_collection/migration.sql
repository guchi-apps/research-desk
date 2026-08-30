CREATE TABLE `collection_runs` (
    `id` VARCHAR(191) NOT NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `finishedAt` DATETIME(3) NULL,
    `targetFrom` DATETIME(3) NOT NULL,
    `targetTo` DATETIME(3) NOT NULL,
    `supplementalFrom` DATETIME(3) NULL,
    `status` ENUM('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED') NOT NULL DEFAULT 'RUNNING',
    `fetchedCount` INTEGER NOT NULL DEFAULT 0,
    `selectedCount` INTEGER NOT NULL DEFAULT 0,
    `insertedCount` INTEGER NOT NULL DEFAULT 0,
    `duplicateCount` INTEGER NOT NULL DEFAULT 0,
    `failedCount` INTEGER NOT NULL DEFAULT 0,
    `errors` JSON NULL,

    INDEX `collection_runs_startedAt_idx`(`startedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
