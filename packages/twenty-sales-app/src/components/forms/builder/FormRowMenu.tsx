import { useEffect, useId, useRef, useState } from 'react';

import { TB } from '../../../lib/forms/builderStrings';

export type RowAction = { key: string; label: string; onSelect: () => void; danger?: boolean };

type FormRowMenuProps = {
  formName: string;
  actions: RowAction[];
};

// "More" menu of a form row: a button that opens a list of actions. Closes
// on Escape, on an outside click and after an action runs.
export const FormRowMenu = ({ formName, actions }: FormRowMenuProps) => {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;

    wrapRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();

    const onPointer = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const moveFocus = (delta: number) => {
    const items = [...(wrapRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [])];
    const index = items.indexOf(document.activeElement as HTMLButtonElement);

    items[(index + delta + items.length) % items.length]?.focus();
  };

  return (
    <div className="svb-menu-wrap" ref={wrapRef}>
      <button
        ref={buttonRef}
        type="button"
        className="btn line sm svb-menu-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={TB.moreActions(formName)}
        onClick={() => setOpen((current) => !current)}
      >
        <span aria-hidden="true">⋯</span>
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          className="svb-menu"
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              moveFocus(1);
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              moveFocus(-1);
            }
          }}
        >
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              role="menuitem"
              className={action.danger ? 'danger' : ''}
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
