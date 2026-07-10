import { coreQuery } from './client';
import { globalSearch, type SearchHit } from './records';

// Deep search enrichment: the native search returns only labels, so for hits
// where the match usually lives in the DETAILS (task/note bodies, person
// phones/emails) we batch-fetch the underlying text and cut a snippet around
// the first matched word.

export type EnrichedHit = SearchHit & {
  description: string | null;
};

const normalize = (s: string) => s.toLocaleLowerCase('fa');

// words worth highlighting/snippeting (2+ chars)
export const queryWords = (query: string): string[] =>
  query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length >= 2);

// Cut a window around the first occurrence of any query word.
export const makeSnippet = (
  text: string,
  query: string,
  radius = 45,
): string | null => {
  const clean = text.replace(/[#*_>`]/g, '').replace(/\s+/g, ' ').trim();
  if (clean === '') return null;
  const haystack = normalize(clean);
  let index = -1;
  for (const word of queryWords(query)) {
    const at = haystack.indexOf(normalize(word));
    if (at !== -1 && (index === -1 || at < index)) index = at;
  }
  if (index === -1) return clean.slice(0, radius * 2) || null;
  const start = Math.max(0, index - radius);
  const end = Math.min(clean.length, index + radius * 2);
  return (
    (start > 0 ? '…' : '') + clean.slice(start, end) + (end < clean.length ? '…' : '')
  );
};

const fetchBodies = async (
  plural: 'tasks' | 'notes',
  ids: string[],
): Promise<Map<string, string>> => {
  if (ids.length === 0) return new Map();
  try {
    const data = await coreQuery<
      Record<string, { edges: { node: { id: string; bodyV2: { markdown: string | null } | null } }[] }>
    >(
      `query Bodies($ids: [UUID!]) {
        ${plural}(filter: { id: { in: $ids } }, first: ${ids.length}) {
          edges { node { id bodyV2 { markdown } } }
        }
      }`,
      { ids },
    );
    return new Map(
      data[plural].edges.map((e) => [e.node.id, e.node.bodyV2?.markdown ?? '']),
    );
  } catch {
    return new Map();
  }
};

const fetchPeopleDetails = async (
  ids: string[],
): Promise<Map<string, string>> => {
  if (ids.length === 0) return new Map();
  try {
    const data = await coreQuery<{
      people: {
        edges: {
          node: {
            id: string;
            jobTitle: string | null;
            phones: { primaryPhoneCallingCode: string | null; primaryPhoneNumber: string | null } | null;
            emails: { primaryEmail: string | null } | null;
            company: { name: string } | null;
          };
        }[];
      };
    }>(
      `query PeopleDetails($ids: [UUID!]) {
        people(filter: { id: { in: $ids } }, first: ${ids.length}) {
          edges {
            node {
              id
              jobTitle
              phones { primaryPhoneCallingCode primaryPhoneNumber }
              emails { primaryEmail }
              company { name }
            }
          }
        }
      }`,
      { ids },
    );
    return new Map(
      data.people.edges.map((e) => {
        const n = e.node;
        const phone = n.phones?.primaryPhoneNumber
          ? `${n.phones.primaryPhoneCallingCode ?? ''}${n.phones.primaryPhoneNumber}`
          : null;
        const parts = [n.company?.name, n.jobTitle, phone, n.emails?.primaryEmail]
          .filter(Boolean)
          .join(' · ');
        return [n.id, parts];
      }),
    );
  } catch {
    return new Map();
  }
};

export const enrichedGlobalSearch = async (
  query: string,
  limit = 16,
): Promise<EnrichedHit[]> => {
  const hits = await globalSearch(query, limit);

  const taskIds = hits
    .filter((h) => h.objectNameSingular === 'task')
    .map((h) => h.recordId);
  const noteIds = hits
    .filter((h) => h.objectNameSingular === 'note')
    .map((h) => h.recordId);
  const personIds = hits
    .filter((h) => h.objectNameSingular === 'person')
    .map((h) => h.recordId);

  const [taskBodies, noteBodies, personDetails] = await Promise.all([
    fetchBodies('tasks', taskIds),
    fetchBodies('notes', noteIds),
    fetchPeopleDetails(personIds),
  ]);

  return hits.map((hit) => {
    let description: string | null = null;
    if (hit.objectNameSingular === 'task') {
      description = makeSnippet(taskBodies.get(hit.recordId) ?? '', query);
    } else if (hit.objectNameSingular === 'note') {
      description = makeSnippet(noteBodies.get(hit.recordId) ?? '', query);
    } else if (hit.objectNameSingular === 'person') {
      description = personDetails.get(hit.recordId) ?? null;
    }
    return { ...hit, description: description || null };
  });
};
