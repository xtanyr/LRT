import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Modal from '../components/Modal';
import { MonthPicker, SelectControl } from '../components/SelectControl';

afterEach(cleanup);

describe('Shared form controls', () => {
  it('selects options with arrows and Enter, skips disabled options and restores focus', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<SelectControl label="Город" value="1" options={[{ value: '1', label: 'Омск' }, { value: '2', label: 'Недоступен', disabled: true }, { value: '3', label: 'Москва' }]} onChange={onChange} />);
    screen.getByRole('button', { name: 'Город' }).focus();
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenCalledWith('3');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Город' })).toHaveFocus();
  });

  it('closes an open select with Escape without closing its parent dialog', async () => {
    const close = vi.fn();
    const user = userEvent.setup();
    render(<Modal open title="Назначение" onClose={close}><SelectControl label="Город" value="1" options={[{ value: '1', label: 'Омск' }]} onChange={vi.fn()} /></Modal>);
    await user.click(screen.getByRole('button', { name: 'Город' }));
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Назначение' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(close).toHaveBeenCalledOnce();
  });

  it('contains focus in dialogs and restores the triggering control after closing', async () => {
    const user = userEvent.setup();
    function Example() {
      const [open, setOpen] = useState(false);
      return <><button onClick={() => setOpen(true)}>Настроить</button><Modal open={open} title="Пользователь" onClose={() => setOpen(false)}><input aria-label="Имя" /><button>Сохранить</button></Modal></>;
    }
    render(<Example />);
    await user.click(screen.getByRole('button', { name: 'Настроить' }));
    expect(screen.getByRole('textbox', { name: 'Имя' })).toHaveFocus();
    screen.getByRole('button', { name: 'Сохранить' }).focus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Закрыть окно' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Настроить' })).toHaveFocus();
  });

  it('opens the month selector upwards near the viewport bottom and supports Escape', async () => {
    const user = userEvent.setup();
    render(<MonthPicker label="Период" value="2026-09" onChange={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Период' });
    vi.spyOn(trigger.parentElement!, 'getBoundingClientRect').mockReturnValue({ top: 700, bottom: 740 } as DOMRect);
    fireEvent.click(trigger);
    expect(trigger.parentElement).toHaveClass('opens-up');
    expect(screen.getByRole('button', { pressed: true })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});
