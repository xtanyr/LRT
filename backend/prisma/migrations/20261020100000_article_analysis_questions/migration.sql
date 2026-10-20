UPDATE "analysis_questions"
SET "isActive" = false,
    "updatedAt" = CURRENT_TIMESTAMP
WHERE "questionKey" IN ('gifts_actions', 'gifts_plan');

INSERT INTO "analysis_questions" ("section", "questionKey", "label", "displayOrder", "isActive", "updatedAt")
VALUES
  ('GIFTS', 'gifts_actions_plan', 'Действия по устранению и план на месяц', 2, true, CURRENT_TIMESTAMP),
  ('DESSERT_WRITEOFF', 'dessert_writeoff_analysis', 'Списания десертов: причины и план', 1, true, CURRENT_TIMESTAMP),
  ('PRODUCT_WRITEOFF', 'product_writeoff_analysis', 'Списания продуктов: причины и план', 1, true, CURRENT_TIMESTAMP),
  ('FREE_ACCESS', 'free_access_analysis', 'Свободный доступ: расходы и план', 1, true, CURRENT_TIMESTAMP),
  ('ADMIN_COSTS', 'admin_costs_analysis', 'Административные затраты: причины и план', 1, true, CURRENT_TIMESTAMP),
  ('RENT', 'rent_analysis', 'Аренда: причины и план', 1, true, CURRENT_TIMESTAMP),
  ('EQUIPMENT', 'equipment_analysis', 'Оборудование: анализ и план', 1, true, CURRENT_TIMESTAMP),
  ('EQUIPMENT', 'materials_analysis', 'Материалы: анализ и план', 2, true, CURRENT_TIMESTAMP),
  ('EQUIPMENT', 'repair_analysis', 'Ремонт: анализ и план', 3, true, CURRENT_TIMESTAMP)
ON CONFLICT ("questionKey") DO UPDATE
SET "section" = EXCLUDED."section",
    "label" = EXCLUDED."label",
    "displayOrder" = EXCLUDED."displayOrder",
    "isActive" = true,
    "updatedAt" = CURRENT_TIMESTAMP;
