// Builds the GraphQL filter behind the audit screen's actor search.
//
// Split out as a pure function because the interesting behaviour is not the
// request, it is how a typed phrase maps onto fields: a person's name lives in
// two columns, so a single `ilike '%Lincoln Jackson%'` matches nobody. Every
// word has to be matched independently, and every word has to appear
// somewhere -- otherwise typing more makes the results worse.

export type ActorSearchFilter = {
  and: { or: Record<string, unknown>[] }[];
} | null;

const MAX_TOKENS = 4;

export const buildActorSearchFilter = (search: string): ActorSearchFilter => {
  const tokens = search.trim().split(/\s+/).filter(Boolean).slice(0, MAX_TOKENS);

  // No query means the unfiltered first page, which is what the picker shows
  // before anyone types.
  if (tokens.length === 0) return null;

  return {
    // AND across words, OR across fields: "Lincoln Jackson" needs Lincoln to
    // match something and Jackson to match something, but not the same
    // something -- which is exactly how a first name and a surname behave.
    and: tokens.map((token) => {
      const like = `%${token}%`;

      return {
        or: [
          { name: { firstName: { ilike: like } } },
          { name: { lastName: { ilike: like } } },
          { userEmail: { ilike: like } },
        ],
      };
    }),
  };
};
