import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../services/api';
import CityTriggersPage from '../pages/city-leader/CityTriggersPage';

const config = [
  { id: 1, code: 'T1', thresholdRating: 60, monthsCount: 3, minMonthsOnPosition: 6, minMonthsSinceApproval: 6, isActive: true },
  { id: 2, code: 'T2', thresholdRating: 80, monthsCount: 12, minMonthsOnPosition: 6, minMonthsSinceApproval: 6, isActive: false },
  { id: 3, code: 'T3', thresholdRating: 0, monthsCount: 3, minMonthsOnPosition: 6, minMonthsSinceApproval: 6, isActive: true },
];
const coffeeShop = { id: 7, name: 'Кофейня у парка', city: { name: 'Омск' } };
let statuses: any[];
let diagnostics: any[];
let exemptions: any[];

beforeEach(() => {
  vi.mocked(api.get).mockReset();
  vi.mocked(api.post).mockReset();
  vi.mocked(api.patch).mockReset();
  exemptions = [];
  statuses = [{ id: 10, coffeeShopId: 7, coffeeShop, triggerCode: 'T3', rule: 'T3', metricName: 'eNPS', severity: 'critical', status: 'NOT_STARTED', triggeredAt: '2026-09-20T09:00:00Z', daysOverdue: 0, closeReason: null }];
  diagnostics = [{ coffeeShopId: 7, coffeeShop, leaders: [{ id: 5, name: 'Анна', approvedAt: '2026-01-01T09:00:00Z', assignedFrom: '2025-12-01T09:00:00Z', exemptions: [] }], checks: [{ code: 'T1', isActive: true, eligible: true, matched: false, reasons: ['Нет отправленного отчёта за 2026-08.'], windowStart: { year: 2026, month: 7 }, windowEnd: { year: 2026, month: 9 } }] }];
  vi.mocked(api.get).mockImplementation(async (url) => {
    const data = url === '/ipv-triggers/statuses' ? statuses : url === '/ipv-triggers/config' ? config : url === '/ipv-triggers/diagnostics' ? diagnostics : exemptions;
    return { data: { data } } as any;
  });
  vi.mocked(api.post).mockResolvedValue({ data: { data: { evaluatedAt: '2026-10-05T09:00:00Z' } } });
  vi.mocked(api.patch).mockResolvedValue({ data: {} });
});

