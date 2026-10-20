INSERT INTO "analysis_questions" ("section", "questionKey", "label", "displayOrder", "isActive", "updatedAt")
VALUES ('COSTING', 'inventory_analysis', 'Анализ инвентаризации', 1, true, CURRENT_TIMESTAMP)
ON CONFLICT ("questionKey") DO UPDATE
SET "section" = EXCLUDED."section",
    "label" = EXCLUDED."label",
    "displayOrder" = EXCLUDED."displayOrder",
    "isActive" = true,
    "updatedAt" = CURRENT_TIMESTAMP;
