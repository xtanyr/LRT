import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import App from '../App';
import { AuthProvider } from '../contexts/AuthProvider';
import ToastProvider from '../components/ToastProvider';
import { authStore } from '../services/auth-store';
import { api } from '../services/api';

const session = {
  accessToken: 'new-leader-session',
  user: { id: 24, name: 'Анна Лебедева', email: 'anna@example.com', role: 'LEADER', coffeeShops: [], cities: [] },
};

function registrationResponse(status: number, body: unknown) {
  const fetch = vi.fn(async (url: string) => url === '/api/auth/register'
    ? { ok: status < 400, status, json: async () => body }
    : { ok: false, status: 401, json: async () => ({}) });
  vi.stubGlobal('fetch', fetch);
  return fetch;
}

function renderApp(path = '/register') {
  window.history.replaceState({}, '', path);
  return render(<BrowserRouter><AuthProvider><ToastProvider><App /></ToastProvider></AuthProvider></BrowserRouter>);
}

async function fillRegistration(passwordConfirmation = 'new-password') {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Имя и фамилия'), '  Анна Лебедева  ');
  await user.type(screen.getByLabelText('Электронная почта'), 'anna@example.com');
  await user.type(screen.getByLabelText('Пароль'), 'new-password');
  await user.type(screen.getByLabelText('Повторите пароль'), passwordConfirmation);
  return user;
}

describe('Registration', () => {
  beforeEach(() => {
    authStore.logout();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
    authStore.logout();
    vi.unstubAllGlobals();
    window.history.replaceState({}, '', '/login');
  });

  it('opens registration from login and starts a session without granting a coffee shop', async () => {
    const fetch = registrationResponse(201, { data: session });
    renderApp('/login');
    const user = userEvent.setup();
    await user.click(await screen.findByRole('link', { name: 'Зарегистрироваться' }));
    expect(window.location.pathname).toBe('/register');
    const formUser = await fillRegistration();
    await formUser.click(screen.getByRole('button', { name: 'Создать аккаунт' }));

    expect(await screen.findByText(/Нет доступных кофеен/)).toBeInTheDocument();
    expect(authStore.getState().user).toEqual(session.user);
    expect(authStore.getState().accessToken).toBe('new-leader-session');
    expect(window.location.pathname).toBe('/');
    expect(fetch).toHaveBeenCalledWith('/api/auth/register', expect.objectContaining({
      method: 'POST', credentials: 'include',
      body: JSON.stringify({ name: 'Анна Лебедева', email: 'anna@example.com', password: 'new-password' }),
    }));
    expect(api.post).not.toHaveBeenCalled();
  });

  it('does not send a request when passwords differ', async () => {
    const fetch = registrationResponse(201, { data: session });
    renderApp();
    const user = await fillRegistration('different-password');
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Пароли не совпадают');
    expect(fetch.mock.calls.some(([url]) => url === '/api/auth/register')).toBe(false);
    expect(authStore.getState().user).toBeNull();
  });

  it.each([
    [409, 'User with this email already exists', /уже зарегистрирован/],
    [403, 'Public registration is disabled', /Регистрация отключена/],
  ])('explains a rejected registration (%s) and keeps the form available', async (status, message, expected) => {
    registrationResponse(status, { message });
    renderApp();
    const user = await fillRegistration();
    await user.click(screen.getByRole('button', { name: 'Создать аккаунт' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(expected));
    expect(screen.getByRole('button', { name: 'Создать аккаунт' })).toBeEnabled();
    expect(authStore.getState().user).toBeNull();
    await user.click(screen.getByRole('link', { name: 'Войти' }));
    expect(await screen.findByRole('button', { name: 'Войти' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });
});
