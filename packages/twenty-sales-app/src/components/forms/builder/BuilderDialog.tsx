import { type ReactNode, useEffect, useId, useRef } from 'react';

import { TSV } from '../../../lib/forms/surveyStrings';

type BuilderDialogProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
};

// Modal used by the builder screens: centred on desktop, a bottom sheet on
// phones. Escape and the backdrop close it; focus moves in on open and goes
// back to whatever opened it on close.
export const BuilderDialog = ({ title, onClose, children, footer, wide = false }: BuilderDialogProps) => {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  onCloseRef.current = onClose;

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const firstField = panel?.querySelector<HTMLElement>(
      'input:not([disabled]), textarea:not([disabled]), select:not([disabled])',
    );

    (firstField ?? panel)?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
      }
    };

    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, []);

  return (
    <div className="svb-dialog-backdrop" onClick={onClose}>
      <div
        ref={panelRef}
        className={`svb-dialog${wide ? ' wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="svb-dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="btn line sm" onClick={onClose}>
            {TSV.close}
          </button>
        </div>
        <div className="svb-dialog-body">{children}</div>
        {footer !== undefined && <div className="svb-dialog-foot">{footer}</div>}
      </div>
    </div>
  );
};

type ConfirmDialogProps = {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export const ConfirmDialog = ({
  title,
  body,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => (
  <BuilderDialog
    title={title}
    onClose={onCancel}
    footer={
      <>
        <button type="button" className="btn line" onClick={onCancel}>
          {TSV.cancel}
        </button>
        <button
          type="button"
          className={`btn${danger ? ' danger' : ''}`}
          onClick={onConfirm}
          disabled={busy}
        >
          {confirmLabel}
        </button>
      </>
    }
  >
    {body}
  </BuilderDialog>
);
