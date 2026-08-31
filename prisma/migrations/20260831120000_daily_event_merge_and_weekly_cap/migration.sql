-- AlterTable
ALTER TABLE `collection_runs` ADD COLUMN `excludedArticles` JSON NULL,
    ADD COLUMN `excludedCount` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `mergedCount` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `industry_information` ADD COLUMN `mergedSources` JSON NULL,
    ADD COLUMN `updateReason` TEXT NULL,
    ADD COLUMN `updatedByRunId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `industry_information_updatedByRunId_idx` ON `industry_information`(`updatedByRunId`);

-- AddForeignKey
ALTER TABLE `industry_information` ADD CONSTRAINT `industry_information_updatedByRunId_fkey` FOREIGN KEY (`updatedByRunId`) REFERENCES `collection_runs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

