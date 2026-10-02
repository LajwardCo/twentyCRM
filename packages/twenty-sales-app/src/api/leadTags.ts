import { useEffect, useState } from 'react';

import { coreQuery, metadataQuery } from './client';
import { type Connection, fetchAllPages, PAGE_SIZE } from './records';
import {
  type LeadTag,
  parseTagColor,
  parseTagVisibility,
  type TagColor,
  type TagLink,
  type TagVisibility,
} from '../lib/leadTags';

// Lead tags live in two custom objects (leadTag, leadTagLink) created by
// tools/sales-crm/provision-lead-tags.mjs. Until that has run the UI hides
// every tag control, decided by the metadata probe below -- asked of /metadata
// rather than inferred from a failed query so an unprovisioned server never
// flashes an error banner.

let tagsProvisioned: boolean | null = null;
let inflight: Promise<boolean> | null = null;

export const isTagsProvisioned = async (): Promise<boolean> => {
  if (tagsProvisioned !== null) return tagsProvisioned;
  if (inflight !== null) return inflight;

  inflight = (async () => {
    try {
      const data = await metadataQuery<{
        objects: { edges: { node: { nameSingular: string } }[] };
      }>(
        `query LeadTagsProbe {
          objects(paging: { first: 500 }) {
            edges { node { nameSingular } }
          }
        }`,
      );
      const names = new Set(data.objects.edges.map((edge) => edge.node.nameSingular));
      tagsProvisioned = names.has('leadTag') && names.has('leadTagLink');
      return tagsProvisioned;
    } catch {
      // A probe that could not run is not evidence the objects are missing, so
      // the answer is not cached.
      return false;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
};

// null while the probe is in flight, so callers render nothing rather than a
// control that may disappear.
export const useTagsProvisioned = (): boolean | null => {
  const [provisioned, setProvisioned] = useState<boolean | null>(tagsProvisioned);

  useEffect(() => {
    if (provisioned !== null) return;
    let cancelled = false;
    void isTagsProvisioned().then((answer) => {
      if (!cancelled) setProvisioned(answer);
    });
    return () => {
      cancelled = true;
    };
  }, [provisioned]);

  return provisioned;
};

type TagNode = {
  id: string;
  name: string | null;
  color: string | null;
  visibility: string | null;
  createdByMemberId: string | null;
};

const toTag = (node: TagNode): LeadTag => ({
  id: node.id,
  name: node.name ?? '',
  color: parseTagColor(node.color),
  visibility: parseTagVisibility(node.visibility),
  createdById: node.createdByMemberId,
});

// Every tag in the workspace, including other members' personal ones: the
// record API cannot scope rows per user, so callers must pass the result
// through visibleTags (tagsByLead and the pickers already do).
export const fetchAllTags = async (): Promise<LeadTag[]> => {
  const { items } = await fetchAllPages<TagNode>(async (after) => {
    const data = await coreQuery<{ leadTags: Connection<TagNode> }>(
      `query LeadTags($limit: Int!, $after: String) {
        leadTags(first: $limit, after: $after, orderBy: [{ name: AscNullsLast }]) {
          edges { node { id name color visibility createdByMemberId } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { limit: PAGE_SIZE, after },
    );
    return data.leadTags;
  });
  return items.map(toTag);
};

export const createTag = async (input: {
  name: string;
  color: TagColor;
  visibility: TagVisibility;
  createdById: string;
}): Promise<LeadTag> => {
  const data = await coreQuery<{ createLeadTag: TagNode }>(
    `mutation CreateLeadTag($data: LeadTagCreateInput!) {
      createLeadTag(data: $data) { id name color visibility createdByMemberId }
    }`,
    {
      data: {
        name: input.name,
        color: input.color,
        visibility: input.visibility,
        createdByMemberId: input.createdById,
      },
    },
  );
  return toTag(data.createLeadTag);
};

export const updateTag = async (
  id: string,
  patch: Partial<{ name: string; color: TagColor; visibility: TagVisibility }>,
): Promise<void> => {
  await coreQuery(
    `mutation UpdateLeadTag($id: UUID!, $data: LeadTagUpdateInput!) {
      updateLeadTag(id: $id, data: $data) { id }
    }`,
    { id, data: patch },
  );
};

// Links go first, in one bulk mutation (a per-row loop would eat the API's
// 100-requests-a-minute budget on a popular tag). Deletes are soft on prod --
// destroy is denied -- which is exactly what we want here.
export const deleteTag = async (id: string): Promise<void> => {
  await coreQuery(
    `mutation DeleteLeadTagLinks($filter: LeadTagLinkFilterInput!) {
      deleteLeadTagLinks(filter: $filter) { id }
    }`,
    { filter: { tagId: { eq: id } } },
  );
  await coreQuery(
    `mutation DeleteLeadTag($id: UUID!) { deleteLeadTag(id: $id) { id } }`,
    { id },
  );
};

const LINK_FIELDS = 'id opportunityId tagId';

const fetchLinks = async (filter: Record<string, unknown>): Promise<TagLink[]> => {
  const { items } = await fetchAllPages<TagLink>(async (after) => {
    const data = await coreQuery<{ leadTagLinks: Connection<TagLink> }>(
      `query LeadTagLinks($filter: LeadTagLinkFilterInput, $limit: Int!, $after: String) {
        leadTagLinks(filter: $filter, first: $limit, after: $after) {
          edges { node { ${LINK_FIELDS} } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { filter, limit: PAGE_SIZE, after },
    );
    return data.leadTagLinks;
  });
  return items;
};

export const fetchLinksForLead = (leadId: string): Promise<TagLink[]> =>
  fetchLinks({ opportunityId: { eq: leadId } });

// One round trip for a whole list page's chips.
export const fetchLinksForLeads = (leadIds: string[]): Promise<TagLink[]> =>
  leadIds.length === 0 ? Promise.resolve([]) : fetchLinks({ opportunityId: { in: leadIds } });

// The leads carrying ANY of the given tags -- the server half of the leads
// filter. The relation is one-to-many, which the record API cannot filter
// through, so the filter is resolved to an id list first.
export const fetchLeadIdsForTags = async (tagIds: string[]): Promise<string[]> => {
  if (tagIds.length === 0) return [];
  const links = await fetchLinks({ tagId: { in: tagIds } });
  return [...new Set(links.map((link) => link.opportunityId))];
};

export const fetchAllLinks = (): Promise<TagLink[]> => fetchLinks({});

export const applyTag = async (leadId: string, tagId: string): Promise<TagLink> => {
  const data = await coreQuery<{ createLeadTagLink: TagLink }>(
    `mutation CreateLeadTagLink($data: LeadTagLinkCreateInput!) {
      createLeadTagLink(data: $data) { ${LINK_FIELDS} }
    }`,
    { data: { opportunityId: leadId, tagId } },
  );
  return data.createLeadTagLink;
};

export const removeTagLink = async (linkId: string): Promise<void> => {
  await coreQuery(
    `mutation DeleteLeadTagLink($id: UUID!) { deleteLeadTagLink(id: $id) { id } }`,
    { id: linkId },
  );
};
