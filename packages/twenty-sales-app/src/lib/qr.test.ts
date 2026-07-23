import { describe, expect, it } from 'vitest';

import { renderQrDataUrl } from './qr';

describe('renderQrDataUrl', () => {
  it('renders a token URL to a PNG data URL on-device', async () => {
    const dataUrl = await renderQrDataUrl(
      'https://crm.hamagan.com/sales/#/upload?t=abc.def.ghi',
    );

    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    // a real QR encodes to a non-trivial payload
    expect(dataUrl.length).toBeGreaterThan(200);
  });
});
