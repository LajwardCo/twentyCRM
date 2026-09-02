export type AfghanLanguage = 'ps' | 'fa' | 'en' | null;

/**
 * Pashto's own letters. Dari (Afghan Persian) shares the Arabic script but uses
 * none of these, so a single occurrence is a reliable Pashto signal.
 */
const PASHTO_ONLY = /[ټځڅډړږښڼۍ]/;

/**
 * An Arabic-script *letter*, which both Dari and Pashto are written in.
 *
 * The lookahead matters: the Arabic block also contains Persian and
 * Arabic-Indic digits (۰-۹, ٠-٩), so a plain range would label a transcript of
 * bare numerals as Dari.
 */
const ARABIC_LETTER = /(?=\p{Script=Arabic})\p{L}/u;

const LATIN = /[A-Za-z]/;

/**
 * Labels a transcript's language from its script.
 *
 * `gpt-4o-transcribe` never reports a detected language — it rejects
 * `response_format=verbose_json` entirely, and only `whisper-1` returns a
 * `language` field. Whisper transcribes Afghan speech less accurately (it
 * normalises Afghan spelling toward Iranian Persian), so rather than downgrade
 * the model for the sake of a label, the language is inferred here.
 *
 * This is a script check, not language identification: it separates Pashto from
 * Dari from English, which is all the CRM needs for filtering and for telling a
 * reviewer what they are about to read. It cannot tell Dari from Iranian
 * Persian, and it will not try.
 *
 * Mixed input resolves to the strongest signal, because agents code-switch: any
 * Pashto-only letter wins, then Arabic script at all, then Latin.
 */
export const detectAfghanLanguage = (text: string): AfghanLanguage => {
  if (PASHTO_ONLY.test(text)) {
    return 'ps';
  }

  if (ARABIC_LETTER.test(text)) {
    return 'fa';
  }

  if (LATIN.test(text)) {
    return 'en';
  }

  return null;
};
