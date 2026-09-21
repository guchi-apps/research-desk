CREATE TABLE `collection_search_policy` (
    `id` INTEGER NOT NULL DEFAULT 1,
    `policy` TEXT NOT NULL,
    `pendingInstruction` TEXT NULL,
    `updatedAt` DATETIME(3) NOT NULL,
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
