// Respondents type Persian (۰-۹) and Arabic-Indic (٠-٩) digits; numbers,
// phones and dates are compared and stored with Latin digits.
export const toLatinDigits = (value: string): string =>
  value
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/٫/g, '.')
    .replace(/٬/g, ',');
