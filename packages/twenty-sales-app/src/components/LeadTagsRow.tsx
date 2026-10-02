import { useMemo, useState } from 'react';

import { type CurrentUser } from '../api/auth';
import {
  fetchAllTags,
  fetchLinksForLead,
  removeTagLink,
  useTagsProvisioned,
} from '../api/leadTags';
import { isExternalUser } from '../lib/access';
import { useCached } from '../lib/cache';
import { sortTags, tagsByLead } from '../lib/leadTags';
import { TTAG } from '../lib/tagStrings';
import { IconTag } from './icons';
import { TagChip } from './TagChip';
import { TagPickerSheet } from './TagPickerSheet';

type LeadTagsRowProps = {
  leadId: string;
  user: CurrentUser;
};

// The chips on a lead's header, plus the "+ tag" entry to the picker. Renders
// nothing until the tag objects exist on this server, and never for external
// marketers/partners.
export const LeadTagsRow = ({ leadId, user }: LeadTagsRowProps) => {
  const provisioned = useTagsProvisioned();

  if (provisioned !== true || isExternalUser(user)) return null;
  return <LeadTagsRowInner leadId={leadId} memberId={user.workspaceMemberId} />;
};

const LeadTagsRowInner = ({
  leadId,
  memberId,
}: {
  leadId: string;
  memberId: string;
}) => {
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState(false);

  const { data, refresh } = useCached(`lead-tags:${leadId}`, async () => {
    const [allTags, links] = await Promise.all([
      fetchAllTags(),
      fetchLinksForLead(leadId),
    ]);
    return { allTags, links };
  });

  const applied = useMemo(() => {
    if (!data) return [];
    const map = tagsByLead(data.links, data.allTags, memberId);
    return sortTags(map.get(leadId) ?? [], memberId);
  }, [data, leadId, memberId]);

  const linkFor = (tagId: string) => data?.links.find((link) => link.tagId === tagId);

  const remove = async (tagId: string) => {
    const link = linkFor(tagId);
    if (!link) return;
    setError(false);
    try {
      await removeTagLink(link.id);
      await refresh();
    } catch {
      setError(true);
    }
  };

  return (
    <>
      <div className="tag-row">
        {applied.map((tag) => (
          <TagChip key={tag.id} tag={tag} onRemove={() => void remove(tag.id)} />
        ))}
        <button type="button" className="tag-add" onClick={() => setPicking(true)}>
          <IconTag size={11} />
          {applied.length === 0 ? TTAG.addTag : '+'}
        </button>
        {error && <span className="tag-error">{TTAG.errGeneric}</span>}
      </div>

      {picking && data && (
        <TagPickerSheet
          leadId={leadId}
          memberId={memberId}
          allTags={data.allTags}
          links={data.links}
          onClose={() => setPicking(false)}
          onChanged={refresh}
        />
      )}
    </>
  );
};
