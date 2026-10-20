const { analysisQuestions } = require('../../prisma/reference-config.cjs');

describe('baseline report analysis questions', () => {
  it('defines separate article analysis and a single combined gifts action-and-plan question', () => {
    expect(analysisQuestions).toHaveLength(33);
    expect(analysisQuestions).toEqual(expect.arrayContaining([
      { section: 'GIFTS', questionKey: 'gifts_top_reasons', label: 'Топ-5 причин за месяц', displayOrder: 1 },
      { section: 'GIFTS', questionKey: 'gifts_actions_plan', label: 'Действия по устранению и план на месяц', displayOrder: 2 },
      { section: 'COSTING', questionKey: 'inventory_analysis', label: 'Анализ инвентаризации', displayOrder: 1 },
      { section: 'DESSERT_WRITEOFF', questionKey: 'dessert_writeoff_analysis', label: 'Списания десертов: причины и план', displayOrder: 1 },
      { section: 'PRODUCT_WRITEOFF', questionKey: 'product_writeoff_analysis', label: 'Списания продуктов: причины и план', displayOrder: 1 },
      { section: 'FREE_ACCESS', questionKey: 'free_access_analysis', label: 'Свободный доступ: расходы и план', displayOrder: 1 },
      { section: 'ADMIN_COSTS', questionKey: 'admin_costs_analysis', label: 'Административные затраты: причины и план', displayOrder: 1 },
      { section: 'RENT', questionKey: 'rent_analysis', label: 'Аренда: причины и план', displayOrder: 1 },
      { section: 'EQUIPMENT', questionKey: 'equipment_analysis', label: 'Оборудование: анализ и план', displayOrder: 1 },
      { section: 'EQUIPMENT', questionKey: 'materials_analysis', label: 'Материалы: анализ и план', displayOrder: 2 },
      { section: 'EQUIPMENT', questionKey: 'repair_analysis', label: 'Ремонт: анализ и план', displayOrder: 3 },
    ]));
    expect(analysisQuestions.map(({ questionKey }: { questionKey: string }) => questionKey)).not.toEqual(expect.arrayContaining(['gifts_actions', 'gifts_plan']));
  });
});
