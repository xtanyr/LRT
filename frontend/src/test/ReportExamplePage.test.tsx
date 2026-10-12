import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '../services/api';
import ReportExamplePage from '../pages/leader/ReportExamplePage';

function renderExample() {
  return render(<MemoryRouter initialEntries={['/report-example?shop=7&period=2026-09']}><ReportExamplePage /></MemoryRouter>);
}

describe('Report example walkthrough', () => {
  beforeEach(() => vi.clearAllMocks());

  it('replaces the current step without accumulating previous rows', () => {
    renderExample();
    expect(screen.getByRole('heading', { level: 1, name: 'Пример заполнения отчёта' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Выберите кофейню и период' })).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Выручка и напитки' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'eNPS' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Следующий шаг' }));

    const revenue = screen.getByRole('region', { name: 'Выручка и напитки' });
    expect(revenue).toHaveTextContent('5 460 082');
    expect(revenue).toHaveTextContent('12 000');
    expect(screen.queryByRole('region', { name: 'Выберите кофейню и период' })).not.toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'eNPS' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '2');
  });

  it('lets the learner select any step directly and go back from the selected step', () => {
    renderExample();

    fireEvent.click(screen.getByRole('button', { name: 'Шаг примера' }));
    expect(screen.getAllByRole('option')).toHaveLength(19);
    fireEvent.click(screen.getByRole('option', { name: '19. Проверка и отправка' }));
    expect(screen.getByRole('region', { name: 'Проверка и отправка' })).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '19');
    expect(screen.getAllByRole('region')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Шаг примера' }));
    fireEvent.click(screen.getByRole('option', { name: '2. Выручка и напитки' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Выручка и напитки' })).toHaveFocus();

    fireEvent.click(screen.getByRole('button', { name: 'Назад' }));

    expect(screen.queryByRole('region', { name: 'Выручка и напитки' })).not.toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Выберите кофейню и период' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Назад' })).toBeDisabled();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '1');
  });

  it('shows example values and converts review hours to the actual form unit', () => {
    renderExample();
    for (let step = 0; step < 2; step++) fireEvent.click(screen.getByRole('button', { name: 'Следующий шаг' }));
    const team = screen.getByRole('region', { name: 'eNPS' });
    expect(team).toHaveTextContent('99');
    expect(team).toHaveTextContent('100');
    fireEvent.click(screen.getByRole('button', { name: 'Следующий шаг' }));
    const reviews = screen.getByRole('region', { name: 'Отзывы и скорость разбора' });
    expect(reviews).toHaveTextContent('1 сутки');
    expect(reviews).toHaveTextContent('24 часа');
    expect(within(reviews).getByText('4,7')).toBeInTheDocument();
  });

  it('finishes without writing a report and returns to the original shop and period', () => {
    renderExample();
    for (let step = 0; step < 30 && screen.queryByRole('button', { name: 'Следующий шаг' }); step++) {
      fireEvent.click(screen.getByRole('button', { name: 'Следующий шаг' }));
    }
    expect(screen.getByRole('region', { name: 'Проверка и отправка' })).toBeInTheDocument();
    expect(screen.getAllByRole('region')).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Следующий шаг' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Заполнить свой отчёт' })).toHaveAttribute('href', '/report?shop=7&period=2026-09');
    expect(screen.getByRole('link', { name: 'Вернуться к отчёту' })).toHaveAttribute('href', '/report?shop=7&period=2026-09');
    expect(api.post).not.toHaveBeenCalled();
    expect(api.patch).not.toHaveBeenCalled();
    expect(api.get).not.toHaveBeenCalled();
  });
});
