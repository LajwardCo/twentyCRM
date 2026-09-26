import { useRef, useState } from 'react';

import { TC } from '../../../../lib/forms/collectStrings';

export const copyText = async (text: string, fallbackInput?: HTMLInputElement | null): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);

    return true;
  } catch {
    // Clipboard API needs a secure context; selecting the text still lets
    // the user copy by hand.
    fallbackInput?.select();

    return false;
  }
};

// A read-only link with a copy button that says when it worked.
export const CopyField = ({ value, label }: { value: string; label?: string }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  return (
    <div className="svc-copy">
      {label !== undefined && <span className="svc-copy-label" dir="auto">{label}</span>}
      <div className="svc-copy-row">
        <input
          ref={inputRef}
          className="sv-input svc-copy-input"
          dir="ltr"
          readOnly
          value={value}
          aria-label={label ?? value}
          onFocus={(event) => event.target.select()}
        />
        <button
          type="button"
          className="btn line sm"
          onClick={() => {
            void copyText(value, inputRef.current).then((ok) => {
              setCopied(ok);
              if (ok) window.setTimeout(() => setCopied(false), 1800);
            });
          }}
        >
          {copied ? TC.copied : TC.copy}
        </button>
      </div>
    </div>
  );
};
