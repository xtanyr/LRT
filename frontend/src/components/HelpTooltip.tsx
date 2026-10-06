import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import './HelpTooltip.css';

export default function HelpTooltip({ label, children, triggerText }: { label: string; children: ReactNode; triggerText?: string }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const clearCloseTimer = () => {
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };
  const show = () => { clearCloseTimer(); setOpen(true); };
  const close = () => { clearCloseTimer(); setOpen(false); };
  const contains = (target: EventTarget | null) => target instanceof Node &&
    (trigger.current?.contains(target) || popup.current?.contains(target));
  const leave = () => {
    if (!contains(document.activeElement)) {
      clearCloseTimer();
      closeTimer.current = window.setTimeout(close, 150);
    }
  };

  useEffect(() => () => clearCloseTimer(), []);
  useLayoutEffect(() => {
    if (!open || !trigger.current || !popup.current) return;
    const anchor = trigger.current.getBoundingClientRect();
    const size = popup.current.getBoundingClientRect();
    const below = anchor.bottom + 8;
    setPosition({
      left: Math.max(12, Math.min(anchor.left, window.innerWidth - size.width - 12)),
      top: Math.max(12, below + size.height <= window.innerHeight - 12 ? below : anchor.top - size.height - 8),
    });
  }, [open, label, children]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!contains(event.target)) close(); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') close(); };
    const scroll = (event: Event) => {
      if (!(event.target instanceof Node) || !popup.current?.contains(event.target)) close();
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    window.addEventListener('scroll', scroll, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
      window.removeEventListener('scroll', scroll, true);
      window.removeEventListener('resize', close);
    };
  }, [open]);

  return <span className="help-tooltip"
    onMouseEnter={show} onMouseLeave={leave} onFocus={show}
    onBlur={event => { if (!contains(event.relatedTarget)) close(); }}>
    <button ref={trigger} type="button" className={'help-tooltip-trigger' + (triggerText ? ' help-tooltip-text-trigger' : '')}
      aria-label={'Подсказка: ' + label} aria-describedby={open ? id : undefined}
      aria-expanded={open} onClick={show}>{triggerText ? <><span>{triggerText}</span><span className="help-tooltip-icon" aria-hidden="true">?</span></> : '?'}</button>
    {open && createPortal(<div ref={popup} id={id} role="tooltip" className="help-tooltip-popup"
      style={position} onMouseEnter={show} onMouseLeave={leave}>
      <strong>{label}</strong><div>{children}</div>
    </div>, document.body)}
  </span>;
}
