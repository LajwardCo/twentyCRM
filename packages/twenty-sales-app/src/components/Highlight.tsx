import { queryWords } from '../api/deepSearch';

// Renders text with every query word wrapped in a bold highlight.
export const Highlight = ({ text, query }: { text: string; query: string }) => {
  const words = queryWords(query);
  if (words.length === 0) return <>{text}</>;

  const escaped = words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const splitter = new RegExp(`(${escaped.join('|')})`, 'gi');
  // fresh non-global regex per test — a 'g' regex is stateful across calls
  const matcher = new RegExp(`^(${escaped.join('|')})$`, 'i');
  const parts = text.split(splitter);

  return (
    <>
      {parts.map((part, i) =>
        matcher.test(part) ? (
          <b key={i} className="hl">
            {part}
          </b>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
};
