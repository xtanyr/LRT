import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import App from '../App';

const auth = vi.hoisted(() => ({ user: null as null | { role: string }, loading: false, login: vi.fn() }));
vi.mock('../contexts/AuthProvider', () => ({ useAuth: () => auth }));
vi.mock('../layouts/AppLayout', () => ({ default: ({ children }: { children: ReactNode }) => <main>{children}</main> }));
vi.mock('../pages/DashboardPage', () => ({ default: () => <h1>Дашборд</h1> }));

beforeEach(() => { auth.user = null; auth.loading = false; });
afterEach(cleanup);

it('requires a session to open the report example', async () => {
  render(<MemoryRouter initialEntries={['/report-example?period=2026-09&shop=7']}><App /></MemoryRouter>);
  expect(await screen.findByPlaceholderText('name@skuratov.ru')).toBeInTheDocument();
  expect(screen.queryByRole('heading', { name: 'Пример заполнения отчёта' })).not.toBeInTheDocument();
});

it.each(['LEADER', 'CITY_LEADER', 'COO', 'ADMIN'])('lets an authenticated %s open the report example and return to their report', async role => {
  auth.user = { role };
  render(<MemoryRouter initialEntries={['/report-example?period=2026-09&shop=7']}><App /></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: 'Пример заполнения отчёта' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Вернуться к отчёту' })).toHaveAttribute('href', '/report?period=2026-09&shop=7');
});
