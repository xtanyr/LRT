import { useEffect, useId, useRef, useState } from 'react';
import './SelectControl.css';

export type SelectOption = { value: string | number; label: string; disabled?: boolean };

export function SelectControl({ value, options, onChange, label, disabled = false, className = '' }: { value: string | number; options: SelectOption[]; onChange: (value: string) => void; label: string; disabled?: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const [opensUp, setOpensUp] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const selected = options.find(option => String(option.value) === String(value));
  useEffect(() => { const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, []);
  const choose = (option: SelectOption) => { if (!option.disabled) { onChange(String(option.value)); setOpen(false); trigger.current?.focus(); } };
  const toggle = () => { if (!open) { const rect = root.current?.getBoundingClientRect(); const menuHeight = Math.min(options.length * 37 + 10, 260); setOpensUp(!!rect && window.innerHeight - rect.bottom < menuHeight && rect.top > window.innerHeight - rect.bottom); } setOpen(v => !v); };
  useEffect(() => {
    if (open) {
      const selectedOption = root.current?.querySelector<HTMLButtonElement>('[role="option"][aria-selected="true"]:not(:disabled)');
      (selectedOption || root.current?.querySelector<HTMLButtonElement>('[role="option"]:not(:disabled)'))?.focus();
    }
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  return <div className={'select-control '+className+(opensUp?' opens-up':'')} ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => {
    if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); }
    if (open && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const choices = Array.from(root.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') || []);
      const index = choices.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? choices.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + choices.length) % choices.length;
      choices[next]?.focus();
    }
  }}><button ref={trigger} type="button" className="select-control-trigger" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? menuId : undefined} disabled={disabled} onClick={toggle} onKeyDown={event => { if (['ArrowDown', 'ArrowUp'].includes(event.key) && !open) { event.preventDefault(); toggle(); } }}><span>{selected?.label ?? 'Выберите значение'}</span><span aria-hidden="true">⌄</span></button>{open && <div id={menuId} className="select-control-menu" role="listbox" aria-label={label}>{options.map(option => <button type="button" role="option" tabIndex={-1} aria-selected={String(option.value) === String(value)} disabled={option.disabled} key={String(option.value)} onClick={() => choose(option)}>{option.label}</button>)}</div>}</div>;
}

const monthName = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
export function MonthPicker({ value, onChange, label, disabled = false }: { value: string; onChange: (value: string) => void; label: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [opensUp, setOpensUp] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = new Date(value + '-01T00:00:00');
  const [cursor, setCursor] = useState(new Date(current.getFullYear(), current.getMonth(), 1));
  useEffect(() => { const close = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); }; document.addEventListener('mousedown', close); return () => document.removeEventListener('mousedown', close); }, []);
  const choose = (month: number) => { onChange(cursor.getFullYear() + '-' + String(month + 1).padStart(2, '0')); setOpen(false); trigger.current?.focus(); };
  useEffect(() => { if (open) (root.current?.querySelector<HTMLButtonElement>('.month-picker-grid .active') || root.current?.querySelector<HTMLButtonElement>('.month-picker-grid button'))?.focus(); }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  return <div className={'month-picker'+(opensUp?' opens-up':'')} ref={root} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }} onKeyDown={event => { if (event.key === 'Escape' && open) { event.preventDefault(); event.stopPropagation(); setOpen(false); trigger.current?.focus(); } }}><button ref={trigger} type="button" className="select-control-trigger month-picker-trigger" aria-label={label} aria-haspopup="dialog" aria-expanded={open} disabled={disabled} onClick={() => { const rect = root.current?.getBoundingClientRect(); setOpensUp(!!rect && window.innerHeight - rect.bottom < 230 && rect.top > window.innerHeight - rect.bottom); setCursor(new Date(current.getFullYear(), current.getMonth(), 1)); setOpen(v => !v); }}><span>◷ {monthName.format(current)}</span><span aria-hidden="true">⌄</span></button>{open && <div className="month-picker-menu" role="dialog" aria-label={label}><div className="month-picker-header"><button type="button" aria-label="Предыдущий год" onClick={() => setCursor(new Date(cursor.getFullYear() - 1, 0, 1))}>‹</button><strong>{cursor.getFullYear()}</strong><button type="button" aria-label="Следующий год" onClick={() => setCursor(new Date(cursor.getFullYear() + 1, 0, 1))}>›</button></div><div className="month-picker-grid">{Array.from({ length: 12 }, (_, month) => <button type="button" className={cursor.getFullYear() === current.getFullYear() && month === current.getMonth() ? 'active' : ''} aria-pressed={cursor.getFullYear() === current.getFullYear() && month === current.getMonth()} key={month} onClick={() => choose(month)}>{new Intl.DateTimeFormat('ru-RU', { month: 'short' }).format(new Date(2026, month, 1)).replace('.', '')}</button>)}</div></div>}</div>;
}
