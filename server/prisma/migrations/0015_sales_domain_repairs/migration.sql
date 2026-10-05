ALTER TABLE `RewardRuleSet`
  ADD COLUMN `migrationNeedsReview` BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE `MemberApplication`
  ADD INDEX `MemberApplication_createdAt_idx`(`createdAt`),
  ADD INDEX `MemberApplication_referrerPromoterId_status_idx`(`referrerPromoterId`, `status`),
  ADD INDEX `MemberApplication_userId_status_idx`(`userId`, `status`);

/* Keep legacy STAFF/SENIOR_MEMBER conflicts visible for an administrator. */
UPDATE `RewardRuleSet` AS sets
JOIN (
  SELECT `productId`
  FROM `RewardRule`
  GROUP BY `productId`
  HAVING SUM(`promoterType` = 'STAFF') > 0 AND SUM(`promoterType` = 'SENIOR_MEMBER') > 0
) AS conflicts ON conflicts.`productId` = sets.`productId`
SET sets.`migrationNeedsReview` = true;

/* Every canonical set has exactly the three supported tiers. Missing legacy
   tiers are zero-value inactive projections and can be edited later. */
INSERT INTO `RewardRuleTier` (`id`, `ruleSetId`, `tier`, `method`, `rateBps`, `fixedFen`, `active`)
SELECT CONCAT(sets.`id`, ':', tiers.`tier`), sets.`id`, tiers.`tier`, 'PERCENT', 0, 0, false
FROM `RewardRuleSet` AS sets
JOIN (
  SELECT 'SALES' AS `tier`
  UNION ALL SELECT 'MEMBER'
  UNION ALL SELECT 'COMPANY'
) AS tiers
WHERE NOT EXISTS (
  SELECT 1 FROM `RewardRuleTier` existing
  WHERE existing.`ruleSetId` = sets.`id` AND existing.`tier` = tiers.`tier`
);

UPDATE `RewardRuleTier`
SET `method` = CASE WHEN COALESCE(`fixedFen`, 0) > 0 THEN 'FIXED' ELSE 'PERCENT' END,
    `rateBps` = CASE WHEN COALESCE(`fixedFen`, 0) > 0 THEN 0 ELSE COALESCE(`rateBps`, 0) END;
