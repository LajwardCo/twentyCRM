import { useEffect, useRef, useState } from 'react';

import { TSR } from '../../../lib/forms/responseStrings';
import { type QuestionColumn } from '../../../lib/forms/responses/responseExport';
import { IconTable } from '../../icons';

type ResponseColumnPickerProps = {
  columns: QuestionColumn[];
  chosen: string[];
  onChange: (questionIds: string[]) => void;
};

export const ResponseColumnPicker = ({ columns, chosen, onChange }: ResponseColumnPickerProps) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!wrapperRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (questionId: string) =>
    onChange(
      chosen.includes(questionId)
        ? chosen.filter((id) => id !== questionId)
        : // Keep the form's question order regardless of click order.
          columns.map((column) => column.questionId).filter((id) => id === questionId || chosen.includes(id)),
    );

  return (
    <div className="svr-columns" ref={wrapperRef}>
      <button type="button" className="btn line sm" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <IconTable size={14} />
        {TSR.columns}
      </button>
      {open && (
        <div className="svr-columns-pop" role="group" aria-label={TSR.columns}>
          <div className="svr-columns-hint">{TSR.columnsHint}</div>
          {columns.map((column) => (
            <label key={column.key} className="svr-columns-option">
              <input
                type="checkbox"
                checked={chosen.includes(column.questionId)}
                onChange={() => toggle(column.questionId)}
              />
              <span dir="auto">{column.header}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
};
