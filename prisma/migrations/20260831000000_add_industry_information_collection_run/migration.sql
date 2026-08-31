-- AlterTable
ALTER TABLE `industry_information` ADD COLUMN `collectionRunId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `industry_information_collectionRunId_idx` ON `industry_information`(`collectionRunId`);

-- AddForeignKey
ALTER TABLE `industry_information` ADD CONSTRAINT `industry_information_collectionRunId_fkey` FOREIGN KEY (`collectionRunId`) REFERENCES `collection_runs`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

