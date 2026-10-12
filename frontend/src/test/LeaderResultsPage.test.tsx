import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthProvider';
import ToastProvider from '../components/ToastProvider';
import LeaderResultsPage from '../pages/leader/LeaderResultsPage';
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

describe('LeaderResultsPage', () => {
  it('explains that a coffee shop must be assigned before there can be results', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url: RequestInfo | URL) => {
      const urlString = typeof url === 'string' ? url : url.toString();
      if (urlString.includes('/metrics')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: [] }),
        }) as any;
      }
      if (urlString.includes('/dashboard/leader')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ data: { reports: [] } }),
        }) as any;
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ data: [] }),
      }) as any;
    });

    renderWithProviders(<LeaderResultsPage />);
    expect(await screen.findByText('Мои результаты')).toBeDefined();
    expect(await screen.findByRole('heading', { name: 'Кофейня пока не назначена' })).toBeInTheDocument();
    expect(screen.queryByText('Просрочено')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Открыть отчёт' })).not.toBeInTheDocument();
    expect(screen.queryByText('Динамика за 12 месяцев')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Посмотреть пример заполнения отчёта' })).toHaveAttribute('href', '/report-example');
  });

  it('shows result history and a valid report link after a shop is assigned', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { coffeeShops: [{ id: 7, name: 'На Ленина', cityId: 1, city: { name: 'Омск' } }], reports: [] } } as any);
    renderWithProviders(<LeaderResultsPage />);
    expect(await screen.findByText('Динамика за 12 месяцев')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Открыть отчёт' }).getAttribute('href')).toMatch(/^\/report\?shop=7&/);
  });
});
