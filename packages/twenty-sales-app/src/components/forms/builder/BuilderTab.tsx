import { type FormDefinition, pickLocalizedText } from '@shared/surveys';
import { type ReactNode, useState } from 'react';

import { TB } from '../../../lib/forms/builderStrings';
import {
  addPage,
  duplicateItem,
  duplicatePage,
  insertItem,
  locateItem,
  moveItemBy,
  moveItemTo,
  movePage,
  removeItem,
  removePage,
} from '../../../lib/forms/builder/definitionOps';
import { createPaletteItem, findPaletteEntry, itemText, type PaletteEntry } from '../../../lib/forms/builder/palette';
import {
  type RuleReference,
  findPageReferences,
  findQuestionReferences,
} from '../../../lib/forms/builder/references';
import { IconPlus } from '../../icons';
import { BuilderCanvas } from './BuilderCanvas';
import { ConfirmDialog, BuilderDialog } from './BuilderDialog';
import { BuilderPalette, type DragPayload } from './BuilderPalette';
import { type BuilderSelection, type EditorProps } from './builderTypes';
import { ItemInspector } from './ItemInspector';
import { BUILDER_MOBILE_QUERY, useMediaQuery } from './useMediaQuery';

type BuilderTabProps = EditorProps & {
  selection: BuilderSelection;
  onSelect: (selection: BuilderSelection) => void;
  numbering: Record<string, number>;
  onOpenLogic: () => void;
};

type PendingDelete =
  | { kind: 'item'; id: string; references: RuleReference[] }
  | { kind: 'page'; id: string; itemCount: number; incoming: number; references: RuleReference[] };

export const describeReference = (reference: RuleReference, definition: FormDefinition): string => {
  const kind = TB.referenceKind[reference.kind];
  const language = definition.languages[0] ?? 'fa';

  if (reference.itemId !== undefined) {
    const location = locateItem(definition, reference.itemId);

    return TB.referenceOf(kind, location === null ? reference.itemId : itemText(location.item, definition) || TB.noLabel);
  }

  if (reference.pageIndex !== undefined) return TB.referenceOf(kind, TB.pageN(reference.pageIndex + 1));

  if (reference.kind === 'ending') {
    const index = definition.endings.findIndex((ending) => ending.id === reference.ruleId);
    const title = pickLocalizedText(definition.endings[index]?.title, language, definition.languages);

    return TB.referenceOf(kind, title || TB.endingN(index + 1));
  }

  return kind;
};

