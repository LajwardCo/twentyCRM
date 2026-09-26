import { type FormDefinition, pickLocalizedText } from '@shared/surveys';
import { type DragEvent, useState } from 'react';

import { TB, formatCount } from '../../../lib/forms/builderStrings';
import { canMoveItem } from '../../../lib/forms/builder/definitionOps';
import { itemText } from '../../../lib/forms/builder/palette';
import { IconChevronDown, IconPlus, IconTrash } from '../../icons';
import { DRAG_MIME, type DragPayload } from './BuilderPalette';
import { type BuilderSelection } from './builderTypes';
import { CanvasItem } from './CanvasItem';

type DropTarget = { pageId: string; index: number };

type BuilderCanvasProps = {
  definition: FormDefinition;
  numbering: Record<string, number>;
  readOnly: boolean;
  selection: BuilderSelection;
  onSelect: (selection: BuilderSelection) => void;
  onMoveItem: (itemId: string, delta: -1 | 1) => void;
  onMoveItemToPage: (itemId: string, pageId: string) => void;
  onDuplicateItem: (itemId: string) => void;
  onDeleteItem: (itemId: string) => void;
  onDrop: (payload: DragPayload, target: DropTarget) => void;
  onAddPage: (afterPageId: string) => void;
  onDuplicatePage: (pageId: string) => void;
  onDeletePage: (pageId: string) => void;
  onMovePage: (pageId: string, delta: -1 | 1) => void;
};

const readPayload = (event: DragEvent): DragPayload | null => {
  try {
    const raw = event.dataTransfer.getData(DRAG_MIME);

    return raw === '' ? null : (JSON.parse(raw) as DragPayload);
  } catch {
    return null;
  }
};

const carriesPayload = (event: DragEvent) => event.dataTransfer.types.includes(DRAG_MIME);

