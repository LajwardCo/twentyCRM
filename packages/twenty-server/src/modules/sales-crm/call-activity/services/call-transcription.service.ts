import { Injectable, Logger } from '@nestjs/common';

import { detectAfghanLanguage } from 'src/modules/sales-crm/utils/detect-afghan-language.util';

export type TranscriptionResult = {
  text: string;
  /** Language the provider detected, when it reports one. */
  language: string | null;
};

/**
 * Speech-to-text for call recordings.
 *
 * Claude cannot do this — no Anthropic model accepts audio input (verified
 * against the Models API: capabilities are image_input and pdf_input only). So
 * this is the one place the sales stack talks to OpenAI; everything else stays
 * on Anthropic.
 *
 * ## Do not pass a language hint
 *
 * Measured on 2026-09-03 against synthesized Dari and Pashto speech:
 *
 * - Dari, auto-detected: near-verbatim, and it keeps Afghan vocabulary such as
 *   `شفاخانه`. It does sometimes normalise Afghan `داکتر` to Iranian `دکتر`.
 * - Pashto, auto-detected: near-verbatim, including `ښاغلیه`, `سیسټم`,
 *   `ډاکټرانو`.
 * - Pashto with `language=ps`: **materially worse** — `ښاغلیه` became
 *   `شاګلیه`, `پنځو` became `پنزو`, and the retroflex `ټ` was dropped from
 *   `سیسټم` and `ډاکټرانو`.
 *
 * Forcing the hint is the intuitive implementation and it is the wrong one.
 * Agents also code-switch between Dari, Pashto and English mid-call, which a
 * fixed hint cannot express. Leave detection to the model.
 *
 * Those figures come from clean synthesized speech. Real calls are 8 kHz, noisy
 * and two-party, so treat them as an upper bound: they show the model knows the
 * orthography, not that it will be this accurate on a real recording.
 */
@Injectable()
export class CallTranscriptionService {
  private readonly logger = new Logger(CallTranscriptionService.name);

  /** Chosen over whisper-1, which normalised more Afghan spelling away. */
  private readonly model = 'gpt-4o-transcribe';

  private readonly endpoint = 'https://api.openai.com/v1/audio/transcriptions';

  isConfigured(): boolean {
    return (process.env.OPENAI_API_KEY ?? '').trim() !== '';
  }

  async transcribe({
    audio,
    filename,
    mimeType,
  }: {
    audio: Buffer;
    filename: string;
    mimeType: string;
  }): Promise<TranscriptionResult> {
    const apiKey = (process.env.OPENAI_API_KEY ?? '').trim();

    if (apiKey === '') {
      throw new Error(
        'OPENAI_API_KEY is not set; call transcription is unavailable.',
      );
    }

    const form = new FormData();

    form.append(
      'file',
      new Blob([new Uint8Array(audio)], { type: mimeType }),
      filename,
    );
    form.append('model', this.model);
    // Deliberately no `language` field — see the class comment.
    form.append('response_format', 'json');

    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!response.ok) {
      const detail = await response.text();

      // The key must never reach a log line or an API response.
      this.logger.error(
        `Transcription failed (${response.status}): ${detail.slice(0, 300)}`,
      );

      throw new Error(`Transcription failed (${response.status})`);
    }

    const json = (await response.json()) as {
      text?: string;
      language?: string;
    };

    const text = (json.text ?? '').trim();

    // gpt-4o-transcribe never returns a language: it rejects verbose_json, and
    // only whisper-1 reports one — and whisper is worse on Afghan speech. So
    // the label is inferred from the script rather than downgrading the model.
    return { text, language: json.language ?? detectAfghanLanguage(text) };
  }
}
