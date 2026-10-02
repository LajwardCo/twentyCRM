import { useMemo, useState } from 'react';

import { fetchMembers } from '../api/admin';
import { type CurrentUser } from '../api/auth';
import {
  deleteTag,
  fetchAllLinks,
  fetchAllTags,
  updateTag,
  useTagsProvisioned,
} from '../api/leadTags';
import { ModalSheet } from '../components/ModalSheet';
import { TagChip } from '../components/TagChip';
import { TagEditorFields, type TagDraft } from '../components/TagEditorFields';
import { useCached } from '../lib/cache';
import { toPersianDigits } from '../lib/jalali';
import {
  canManageTag,
  cleanTagName,
  countLeadsPerTag,
  type LeadTag,
  sortTags,
  validateTagName,
  visibleTags,
} from '../lib/leadTags';
import { navigate } from '../lib/router';
import { TTAG } from '../lib/tagStrings';

type TagsViewProps = { user: CurrentUser };

const problemText = (problem: ReturnType<typeof validateTagName>): string | null => {
  if (problem === 'empty') return TTAG.errEmpty;
  if (problem === 'tooLong') return TTAG.errTooLong;
  if (problem === 'duplicate') return TTAG.errDuplicate;
  return null;
};

// "Manage my tags": every tag the member can see, with how many leads carry it,
// and rename / recolor / personal<->public / delete for the ones they may touch.
export const TagsView = ({ user }: TagsViewProps) => {
  const provisioned = useTagsProvisioned();
  const memberId = user.workspaceMemberId;

  const { data, error, refresh } = useCached(
    provisioned ? `manage-tags:${memberId}` : 'manage-tags:skip',
    async () => {
      if (!provisioned) return null;
      const [allTags, links, members] = await Promise.all([
        fetchAllTags(),
        fetchAllLinks(),
        fetchMembers().catch(() => []),
      ]);
      return { allTags, links, members };
    },
  );

  const [editing, setEditing] = useState<LeadTag | null>(null);
  const [draft, setDraft] = useState<TagDraft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const visible = useMemo(
    () => sortTags(visibleTags(data?.allTags ?? [], memberId), memberId),
    [data, memberId],
  );
  // Counts only the leads of tags this member can see; the link list itself is
  // never rendered.
  const counts = useMemo(() => countLeadsPerTag(data?.links ?? []), [data]);
  const memberName = (id: string | null): string => {
    const member = data?.members.find((entry) => entry.id === id);
    return member ? `${member.name.firstName} ${member.name.lastName}`.trim() : '—';
  };

  const mine = visible.filter((tag) => tag.visibility === 'PERSONAL');
  const shared = visible.filter((tag) => tag.visibility === 'PUBLIC');

  const openEditor = (tag: LeadTag) => {
    setEditing(tag);
    setDraft({ name: tag.name, color: tag.color, visibility: tag.visibility });
    setFormError(null);
  };

  const closeEditor = () => {
    setEditing(null);
    setDraft(null);
  };

  const save = async () => {
    if (!editing || !draft) return;
    const problem = validateTagName(data?.allTags ?? [], draft.name, memberId, {
      excludeId: editing.id,
    });
    if (problem) {
      setFormError(problemText(problem));
      return;
    }
    setBusy(true);
    setFormError(null);
    try {
      await updateTag(editing.id, {
        name: cleanTagName(draft.name),
        color: draft.color,
        visibility: draft.visibility,
      });
      await refresh();
      closeEditor();
    } catch {
      setFormError(TTAG.errGeneric);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (tag: LeadTag) => {
    if (!window.confirm(TTAG.confirmDelete)) return;
    try {
      await deleteTag(tag.id);
      await refresh();
    } catch {
      setFormError(TTAG.errGeneric);
    }
  };

  const renderRow = (tag: LeadTag) => {
    const manageable = canManageTag(tag, memberId, user.isAdmin);
    return (
      <div key={tag.id} className="tag-manage-row">
        <div className="grow">
          <TagChip tag={tag} />
          {tag.visibility === 'PUBLIC' && (
            <div className="sub" style={{ marginTop: 3 }}>
              {TTAG.createdBy}: {memberName(tag.createdById)}
            </div>
          )}
        </div>
        <button
          type="button"
          className="btn line sm"
          onClick={() => navigate(`/leads?tags=${encodeURIComponent(tag.id)}`)}
        >
          {toPersianDigits(counts.get(tag.id) ?? 0)} {TTAG.leadsCount}
        </button>
        {manageable && (
          <>
            <button type="button" className="btn line sm" onClick={() => openEditor(tag)}>
              {TTAG.editTag}
            </button>
            <button
              type="button"
              className="btn line sm"
              aria-label={TTAG.deleteTag}
              title={TTAG.deleteTag}
              onClick={() => void remove(tag)}
            >
              ×
            </button>
          </>
        )}
      </div>
    );
  };

  return (
    <main className="page">
      <div className="page-head anim">
        <div>
          <h1>{TTAG.title}</h1>
        </div>
      </div>

      {provisioned === false && <div className="empty-state">{TTAG.notReady}</div>}
      {error !== null && <div className="error-banner">{TTAG.loadFailed}</div>}
      {formError !== null && editing === null && (
        <div className="error-banner">{formError}</div>
      )}

      {provisioned && data === null && error === null && (
        <div className="skeleton" style={{ height: 120 }} />
      )}

      {data && (
        <>
          <h3 style={{ margin: '14px 4px 8px' }}>{TTAG.mineSection}</h3>
          <div className="card anim d1">
            {mine.length === 0 ? (
              <div className="empty-state">{TTAG.emptyMine}</div>
            ) : (
              mine.map(renderRow)
            )}
          </div>

          <h3 style={{ margin: '18px 4px 8px' }}>{TTAG.publicSection}</h3>
          <div className="card anim d2">
            {shared.length === 0 ? (
              <div className="empty-state">{TTAG.emptyPublic}</div>
            ) : (
              shared.map(renderRow)
            )}
          </div>
        </>
      )}

      {editing && draft && (
        <ModalSheet title={TTAG.editTag} onClose={closeEditor}>
          <TagEditorFields
            draft={draft}
            onChange={setDraft}
            publishing={editing.visibility === 'PERSONAL' && draft.visibility === 'PUBLIC'}
            lockVisibility={editing.createdById !== memberId}
          />
          {formError && <div className="tag-error">{formError}</div>}
          <div style={{ marginTop: 12 }}>
            <button
              type="button"
              className="btn gold"
              disabled={busy}
              onClick={() => void save()}
            >
              {TTAG.save}
            </button>
          </div>
        </ModalSheet>
      )}
    </main>
  );
};