describe('CityTriggersPage', () => {
  it('shows distinct rules, metric, Moscow trigger time and start deadline without a stray zero', async () => {
    render(<CityTriggersPage />);
    expect(await screen.findByText('eNPS')).toBeVisible();
    expect(screen.getByText(/20\.09\.2026.*12:00:00 МСК/)).toBeVisible();
    expect(screen.getByText(/Начать до.*04\.10\.2026.*12:00:00 МСК/)).toBeVisible();
    expect(screen.getByText('Одна и та же метрика в красной зоне 3 мес. подряд.')).toBeVisible();
    expect(screen.getByText('Рейтинг ниже 60 в течение 3 мес. подряд, без роста.')).toBeVisible();
    expect(screen.getByText('Рейтинг ниже 80 в течение 12 мес. подряд.')).toBeVisible();
    expect(screen.getByText('Выключен')).toBeVisible();
    expect(screen.queryByText('Рейтинг < 0')).not.toBeInTheDocument();
    expect(within(screen.getByText('eNPS').closest('tr')!).queryByText('0')).not.toBeInTheDocument();
  });

  it('shows a load error instead of claiming no triggers and allows retry', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('offline'));
    render(<CityTriggersPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить триггеры');
    expect(screen.queryByText('Нет триггеров')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
    expect(await screen.findByText('eNPS')).toBeVisible();
  });

  it('preserves a new trigger and reports a failed start action', async () => {
    vi.mocked(api.patch).mockRejectedValueOnce(new Error('offline'));
    render(<CityTriggersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Взять в работу' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось начать ИПВ');
    expect(screen.getByText('Новый')).toBeVisible();
    expect(api.patch).toHaveBeenCalledWith('/ipv-triggers/status/10', { status: 'IN_PROGRESS' });
  });

  it('requires a closing outcome, saves it and refreshes notifications', async () => {
    statuses[0] = { ...statuses[0], status: 'IN_PROGRESS' };
    vi.mocked(api.patch).mockImplementationOnce(async () => {
      statuses[0] = { ...statuses[0], status: 'COMPLETED', closeReason: 'План выполнен' };
      return { data: {} };
    });
    const changed = vi.fn();
    window.addEventListener('ipv-updated', changed);
    render(<CityTriggersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Завершить ИПВ' }));
    expect(screen.getByRole('button', { name: 'Сохранить итог' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Итог ИПВ'), { target: { value: 'План выполнен' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить итог' }));
    expect(await screen.findByText('План выполнен')).toBeVisible();
    expect(api.patch).toHaveBeenCalledWith('/ipv-triggers/status/10', { status: 'COMPLETED', closeReason: 'План выполнен' });
    expect(changed).toHaveBeenCalledOnce();
    window.removeEventListener('ipv-updated', changed);
  });

  it('runs the monitor on demand and reloads statuses and diagnostics', async () => {
    statuses = [];
    vi.mocked(api.post).mockImplementationOnce(async () => {
      statuses = [{ id: 11, coffeeShopId: 7, coffeeShop, rule: 'T1', triggerCode: 'T1', metricName: null, status: 'NOT_STARTED', triggeredAt: '2026-10-05T09:00:00Z', daysOverdue: 0 }];
      return { data: { data: { evaluatedAt: '2026-10-05T09:00:00Z' } } };
    });
    render(<CityTriggersPage />);
    expect(await screen.findByText('Нет триггеров')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Проверить сейчас' }));
    expect(await screen.findByRole('button', { name: 'Взять в работу' })).toBeVisible();
    expect(api.post).toHaveBeenCalledWith('/ipv-triggers/evaluate', {});
    await waitFor(() => expect(vi.mocked(api.get).mock.calls.filter(([url]) => url === '/ipv-triggers/diagnostics')).toHaveLength(2));
  });

  it('keeps the entered outcome when completing an IPV fails', async () => {
    statuses[0] = { ...statuses[0], status: 'IN_PROGRESS' };
    vi.mocked(api.patch).mockRejectedValueOnce(new Error('offline'));
    render(<CityTriggersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Завершить ИПВ' }));
    fireEvent.change(screen.getByLabelText('Итог ИПВ'), { target: { value: 'План выполнен' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить итог' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось завершить ИПВ');
    expect(screen.getByLabelText('Итог ИПВ')).toHaveValue('План выполнен');
    expect(screen.getByText('В работе', { selector: 'span' })).toBeVisible();
  });

  it('reports a failed manual evaluation and keeps the current events', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('offline'));
    render(<CityTriggersPage />);
    await screen.findByText('eNPS');
    fireEvent.click(screen.getByRole('button', { name: 'Проверить сейчас' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось проверить триггеры');
    expect(screen.getByText('eNPS')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Проверить сейчас' })).toBeEnabled();
  });

  it('shows why a shop did not trigger and allows a reasoned manual exemption', async () => {
    vi.mocked(api.post).mockImplementationOnce(async () => {
      exemptions = [{ id: 20, userId: 5, reason: 'Новая команда', setById: 2, canClear: true }];
      diagnostics[0].leaders[0].exemptions = exemptions;
      return { data: {} };
    });
    render(<CityTriggersPage />);
    await screen.findByText('eNPS');
    fireEvent.click(screen.getByRole('button', { name: 'Мониторинг кофеен' }));
    expect(screen.getByText('Анна')).toBeVisible();
    expect(screen.getByText('Нет отправленного отчёта за 2026-08.')).toBeVisible();
    expect(screen.getByText(/07\.2026.*09\.2026/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Добавить исключение' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Причина исключения для Анна'), { target: { value: 'Новая команда' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить исключение' }));
    expect(await screen.findByText('Новая команда')).toBeVisible();
    expect(api.post).toHaveBeenCalledWith('/ipv-triggers/exemptions', { userId: 5, reason: 'Новая команда' });
  });

  it('only offers to clear permitted exemptions and refreshes after clearing', async () => {
    exemptions = [{ id: 20, userId: 5, reason: 'Можно снять', setById: 2, canClear: true }, { id: 21, userId: 5, reason: 'Другой автор', setById: 3, canClear: false }];
    diagnostics[0].leaders[0].exemptions = exemptions;
    vi.mocked(api.patch).mockImplementationOnce(async () => {
      exemptions = exemptions.filter(e => e.id !== 20);
      diagnostics[0].leaders[0].exemptions = exemptions;
      return { data: {} };
    });
    render(<CityTriggersPage />);
    await screen.findByText('eNPS');
    fireEvent.click(screen.getByRole('button', { name: 'Мониторинг кофеен' }));
    expect(screen.getAllByRole('button', { name: 'Снять исключение' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Снять исключение' }));
    await waitFor(() => expect(screen.queryByText('Можно снять')).not.toBeInTheDocument());
    expect(screen.getByText('Другой автор')).toBeVisible();
    expect(api.patch).toHaveBeenCalledWith('/ipv-triggers/exemptions/20/clear', {});
  });

  it('keeps the exemption reason when its creation fails', async () => {
    vi.mocked(api.post).mockRejectedValueOnce(new Error('offline'));
    render(<CityTriggersPage />);
    await screen.findByText('eNPS');
    fireEvent.click(screen.getByRole('button', { name: 'Мониторинг кофеен' }));
    fireEvent.change(screen.getByLabelText('Причина исключения для Анна'), { target: { value: 'Новая команда' } });
    fireEvent.click(screen.getByRole('button', { name: 'Добавить исключение' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось добавить исключение');
    expect(screen.getByLabelText('Причина исключения для Анна')).toHaveValue('Новая команда');
    expect(screen.queryByRole('button', { name: 'Снять исключение' })).not.toBeInTheDocument();
  });

  it('lets an author clear their saved exemption after a leader leaves accessible shops', async () => {
    diagnostics = [];
    exemptions = [
      { id: 20, userId: 5, user: { id: 5, name: 'Анна' }, reason: 'Перевод в другой город', canClear: true },
      { id: 21, userId: 6, user: { id: 6, name: 'Иван' }, reason: 'Исключение другого автора', canClear: false },
    ];
    vi.mocked(api.patch).mockImplementationOnce(async () => {
      exemptions = exemptions.filter(exemption => exemption.id !== 20);
      return { data: {} };
    });
    render(<CityTriggersPage />);
    await screen.findByText('eNPS');
    fireEvent.click(screen.getByRole('button', { name: 'Мониторинг кофеен' }));
    expect(screen.getByText('Анна')).toBeVisible();
    expect(screen.getByText('Перевод в другой город')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Снять исключение' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Снять исключение' }));
    await waitFor(() => expect(screen.queryByText('Перевод в другой город')).not.toBeInTheDocument());
    expect(screen.getByText('Исключение другого автора')).toBeVisible();
    expect(api.patch).toHaveBeenCalledWith('/ipv-triggers/exemptions/20/clear', {});
  });

  it('uses client validation for short or meaningless outcomes and exemption reasons', async () => {
    statuses[0] = { ...statuses[0], status: 'IN_PROGRESS' };
    render(<CityTriggersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Завершить ИПВ' }));
    expect(screen.getByText('Не менее 3 символов, включая букву или цифру.')).toBeVisible();
    fireEvent.change(screen.getByLabelText('Итог ИПВ'), { target: { value: 'да' } });
    expect(screen.getByRole('button', { name: 'Сохранить итог' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить итог' }));
    fireEvent.change(screen.getByLabelText('Итог ИПВ'), { target: { value: '!!!' } });
    expect(screen.getByRole('button', { name: 'Сохранить итог' })).toBeDisabled();
    expect(api.patch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Мониторинг кофеен' }));
    fireEvent.change(screen.getByLabelText('Причина исключения для Анна'), { target: { value: 'я' } });
    expect(screen.getByRole('button', { name: 'Добавить исключение' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Добавить исключение' }));
    expect(api.post).not.toHaveBeenCalled();
  });

  it('shows actionable server validation messages from a failed action', async () => {
    vi.mocked(api.patch).mockRejectedValueOnce({ response: { data: { message: ['ИПВ скрыто ручным исключением', 'Сначала снимите исключение'] } } });
    render(<CityTriggersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Взять в работу' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('ИПВ скрыто ручным исключением, Сначала снимите исключение');
    expect(screen.getByText('Новый')).toBeVisible();
  });
});
