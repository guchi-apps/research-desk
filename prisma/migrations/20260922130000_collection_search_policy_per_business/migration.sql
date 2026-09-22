-- 判定基準を事業（DELIVERY/LOCKER）ごとに持たせる（#211）。
-- 既存の1件（id=1）はDELIVERY・LOCKER両方の初期値として複製し、これまでAIが調整してきた基準を失わない。
ALTER TABLE `collection_search_policy` ADD COLUMN `business` ENUM('DELIVERY', 'LOCKER') NULL;

UPDATE `collection_search_policy` SET `business` = 'DELIVERY' WHERE `id` = 1;

-- `id`列はまだ主キー（DEFAULT 1）のままなので、複製行のidも明示しないと既存行（id=1）と衝突する。
INSERT INTO `collection_search_policy` (`id`, `business`, `policy`, `pendingInstruction`, `updatedAt`)
SELECT 2, 'LOCKER', `policy`, `pendingInstruction`, `updatedAt` FROM `collection_search_policy` WHERE `business` = 'DELIVERY';

ALTER TABLE `collection_search_policy` DROP PRIMARY KEY,
    DROP COLUMN `id`,
    MODIFY COLUMN `business` ENUM('DELIVERY', 'LOCKER') NOT NULL,
    ADD PRIMARY KEY (`business`);