export const BuilderTab = (props: BuilderTabProps) => {
  const { definition, onEdit, readOnly, editLanguage, selection, onSelect, numbering } = props;
  const isMobile = useMediaQuery(BUILDER_MOBILE_QUERY);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(null);

  const select = (next: BuilderSelection) => {
    onSelect(next);
    setInspectorOpen(next !== null);
  };

  // New items go below the selection, or at the end of the selected page,
  // or at the end of the last page.
  const add = (entry: PaletteEntry) => {
    const item = createPaletteItem(entry, editLanguage);
    const selected = selection?.kind === 'item' ? locateItem(definition, selection.id) : null;
    const pageId =
      selected?.page.id ??
      (selection?.kind === 'page' ? selection.id : definition.pages[definition.pages.length - 1].id);

    onEdit((current) => insertItem(current, pageId, item, selected === null ? undefined : selected.itemIndex + 1));
    setPaletteOpen(false);
    select({ kind: 'item', id: item.id });
  };

  const drop = (payload: DragPayload, target: { pageId: string; index: number }) => {
    if (payload.source === 'palette') {
      const entry = findPaletteEntry(payload.key);

      if (entry === undefined) return;

      const item = createPaletteItem(entry, editLanguage);

      onEdit((current) => insertItem(current, target.pageId, item, target.index));
      select({ kind: 'item', id: item.id });

      return;
    }

    onEdit((current) => {
      const source = locateItem(current, payload.id);

      if (source === null) return current;

      // The target index counts the moved item when it sits above it on the same page.
      const index =
        source.page.id === target.pageId && source.itemIndex < target.index ? target.index - 1 : target.index;

      return moveItemTo(current, payload.id, target.pageId, index);
    });
  };

  const requestDeleteItem = (itemId: string) => {
    setPendingDelete({ kind: 'item', id: itemId, references: findQuestionReferences(definition, itemId) });
  };

  const requestDeletePage = (pageId: string) => {
    const page = definition.pages.find((candidate) => candidate.id === pageId);

    if (page === undefined) return;

    const { incomingJumps, questionReferences } = findPageReferences(definition, pageId);

    if (page.items.length === 0 && incomingJumps.length === 0) {
      onEdit((current) => removePage(current, pageId));
      if (selection?.id === pageId) select(null);

      return;
    }

    setPendingDelete({
      kind: 'page',
      id: pageId,
      itemCount: page.items.length,
      incoming: incomingJumps.length,
      references: questionReferences,
    });
  };

  const confirmDelete = () => {
    if (pendingDelete === null) return;

    const { kind, id } = pendingDelete;

    onEdit((current) => (kind === 'item' ? removeItem(current, id) : removePage(current, id)));

    const selectedGone =
      selection !== null &&
      (selection.id === id ||
        (kind === 'page' &&
          selection.kind === 'item' &&
          locateItem(definition, selection.id)?.page.id === id));

    if (selectedGone) select(null);
    setPendingDelete(null);
  };

  const inspector = (
    <ItemInspector {...props} selection={selection} numbering={numbering} onOpenLogic={props.onOpenLogic} />
  );

  const referenceList = (references: RuleReference[]): ReactNode =>
    references.length === 0 ? null : (
      <ul className="svb-ref-list">
        {references.map((reference, index) => (
          <li key={`${reference.kind}-${reference.ruleId ?? reference.itemId ?? index}`}>
            {describeReference(reference, definition)}
          </li>
        ))}
      </ul>
    );

  return (
    <div className="svb-builder">
      {!isMobile && !readOnly && (
        <aside className="svb-col svb-col-palette">
          <BuilderPalette onAdd={add} />
        </aside>
      )}
      <div className="svb-col svb-col-canvas">
        {isMobile && !readOnly && (
          <button type="button" className="btn gold svb-mobile-add" onClick={() => setPaletteOpen(true)}>
            <IconPlus size={16} />
            {TB.palette}
          </button>
        )}
        <BuilderCanvas
          definition={definition}
          numbering={numbering}
          readOnly={readOnly}
          selection={selection}
          onSelect={select}
          onMoveItem={(itemId, delta) => onEdit((current) => moveItemBy(current, itemId, delta))}
          onMoveItemToPage={(itemId, pageId) => onEdit((current) => moveItemTo(current, itemId, pageId))}
          onDuplicateItem={(itemId) => {
            const { definition: next, newId } = duplicateItem(definition, itemId);

            onEdit(() => next);
            if (newId !== null) select({ kind: 'item', id: newId });
          }}
          onDeleteItem={requestDeleteItem}
          onDrop={drop}
          onAddPage={(afterPageId) => {
            const { definition: next, pageId } = addPage(definition, editLanguage, afterPageId);

            onEdit(() => next);
            select({ kind: 'page', id: pageId });
          }}
          onDuplicatePage={(pageId) => {
            const { definition: next, pageId: copyId } = duplicatePage(definition, pageId);

            onEdit(() => next);
            if (copyId !== null) select({ kind: 'page', id: copyId });
          }}
          onDeletePage={requestDeletePage}
          onMovePage={(pageId, delta) => onEdit((current) => movePage(current, pageId, delta))}
        />
      </div>
      {!isMobile && (
        <aside className="svb-col svb-col-inspector card" aria-label={TB.inspector}>
          {inspector}
        </aside>
      )}
      {isMobile && inspectorOpen && selection !== null && (
        <BuilderDialog title={TB.inspector} onClose={() => setInspectorOpen(false)}>
          {inspector}
        </BuilderDialog>
      )}
      {isMobile && paletteOpen && (
        <BuilderDialog title={TB.palette} onClose={() => setPaletteOpen(false)}>
          <BuilderPalette onAdd={add} />
        </BuilderDialog>
      )}
      {pendingDelete !== null && (
        <ConfirmDialog
          title={pendingDelete.kind === 'item' ? TB.deleteQuestionTitle : TB.deletePageTitle}
          danger
          confirmLabel={TB.deleteAnyway}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
          body={
            pendingDelete.kind === 'item' ? (
              <>
                <p>
                  {pendingDelete.references.length > 0
                    ? TB.deleteReferencedBody(pendingDelete.references.length)
                    : TB.deleteQuestionBody}
                </p>
                {referenceList(pendingDelete.references)}
              </>
            ) : (
              <>
                <p>{TB.deletePageBody(pendingDelete.itemCount)}</p>
                {pendingDelete.incoming > 0 && <p>{TB.deletePageJumps(pendingDelete.incoming)}</p>}
                {pendingDelete.references.length > 0 && (
                  <p>{TB.deleteReferencedBody(pendingDelete.references.length)}</p>
                )}
                {referenceList(pendingDelete.references)}
              </>
            )
          }
        />
      )}
    </div>
  );
};
