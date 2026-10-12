const metrics = [
    { name: 'eNPS', code: 'ENPS', unit: '%', direction: 'HIGHER_IS_BETTER', thresholdStrong: 95, thresholdMedium: 80, pointsStrong: 11.5, pointsMedium: 5.75, displayOrder: 1, section: 'TEAM_GUESTS', source: 'City leader', targetValue: 95, midValue: 80, ptTarget: 11.5, ptMid: 5.75 },
    { name: 'Скорость разбора отзыва', code: 'REVIEW_SPEED', unit: 'суток', direction: 'LOWER_IS_BETTER', thresholdStrong: 2, thresholdMedium: 3, pointsStrong: 11.5, pointsMedium: 5.75, displayOrder: 2, section: 'TEAM_GUESTS', source: 'RocketData', targetValue: 2, midValue: 3, ptTarget: 11.5, ptMid: 5.75 },
    { name: 'Индекс гостевого опыта', code: 'GUEST_EXP', unit: '%', direction: 'HIGHER_IS_BETTER', thresholdStrong: 90, thresholdMedium: 75, pointsStrong: 11.5, pointsMedium: 5.75, displayOrder: 3, section: 'TEAM_GUESTS', source: 'City leader', targetValue: 90, midValue: 75, ptTarget: 11.5, ptMid: 5.75 },
    { name: 'Рейтинг стандартов', code: 'STANDARDS', unit: '%', direction: 'HIGHER_IS_BETTER', thresholdStrong: 90, thresholdMedium: 75, pointsStrong: 11.5, pointsMedium: 5.75, displayOrder: 4, section: 'TEAM_GUESTS', source: 'City leader', targetValue: 90, midValue: 75, ptTarget: 11.5, ptMid: 5.75 },
    { name: 'Производительность', code: 'PERFORMANCE', unit: 'ед.', direction: 'HIGHER_IS_BETTER', thresholdStrong: 11, thresholdMedium: 8.5, pointsStrong: 8.5, pointsMedium: 4.25, displayOrder: 5, section: 'LABOR_COST', source: 'Manual', targetValue: 11, midValue: 8.5, ptTarget: 8.5, ptMid: 4.25 },
    { name: 'Доля ФОТ в выручке', code: 'LABOR_COST', unit: '%', direction: 'LOWER_IS_BETTER', thresholdStrong: 11, thresholdMedium: 16, pointsStrong: 8.5, pointsMedium: 4.25, displayOrder: 6, section: 'LABOR_COST', source: 'Finance', targetValue: 11, midValue: 16, ptTarget: 8.5, ptMid: 4.25 },
    { name: 'Доля списания десертов', code: 'DESSERT_WRITEOFF', unit: '%', direction: 'LOWER_IS_BETTER', thresholdStrong: 0.8, thresholdMedium: 1, pointsStrong: 8.5, pointsMedium: 4.25, displayOrder: 7, section: 'COSTING', source: 'Finance', targetValue: 0.8, midValue: 1, ptTarget: 8.5, ptMid: 4.25 },
    { name: 'Доля списания продуктов', code: 'PRODUCT_WRITEOFF', unit: '%', direction: 'LOWER_IS_BETTER', thresholdStrong: 0.6, thresholdMedium: 1, pointsStrong: 8.5, pointsMedium: 4.25, displayOrder: 8, section: 'COSTING', source: 'Finance', targetValue: 0.6, midValue: 1, ptTarget: 8.5, ptMid: 4.25 },
    { name: 'Доля депозита в выручке', code: 'FREE_ACCESS', unit: '%', direction: 'LOWER_IS_BETTER', thresholdStrong: 1.3, thresholdMedium: 1.5, pointsStrong: 8.5, pointsMedium: 4.25, displayOrder: 9, section: 'COSTING', source: 'Finance', targetValue: 1.3, midValue: 1.5, ptTarget: 8.5, ptMid: 4.25 },
    { name: 'Рейтинг отзывов за месяц', code: 'REVIEW_RATING', unit: 'балл', direction: 'HIGHER_IS_BETTER', thresholdStrong: 4.8, thresholdMedium: 4.6, pointsStrong: 11.5, pointsMedium: 5.75, displayOrder: 10, section: 'TEAM_GUESTS', source: 'RocketData', targetValue: 4.8, midValue: 4.6, ptTarget: 11.5, ptMid: 5.75 },
];

