import { useRef, useState, type CSSProperties } from 'react';

import {
  isPartialNumber,
  numberToInputText,
  parseDecimalInput,
} from '../lib/numberInput';

// A number box that can actually be typed into. The naive
// `value={n} onChange={Number(...)}` pairing loses the decimal point the
// instant it is typed -- Number('12.') is 12, which re-renders as "12" -- so
// this keeps the raw text and only tells the parent about parsed values.
// Persian digits and the ٫ separator are accepted; see lib/numberInput.
//
// onChange fires with null while the box is empty or mid-number ('12.'), so
// callers must treat null as "no value given" rather than as zero.

type NumberFieldProps = {
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  // Counted things (quantities, tier bands) take no fractional part.
  integer?: boolean;
  allowNegative?: boolean;
  id?: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
  style?: CSSProperties;
  'aria-label'?: string;
};

export const NumberField = ({
  value,
  onChange,
  integer = false,
  allowNegative = false,
  ...rest
}: NumberFieldProps) => {
  const [text, setText] = useState(() => numberToInputText(value));
  // What the parent last heard from us. Anything else means the value changed
  // outside this box (a record loaded, a form reset, a currency swap) and the
  // text is stale -- but a value that merely echoes our own keystroke must not
  // rewrite "12." or "12.50" back to "12".
  const emitted = useRef<number | null>(parseDecimalInput(text, { integer, allowNegative }));
  const incoming = value ?? null;

  if (incoming !== emitted.current) {
    emitted.current = incoming;
    setText(numberToInputText(incoming));
  }

  const handleChange = (raw: string) => {
    if (!isPartialNumber(raw, { integer, allowNegative })) return;

    const parsed = parseDecimalInput(raw, { integer, allowNegative });

    setText(raw);
    emitted.current = parsed;
    onChange(parsed);
  };

  return (
    <input
      {...rest}
      inputMode={integer ? 'numeric' : 'decimal'}
      dir="ltr"
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      // Tidy on the way out so a stored 12.5 never lingers as '۰۱۲٫۵۰'.
      onBlur={() => setText(numberToInputText(emitted.current))}
    />
  );
};
