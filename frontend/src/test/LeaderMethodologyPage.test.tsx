import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import LeaderMethodologyPage from '../pages/leader/LeaderMethodologyPage';
import { api } from '../services/api';

afterEach(cleanup);

it('offers the filled report example from the methodology without losing report context', async () => {
  render(<MemoryRouter initialEntries={['/methodology?period=2026-09&shop=7']}><LeaderMethodologyPage /></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Как считается рейтинг' });
  expect(screen.getByRole('link', { name: 'Пример заполнения отчёта' })).toHaveAttribute('href', '/report-example?period=2026-09&shop=7');
});

it('shows only active metrics and derives the maximum from their current points', async () => {
  vi.mocked(api.get).mockResolvedValue({ data: [
    { id: 1, name: 'eNPS', code: 'ENPS', unit: '%', direction: 'HIGHER_IS_BETTER', targetValue: 95, midValue: 80, ptTarget: 11.5, ptMid: 5, isActive: true },
    { id: 2, name: 'Архивный депозит', code: 'DEPOSIT', unit: '%', direction: 'HIGHER_IS_BETTER', targetValue: 10, midValue: 5, ptTarget: 8.5, ptMid: 5, isActive: false },
  ] } as any);
  render(<MemoryRouter><LeaderMethodologyPage /></MemoryRouter>);
  expect(await screen.findByText(/Текущий максимум — 11,5 баллов/)).toBeInTheDocument();
  expect(screen.getByRole('cell', { name: 'eNPS' })).toBeInTheDocument();
  expect(screen.queryByText('Архивный депозит')).not.toBeInTheDocument();
});

it.each(['legacy decimal strings', 'canonical points with null aliases'])('adds %s numerically instead of concatenating them', async variant => {
  const codes = ['ENPS', 'REVIEW_SPEED', 'GUEST_EXP', 'STANDARDS', 'REVIEW_RATING', 'FREE_ACCESS', 'DEPOSIT', 'LABOR_COST', 'PERFORMANCE', 'DESSERT_WRITEOFF'];
  vi.mocked(api.get).mockResolvedValue({ data: codes.map((code, index) => ({
    id: index + 1, name: code, code, unit: '%', direction: 'HIGHER_IS_BETTER', targetValue: '95', midValue: '80',
    isActive: true,
    ...(variant === 'legacy decimal strings'
      ? { ptTarget: index < 5 ? '11.5' : '8.5', ptMid: '5' }
      : { pointsStrong: index < 5 ? '11.5' : '8.5', pointsMedium: '5', ptTarget: null, ptMid: null }),
  })) } as any);
  render(<MemoryRouter><LeaderMethodologyPage /></MemoryRouter>);
  expect(await screen.findByText(/Текущий максимум — 100 баллов/)).toBeInTheDocument();
});
