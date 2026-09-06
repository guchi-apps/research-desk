-- CreateTable
CREATE TABLE `weekly_brief_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `weekStart` DATETIME(3) NOT NULL,
    `weekEnd` DATETIME(3) NOT NULL,
    `basis` ENUM('PUBLISHED', 'COLLECTED', 'EITHER') NOT NULL DEFAULT 'EITHER',
    `articleIds` JSON NOT NULL,
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
    `headline` TEXT NULL,
    `overview` TEXT NULL,
    `topics` JSON NULL,
    `model` VARCHAR(191) NULL,
    `codexAuthMode` VARCHAR(191) NULL,
    `durationMs` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `weekly_brief_jobs_activeKey_key`(`activeKey`),
    INDEX `weekly_brief_jobs_status_queuedAt_idx`(`status`, `queuedAt`),
    INDEX `weekly_brief_jobs_weekStart_queuedAt_idx`(`weekStart`, `queuedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

