import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import { AuthProvider } from '../contexts/AuthProvider';
import ToastProvider from '../components/ToastProvider';
import AdminHistoryPage from '../pages/admin/AdminHistoryPage';
import { api } from '../services/api';
import { authStore } from '../services/auth-store';
import type { UserRole } from '../types/auth';

const report = {
  id: 44, year: 2026, month: 9,
  coffeeShop: { id: 7, name: 'Кофейня на Ленина' },
  metricValues: [{ metricId: 1, metric: { name: 'eNPS' } }],
};
const reportEdit = {
  id: 1, reportId: 44, editedAt: '2026-10-05T07:15:00.000Z',
  editedBy: { id: 5, name: 'Анна Лебедева' },
  fieldChanged: 'metric:1', oldValue: '"80"', newValue: '"0"', report,
};
const configEdit = {
  id: 1, changedAt: '2026-10-05T07:00:00.000Z',
  changedBy: { id: 2, name: 'Операционный директор' },
  fieldChanged: 'metric:1:update',
  oldValue: '{"name":"eNPS","thresholdStrong":80}',
  newValue: '{"name":"eNPS","thresholdStrong":90}',
};

function loadEvents(reportEvents: unknown[] = [reportEdit], configEvents: unknown[] = [configEdit], wrapped = false) {
  vi.mocked(api.get).mockImplementation(async (url) => {
    const events = url === '/reports/edit-logs' ? reportEvents : url === '/admin/config-logs' ? configEvents : [];
    return { data: wrapped ? { data: events } : events } as any;
  });
}

function renderHistory(role: UserRole = 'ADMIN', fullApp = false) {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    ok: true,
    json: async () => ({ data: { accessToken: 'session-token', user: {
      id: 5, name: 'Анна Лебедева', email: 'anna@example.com', role,
      coffeeShops: [{ id: 7, name: 'Кофейня на Ленина' }], cities: [{ id: 1, name: 'Омск' }],
    } } }),
  } as Response);
  return render(
    <MemoryRouter initialEntries={['/history']}>
      <AuthProvider><ToastProvider>{fullApp ? <App /> : <AdminHistoryPage />}</ToastProvider></AuthProvider>
    </MemoryRouter>,
  );
}

const rows = () => screen.getAllByRole('row').slice(1);
const values = (row: HTMLElement) => within(row).getAllByRole('cell').slice(-2).map((cell) => cell.textContent);

