import QRCode from 'qrcode';

// Renders a QR code to a PNG data URL entirely on-device. We deliberately do
// NOT use any hosted QR-image API — that would send the upload token to a third
// party. High error-correction so a phone camera reads it even at a glance.
export const renderQrDataUrl = (text: string): Promise<string> =>
  QRCode.toDataURL(text, {
    errorCorrectionLevel: 'M',
    margin: 2,
    width: 260,
    color: { dark: '#0b1f4d', light: '#ffffff' },
  });