export const BuilderCanvas = ({
  definition,
  numbering,
  readOnly,
  selection,
  onSelect,
  onMoveItem,
  onMoveItemToPage,
  onDuplicateItem,
  onDeleteItem,
  onDrop,
  onAddPage,
  onDuplicatePage,
  onDeletePage,
  onMovePage,
}: BuilderCanvasProps) => {
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null);
  const language = definition.languages[0] ?? 'fa';
  const pageOptions = definition.pages.map((page, index) => {
    const title = pickLocalizedText(page.title, language, definition.languages);

    return { id: page.id, label: title === '' ? TB.pageN(index + 1) : `${TB.pageN(index + 1)} — ${title}` };
  });

  const acceptDrop = (event: DragEvent, target: DropTarget) => {
    if (readOnly || !carriesPayload(event)) return;
    event.preventDefault();
    if (dropTarget?.pageId !== target.pageId || dropTarget.index !== target.index) {
      setDropTarget(target);
    }
  };

  const finishDrop = (event: DragEvent, target: DropTarget) => {
    if (readOnly) return;
    event.preventDefault();
    event.stopPropagation();
    setDropTarget(null);

    const payload = readPayload(event);

    if (payload !== null) onDrop(payload, target);
  };

  return (
    <div className="svb-canvas" onDragEnd={() => setDropTarget(null)}>
      {definition.pages.map((page, pageIndex) => {
        const pageSelected = selection?.kind === 'page' && selection.id === page.id;
        const title = pickLocalizedText(page.title, language, definition.languages);
        const endTarget = { pageId: page.id, index: page.items.length };

        return (
          <section
            key={page.id}
            className={`svb-page card${pageSelected ? ' selected' : ''}`}
            aria-label={TB.pageN(pageIndex + 1)}
          >
            <header className="svb-page-head">
              <button
                type="button"
                className="svb-page-title"
                aria-pressed={pageSelected}
                aria-label={TB.pageSettings(pageIndex + 1)}
                onClick={() => onSelect({ kind: 'page', id: page.id })}
              >
                <span className="svb-page-num">{TB.pageN(pageIndex + 1)}</span>
                <span dir="auto" className={title === '' ? 'svb-muted' : ''}>
                  {title === '' ? TB.pageTitlePlaceholder : title}
                </span>
                {page.jumps.length > 0 && <span className="svb-badge logic">{TB.jumpsN(page.jumps.length)}</span>}
              </button>
              {!readOnly && (
                <div className="svb-item-tools">
                  <button
                    type="button"
                    className="svb-tool"
                    aria-label={TB.movePageUp(pageIndex + 1)}
                    title={TB.movePageUp(pageIndex + 1)}
                    disabled={pageIndex === 0}
                    onClick={() => onMovePage(page.id, -1)}
                  >
                    <span className="svb-rot180" aria-hidden="true">
                      <IconChevronDown size={15} />
                    </span>
                  </button>
                  <button
                    type="button"
                    className="svb-tool"
                    aria-label={TB.movePageDown(pageIndex + 1)}
                    title={TB.movePageDown(pageIndex + 1)}
                    disabled={pageIndex === definition.pages.length - 1}
                    onClick={() => onMovePage(page.id, 1)}
                  >
                    <IconChevronDown size={15} />
                  </button>
                  <button
                    type="button"
                    className="svb-tool"
                    aria-label={`${TB.duplicatePage} ${formatCount(pageIndex + 1)}`}
                    title={TB.duplicatePage}
                    onClick={() => onDuplicatePage(page.id)}
                  >
                    <span aria-hidden="true">⧉</span>
                  </button>
                  <button
                    type="button"
                    className="svb-tool danger"
                    aria-label={`${TB.deletePage} ${formatCount(pageIndex + 1)}`}
                    title={TB.deletePage}
                    disabled={definition.pages.length <= 1}
                    onClick={() => onDeletePage(page.id)}
                  >
                    <IconTrash size={15} />
                  </button>
                </div>
              )}
            </header>
            <div
              className={`svb-page-items${dropTarget?.pageId === page.id && dropTarget.index === page.items.length ? ' drop-end' : ''}`}
              onDragOver={(event) => acceptDrop(event, endTarget)}
              onDrop={(event) => finishDrop(event, endTarget)}
            >
              {page.items.length === 0 && <p className="svb-empty-page">{TB.emptyPage}</p>}
              {page.items.map((item, itemIndex) => {
                const targetFor = (event: DragEvent<HTMLDivElement>): DropTarget => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  const after = event.clientY > rect.top + rect.height / 2;

                  return { pageId: page.id, index: after ? itemIndex + 1 : itemIndex };
                };

                return (
                  <CanvasItem
                    key={item.id}
                    item={item}
                    text={itemText(item, definition)}
                    number={numbering[item.id]}
                    selected={selection?.kind === 'item' && selection.id === item.id}
                    readOnly={readOnly}
                    canMoveUp={canMoveItem(definition, item.id, -1)}
                    canMoveDown={canMoveItem(definition, item.id, 1)}
                    pages={pageOptions}
                    currentPageId={page.id}
                    dropBefore={dropTarget?.pageId === page.id && dropTarget.index === itemIndex}
                    dropAfter={
                      dropTarget?.pageId === page.id &&
                      dropTarget.index === itemIndex + 1 &&
                      itemIndex === page.items.length - 1
                    }
                    onSelect={() => onSelect({ kind: 'item', id: item.id })}
                    onMove={(delta) => onMoveItem(item.id, delta)}
                    onMoveToPage={(pageId) => onMoveItemToPage(item.id, pageId)}
                    onDuplicate={() => onDuplicateItem(item.id)}
                    onDelete={() => onDeleteItem(item.id)}
                    onDragOverItem={(event) => {
                      event.stopPropagation();
                      acceptDrop(event, targetFor(event));
                    }}
                    onDropOnItem={(event) => finishDrop(event, targetFor(event))}
                    onDragEnd={() => setDropTarget(null)}
                  />
                );
              })}
            </div>
            {!readOnly && (
              <button type="button" className="btn line sm svb-add-page" onClick={() => onAddPage(page.id)}>
                <IconPlus size={14} />
                {TB.addPage}
              </button>
            )}
          </section>
        );
      })}
    </div>
  );
};
