import { ReactNode, useEffect, useId, useRef } from 'react';
import './../styles/modal.css';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export default function Modal({ open, title, onClose, children }: ModalProps) {
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const titleId = useId();
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const focusable = () => Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]') || []).filter(element => !element.closest('fieldset:disabled') && !element.hidden).sort((a, b) => a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1);
    const initial = dialog.current?.querySelector<HTMLElement>('.modal-body input:not(:disabled), .modal-body textarea:not(:disabled), .modal-body button:not(:disabled)');
    (initial || dialog.current)?.focus();
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) {
        e.preventDefault();
        close.current();
      }
      if (e.key === 'Tab') {
        const elements = focusable();
        const first = elements[0], last = elements[elements.length - 1];
        if (!first) { e.preventDefault(); dialog.current?.focus(); }
        else if (e.shiftKey && (document.activeElement === first || !dialog.current?.contains(document.activeElement))) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && (document.activeElement === last || !dialog.current?.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
      }
    };
    const containFocus = (e: FocusEvent) => { if (e.target instanceof Node && !dialog.current?.contains(e.target)) (focusable()[0] || dialog.current)?.focus(); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('focusin', containFocus);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', containFocus);
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" ref={dialog} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title" id={titleId}>{title}</h2>
          <button type="button" className="modal-close" aria-label="Закрыть окно" onClick={onClose}>×</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}
