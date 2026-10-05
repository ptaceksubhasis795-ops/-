ALTER TABLE `PerformanceLedger`
  ADD COLUMN `status` VARCHAR(20) NOT NULL DEFAULT 'active',
  ADD COLUMN `cancelledAt` DATETIME(3) NULL;
