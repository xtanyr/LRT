import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../contexts/AuthProvider';
import LoginPage from '../pages/LoginPage';
import { authStore } from '../services/auth-store';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <BrowserRouter>
      <AuthProvider>{ui}</AuthProvider>
    </BrowserRouter>,
  );
}

describe('LoginPage', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/login');
    authStore.logout();
  });

  afterEach(() => {
    cleanup();
    authStore.logout();
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/login');
  });

  it('renders login form', async () => {
    (globalThis as any).fetch = vi.fn().mockResolvedValue({ ok: false });
    renderWithProviders(<LoginPage />);
    expect(await screen.findByPlaceholderText('name@skuratov.ru')).toBeDefined();
    expect(screen.getByText('Войти')).toBeDefined();
  });

  it('submits login form', async () => {
    const user = userEvent.setup();
    (globalThis as any).fetch = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            data: {
              accessToken: 'test-token',
              user: { id: 1, name: 'Admin', email: 'admin@skuratovcoffee.ru', role: 'ADMIN' },
            },
          }),
      }),
    ) as any;

    renderWithProviders(<LoginPage />);
    await user.type(await screen.findByPlaceholderText('name@skuratov.ru'), 'admin@skuratovcoffee.ru');
    await user.type(screen.getByLabelText('Пароль'), 'password123');
    await user.click(screen.getByText('Войти'));

    expect((globalThis as any).fetch).toHaveBeenCalledWith('/api/auth/login', expect.objectContaining({
      credentials: 'include',
    }));
  });

  it.each([
    [401, { message: 'Unauthorized', statusCode: 401 }, /Неверная почта или пароль/],
    [429, { message: 'Too Many Requests', statusCode: 429 }, /Слишком много попыток входа/],
    [500, { message: 'Internal server error', statusCode: 500 }, /Не удалось войти.*позже/],
  ])('explains a rejected login (%s) without starting a session', async (status, body, expected) => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === '/api/auth/login'
      ? new Response(JSON.stringify(body), { status })
      : new Response(null, { status: 401 })));

    renderWithProviders(<LoginPage />);
    await user.type(await screen.findByLabelText('Электронная почта'), 'leader@example.com');
    await user.type(screen.getByLabelText('Пароль'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByText(expected)).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(expected);
    expect(screen.getByRole('button', { name: 'Войти' })).toBeEnabled();
    expect(window.location.pathname).toBe('/login');
    expect(authStore.getState().user).toBeNull();
    expect(authStore.getState().accessToken).toBeNull();
  });

  it('explains a connection failure and allows another login attempt', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url === '/api/auth/login') throw new TypeError('Failed to fetch');
      return new Response(null, { status: 401 });
    }));

    renderWithProviders(<LoginPage />);
    await user.type(await screen.findByLabelText('Электронная почта'), 'leader@example.com');
    await user.type(screen.getByLabelText('Пароль'), 'password');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(await screen.findByText(/Не удалось связаться с сервером/)).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(/Проверьте подключение/);
    expect(screen.getByRole('button', { name: 'Войти' })).toBeEnabled();
    expect(authStore.getState().user).toBeNull();
  });

  it('clears a rejected login error when the next attempt succeeds', async () => {
    const user = userEvent.setup();
    const responses = [
      new Response(JSON.stringify({ message: 'Unauthorized', statusCode: 401 }), { status: 401 }),
      new Response(JSON.stringify({ data: {
        accessToken: 'test-token',
        user: { id: 1, name: 'Leader', email: 'leader@example.com', role: 'LEADER', coffeeShops: [], cities: [] },
      } }), { status: 200 }),
    ];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === '/api/auth/login'
      ? responses.shift()!
      : new Response(null, { status: 401 })));

    renderWithProviders(<LoginPage />);
    await user.type(await screen.findByLabelText('Электронная почта'), 'leader@example.com');
    await user.type(screen.getByLabelText('Пароль'), 'wrong-password');
    await user.click(screen.getByRole('button', { name: 'Войти' }));
    expect(await screen.findByText(/Неверная почта или пароль/)).toBeVisible();

    await user.clear(screen.getByLabelText('Пароль'));
    await user.type(screen.getByLabelText('Пароль'), 'correct-password');
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    await waitFor(() => expect(window.location.pathname).toBe('/'));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(authStore.getState().accessToken).toBe('test-token');
  });

  it('replaces the password when opened from a reset link', async () => {
    window.history.pushState({}, '', '/login?resetToken=reset-secret');
    const user = userEvent.setup();
    (globalThis as any).fetch = vi.fn((url: string) => Promise.resolve({
      ok: url === '/api/auth/reset-password',
      json: () => Promise.resolve({ data: {} }),
    })) as any;

    renderWithProviders(<LoginPage />);
    await user.type(await screen.findByLabelText('Новый пароль'), 'new-password');
    await user.type(screen.getByLabelText('Повторите пароль'), 'new-password');
    await user.click(screen.getByRole('button', { name: 'Сохранить новый пароль' }));

    await waitFor(() => expect((globalThis as any).fetch).toHaveBeenCalledWith(
      '/api/auth/reset-password',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ token: 'reset-secret', password: 'new-password' }),
      }),
    ));
    expect(await screen.findByText('Пароль изменён. Теперь можно войти.')).toBeDefined();
    window.history.pushState({}, '', '/login');
  });
});
