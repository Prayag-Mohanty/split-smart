import { useEffect, useRef, type ReactNode } from 'react';
import { Icon } from './Icon';

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}

/**
 * Accessible modal built on <dialog>: focus is trapped by the browser, Esc closes it,
 * and it becomes a bottom sheet on small screens (see .modal in styles.css).
 */
export function Modal({ open, title, onClose, children, footer, wide }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={`modal${wide ? ' modal-wide' : ''}`}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose(); // click on the backdrop
      }}
    >
      {open && (
        <div className="modal-body">
          <header className="modal-header">
            <h2 id="modal-title">{title}</h2>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </button>
          </header>
          <div className="modal-content">{children}</div>
          {footer && <footer className="modal-footer">{footer}</footer>}
        </div>
      )}
    </dialog>
  );
}
