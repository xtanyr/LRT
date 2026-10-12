import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminStructurePage from '../pages/admin/AdminStructurePage';
import ToastProvider from '../components/ToastProvider';
import { api } from '../services/api';

describe('AdminStructurePage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads inactive shops and can activate them again', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [{ id: 1, name: 'Омск', isActive: true, coffeeShops: [{ id: 9, name: 'Закрытая', isActive: false }] }] } as any);
    vi.mocked(api.patch).mockResolvedValue({ data: { id: 9, isActive: true } } as any);

    render(<ToastProvider><AdminStructurePage /></ToastProvider>);
    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/cities?includeInactiveShops=true'));
    fireEvent.click(await screen.findByText('Омск'));
    expect(await screen.findByText('деактивирована')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Активировать' }));

    await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/coffee-shops/9', { isActive: true }));
    expect(await screen.findByText('активна')).toBeInTheDocument();
  });

  it('opens the new coffee shop form even when the city is collapsed', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: [{ id: 1, name: 'Омск', isActive: true, coffeeShops: [] }] } as any);
    vi.mocked(api.post).mockResolvedValue({ data: { id: 10, name: 'На Ленина', isActive: true } } as any);
    render(<ToastProvider><AdminStructurePage /></ToastProvider>);
    fireEvent.click(await screen.findByRole('button', { name: '+ Кофейня' }));
    const input = screen.getByRole('textbox', { name: 'Название кофейни' });
    expect(input).toHaveFocus();
    fireEvent.change(input, { target: { value: '  На Ленина  ' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/coffee-shops', { name: 'На Ленина', cityId: 1 }));
    expect(await screen.findByRole('cell', { name: 'На Ленина' })).toBeInTheDocument();
  });

  it('distinguishes a loading failure from an empty directory and allows retry', async () => {
    vi.mocked(api.get).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ data: [] } as any);
    render(<ToastProvider><AdminStructurePage /></ToastProvider>);
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить структуру сети');
    expect(screen.queryByText(/Пока нет городов/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }));
    expect(await screen.findByText(/Пока нет городов/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
