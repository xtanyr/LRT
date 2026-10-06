import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthProvider';
import ToastProvider from '../components/ToastProvider';
import CityDashboardPage from '../pages/city-leader/CityDashboardPage';
import { api } from '../services/api';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>{ui}</ToastProvider>
      </AuthProvider>
    </BrowserRouter>,
  );
}

describe('CityDashboardPage', () => {
  it('renders city dashboard', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      const urlString = typeof url === 'string' ? url : url.toString();
      if (urlString.includes('/metrics')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: [] }),
        }) as any;
      }
      if (urlString.includes('/dashboard/city-leader')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { reports: [], ipvStatuses: [] } }),
        }) as any;
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      }) as any;
    });

    renderWithProviders(<CityDashboardPage />);
    expect(await screen.findByText('Дашборд города · 0 кофеен')).toBeDefined();
  });
});

describe('City coffee shop report state by month', () => {
  const coffeeShops = [
    { id: 7, name: 'На Ленина', cityId: 2, city: { name: 'Омск' } },
    { id: 8, name: 'На Мира', cityId: 2, city: { name: 'Омск' } },
    { id: 9, name: 'На Маркса', cityId: 2, city: { name: 'Омск' } },
  ];
  const reports = [
    { id: 44, coffeeShopId: 7, year: 2026, month: 9, status: 'SUBMITTED', submittedAt: '2026-10-01T05:20:00.000Z', score: { rating: 88, results: [] } },
    { id: 45, coffeeShopId: 8, year: 2026, month: 9, status: 'NOT_FILLED', submittedAt: null, score: { rating: 20, results: [] } },
    { id: 43, coffeeShopId: 7, year: 2026, month: 8, status: 'OVERDUE', submittedAt: null, score: { rating: 44, results: [] } },
    { id: 42, coffeeShopId: 8, year: 2026, month: 8, status: 'SUBMITTED', submittedAt: '2026-09-05T06:00:00.000Z', score: { rating: 55, results: [] } },
  ];
  const rowFor = (name: string) => within(screen.getByRole('link', { name }).closest('tr')!);
  const submissionCount = () => screen.getByText('Сданность').closest('.kpi')!;
  const chooseMonth = (name: string) => {
    fireEvent.click(screen.getByRole('button', { name: 'Период' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Период' })).getByRole('button', { name }));
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 5, 9));
    vi.mocked(api.get).mockImplementation(async (url) => ({ data: url === '/dashboard/city-leader'
      ? { coffeeShops, reports, ipvStatuses: [] }
      : { greenThreshold: 80, redThreshold: 60 } }) as any);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('shows the selected month submission time in Moscow time with distinct submitted, draft and missing states', async () => {
    vi.stubEnv('TZ', 'Asia/Omsk');
    render(<MemoryRouter><CityDashboardPage /></MemoryRouter>);
    await screen.findByRole('link', { name: 'На Ленина' });

    expect(screen.getByRole('columnheader', { name: 'Время подачи' })).toBeInTheDocument();
    expect(rowFor('На Ленина').getByText('Заполнено')).toBeInTheDocument();
    expect(rowFor('На Ленина').getByText('01.10.2026, 08:20:00 МСК')).toBeInTheDocument();
    expect(rowFor('На Ленина').getByText('88.0')).toHaveStyle({ color: 'var(--success)' });
    expect(rowFor('На Мира').getByText('Черновик')).toBeInTheDocument();
    expect(rowFor('На Мира').queryByText(/МСК/)).not.toBeInTheDocument();
    expect(rowFor('На Маркса').getByText('Не заполнено')).toBeInTheDocument();
    expect(submissionCount()).toHaveTextContent('1 / 3');
  });

  it('counts one IPV per shop and gives in-progress indicators priority over pending reasons', async () => {
    const ipvStatuses = [
      { id: 1, coffeeShopId: 7, triggerCode: 'T3', status: 'NOT_STARTED', triggeredAt: '2026-09-01T09:00:00Z' },
      { id: 2, coffeeShopId: 7, triggerCode: 'T1', status: 'IN_PROGRESS', triggeredAt: '2026-09-01T09:00:00Z' },
    ];
    vi.mocked(api.get).mockImplementation(async (url) => ({ data: url === '/dashboard/city-leader'
      ? { coffeeShops, reports, ipvStatuses }
      : { greenThreshold: 80, redThreshold: 60 } }) as any);
    render(<MemoryRouter><CityDashboardPage /></MemoryRouter>);
    await screen.findByRole('link', { name: 'На Ленина' });
    expect(screen.getByText('Открытые ИПВ').closest('.kpi')!.querySelector('.kpi-value')).toHaveTextContent('1');
    expect(rowFor('На Ленина').getByText(/⏳/)).toBeInTheDocument();
    expect(rowFor('На Ленина').queryByText(/🔔/)).not.toBeInTheDocument();
  });

  it('changes each shop status, rating and submission time when the selected month changes', async () => {
    render(<MemoryRouter><CityDashboardPage /></MemoryRouter>);
    await screen.findByRole('link', { name: 'На Ленина' });
    chooseMonth('авг');

    expect(rowFor('На Ленина').getByText('Просрочено')).toBeInTheDocument();
    expect(rowFor('На Ленина').queryByText(/МСК/)).not.toBeInTheDocument();
    expect(rowFor('На Ленина').queryByText('88.0')).not.toBeInTheDocument();
    expect(rowFor('На Мира').getByText('Заполнено')).toBeInTheDocument();
    expect(rowFor('На Мира').getByText('05.09.2026, 09:00:00 МСК')).toBeInTheDocument();
    expect(rowFor('На Мира').getByText('55.0')).toHaveStyle({ color: 'var(--danger)' });
    expect(rowFor('На Маркса').getByText('Просрочено')).toBeInTheDocument();
    expect(submissionCount()).toHaveTextContent('1 / 3');

    chooseMonth('окт');
    expect(submissionCount()).toHaveTextContent('0 / 3');
    for (const shop of coffeeShops) {
      expect(rowFor(shop.name).getByText('Не заполнено')).toBeInTheDocument();
      expect(rowFor(shop.name).queryByText(/МСК/)).not.toBeInTheDocument();
    }
  });

  it('counts both submitted demo reports, but excludes a draft and a missing report in another month', async () => {
    const demoShops = coffeeShops.slice(0, 2).map((shop, index) => ({ ...shop, name: `Coffee Shop ${index + 1}`, city: { name: 'Москва' } }));
    const demoReports = [
      { ...reports[0], coffeeShopId: demoShops[0].id, score: { rating: 71.5, results: [] } },
      { ...reports[0], id: 46, coffeeShopId: demoShops[1].id, score: { rating: 100, results: [] } },
      { ...reports[1], coffeeShopId: demoShops[0].id, month: 8 },
    ];
    vi.mocked(api.get).mockImplementation(async (url) => ({ data: url === '/dashboard/city-leader'
      ? { coffeeShops: demoShops, reports: demoReports, ipvStatuses: [] }
      : { greenThreshold: 80, redThreshold: 60 } }) as any);
    render(<MemoryRouter><CityDashboardPage /></MemoryRouter>);
    await screen.findByRole('link', { name: 'Coffee Shop 1' });

    expect(submissionCount()).toHaveTextContent('2 / 2');
    expect(rowFor('Coffee Shop 1').getByText('Заполнено')).toBeInTheDocument();
    expect(rowFor('Coffee Shop 2').getByText('Заполнено')).toBeInTheDocument();
    expect(screen.getByText('85.8')).toBeInTheDocument();

    chooseMonth('авг');
    expect(submissionCount()).toHaveTextContent('0 / 2');
    expect(rowFor('Coffee Shop 1').getByText('Черновик')).toBeInTheDocument();
    expect(rowFor('Coffee Shop 2').getByText('Просрочено')).toBeInTheDocument();
    expect(screen.queryByText('85.8')).not.toBeInTheDocument();
    expect(screen.queryByText('71.5')).not.toBeInTheDocument();
    expect(screen.queryByText('100.0')).not.toBeInTheDocument();
  });

  it('uses the server overdue state even when the browser date is before that period deadline', async () => {
    vi.mocked(api.get).mockImplementation(async (url) => ({ data: url === '/dashboard/city-leader'
      ? { coffeeShops: [coffeeShops[0]], reports: [{ ...reports[0], status: 'OVERDUE', submittedAt: null }], ipvStatuses: [] }
      : { greenThreshold: 80, redThreshold: 60 } }) as any);
    render(<MemoryRouter><CityDashboardPage /></MemoryRouter>);
    await screen.findByRole('link', { name: 'На Ленина' });

    expect(rowFor('На Ленина').getByText('Просрочено')).toBeInTheDocument();
    expect(rowFor('На Ленина').queryByText('Заполнено')).not.toBeInTheDocument();
  });

  it.each([
    ['SUBMITTED', null, 'Заполнено'],
    ['SUBMITTED', 'invalid legacy date', 'Заполнено'],
    ['NOT_FILLED', '2026-09-05T06:00:00.000Z', 'Черновик'],
  ])('shows no submission time for status %s and timestamp %s without inventing another month date', async (status, submittedAt, label) => {
    vi.mocked(api.get).mockImplementation(async (url) => ({ data: url === '/dashboard/city-leader'
      ? { coffeeShops: [coffeeShops[0]], reports: [{ ...reports[0], status, submittedAt }], ipvStatuses: [] }
      : { greenThreshold: 80, redThreshold: 60 } }) as any);
    render(<MemoryRouter><CityDashboardPage /></MemoryRouter>);
    await screen.findByRole('link', { name: 'На Ленина' });

    const row = rowFor('На Ленина');
    expect(row.getByText(label!)).toBeInTheDocument();
    expect(row.getAllByRole('cell')[3]).toHaveTextContent('—');
    expect(row.queryByText(/МСК|Invalid Date/)).not.toBeInTheDocument();
  });
});
