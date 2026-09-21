-- CreateTable
CREATE TABLE `collection_search_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `activeKey` VARCHAR(191) NULL,
    `status` ENUM('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'AUTH_REQUIRED') NOT NULL DEFAULT 'QUEUED',
    `requestedBy` VARCHAR(191) NULL,
    `queuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `leaseExpiresAt` DATETIME(3) NULL,
    `workerHost` VARCHAR(191) NULL,
    `failureKind` ENUM('AUTH_REQUIRED', 'RATE_LIMITED', 'INVALID_OUTPUT', 'EXECUTION_FAILED', 'TIMEOUT') NULL,
    `failureMessage` TEXT NULL,
    `collectionRunId` VARCHAR(191) NULL,
    `foundCount` INTEGER NULL,
    `droppedCount` INTEGER NULL,
    `insertedCount` INTEGER NULL,
    `mergedCount` INTEGER NULL,
    `duplicateCount` INTEGER NULL,
    `excludedCount` INTEGER NULL,
    `model` VARCHAR(191) NULL,
    `codexAuthMode` VARCHAR(191) NULL,
    `durationMs` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `collection_search_jobs_activeKey_key`(`activeKey`),
    INDEX `collection_search_jobs_status_queuedAt_idx`(`status`, `queuedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

