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

describe('AdminUsersPage Leader-Senpai', () => {
  const senpai = {
    id: 8,
    name: 'Семпай',
    email: 'senpai@example.com',
    role: 'SENPAI',
    approvedAt: null,
    cityAssignments: [],
    coffeeShopAssignments: [],
    supervisions: [{ leaderId: 7 }],
  };
  const otherSenpai = { ...senpai, id: 9, name: 'Другой семпай', email: 'other@example.com', supervisions: [] };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation(async (url) => ({
      data: url === '/admin/users' ? [user, senpai, otherSenpai] : url === '/cities' ? cities : shops,
    }) as any);
    vi.mocked(api.patch).mockResolvedValue({ data: senpai } as any);
  });

  it('shows the supervised leaders picker only for SENPAI, listing only LEADER users', async () => {
    render(<AdminUsersPage />);
    const buttons = await screen.findAllByRole('button', { name: 'Настроить' });

    fireEvent.click(buttons[1]);
    const group = screen.getByRole('group', { name: 'Подчинённые лидеры' });
    expect(within(group).getAllByRole('checkbox')).toHaveLength(1);
    expect(within(group).getByRole('checkbox', { name: 'Лидер' })).toBeChecked();
    expect(within(group).queryByRole('checkbox', { name: 'Семпай' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));

    fireEvent.click(buttons[0]);
    expect(screen.queryByRole('group', { name: 'Подчинённые лидеры' })).not.toBeInTheDocument();
  });

  it('sends the selected leaderIds when saving a SENPAI', async () => {
    render(<AdminUsersPage />);
    const buttons = await screen.findAllByRole('button', { name: 'Настроить' });
    fireEvent.click(buttons[2]);

    fireEvent.click(within(screen.getByRole('group', { name: 'Подчинённые лидеры' })).getByRole('checkbox', { name: 'Лидер' }));
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/users/9', expect.objectContaining({
      role: 'SENPAI', leaderIds: [7], coffeeShopIds: [], cityIds: [],
    })));
  });

  it('sends an empty leaderIds list for an ordinary leader', async () => {
    render(<AdminUsersPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: 'Настроить' }))[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/users/7', expect.objectContaining({
      role: 'LEADER', leaderIds: [],
    })));
  });

  it('shows the number of supervised leaders in the table', async () => {
    render(<AdminUsersPage />);
    expect(await screen.findByText('Подчинённых лидеров: 1')).toBeInTheDocument();
    expect(screen.getByText('Подчинённых лидеров: 0')).toBeInTheDocument();
  });
});
