CREATE TABLE `industry_items` (
    `id` VARCHAR(191) NOT NULL,
    `business` ENUM('DELIVERY', 'LOCKER') NOT NULL,
    `informationType` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `url` TEXT NOT NULL,
    `normalizedUrl` VARCHAR(512) NOT NULL,
    `sourceName` VARCHAR(191) NULL,
    `publisher` VARCHAR(191) NULL,
    `publishedAt` DATETIME(3) NULL,
    `collectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `body` TEXT NULL,
    `summary` TEXT NULL,
    `metrics` JSON NULL,
    `implications` TEXT NULL,
    `importance` ENUM('HIGH', 'MEDIUM', 'REFERENCE') NOT NULL DEFAULT 'REFERENCE',
    `subjects` JSON NULL,
    `tags` JSON NULL,
    `isSupplemental` BOOLEAN NOT NULL DEFAULT false,
    `primaryItemId` VARCHAR(191) NULL,
    `relatedUrls` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `industry_items_normalizedUrl_key`(`normalizedUrl`),
    INDEX `industry_items_business_publishedAt_idx`(`business`, `publishedAt`),
    INDEX `industry_items_business_informationType_idx`(`business`, `informationType`),
    INDEX `industry_items_importance_publishedAt_idx`(`importance`, `publishedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `industry_items` ADD CONSTRAINT `industry_items_primaryItemId_fkey` FOREIGN KEY (`primaryItemId`) REFERENCES `industry_items`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

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
