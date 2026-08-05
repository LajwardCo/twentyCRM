import { type ReactNode } from 'react';

import { T } from '../lib/strings';

// The bottom sheet every modal in the app uses. Extracted from QuickTaskModal
// so a new dialog inherits the same geometry, safe-area padding and dismiss
// behaviour instead of re-deriving them.

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(8, 23, 55, 0.55)',
  zIndex: 60,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
  animation: 'fade-in .2s both',
};

const sheetStyle: React.CSSProperties = {
  background: 'var(--card)',
  borderRadius: '18px 18px 0 0',
  width: '100%',
  maxWidth: 480,
  maxHeight: '85dvh',
  overflowY: 'auto',
  padding: '18px 18px calc(18px + var(--safe-bottom))',
  animation: 'rise-in .3s both',
};

type ModalSheetProps = {
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export const ModalSheet = ({ title, onClose, children }: ModalSheetProps) => (
  <div style={overlayStyle} onClick={onClose}>
    <div style={sheetStyle} onClick={(e) => e.stopPropagation()}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 750 }}>{title}</h3>
        <button className="btn line sm" onClick={onClose}>
          {T.close}
        </button>
      </div>
      {children}
    </div>
  </div>
);
