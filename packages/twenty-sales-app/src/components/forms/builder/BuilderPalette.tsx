import { TB } from '../../../lib/forms/builderStrings';
import {
  PALETTE_GROUPS,
  type PaletteEntry,
  glyphFor,
} from '../../../lib/forms/builder/palette';
import { QUESTION_TYPE_LABELS } from '../../../lib/forms/surveyStrings';

export const DRAG_MIME = 'application/x-survey-builder';

export type DragPayload = { source: 'palette'; key: string } | { source: 'item'; id: string };

export const paletteLabel = (entry: PaletteEntry): string =>
  entry.kind === 'question' ? QUESTION_TYPE_LABELS[entry.type] : TB.blockLabels[entry.kind];

type BuilderPaletteProps = {
  onAdd: (entry: PaletteEntry) => void;
};

// Click (or Enter) adds below the selection; dragging drops at a position.
export const BuilderPalette = ({ onAdd }: BuilderPaletteProps) => (
  <nav className="svb-palette" aria-label={TB.palette}>
    {PALETTE_GROUPS.map((group) => (
      <section key={group.key} className={`svb-palette-group${group.key === 'staff' ? ' staff' : ''}`}>
        <h3>{TB.paletteGroups[group.key]}</h3>
        {group.key === 'staff' && <p className="svb-hint">{TB.staffOnlyGroupHint}</p>}
        <div className="svb-palette-grid">
          {group.entries.map((entry) => {
            const label = paletteLabel(entry);

            return (
              <button
                key={entry.key}
                type="button"
                className="svb-palette-btn"
                draggable
                aria-label={TB.addToPage(label)}
                title={TB.addToPage(label)}
                onClick={() => onAdd(entry)}
                onDragStart={(event) => {
                  const payload: DragPayload = { source: 'palette', key: entry.key };

                  event.dataTransfer.setData(DRAG_MIME, JSON.stringify(payload));
                  event.dataTransfer.effectAllowed = 'copy';
                }}
              >
                <span className="svb-glyph" aria-hidden="true">
                  {glyphFor(entry)}
                </span>
                <span>{label}</span>
              </button>
            );
          })}
        </div>
      </section>
    ))}
  </nav>
);