describe('report edit history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authStore.logout();
    loadEvents();
  });
  afterEach(() => {
    cleanup();
    authStore.logout();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it.each<UserRole>(['LEADER', 'CITY_LEADER', 'COO'])('denies %s history through the real app, navigation and direct URL', async (role) => {
    renderHistory(role, true);
    await screen.findByRole('button', { name: 'Выйти' });
    expect(screen.queryByRole('heading', { name: 'История изменений' })).not.toBeInTheDocument();
    expect(screen.queryByText('История')).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('/reports/edit-logs');
    expect(api.get).not.toHaveBeenCalledWith('/admin/config-logs');
  });

  it('lets only an administrator open history through the real app and navigation', async () => {
    renderHistory('ADMIN', true);
    expect(await screen.findByRole('heading', { name: 'История изменений' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'История' })).toHaveAttribute('href', '/history');
    const row = (await screen.findByText('eNPS · факт')).closest('tr')!;
    expect(row).toHaveTextContent('Кофейня на Ленина · 09/2026');
    expect(row).toHaveTextContent('Анна Лебедева');
    expect(within(row).getAllByRole('cell')[0]).toHaveTextContent('05.10.2026');
    expect(values(row)).toEqual(['80', '0']);
    expect(api.get).toHaveBeenCalledWith('/reports/edit-logs');
    expect(api.get).toHaveBeenCalledWith('/admin/config-logs');
  });

  it('merges administrator history chronologically without losing colliding IDs', async () => {
    loadEvents([reportEdit], [configEdit], true);
    renderHistory();
    await screen.findByText('eNPS · факт');
    expect(rows()).toHaveLength(2);
    expect(rows()[0]).toHaveTextContent('Кофейня на Ленина');
    expect(rows()[1]).toHaveTextContent('Метрика #1 · изменение');
    expect(api.get).toHaveBeenCalledWith('/admin/config-logs');

    fireEvent.click(screen.getByRole('button', { name: 'Отчёты' }));
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent('eNPS · факт');
    fireEvent.click(screen.getByRole('button', { name: 'Метрики' }));
    expect(rows()).toHaveLength(1);
    expect(rows()[0]).toHaveTextContent('Метрика #1 · изменение');
    expect(rows()[0]).not.toHaveTextContent('Кофейня на Ленина');
    fireEvent.click(screen.getByRole('button', { name: 'Все' }));
    expect(rows()).toHaveLength(2);
  });

  it('keeps zero, null and an empty answer distinct', async () => {
    loadEvents([
      { ...reportEdit, id: 2, fieldChanged: 'revenue', oldValue: null, newValue: '0' },
      { ...reportEdit, id: 3, fieldChanged: 'drinksCount', oldValue: '0', newValue: 'null' },
      { ...reportEdit, id: 4, fieldChanged: 'analysis:enps_problem', analysisLabel: 'Проблемы eNPS', oldValue: '""', newValue: '"Причины описаны"' },
    ], []);
    renderHistory();
    const revenue = (await screen.findByText('Выручка, ₽')).closest('tr')!;
    expect(values(revenue)).toEqual(['—', '0']);
    expect(values(screen.getByText('Количество напитков').closest('tr')!)).toEqual(['0', '—']);
    expect(values(screen.getByText('Анализ: Проблемы eNPS').closest('tr')!)).toEqual(['Пусто', 'Причины описаны']);
  });

  it('shows legacy formData changes per field and leaves unchanged values out', async () => {
    loadEvents([{
      ...reportEdit, fieldChanged: 'formData',
      oldValue: '{"metricPlan_1":90,"gifts":1,"equipmentLink":null,"revenuePlan":10}',
      newValue: '{"metricPlan_1":0,"gifts":1,"equipmentLink":"","adminCosts":0}',
    }], []);
    renderHistory();
    const plan = (await screen.findByText('План: eNPS')).closest('tr')!;
    expect(rows()).toHaveLength(4);
    expect(values(plan)).toEqual(['90', '0']);
    expect(values(screen.getByText('План выручки').closest('tr')!)).toEqual(['10', '—']);
    expect(values(screen.getByText('Ссылка на план затрат на оборудование').closest('tr')!)).toEqual(['—', 'Пусто']);
    expect(values(screen.getByText('Административные затраты, ₽').closest('tr')!)).toEqual(['—', '0']);
    expect(screen.queryByText('Подарки, ₽')).not.toBeInTheDocument();
    rows().forEach((row) => expect(row).toHaveTextContent('Кофейня на Ленина · 09/2026'));
  });

  it('labels new plans and extra report fields without requiring active metric lookups', async () => {
    loadEvents([
      { ...reportEdit, id: 2, fieldChanged: 'formData:metricPlan_1', oldValue: '90', newValue: '95' },
      { ...reportEdit, id: 3, fieldChanged: 'formData:giftsPlan', oldValue: 'null', newValue: '1000' },
      { ...reportEdit, id: 4, fieldChanged: 'metric:999', oldValue: '"1"', newValue: '"2"' },
    ], []);
    renderHistory();
    expect(await screen.findByText('План: eNPS')).toBeInTheDocument();
    expect(screen.getByText('План: Подарки, ₽')).toBeInTheDocument();
    expect(screen.getByText('Метрика #999 · факт')).toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('/metrics');
  });

  it('shows submitted-report status changes with readable values', async () => {
    loadEvents([{ ...reportEdit, fieldChanged: 'status', oldValue: 'NOT_FILLED', newValue: 'SUBMITTED' }], []);
    renderHistory();
    const status = (await screen.findByText('Статус отчёта')).closest('tr')!;
    expect(values(status)).toEqual(['Не заполнено', 'Отправлен']);
  });

  it.each(['Asia/Omsk', 'America/New_York'])('shows report submission history values in Moscow time when the browser timezone is %s', async (timeZone) => {
    vi.stubEnv('TZ', timeZone);
    loadEvents([{
      ...reportEdit, fieldChanged: 'submittedAt',
      oldValue: '"2026-10-05T09:00:00.000Z"', newValue: '2026-10-01T05:20:00.000Z',
    }], []);
    renderHistory();
    const row = (await screen.findByText('Кофейня на Ленина · 09/2026')).closest('tr')!;
    expect(values(row)).toEqual(['05.10.2026, 12:00:00 МСК', '01.10.2026, 08:20:00 МСК']);
    expect(within(row).getAllByRole('cell')[3]).toHaveTextContent('Дата отправки');
  });

  it('keeps missing submission dates and invalid legacy values readable in history', async () => {
    loadEvents([
      { ...reportEdit, id: 2, fieldChanged: 'submittedAt', oldValue: null, newValue: '"2026-10-01T05:20:00.000Z"' },
      { ...reportEdit, id: 3, fieldChanged: 'submittedAt', oldValue: '"неизвестная дата"', newValue: 'legacy-invalid-date' },
    ], []);
    renderHistory();
    const fields = await screen.findAllByText('Дата отправки');
    const dateRows = fields.map((field) => field.closest('tr')!);
    expect(dateRows.map(values)).toContainEqual(['—', '01.10.2026, 08:20:00 МСК']);
    expect(dateRows.map(values)).toContainEqual(['неизвестная дата', 'legacy-invalid-date']);
  });

  it('hides history and stops loading it when the administrator previews a leader role', async () => {
    renderHistory('ADMIN', true);
    await screen.findByText('Метрика #1 · изменение');
    vi.mocked(api.get).mockClear();
    act(() => authStore.setViewAsRole('LEADER'));
    await waitFor(() => expect(screen.queryByRole('heading', { name: 'История изменений' })).not.toBeInTheDocument());
    expect(screen.queryByText('Метрика #1 · изменение')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Метрики' })).not.toBeInTheDocument();
    expect(screen.queryByText('История')).not.toBeInTheDocument();
    expect(api.get).not.toHaveBeenCalledWith('/reports/edit-logs');
    expect(api.get).not.toHaveBeenCalledWith('/admin/config-logs');
  });

  it('shows a report-history failure while retaining the available configuration history', async () => {
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/reports/edit-logs') throw new Error('Offline');
      return { data: [configEdit] } as any;
    });
    renderHistory();
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить историю отчётов');
    expect(screen.getByText('Метрика #1 · изменение')).toBeInTheDocument();
    expect(screen.getByText('Записей: 1')).toBeInTheDocument();
    loadEvents();
    fireEvent.click(screen.getByRole('button', { name: 'Обновить' }));
    await screen.findByText('eNPS · факт');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows a configuration-history failure without claiming the merged history is complete', async () => {
    vi.mocked(api.get).mockImplementation(async (url) => {
      if (url === '/admin/config-logs') throw new Error('Forbidden');
      return { data: [reportEdit] } as any;
    });
    renderHistory('ADMIN');
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить историю конфигурации');
    expect(screen.getByText('eNPS · факт')).toBeInTheDocument();
  });

  it('exports the selected report rows with their context and before/after values', async () => {
    let downloaded: Blob | undefined;
    const createUrl = vi.fn((blob: Blob) => { downloaded = blob; return 'blob:history'; });
    const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      renderHistory('ADMIN');
      await screen.findByText('eNPS · факт');
      fireEvent.click(screen.getByRole('button', { name: 'Отчёты' }));
      fireEvent.click(screen.getByRole('button', { name: 'Экспорт CSV' }));
      expect(downloaded).toBeDefined();
      const csv = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsText(downloaded!);
      });
      expect(csv).toContain('Пользователь;Объект;Поле;Было;Стало');
      expect(csv).toContain('"Анна Лебедева";"Кофейня на Ленина · 09/2026";"eNPS · факт";"80";"0"');
      expect(csv).not.toContain('Операционный директор');
    } finally {
      if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
      else Reflect.deleteProperty(URL, 'createObjectURL');
      if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
      else Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });

  it('exports formula-leading text as text while preserving negative numbers and normal context', async () => {
    loadEvents([
      { ...reportEdit, id: 1, oldValue: '"-42.5"', newValue: '"-37"' },
      { ...reportEdit, id: 2, fieldChanged: 'analysis:enps_problem', analysisLabel: 'Проблемы eNPS', oldValue: '"=1+1"', newValue: JSON.stringify(' \t=2+2') },
      { ...reportEdit, id: 3, fieldChanged: 'analysis:enps_problem', analysisLabel: 'Проблемы eNPS', oldValue: JSON.stringify('+SUM(1;2)'), newValue: JSON.stringify('-SUM(1;2)') },
      { ...reportEdit, id: 4, fieldChanged: 'analysis:enps_problem', analysisLabel: 'Проблемы eNPS', oldValue: JSON.stringify('@SUM(1;2)'), newValue: JSON.stringify('\u0001 \t@SUM(1;2)'), editedBy: { id: 5, name: '=1+1' } },
    ], []);
    let downloaded: Blob | undefined;
    const originalCreate = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const originalRevoke = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: (blob: Blob) => { downloaded = blob; return 'blob:history'; } });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    try {
      renderHistory();
      await screen.findByText('eNPS · факт');
      fireEvent.click(screen.getByRole('button', { name: 'Экспорт CSV' }));
      expect(downloaded).toBeDefined();
      const csv = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.readAsText(downloaded!);
      });
      expect(csv).toContain('"\'=1+1"');
      expect(csv).toContain('"\' \t=2+2"');
      expect(csv).toContain('"\'+SUM(1;2)";"\'-SUM(1;2)"');
      expect(csv).toContain('"\'@SUM(1;2)";"\'\u0001 \t@SUM(1;2)"');
      expect(csv).toContain('"-42.5";"-37"');
      expect(csv).toContain('"Кофейня на Ленина · 09/2026";"eNPS · факт"');
    } finally {
      if (originalCreate) Object.defineProperty(URL, 'createObjectURL', originalCreate);
      else Reflect.deleteProperty(URL, 'createObjectURL');
      if (originalRevoke) Object.defineProperty(URL, 'revokeObjectURL', originalRevoke);
      else Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });
});
