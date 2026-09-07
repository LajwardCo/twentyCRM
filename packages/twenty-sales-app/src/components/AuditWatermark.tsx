import { useEffect, useState } from 'react';

import type { CurrentUser } from '../api/auth';

// Screenshots cannot be detected on a phone -- there is no API, and the
// operating system never tells the page. So instead of pretending to catch
// them, make every one of them carry the name of whoever took it.
//
// A tiled, low-contrast overlay of the viewer's name, email and the current
// time survives any capture path a person actually uses: the side-button
// screenshot, a photo of the screen with another phone, a screen recording, a
// print-to-PDF. It is `pointer-events: none` so it changes nothing about using
// the app, and it re-stamps the time every minute so a leaked image says when.
//
// This is the deterrent half of the audit feature. lib/screenCapture.ts is the
// detection half, and it is the weaker one.

type AuditWatermarkProps = {
  user: CurrentUser;
  // Whether this screen is worth marking. Off by default on ordinary screens
  // so the app does not look like a hostage negotiation; on wherever customer
  // contact details, money, or the audit trail itself is on screen.
  active: boolean;
};

const stamp = (user: CurrentUser): string => {
  const name = `${user.firstName} ${user.lastName}`.trim() || user.userEmail;
  const time = new Date().toLocaleString('fa-IR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
  return `${name} · ${user.userEmail} · ${time}`;
};

export const AuditWatermark = ({ user, active }: AuditWatermarkProps) => {
  const [text, setText] = useState(() => stamp(user));

  useEffect(() => {
    if (!active) return;
    setText(stamp(user));
    const timer = window.setInterval(() => setText(stamp(user)), 60000);
    return () => window.clearInterval(timer);
  }, [active, user]);

  if (!active) return null;

  return (
    <div className="audit-watermark" aria-hidden="true">
      {Array.from({ length: 14 }, (_, row) => (
        <div className="audit-watermark-row" key={row}>
          <span>{text}</span>
          <span>{text}</span>
          <span>{text}</span>
        </div>
      ))}
    </div>
  );
};
