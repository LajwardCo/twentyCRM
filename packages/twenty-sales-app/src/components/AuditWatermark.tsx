import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

import type { CurrentUser } from '../api/auth';

// Screenshots cannot be detected on a phone -- there is no API, and the
// operating system never tells the page. So instead of pretending to catch
// them, make every one of them carry the name of whoever took it.
//
// The mark is deliberately BELOW the threshold of human vision: each glyph
// shifts the pixels under it by 2 of 255 steps (0.8%, about 0.7 of a CIELAB
// L* step on white), which nobody sees on a phone but which survives every
// digital capture path a person actually uses -- the side-button screenshot,
// a screen recording, print-to-PDF, and a WhatsApp re-compression on top of
// any of them. One Levels pull in an image editor brings the name back;
// tools/sales-crm/reveal-watermark.html does that pull for you, and
// tools/sales-crm/verify-watermark.mjs measures the shift if anyone retunes it.
//
// It is `pointer-events: none` so it changes nothing about using the app, and
// it re-stamps the time every minute so a leaked image says when.
//
// The one capture path it does NOT reliably survive is a photo of the screen
// taken with another camera: sensor noise is larger than the mark. Photo mode
// in the reveal tool averages that noise down and sometimes wins, but do not
// count on it. Glyphs are large and heavy for the same reason -- fat strokes
// are low-frequency, and low frequencies are what a lossy re-encode keeps.
//
// This is the deterrent half of the audit feature. lib/screenCapture.ts is the
// detection half, and it is the weaker one.

type AuditWatermarkProps = {
  user: CurrentUser;
  // Whether this screen is worth marking. Off by default on ordinary screens
  // so we are not blending a full-screen layer on every scroll; on wherever
  // customer contact details, money, or the audit trail itself is on screen.
  active: boolean;
};

const ROWS = 7;
const COLUMNS = 2;

// Three short lines rather than one long one: a single line of
// name-email-timestamp is wider than a phone, so the clock -- the half that
// says *when* something leaked -- ends up cropped off the edge of every tile.
const stamp = (user: CurrentUser): string[] => {
  const name = `${user.firstName} ${user.lastName}`.trim() || user.userEmail;
  const time = new Date().toLocaleString('fa-IR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return [name, user.userEmail, time];
};

export const AuditWatermark = ({ user, active }: AuditWatermarkProps) => {
  const [lines, setLines] = useState(() => stamp(user));

  useEffect(() => {
    if (!active) return;
    setLines(stamp(user));
    const timer = window.setInterval(() => setLines(stamp(user)), 60000);
    return () => window.clearInterval(timer);
  }, [active, user]);

  if (!active) return null;

  // Rendered into <body> rather than in place: `mix-blend-mode` only blends
  // against the backdrop of its own stacking context, and any ancestor with a
  // transform, filter or opacity would silently cut the overlay off from the
  // page underneath it. Measured in Chromium: under an ancestor with `opacity`
  // the same markup paints the text at 253/255 -- plainly, embarrassingly
  // visible -- instead of shifting it by 2. The body is the one parent that
  // cannot introduce that.
  return createPortal(
    <div className="audit-watermark" aria-hidden="true">
      {Array.from({ length: ROWS }, (_, row) => (
        <div className="audit-watermark-row" key={row}>
          {Array.from({ length: COLUMNS }, (_, column) => (
            <div className="audit-watermark-tile" key={column}>
              {lines.map((line) => (
                <div key={line}>{line}</div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>,
    document.body,
  );
};
