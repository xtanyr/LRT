import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminUsersPage from '../pages/admin/AdminUsersPage';
import { api } from '../services/api';

const cities = [{ id: 1, name: 'Москва' }, { id: 2, name: 'Омск' }];
const shops = [
  { id: 11, name: 'Кофейня A', cityId: 1, city: { name: 'Москва' } },
  { id: 22, name: 'Кофейня B', cityId: 2, city: { name: 'Омск' } },
];
const user = {
  id: 7,
  name: 'Лидер',
  email: 'leader@example.com',
  role: 'LEADER',
  approvedAt: '2026-01-01T00:00:00.000Z',
  cityAssignments: [],
  coffeeShopAssignments: [{ coffeeShop: shops[0], assignedFrom: '2026-01-01T00:00:00.000Z', assignedUntil: null }],
};

describe('AdminUsersPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation(async (url) => ({
      data: url === '/admin/users' ? [user] : url === '/cities' ? cities : shops,
    }) as any);
    vi.mocked(api.patch).mockResolvedValue({ data: user } as any);
  });

  it('selects a city first and then shows only its coffee shops', async () => {
    render(<AdminUsersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Настроить' }));

    expect(screen.getByRole('button', { name: 'Город кофейни' })).toHaveTextContent('Москва');
    expect(screen.getByRole('button', { name: 'Кофейня' })).toHaveTextContent('Кофейня A');
    expect(screen.getByLabelText('Дата снятия с кофейни')).toHaveValue('');

    fireEvent.click(screen.getByRole('button', { name: 'Город кофейни' }));
    fireEvent.click(screen.getByRole('option', { name: 'Омск' }));
    expect(screen.getByRole('button', { name: 'Кофейня' })).toHaveTextContent('Выберите кофейню');

    fireEvent.click(screen.getByRole('button', { name: 'Кофейня' }));
    const shopList = screen.getByRole('listbox', { name: 'Кофейня' });
    expect(within(shopList).queryByRole('option', { name: 'Кофейня A' })).not.toBeInTheDocument();
    fireEvent.click(within(shopList).getByRole('option', { name: 'Кофейня B' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/users/7', expect.objectContaining({
      role: 'LEADER', cityIds: [], coffeeShopIds: [22],
    })));
  });

  it('shows a recoverable load error instead of claiming there are no users', async () => {
    vi.mocked(api.get).mockRejectedValue(new Error('offline'));
    render(<AdminUsersPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить пользователей');
    expect(screen.queryByText('Нет пользователей')).not.toBeInTheDocument();
    vi.mocked(api.get).mockImplementation(async (url) => ({ data: url === '/admin/users' ? [user] : url === '/cities' ? cities : shops }) as any);
    fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
    expect(await screen.findByRole('button', { name: 'Настроить' })).toBeInTheDocument();
  });

  it('prevents an assignment ending before it starts without sending a request', async () => {
    render(<AdminUsersPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Настроить' }));
    fireEvent.change(screen.getByLabelText('Дата снятия с кофейни'), { target: { value: '2025-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Дата снятия не может быть раньше даты назначения');
    expect(api.patch).not.toHaveBeenCalled();
  });
});
