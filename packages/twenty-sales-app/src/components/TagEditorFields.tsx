import { TAG_COLORS, type TagColor, type TagVisibility } from '../lib/leadTags';
import { TTAG } from '../lib/tagStrings';

export type TagDraft = {
  name: string;
  color: TagColor;
  visibility: TagVisibility;
};

type TagEditorFieldsProps = {
  draft: TagDraft;
  onChange: (draft: TagDraft) => void;
  // Shown under the visibility toggle when an edit would newly publish a
  // personal tag.
  publishing?: boolean;
  // An admin may rename/recolor someone's public tag but not flip its scope.
  lockVisibility?: boolean;
  autoFocusName?: boolean;
};

// Name + colour + personal/public. Shared by the picker's create box and the
// manage screen's editor so the two cannot drift apart.
export const TagEditorFields = ({
  draft,
  onChange,
  publishing = false,
  lockVisibility = false,
  autoFocusName = false,
}: TagEditorFieldsProps) => (
  <>
    <div className="fld">
      <label>{TTAG.name}</label>
      <input
        value={draft.name}
        maxLength={60}
        autoFocus={autoFocusName}
        onChange={(event) => onChange({ ...draft, name: event.target.value })}
      />
    </div>

    <div className="fld">
      <label>{TTAG.color}</label>
      <div className="tag-swatches">
        {TAG_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            className={`tag-swatch${draft.color === color ? ' on' : ''}`}
            data-color={color}
            aria-label={TTAG.colors[color]}
            title={TTAG.colors[color]}
            onClick={() => onChange({ ...draft, color })}
          />
        ))}
      </div>
    </div>

    {!lockVisibility && (
    <div className="fld">
      <label>{TTAG.visibility}</label>
      <div className="seg">
        <button
          type="button"
          className={draft.visibility === 'PERSONAL' ? 'on' : ''}
          onClick={() => onChange({ ...draft, visibility: 'PERSONAL' })}
        >
          {TTAG.personal}
        </button>
        <button
          type="button"
          className={draft.visibility === 'PUBLIC' ? 'on' : ''}
          onClick={() => onChange({ ...draft, visibility: 'PUBLIC' })}
        >
          {TTAG.public}
        </button>
      </div>
      <div className="sub" style={{ marginTop: 6 }}>
        {draft.visibility === 'PERSONAL' ? TTAG.personalHint : TTAG.publicHint}
      </div>
      {publishing && (
        <div className="sub" style={{ marginTop: 4, color: 'var(--warm)' }}>
          {TTAG.publishWarning}
        </div>
      )}
    </div>
    )}
  </>
);
