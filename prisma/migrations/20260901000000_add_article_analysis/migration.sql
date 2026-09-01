-- AlterTable
ALTER TABLE `industry_information` ADD COLUMN `analysisStatus` ENUM('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'AUTH_REQUIRED') NULL,
    ADD COLUMN `analyzedAt` DATETIME(3) NULL,
    ADD COLUMN `reviewNote` TEXT NULL,
    ADD COLUMN `reviewedAt` DATETIME(3) NULL,
    ADD COLUMN `reviewedBy` VARCHAR(191) NULL,
    ADD COLUMN `weeklyCandidate` BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE `article_analysis_jobs` (
    `id` VARCHAR(191) NOT NULL,
    `articleId` VARCHAR(191) NOT NULL,
    `activeKey` VARCHAR(191) NULL,
    `status` ENUM('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'AUTH_REQUIRED') NOT NULL DEFAULT 'QUEUED',
    `attempt` INTEGER NOT NULL DEFAULT 1,
    `requestedBy` VARCHAR(191) NULL,
    `queuedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `startedAt` DATETIME(3) NULL,
    `finishedAt` DATETIME(3) NULL,
    `leaseExpiresAt` DATETIME(3) NULL,
    `workerHost` VARCHAR(191) NULL,
    `failureKind` ENUM('AUTH_REQUIRED', 'RATE_LIMITED', 'INVALID_OUTPUT', 'EXECUTION_FAILED', 'TIMEOUT') NULL,
    `failureMessage` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `article_analysis_jobs_activeKey_key`(`activeKey`),
    INDEX `article_analysis_jobs_status_queuedAt_idx`(`status`, `queuedAt`),
    INDEX `article_analysis_jobs_articleId_queuedAt_idx`(`articleId`, `queuedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `article_analyses` (
    `id` VARCHAR(191) NOT NULL,
    `articleId` VARCHAR(191) NOT NULL,
    `jobId` VARCHAR(191) NOT NULL,
    `relevance` ENUM('DELIVERY', 'LOCKER', 'OUT_OF_SCOPE') NOT NULL,
    `confidence` DOUBLE NOT NULL,
    `reason` TEXT NOT NULL,
    `noiseReason` TEXT NULL,
    `summary` TEXT NOT NULL,
    `fullSummary` TEXT NULL,
    `announcedOn` DATETIME(3) NULL,
    `regions` JSON NULL,
    `metrics` JSON NULL,
    `implications` TEXT NULL,
    `importance` ENUM('HIGH', 'MEDIUM', 'REFERENCE') NOT NULL DEFAULT 'REFERENCE',
    `duplicates` JSON NULL,
    `relatedFindings` JSON NULL,
    `model` VARCHAR(191) NULL,
    `codexAuthMode` VARCHAR(191) NULL,
    `durationMs` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `article_analyses_jobId_key`(`jobId`),
    INDEX `article_analyses_articleId_createdAt_idx`(`articleId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `analysis_workers` (
    `host` VARCHAR(191) NOT NULL,
    `lastSeenAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `codexAuthMode` VARCHAR(191) NULL,
    `codexVersion` VARCHAR(191) NULL,
    `lastError` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`host`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `industry_information_analysisStatus_idx` ON `industry_information`(`analysisStatus`);

-- CreateIndex
CREATE INDEX `industry_information_weeklyCandidate_idx` ON `industry_information`(`weeklyCandidate`);

-- AddForeignKey
ALTER TABLE `article_analysis_jobs` ADD CONSTRAINT `article_analysis_jobs_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `industry_information`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_analyses` ADD CONSTRAINT `article_analyses_articleId_fkey` FOREIGN KEY (`articleId`) REFERENCES `industry_information`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `article_analyses` ADD CONSTRAINT `article_analyses_jobId_fkey` FOREIGN KEY (`jobId`) REFERENCES `article_analysis_jobs`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

