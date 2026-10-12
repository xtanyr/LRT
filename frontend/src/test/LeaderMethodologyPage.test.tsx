import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import LeaderMethodologyPage from '../pages/leader/LeaderMethodologyPage';

afterEach(cleanup);

it('offers the filled report example from the methodology without losing report context', async () => {
  render(<MemoryRouter initialEntries={['/methodology?period=2026-09&shop=7']}><LeaderMethodologyPage /></MemoryRouter>);
  await screen.findByRole('heading', { name: 'Как считается рейтинг' });
  expect(screen.getByRole('link', { name: 'Пример заполнения отчёта' })).toHaveAttribute('href', '/report-example?period=2026-09&shop=7');
});
