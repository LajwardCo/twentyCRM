import { SUPPORTED_CURRENCIES, type CurrencyCode } from '../lib/format';

type MoneyInputProps = {
  amount: string;
  onAmountChange: (value: string) => void;
  currency: CurrencyCode;
  onCurrencyChange: (value: CurrencyCode) => void;
  id?: string;
  placeholder?: string;
};

// Amount field paired with an AFN/USD toggle. The amount stays a raw string so
// callers keep their own Persian-digit / thousands parsing at submit time.
export const MoneyInput = ({
  amount,
  onAmountChange,
  currency,
  onCurrencyChange,
  id,
  placeholder,
}: MoneyInputProps) => (
  <div className="money-input">
    <input
      id={id}
      inputMode="numeric"
      dir="ltr"
      placeholder={placeholder}
      value={amount}
      onChange={(e) => onAmountChange(e.target.value)}
    />
    <div className="money-cur" role="group">
      {SUPPORTED_CURRENCIES.map((code) => (
        <button
          type="button"
          key={code}
          className={currency === code ? 'on' : ''}
          onClick={() => onCurrencyChange(code)}
        >
          {code === 'AFN' ? '؋ افغانی' : '$ دالر'}
        </button>
      ))}
    </div>
  </div>
);
