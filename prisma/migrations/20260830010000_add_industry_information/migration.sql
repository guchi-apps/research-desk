-- CreateTable
CREATE TABLE `industry_information` (
    `id` VARCHAR(191) NOT NULL,
    `business` ENUM('DELIVERY', 'LOCKER') NOT NULL,
    `informationType` ENUM('NEW_PRODUCT', 'COMPETITOR', 'INTRODUCTION_CASE', 'RECRUITMENT_PARTNERSHIP', 'POLICY_SUBSIDY', 'MARKET_STATISTICS', 'USER_ISSUE', 'CONSTRUCTION', 'QUALITY_SAFETY', 'PATENT', 'OVERSEAS_CASE', 'OTHER') NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `originalUrl` TEXT NOT NULL,
    `normalizedUrl` VARCHAR(512) NOT NULL,
    `urlHash` CHAR(64) NOT NULL,
    `sourceName` VARCHAR(191) NOT NULL,
    `publisher` VARCHAR(191) NULL,
    `isPrimarySource` BOOLEAN NOT NULL DEFAULT false,
    `publishedAt` DATETIME(3) NULL,
    `occurredAt` DATETIME(3) NULL,
    `collectedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `content` TEXT NULL,
    `summary` TEXT NULL,
    `extractedMetrics` JSON NULL,
    `implications` TEXT NULL,
    `importance` ENUM('HIGH', 'MEDIUM', 'REFERENCE') NOT NULL DEFAULT 'REFERENCE',
    `targetCompany` VARCHAR(191) NULL,
    `targetProduct` VARCHAR(191) NULL,
    `keywords` JSON NULL,
    `tags` JSON NULL,
    `periodScope` ENUM('IN_SCOPE', 'PAST_30_DAYS_SUPPLEMENT') NOT NULL DEFAULT 'IN_SCOPE',
    `canonicalId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `industry_information_normalizedUrl_key`(`normalizedUrl`),
    UNIQUE INDEX `industry_information_urlHash_key`(`urlHash`),
    INDEX `industry_information_business_informationType_idx`(`business`, `informationType`),
    INDEX `industry_information_importance_publishedAt_idx`(`importance`, `publishedAt`),
    INDEX `industry_information_periodScope_publishedAt_idx`(`periodScope`, `publishedAt`),
    INDEX `industry_information_canonicalId_idx`(`canonicalId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `industry_information` ADD CONSTRAINT `industry_information_canonicalId_fkey` FOREIGN KEY (`canonicalId`) REFERENCES `industry_information`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
