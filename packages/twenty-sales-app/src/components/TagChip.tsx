import { type LeadTag } from '../lib/leadTags';
import { TTAG } from '../lib/tagStrings';
import { IconLock } from './icons';

type TagChipProps = {
  tag: Pick<LeadTag, 'name' | 'color' | 'visibility'>;
  onRemove?: () => void;
};

// A personal tag carries a small lock so a seller can tell at a glance which
// labels colleagues can see.
export const TagChip = ({ tag, onRemove }: TagChipProps) => (
  <span className="tag-chip" data-color={tag.color}>
    {tag.visibility === 'PERSONAL' && <IconLock size={10} />}
    <span className="tag-chip-name">{tag.name}</span>
    {onRemove && (
      <button
        type="button"
        aria-label={TTAG.remove}
        title={TTAG.remove}
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
      >
        ×
      </button>
    )}
  </span>
);