const triggerConfigs = [
    { code: 'T1', thresholdRating: 60, monthsCount: 3 },
    { code: 'T2', thresholdRating: 80, monthsCount: 12 },
    { code: 'T3', thresholdRating: 0, monthsCount: 3 },
];

const analysisQuestions = [
    { section: 'ENPS', questionKey: 'enps_problems', label: 'Проблемы', displayOrder: 1 },
    { section: 'ENPS', questionKey: 'enps_reasons', label: 'Причины', displayOrder: 2 },
    { section: 'ENPS', questionKey: 'enps_plan', label: 'План устранения', displayOrder: 3 },
    { section: 'REVIEWS', questionKey: 'reviews_root_causes', label: 'Корневые причины', displayOrder: 1 },
    { section: 'REVIEWS', questionKey: 'reviews_how_fixed', label: 'Как устранили', displayOrder: 2 },
    { section: 'REVIEWS', questionKey: 'reviews_prevention', label: 'План предотвращения', displayOrder: 3 },
    { section: 'REVIEWS', questionKey: 'reviews_speed', label: 'Скорость разбора', displayOrder: 4 },
    { section: 'GUEST_EXPERIENCE', questionKey: 'guest_exp_top_problems', label: 'Топ-3 проблемы', displayOrder: 1 },
    { section: 'GUEST_EXPERIENCE', questionKey: 'guest_exp_repeated_errors', label: 'Повторяющиеся ошибки', displayOrder: 2 },
    { section: 'GUEST_EXPERIENCE', questionKey: 'guest_exp_plan', label: 'План устранения', displayOrder: 3 },
    { section: 'STANDARDS', questionKey: 'standards_top_problems', label: 'Топ-3 проблемы', displayOrder: 1 },
    { section: 'STANDARDS', questionKey: 'standards_repeated_errors', label: 'Повторяющиеся ошибки', displayOrder: 2 },
    { section: 'STANDARDS', questionKey: 'standards_plan', label: 'План устранения', displayOrder: 3 },
    { section: 'GIFTS', questionKey: 'gifts_top_reasons', label: 'Топ-5 причин за месяц', displayOrder: 1 },
    { section: 'GIFTS', questionKey: 'gifts_actions', label: 'Действия по устранению', displayOrder: 2 },
    { section: 'GIFTS', questionKey: 'gifts_plan', label: 'План на месяц', displayOrder: 3 },
    { section: 'LABOR_COST', questionKey: 'labor_lfl_month', label: 'LFL месяц к месяцу по напиткам', displayOrder: 1 },
    { section: 'LABOR_COST', questionKey: 'labor_lfl_year', label: 'LFL год к году', displayOrder: 2 },
    { section: 'LABOR_COST', questionKey: 'labor_revenue_reasons', label: 'Причины роста/падения выручки', displayOrder: 3 },
    { section: 'LABOR_COST', questionKey: 'labor_hypothesis', label: 'Гипотеза на след. месяц', displayOrder: 4 },
    { section: 'LABOR_COST', questionKey: 'labor_performance', label: 'Разбор производительности + потребность в бариста/часах', displayOrder: 5 },
    { section: 'LABOR_COST', questionKey: 'labor_certification', label: 'Сертифицированность бариста, дефицит', displayOrder: 6 },
    { section: 'SUMMARY', questionKey: 'summary_problems', label: '3 главные проблемы месяца', displayOrder: 1 },
    { section: 'SUMMARY', questionKey: 'summary_reasons', label: '3 главные причины', displayOrder: 2 },
    { section: 'SUMMARY', questionKey: 'summary_actions', label: '3 действия на следующий месяц', displayOrder: 3 },
];

const ratingColors = { greenThreshold: 80, redThreshold: 60 };

module.exports = { metrics, triggerConfigs, analysisQuestions, ratingColors };
