import { useEffect, useState } from 'react';

import {
  fetchWhatsappTemplates,
  sendWhatsappMessage,
  type WhatsappTemplate,
} from '../api/whatsapp';

type WhatsAppModalProps = {
  personId: string;
  opportunityId: string;
  onClose: () => void;
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 18, 24, 0.5)',
  zIndex: 50,
  display: 'flex',
  alignItems: 'flex-end',
  justifyContent: 'center',
};

const sheetStyle: React.CSSProperties = {
  background: 'var(--color-surface)',
  borderRadius: '16px 16px 0 0',
  width: '100%',
  maxWidth: 720,
  maxHeight: '85dvh',
  overflowY: 'auto',
  padding: '18px 16px calc(18px + var(--safe-bottom))',
};

export const WhatsAppModal = ({
  personId,
  opportunityId,
  onClose,
}: WhatsAppModalProps) => {
  const [mode, setMode] = useState<'text' | 'template'>('text');
  const [text, setText] = useState('');
  const [templates, setTemplates] = useState<WhatsappTemplate[] | null>(null);
  const [templateName, setTemplateName] = useState('');
  const [templateParams, setTemplateParams] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    fetchWhatsappTemplates()
      .then(setTemplates)
      .catch(() => setTemplates([]));
  }, []);

  const selectedTemplate = templates?.find((t) => t.name === templateName);

  const handleSend = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await sendWhatsappMessage({
        personId,
        opportunityId,
        ...(mode === 'text'
          ? { text }
          : {
              templateName,
              templateLanguage: selectedTemplate?.language,
              templateBodyParams: templateParams,
            }),
      });
      if (!result.success) {
        setError(result.error ?? 'Send failed');
      } else {
        setSent(true);
        setTimeout(onClose, 1200);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={overlayStyle} onClick={onClose}>
      <div style={sheetStyle} onClick={(e) => e.stopPropagation()}>
        <div className="section-head" style={{ marginTop: 0 }}>
          <h2>Send WhatsApp</h2>
          <button className="btn ghost small" onClick={onClose}>
            Close
          </button>
        </div>

        <div className="segmented" style={{ marginBottom: 14 }}>
          <button
            className={mode === 'text' ? 'selected' : ''}
            onClick={() => setMode('text')}
          >
            Free text
          </button>
          <button
            className={mode === 'template' ? 'selected' : ''}
            onClick={() => setMode('template')}
          >
            Template
          </button>
        </div>

        {mode === 'text' ? (
          <div className="field">
            <label htmlFor="wa-text">Message</label>
            <textarea
              id="wa-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Free text only works inside a 24h conversation window; otherwise use a template."
            />
          </div>
        ) : (
          <>
            <div className="field">
              <label htmlFor="wa-template">Template</label>
              <select
                id="wa-template"
                value={templateName}
                onChange={(e) => {
                  setTemplateName(e.target.value);
                  const tpl = templates?.find(
                    (t) => t.name === e.target.value,
                  );
                  setTemplateParams(
                    Array.from({ length: tpl?.variableCount ?? 0 }, () => ''),
                  );
                }}
              >
                <option value="">Select a template…</option>
                {templates?.map((t) => (
                  <option key={`${t.name}-${t.language}`} value={t.name}>
                    {t.name} ({t.language})
                  </option>
                ))}
              </select>
            </div>
            {selectedTemplate && (
              <div className="muted" style={{ marginBottom: 12 }}>
                {selectedTemplate.bodyText}
              </div>
            )}
            {templateParams.map((value, index) => (
              <div className="field" key={index}>
                <label>{`Variable {{${index + 1}}}`}</label>
                <input
                  value={value}
                  onChange={(e) =>
                    setTemplateParams((prev) =>
                      prev.map((v, i) => (i === index ? e.target.value : v)),
                    )
                  }
                />
              </div>
            ))}
          </>
        )}

        {error !== null && <div className="error-banner">{error}</div>}

        <button
          className="btn block"
          disabled={
            busy ||
            sent ||
            (mode === 'text' ? text.trim() === '' : templateName === '')
          }
          onClick={handleSend}
        >
          {sent ? 'Sent ✓' : busy ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
};
