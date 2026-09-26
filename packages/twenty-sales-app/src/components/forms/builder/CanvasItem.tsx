import { type FormItem } from '@shared/surveys';
import { type DragEvent } from 'react';

import { TB, formatCount } from '../../../lib/forms/builderStrings';
import { glyphFor } from '../../../lib/forms/builder/palette';
import { QUESTION_TYPE_LABELS } from '../../../lib/forms/surveyStrings';
import { IconChevronDown, IconTrash } from '../../icons';
import { DRAG_MIME, type DragPayload } from './BuilderPalette';

type CanvasItemProps = {
  item: FormItem;
  text: string;
  number: number | undefined;
  selected: boolean;
  readOnly: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  pages: { id: string; label: string }[];
  currentPageId: string;
  dropBefore: boolean;
  dropAfter: boolean;
  onSelect: () => void;
  onMove: (delta: -1 | 1) => void;
  onMoveToPage: (pageId: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onDragOverItem: (event: DragEvent<HTMLDivElement>) => void;
  onDropOnItem: (event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
};

const kindLabel = (item: FormItem): string =>
  item.kind === 'question' ? QUESTION_TYPE_LABELS[item.type] : TB.blockLabels[item.kind];

const hasLogic = (item: FormItem): boolean =>
  (item.kind === 'question' && (item.visibleWhen !== undefined || item.requiredWhen !== undefined)) ||
  (item.kind === 'section' && item.visibleWhen !== undefined);

const isStaffOnly = (item: FormItem): boolean =>
  (item.kind === 'question' && item.audience === 'STAFF_ONLY') ||
  ((item.kind === 'heading' || item.kind === 'paragraph' || item.kind === 'image' || item.kind === 'divider') &&
    item.audience === 'STAFF_ONLY');

export const CanvasItem = ({
  item,
  text,
  number,
  selected,
  readOnly,
  canMoveUp,
  canMoveDown,
  pages,
  currentPageId,
  dropBefore,
  dropAfter,
  onSelect,
  onMove,
  onMoveToPage,
  onDuplicate,
  onDelete,
  onDragOverItem,
  onDropOnItem,
  onDragEnd,
}: CanvasItemProps) => {
  const name = text !== '' ? text : kindLabel(item);
  const isQuestion = item.kind === 'question';

  return (
    <div
      className={[
        'svb-item',
        `kind-${item.kind}`,
        selected ? 'selected' : '',
        dropBefore ? 'drop-before' : '',
        dropAfter ? 'drop-after' : '',
      ].join(' ')}
      draggable={!readOnly}
      onDragStart={(event) => {
        const payload: DragPayload = { source: 'item', id: item.id };

        event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
        event.dataTransfer.effectAllowed = 'move';
      }}
      onDragOver={onDragOverItem}
      onDrop={onDropOnItem}
      onDragEnd={onDragEnd}
    >
      {!readOnly && (
        <span className="svb-grip" aria-hidden="true" title={TB.dragHandle(name)}>
          ⋮⋮
        </span>
      )}
      <button
        type="button"
        className="svb-item-main"
        aria-pressed={selected}
        aria-label={TB.selectItem(name)}
        onClick={onSelect}
      >
        <span className="svb-glyph" aria-hidden="true">
          {glyphFor(item)}
        </span>
        <span className="svb-item-body">
          <span className="svb-item-title" dir="auto">
            {number !== undefined && <span className="svb-item-num">{formatCount(number)}.</span>}
            {text !== '' ? text : <span className="svb-muted">{isQuestion ? TB.noLabel : kindLabel(item)}</span>}
            {isQuestion && item.required && (
              <span className="svb-req" title={TB.requiredMark} aria-label={TB.requiredMark}>
                *
              </span>
            )}
          </span>
          <span className="svb-item-meta">
            <span>{kindLabel(item)}</span>
            {isStaffOnly(item) && <span className="svb-badge staff">{TB.staffBadge}</span>}
            {hasLogic(item) && (
              <span className="svb-badge logic" title={TB.logicBadgeTitle}>
                {TB.logicBadge}
              </span>
            )}
          </span>
        </span>
      </button>
      {!readOnly && (
        <div className="svb-item-tools">
          <button
            type="button"
            className="svb-tool"
            aria-label={TB.moveUp(name)}
            title={TB.moveUp(name)}
            disabled={!canMoveUp}
            onClick={() => onMove(-1)}
          >
            <span className="svb-rot180" aria-hidden="true">
              <IconChevronDown size={15} />
            </span>
          </button>
          <button
            type="button"
            className="svb-tool"
            aria-label={TB.moveDown(name)}
            title={TB.moveDown(name)}
            disabled={!canMoveDown}
            onClick={() => onMove(1)}
          >
            <IconChevronDown size={15} />
          </button>
          {pages.length > 1 && (
            <select
              className="svb-tool-select"
              aria-label={TB.moveToPageLabel(name)}
              value=""
              onChange={(event) => {
                if (event.target.value !== '') onMoveToPage(event.target.value);
              }}
            >
              <option value="">{TB.moveToPage}</option>
              {pages
                .filter((page) => page.id !== currentPageId)
                .map((page) => (
                  <option key={page.id} value={page.id}>
                    {page.label}
                  </option>
                ))}
            </select>
          )}
          <button
            type="button"
            className="svb-tool"
            aria-label={TB.duplicateItem(name)}
            title={TB.duplicateItem(name)}
            onClick={onDuplicate}
          >
            <span aria-hidden="true">⧉</span>
          </button>
          <button
            type="button"
            className="svb-tool danger"
            aria-label={TB.deleteItem(name)}
            title={TB.deleteItem(name)}
            onClick={onDelete}
          >
            <IconTrash size={15} />
          </button>
        </div>
      )}
    </div>
  );
};
