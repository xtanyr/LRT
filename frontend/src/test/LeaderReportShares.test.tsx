import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import ToastProvider from '../components/ToastProvider';
import LeaderReportPage from '../pages/leader/LeaderReportPage';
import { api } from '../services/api';

const metrics = [
  { id: 2, name: 'Доля депозита в выручке', code: 'DEPOSIT', unit: '%', section: 'TEAM_GUESTS', displayOrder: 2, isActive: true },
  { id: 3, name: 'Доля списания десертов', code: 'DESSERT_WRITEOFF', unit: '%', section: 'DESSERT_WRITEOFF', displayOrder: 1, isActive: true },
  { id: 4, name: 'Доля списания продуктов', code: 'PRODUCT_WRITEOFF', unit: '%', section: 'PRODUCT_WRITEOFF', displayOrder: 2, isActive: true },
];

function reportWith(revenue: unknown, formData: Record<string, unknown> = {}) {
  return {
    id: 44, coffeeShopId: 7, year: 2026, month: 9, revenue, drinksCount: 50, isEditable: true,
    metricValues: [{ metricId: 2, absoluteValue: 3000 }, { metricId: 3, absoluteValue: 1600 }, { metricId: 4, absoluteValue: 500 }],
    analyses: [], formData: { revenuePlan: 100000, metricPlan_2: '2000', ...formData },
  };
}

function mockApi(report: any) {
  vi.mocked(api.get).mockImplementation(async (path) => ({ data:
    path === '/metrics' ? metrics :
    path === '/coffee-shops' ? [{ id: 7, name: 'Тестовая кофейня' }] :
    path === '/admin/analysis-questions' ? [] :
    path === '/reports/editing-policy' ? { historicalEditingEnabled: false } :
    report,
  }) as any);
}

const cells = (label: string) => {
  const row = screen.getByLabelText(label).closest('tr')!;
  return Array.from(row.querySelectorAll('td'));
};

describe('LeaderReportPage amount and revenue share', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.post).mockImplementation(async (_url, body) => ({ data: body }) as any);
  });
  afterEach(cleanup);

  it('shows the deposit share of revenue next to the amount, for the fact and for the plan', async () => {
    mockApi(reportWith(200000));
    render(<MemoryRouter><ToastProvider><LeaderReportPage /></ToastProvider></MemoryRouter>);
    await screen.findByLabelText('Доля депозита в выручке');
    const [, , fact, plan] = cells('Доля депозита в выручке');
    expect(within(fact).getByText('1,5%')).toBeInTheDocument();
    expect(within(plan).getByText('2%')).toBeInTheDocument();
  });

  it('recalculates the share as the leader types the amount', async () => {
    mockApi(reportWith(200000));
    render(<MemoryRouter><ToastProvider><LeaderReportPage /></ToastProvider></MemoryRouter>);
    fireEvent.change(await screen.findByLabelText('Доля депозита в выручке'), { target: { value: '5 000' } });
    expect(within(cells('Доля депозита в выручке')[2]).getByText('2,5%')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Доля депозита в выручке'), { target: { value: '' } });
    expect(within(cells('Доля депозита в выручке')[2]).getByText('—')).toBeInTheDocument();
  });

  it('shows the share for dessert and product write-offs', async () => {
    mockApi(reportWith(200000));
    render(<MemoryRouter><ToastProvider><LeaderReportPage /></ToastProvider></MemoryRouter>);
    await screen.findByLabelText('Доля депозита в выручке');
    fireEvent.click(screen.getByRole('button', { name: 'Себестоимость' }));
    expect(within(cells('Доля списания десертов')[2]).getByText('0,8%')).toBeInTheDocument();
    expect(within(cells('Доля списания продуктов')[2]).getByText('0,25%')).toBeInTheDocument();
  });

  it('shows a dash instead of a share when revenue is not filled in', async () => {
    mockApi(reportWith('', { revenuePlan: '' }));
    render(<MemoryRouter><ToastProvider><LeaderReportPage /></ToastProvider></MemoryRouter>);
    await screen.findByLabelText('Доля депозита в выручке');
    const [, , fact, plan] = cells('Доля депозита в выручке');
    expect(within(fact).getByText('—')).toBeInTheDocument();
    expect(within(plan).getByText('—')).toBeInTheDocument();
  });
});
