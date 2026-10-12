import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import AdminConfigPage from '../pages/admin/AdminConfigPage';
import ToastProvider from '../components/ToastProvider';
import { api } from '../services/api';

describe('Rating color configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.get).mockImplementation(async url => ({ data: url === '/admin/rating-color-config' ? { id: 1, greenThreshold: 85, redThreshold: 55 } : [] }) as any);
  });
  afterEach(cleanup);

  it('keeps edits after a rejected save, explains server errors and lets the user retry', async () => {
    vi.mocked(api.patch).mockRejectedValueOnce({ response: { status: 400, data: { message: ['Проверьте цветовые пороги', 'Зелёный порог должен быть выше красного'] } } }).mockResolvedValueOnce({ data: {} } as any);
    render(<ToastProvider><AdminConfigPage /></ToastProvider>);
    const green = await screen.findByLabelText('Зелёная зона ≥');
    fireEvent.change(green, { target: { value: '95' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Проверьте цветовые пороги, Зелёный порог должен быть выше красного');
    expect(green).toHaveValue(95);
    expect(green).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    expect(await screen.findByText('Цветовые пороги сохранены.')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(api.patch).toHaveBeenLastCalledWith('/admin/rating-color-config', { id: 1, greenThreshold: 95, redThreshold: 55 });
  });

  it('prevents duplicate writes while pending and explains a connection failure', async () => {
    let rejectSave: (error: Error) => void = () => {};
    vi.mocked(api.patch).mockImplementation(() => new Promise((_, reject) => { rejectSave = reject; }));
    render(<ToastProvider><AdminConfigPage /></ToastProvider>);
    const green = await screen.findByLabelText('Зелёная зона ≥');
    fireEvent.change(green, { target: { value: '95' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить' }));
    const pending = screen.getByRole('button', { name: 'Сохраняем…' });
    expect(pending).toBeDisabled();
    expect(green).toBeDisabled();
    fireEvent.click(pending);
    expect(api.patch).toHaveBeenCalledOnce();
    await act(async () => rejectSave(new Error('Internal connection details')));
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось сохранить цветовые пороги');
    expect(screen.getByRole('alert')).not.toHaveTextContent('Internal connection details');
    expect(green).toHaveValue(95);
    expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled();
  });
});
