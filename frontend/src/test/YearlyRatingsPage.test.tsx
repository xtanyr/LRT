import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import YearlyRatingsPage from '../pages/YearlyRatingsPage';
import { api } from '../services/api';

vi.mock('../contexts/AuthProvider', () => ({
  useAuth: () => ({ user: { id: 1, role: 'CITY_LEADER' }, viewAsRole: null }),
}));

const shops = [1, 2, 3].map((id) => ({ id, name: 'Кофейня ' + id, city: { name: 'Москва' } }));
const report = (coffeeShopId: number, rating: number) => ({ coffeeShopId, year: 2026, month: 1, status: 'SUBMITTED', score: { rating }, submittedBy: null });

describe('YearlyRatingsPage score highlight', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation(async (url) => ({ data:
      url === '/admin/rating-color-config' ? { greenThreshold: 80, redThreshold: 60 } :
      { coffeeShops: shops, reports: [report(1, 85), report(2, 70), report(3, 50)] },
    }) as any);
  });

  it('gives every score a highlight color matching its rating zone', async () => {
    render(<YearlyRatingsPage />);
    const rowOf = async (name: string) => within((await screen.findByText(name)).closest('tr')!);
    const green = (await rowOf('Кофейня 1')).getByText('85');
    const yellow = (await rowOf('Кофейня 2')).getByText('70');
    const red = (await rowOf('Кофейня 3')).getByText('50');
    expect(green).toHaveClass('yearly-score');
    expect(green.style.getPropertyValue('--score-color')).toBe('var(--success)');
    expect(yellow.style.getPropertyValue('--score-color')).toBe('var(--warning)');
    expect(red.style.getPropertyValue('--score-color')).toBe('var(--danger)');
  });

  it('highlights the average column too and leaves empty cells without a highlight', async () => {
    render(<YearlyRatingsPage />);
    const row = within((await screen.findByText('Кофейня 1')).closest('tr')!);
    const average = row.getByText('85.0');
    expect(average).toHaveClass('yearly-score');
    expect(average.style.getPropertyValue('--score-color')).toBe('var(--success)');
    const empty = row.getAllByText('—')[0];
    expect(empty).toHaveClass('yearly-score', 'is-empty');
  });
});
