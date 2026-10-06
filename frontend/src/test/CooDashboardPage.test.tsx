import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CooShopsPage from '../pages/coo/CooShopsPage';
import CooReportsPage from '../pages/coo/CooReportsPage';
import CityDashboardPage from '../pages/city-leader/CityDashboardPage';
import LeaderResultsPage from '../pages/leader/LeaderResultsPage';
import { api } from '../services/api';

describe('COO dashboard report status filter', () => {
  const coffeeShops = [
    { id: 7, name: 'На Арбате', cityId: 2, city: { name: 'Москва' } },
    { id: 8, name: 'На Тверской', cityId: 2, city: { name: 'Москва' } },
    { id: 9, name: 'На Садовой', cityId: 2, city: { name: 'Москва' } },
    { id: 10, name: 'На Ленина', cityId: 3, city: { name: 'Омск' } },
    { id: 11, name: 'На Мира', cityId: 3, city: { name: 'Омск' } },
  ];
  const reports = [
    { id: 44, coffeeShopId: 7, year: 2026, month: 9, status: 'SUBMITTED', submittedAt: '2026-10-01T05:20:00.000Z', score: { rating: 88, results: [] } },
    { id: 45, coffeeShopId: 8, year: 2026, month: 9, status: 'NOT_FILLED', submittedAt: null, score: { rating: 20, results: [] } },
    { id: 46, coffeeShopId: 10, year: 2026, month: 9, status: 'OVERDUE', submittedAt: null, score: { rating: 44, results: [] } },
    { id: 47, coffeeShopId: 11, year: 2026, month: 9, status: 'SUBMITTED', submittedAt: '2026-10-02T06:00:00.000Z', score: { rating: 55, results: [] } },
    { id: 42, coffeeShopId: 7, year: 2026, month: 8, status: 'OVERDUE', submittedAt: null, score: null },
    { id: 43, coffeeShopId: 8, year: 2026, month: 8, status: 'SUBMITTED', submittedAt: '2026-09-05T06:00:00.000Z', score: { rating: 90, results: [] } },
  ];
  const ipvStatuses = [
    { id: 1, coffeeShopId: 7, status: 'IN_PROGRESS', triggerCode: 'T1', triggeredAt: '2026-10-01T00:00:00Z' },
    { id: 2, coffeeShopId: 8, status: 'OPEN', triggerCode: 'T2', triggeredAt: '2026-10-01T00:00:00Z' },
    { id: 3, coffeeShopId: 10, status: 'OPEN', triggerCode: 'T3', triggeredAt: '2026-10-01T00:00:00Z' },
    { id: 4, coffeeShopId: 11, status: 'COMPLETED', triggerCode: 'T1', triggeredAt: '2026-10-01T00:00:00Z' },
  ];
  const choose = (label: string, option: string) => {
    fireEvent.click(screen.getByRole('button', { name: label }));
    fireEvent.click(within(screen.getByRole('listbox', { name: label })).getByRole('option', { name: option }));
  };
  const chooseMonth = (name: string) => {
    fireEvent.click(screen.getByRole('button', { name: 'Период' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Период' })).getByRole('button', { name }));
  };
  const shopNames = () => within(screen.getByRole('table')).queryAllByRole('link').map(link => link.textContent);
  const kpi = (name: string) => screen.getByText(name).closest('.kpi')!;
  const renderShops = async () => {
    render(<MemoryRouter><CooShopsPage /></MemoryRouter>);
    await screen.findByRole('link', { name: 'На Арбате' });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Date, 'now').mockReturnValue(Date.UTC(2026, 9, 5, 9));
    vi.mocked(api.get).mockImplementation(async url => ({ data: url.startsWith('/dashboard/')
      ? { coffeeShops, reports, ipvStatuses }
      : { greenThreshold: 80, redThreshold: 60 } }) as any);
  });
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it.each([
    ['Заполнено', ['На Арбате', 'На Мира'], '2 / 2', '71.5', '1'],
    ['Черновик', ['На Тверской'], '0 / 1', '—', '1'],
    ['Не заполнено', ['На Садовой'], '0 / 1', '—', '0'],
    ['Просрочено', ['На Ленина'], '0 / 1', '—', '1'],
  ])('filters %s and recalculates submitted counts, mean rating and open IPV', async (status, names, count, average, ipvCount) => {
    await renderShops();
    choose('Статус отчёта', status);

    expect(shopNames()).toEqual(names);
    expect(kpi('Сданность')).toHaveTextContent(count);
    expect(kpi('Средний балл').querySelector('.kpi-value')).toHaveTextContent(average);
    expect(kpi('Открытые ИПВ').querySelector('.kpi-value')).toHaveTextContent(ipvCount);
  });

  it('combines status, city and name filters and restores all statuses', async () => {
    await renderShops();
    choose('Статус отчёта', 'Заполнено');
    choose('Город', 'Москва');
    expect(shopNames()).toEqual(['На Арбате']);
    expect(kpi('Средний балл')).toHaveTextContent('88.0');

    choose('Статус отчёта', 'Все статусы');
    expect(shopNames()).toEqual(['На Арбате', 'На Тверской', 'На Садовой']);
    expect(kpi('Сданность')).toHaveTextContent('1 / 3');
    fireEvent.change(screen.getByRole('textbox', { name: 'Поиск' }), { target: { value: 'твер' } });
    choose('Статус отчёта', 'Черновик');
    expect(shopNames()).toEqual(['На Тверской']);
    expect(kpi('Сданность')).toHaveTextContent('0 / 1');
  });

  it('keeps the status filter while changing month and preserves rating sorting', async () => {
    await renderShops();
    choose('Статус отчёта', 'Заполнено');
    fireEvent.click(screen.getByRole('button', { name: 'Рейтинг ↓' }));
    expect(shopNames()).toEqual(['На Мира', 'На Арбате']);

    chooseMonth('авг');
    expect(screen.getByRole('button', { name: 'Статус отчёта' })).toHaveTextContent('Заполнено');
    expect(shopNames()).toEqual(['На Тверской']);
    expect(kpi('Сданность')).toHaveTextContent('1 / 1');
    expect(kpi('Средний балл')).toHaveTextContent('90.0');
  });

  it('includes missing past-month reports in the overdue filter', async () => {
    await renderShops();
    chooseMonth('авг');
    choose('Статус отчёта', 'Просрочено');
    expect(shopNames()).toEqual(['На Арбате', 'На Садовой', 'На Ленина', 'На Мира']);
    expect(kpi('Сданность')).toHaveTextContent('0 / 4');
    choose('Статус отчёта', 'Не заполнено');
    expect(shopNames()).toEqual([]);
    expect(screen.getByText('Нет кофеен по выбранным фильтрам')).toBeInTheDocument();
  });

  it('shows an empty result and zero counts for a city without the selected status', async () => {
    await renderShops();
    choose('Город', 'Омск');
    choose('Статус отчёта', 'Черновик');
    expect(shopNames()).toEqual([]);
    expect(kpi('Сданность')).toHaveTextContent('0 / 0');
    expect(kpi('Открытые ИПВ').querySelector('.kpi-value')).toHaveTextContent('0');
    expect(screen.getByText('Нет кофеен по выбранным фильтрам')).toBeInTheDocument();
  });

  it('filters city aggregates and omits cities without matching shops', async () => {
    render(<MemoryRouter initialEntries={['/?view=cities']}><CooShopsPage /></MemoryRouter>);
    await screen.findByRole('cell', { name: 'Москва' });
    choose('Статус отчёта', 'Черновик');
    const table = within(screen.getByRole('table'));
    expect(table.getAllByRole('row')).toHaveLength(2);
    expect(table.getByRole('cell', { name: 'Москва' })).toBeInTheDocument();
    expect(table.queryByRole('cell', { name: 'Омск' })).not.toBeInTheDocument();
    expect(table.getByRole('cell', { name: '0/1' })).toBeInTheDocument();
    choose('Город', 'Омск');
    expect(table.queryAllByRole('cell')).toHaveLength(0);
    expect(screen.getByText('Нет кофеен по выбранным фильтрам')).toBeInTheDocument();
  });

  it('also offers status filtering on the COO monthly reports page', async () => {
    render(<MemoryRouter><CooReportsPage /></MemoryRouter>);
    await screen.findByRole('link', { name: 'На Арбате' });
    choose('Статус отчёта', 'Не заполнено');
    expect(shopNames()).toEqual(['На Садовой']);
  });

  it.each([CityDashboardPage, LeaderResultsPage])('preserves the other role dashboards without the COO status filter', async Page => {
    render(<MemoryRouter><Page /></MemoryRouter>);
    await screen.findByRole('button', { name: 'Период' });
    expect(screen.queryByRole('button', { name: 'Статус отчёта' })).not.toBeInTheDocument();
  });
});
