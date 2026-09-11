import { normalizeText } from './searchText';

// Filtering for the in-form searchable pickers (SearchSelect). Unlike the
// audit actor picker these lists are already in memory -- partners, referrers
// -- so matching happens here rather than on the server.

export type SearchOption = {
  value: string;
  label: string;
  // Extra text that should match but is not shown as the label, e.g. a
  // partner's type or phone number.
  hint?: string;
};

// Every word of the query has to appear somewhere in the option, in any order:
// "احمد شرکت" finds "شرکت احمدی" the same way "شرکت احمد" does. Single-letter
// words are kept here (unlike queryWords) because a list of twenty partners is
// small enough that one letter is a useful narrowing.
export const optionMatchesQuery = (
  option: SearchOption,
  query: string,
): boolean => {
  const words = normalizeText(query)
    .split(' ')
    .filter((word) => word !== '');
  if (words.length === 0) return true;

  const haystack = normalizeText(`${option.label} ${option.hint ?? ''}`);
  return words.every((word) => haystack.includes(word));
};

// Matches, with the ones that START with the query first: typing "ح" should
// put "حسیب" above "احمد" rather than leaving the order to chance.
export const filterOptions = (
  options: SearchOption[],
  query: string,
): SearchOption[] => {
  const normalizedQuery = normalizeText(query);
  const matches = options.filter((option) =>
    optionMatchesQuery(option, normalizedQuery),
  );
  if (normalizedQuery === '') return matches;

  const prefixed: SearchOption[] = [];
  const rest: SearchOption[] = [];
  for (const option of matches) {
    if (normalizeText(option.label).startsWith(normalizedQuery)) {
      prefixed.push(option);
    } else {
      rest.push(option);
    }
  }
  return [...prefixed, ...rest];
};

// A row in a SearchSelect dropdown. Most are options to pick, but two are not:
// the row that clears the selection, and the row that creates a value which
// does not exist yet. Modelling them apart keeps them out of `options`, where
// a magic value would eventually be selected, saved and sent to the server.
export type SelectRow =
  | { kind: 'option'; option: SearchOption }
  | { kind: 'clear'; label: string }
  | { kind: 'create'; label: string; name: string };

type BuildSelectRowsInput = {
  matches: SearchOption[];
  // The row that clears the selection. Omit to make the field mandatory.
  emptyLabel?: string;
  // The row that creates a new record. Omit where creating one makes no sense.
  createLabel?: string;
  // What the user has typed, empty when they haven't typed anything yet.
  query: string;
};

export const buildSelectRows = ({
  matches,
  emptyLabel,
  createLabel,
  query,
}: BuildSelectRowsInput): SelectRow[] => {
  const rows: SelectRow[] = [];
  if (emptyLabel !== undefined) rows.push({ kind: 'clear', label: emptyLabel });
  for (const option of matches) rows.push({ kind: 'option', option });
  if (createLabel !== undefined) {
    // Quoting what was typed shows the name carries over, so the dialog that
    // opens isn't going to ask for it a second time.
    const name = query.trim();
    rows.push({
      kind: 'create',
      label: name === '' ? createLabel : `${createLabel} «${name}»`,
      name,
    });
  }
  return rows;
};
