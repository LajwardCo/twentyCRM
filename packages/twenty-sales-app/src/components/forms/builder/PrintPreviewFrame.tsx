import { useEffect, useRef, useState } from 'react';

import { TB } from '../../../lib/forms/builderStrings';

// A4 at 96 dpi.
const A4_WIDTH_PX = 794;
const MIN_HEIGHT_PX = 1123;

type PrintPreviewFrameProps = {
  formId: string;
  version: string;
};

// Embeds the print document (built by the print view) at true A4 width and
// scales it down to fit narrow screens. Same origin, so the frame's content
// height can be read to avoid a scrollbar inside a scrollbar.
export const PrintPreviewFrame = ({ formId, version }: PrintPreviewFrameProps) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(MIN_HEIGHT_PX);
  const [loads, setLoads] = useState(0);
  const src = `${window.location.pathname}#/form/${formId}/print?version=${encodeURIComponent(version)}&embed=1`;

  useEffect(() => {
    const wrap = wrapRef.current;

    if (wrap === null) return;

    const fit = () => setScale(Math.min(1, wrap.clientWidth / A4_WIDTH_PX));
    const observer = new ResizeObserver(fit);

    fit();
    observer.observe(wrap);

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    // The print view renders asynchronously after each load; poll its height
    // for a little while instead of guessing.
    const timer = window.setInterval(() => {
      try {
        const document = frameRef.current?.contentDocument;
        const measured = document?.documentElement.scrollHeight ?? 0;

        if (measured > 0) setHeight(Math.max(MIN_HEIGHT_PX, measured));
      } catch {
        // Cross-origin would throw; the fixed minimum height then applies.
      }
    }, 800);
    const stop = window.setTimeout(() => window.clearInterval(timer), 20000);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(stop);
    };
  }, [src, loads]);

  return (
    <div className="svb-print-wrap" ref={wrapRef}>
      <div className="svb-print-scaler" style={{ height: height * scale }}>
        <iframe
          ref={frameRef}
          key={src}
          src={src}
          title={TB.printFrameTitle}
          className="svb-print-frame"
          onLoad={() => setLoads((count) => count + 1)}
          style={{ width: A4_WIDTH_PX, height, transform: `scale(${scale})` }}
        />
      </div>
      <a className="btn line sm" href={src.replace('&embed=1', '')} target="_blank" rel="noopener">
        {TB.openPrint}
      </a>
    </div>
  );
};
