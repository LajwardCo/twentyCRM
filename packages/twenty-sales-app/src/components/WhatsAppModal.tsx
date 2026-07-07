import { useEffect, useState } from 'react';

import {
  fetchWhatsappTemplates,
  sendWhatsappMessage,
  type WhatsappTemplate,
} from '../api/whatsapp';
import { toPersianDigits } from '../lib/jalali';
import { T } from '../lib/strings';

type WhatsAppModalProps = {
  personId: string;
  opportunityId?: string;
  onClose: () => void;
};

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
  maxWidth: 620,
  maxHeight: '85dvh',
  overflowY: 'auto',
  padding: '18px 18px calc(18px + var(--safe-bottom))',
  animation: 'rise-in .3s both',
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
        ...(opportunityId ? { opportunityId } : {}),
        ...(mode === 'text'
          ? { text }
          : {
              templateName,
              templateLanguage: selectedTemplate?.language,
              templateBodyParams: templateParams,
            }),
      });
      if (!result.success) {
        setError(result.error ?? T.sendFailed);
      } else {
        setSent(true);
        setTimeout(onClose, 1100);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : T.sendFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
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
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 750 }}>{T.sendWhatsapp}</h3>
          <button className="btn line sm" onClick={onClose}>
            {T.close}
          </button>
        </div>

        <div className="tab-row" style={{ marginBottom: 14, width: '100%' }}>
          <button
            className={mode === 'text' ? 'on' : ''}
            style={{ flex: 1 }}
            onClick={() => setMode('text')}
          >
            {T.freeText}
          </button>
          <button
            className={mode === 'template' ? 'on' : ''}
            style={{ flex: 1 }}
            onClick={() => setMode('template')}
          >
            {T.template}
          </button>
        </div>

        {mode === 'text' ? (
          <div className="fld">
            <label htmlFor="wa-text">{T.message}</label>
            <textarea
              id="wa-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={T.freeTextHint}
            />
          </div>
        ) : (
          <>
            <div className="fld">
              <label htmlFor="wa-template">{T.template}</label>
              <select
                id="wa-template"
                value={templateName}
                onChange={(e) => {
                  setTemplateName(e.target.value);
                  const tpl = templates?.find((t) => t.name === e.target.value);
                  setTemplateParams(
                    Array.from({ length: tpl?.variableCount ?? 0 }, () => ''),
                  );
                }}
              >
                <option value="">{T.selectTemplate}</option>
                {templates?.map((t) => (
                  <option key={`${t.name}-${t.language}`} value={t.name}>
                    {t.name} ({t.language})
                  </option>
                ))}
              </select>
            </div>
            {selectedTemplate && (
              <div className="sub" style={{ marginBottom: 12, color: 'var(--ink-3)' }}>
                {selectedTemplate.bodyText}
              </div>
            )}
            {templateParams.map((value, index) => (
              <div className="fld" key={index}>
                <label>{`${T.variable} ${toPersianDigits(index + 1)}`}</label>
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
          className="btn gold block"
          disabled={
            busy || sent || (mode === 'text' ? text.trim() === '' : templateName === '')
          }
          onClick={handleSend}
          style={{ padding: 12 }}
        >
          {sent ? T.sent : busy ? T.sending : T.send}
        </button>
      </div>
    </div>
  );
};
