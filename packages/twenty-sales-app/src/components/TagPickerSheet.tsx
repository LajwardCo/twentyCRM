import { useMemo, useState } from 'react';

import { applyTag, createTag, removeTagLink } from '../api/leadTags';
import {
  DEFAULT_TAG_COLOR,
  type LeadTag,
  normalizeTagName,
  sortTags,
  type TagLink,
  validateTagName,
  visibleTags,
} from '../lib/leadTags';
import { TTAG } from '../lib/tagStrings';
import { ModalSheet } from './ModalSheet';
import { TagChip } from './TagChip';
import { TagEditorFields, type TagDraft } from './TagEditorFields';

type TagPickerSheetProps = {
  leadId: string;
  memberId: string;
  allTags: LeadTag[];
  // This lead's links, for the member's visible tags and others'.
  links: TagLink[];
  onClose: () => void;
  // Called after any change so the caller can refetch.
  onChanged: () => void | Promise<void>;
};

const errorText = (problem: ReturnType<typeof validateTagName>): string | null => {
  if (problem === 'empty') return TTAG.errEmpty;
  if (problem === 'tooLong') return TTAG.errTooLong;
  if (problem === 'duplicate') return TTAG.errDuplicate;
  return null;
};

// Toggle existing tags on a lead, or create one without leaving the sheet.
export const TagPickerSheet = ({
  leadId,
  memberId,
  allTags,
  links,
  onClose,
  onChanged,
}: TagPickerSheetProps) => {
  const [query, setQuery] = useState('');
  const [busyTagId, setBusyTagId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<TagDraft>({
    name: '',
    color: DEFAULT_TAG_COLOR,
    visibility: 'PERSONAL',
  });
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(
    () => sortTags(visibleTags(allTags, memberId), memberId),
    [allTags, memberId],
  );

  const linkByTag = useMemo(
    () => new Map(links.map((link) => [link.tagId, link])),
    [links],
  );

  const needle = normalizeTagName(query);
  const matches = visible.filter(
    (tag) => needle === '' || normalizeTagName(tag.name).includes(needle),
  );
  const mine = matches.filter((tag) => tag.visibility === 'PERSONAL');
  const shared = matches.filter((tag) => tag.visibility === 'PUBLIC');

  const toggle = async (tag: LeadTag) => {
    setBusyTagId(tag.id);
    setError(null);
    try {
      const existing = linkByTag.get(tag.id);
      if (existing) await removeTagLink(existing.id);
      else await applyTag(leadId, tag.id);
      await onChanged();
    } catch {
      setError(TTAG.errGeneric);
    } finally {
      setBusyTagId(null);
    }
  };

  const startCreate = () => {
    setDraft((current) => ({ ...current, name: query.trim() }));
    setError(null);
    setCreating(true);
  };

  const submitCreate = async () => {
    const problem = validateTagName(allTags, draft.name, memberId);
    if (problem) {
      setError(errorText(problem));
      return;
    }
    setBusyTagId('new');
    setError(null);
    try {
      const tag = await createTag({
        name: draft.name.trim().replace(/\s+/g, ' '),
        color: draft.color,
        visibility: draft.visibility,
        createdById: memberId,
      });
      await applyTag(leadId, tag.id);
      await onChanged();
      setCreating(false);
      setQuery('');
    } catch {
      setError(TTAG.errGeneric);
    } finally {
      setBusyTagId(null);
    }
  };

  const renderItem = (tag: LeadTag) => (
    <button
      key={tag.id}
      type="button"
      className={`tag-pick-item${linkByTag.has(tag.id) ? ' on' : ''}`}
      disabled={busyTagId !== null}
      onClick={() => void toggle(tag)}
    >
      <TagChip tag={tag} />
      <span className="tag-pick-check">{linkByTag.has(tag.id) ? '✓' : ''}</span>
    </button>
  );

  const canOfferCreate =
    query.trim() !== '' &&
    !visible.some((tag) => normalizeTagName(tag.name) === needle);

  return (
    <ModalSheet title={TTAG.addTagTitle} onClose={onClose}>
      {!creating && (
        <>
          <div className="fld" style={{ marginBottom: 0 }}>
            <input
              value={query}
              placeholder={TTAG.searchOrCreate}
              autoFocus
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>

          <div className="tag-pick-list">
            {mine.length > 0 && <div className="tag-pick-group">{TTAG.mineGroup}</div>}
            {mine.map(renderItem)}
            {shared.length > 0 && <div className="tag-pick-group">{TTAG.publicGroup}</div>}
            {shared.map(renderItem)}
            {matches.length === 0 && !canOfferCreate && (
              <div className="sub" style={{ padding: 10 }}>
                {TTAG.noMatches}
              </div>
            )}
          </div>

          {canOfferCreate ? (
            <button type="button" className="btn gold sm" onClick={startCreate}>
              {TTAG.createNamed} «{query.trim()}»
            </button>
          ) : (
            <button type="button" className="btn line sm" onClick={startCreate}>
              {TTAG.newTag}
            </button>
          )}
        </>
      )}

      {creating && (
        <div className="tag-create-box" style={{ borderTop: 0, paddingTop: 0 }}>
          <TagEditorFields draft={draft} onChange={setDraft} autoFocusName />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="btn gold"
              disabled={busyTagId !== null}
              onClick={() => void submitCreate()}
            >
              {busyTagId === 'new' ? TTAG.creating : TTAG.create}
            </button>
            <button type="button" className="btn line" onClick={() => setCreating(false)}>
              {TTAG.back}
            </button>
          </div>
        </div>
      )}

      {error && <div className="tag-error">{error}</div>}
    </ModalSheet>
  );
};
