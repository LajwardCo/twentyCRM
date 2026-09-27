import { useEffect, useRef, useState } from 'react';

import {
  searchAttachments,
  type AttachmentCandidate,
} from '../api/assistantAttachments';
import {
  ATTACHMENT_KINDS,
  attachmentKey,
  type AttachmentKind,
  type ChatAttachment,
} from '../lib/assistantContext';
import { ATTACHMENT_KIND_LABELS, TAI } from '../lib/assistantStrings';
import { IconCheck, IconSearch } from './icons';
import { ModalSheet } from './ModalSheet';

type AssistantAttachPickerProps = {
  selected: ChatAttachment[];
  onToggle: (attachment: ChatAttachment) => void;
  onClose: () => void;
};

const MIN_QUERY_LENGTH = 2;

// Search one record type at a time and tick as many as needed; the sheet
// stays open so a lead and its survey can be picked in one go.
export const AssistantAttachPicker = ({
  selected,
  onToggle,
  onClose,
}: AssistantAttachPickerProps) => {
  const [kind, setKind] = useState<AttachmentKind>('lead');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<AttachmentCandidate[]>([]);
  const [searching, setSearching] = useState(false);
  const requestSeq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [kind]);

  useEffect(() => {
    const trimmed = query.trim();
    const seq = ++requestSeq.current;

    if (trimmed.length < MIN_QUERY_LENGTH) {
      setResults([]);
      setSearching(false);
      return;
    }

    setSearching(true);
    const timer = window.setTimeout(() => {
      searchAttachments(kind, trimmed)
        .catch(() => [] as AttachmentCandidate[])
        .then((found) => {
          if (seq !== requestSeq.current) return;
          setResults(found);
          setSearching(false);
        });
    }, 250);

    return () => window.clearTimeout(timer);
  }, [kind, query]);

  const selectedKeys = new Set(selected.map(attachmentKey));

  return (
    <ModalSheet title={TAI.pickerTitle} onClose={onClose}>
      <div className="seg ai-kind-seg">
        {ATTACHMENT_KINDS.map((option) => (
          <button
            key={option}
            className={kind === option ? 'on' : ''}
            onClick={() => setKind(option)}
          >
            {ATTACHMENT_KIND_LABELS[option]}
          </button>
        ))}
      </div>

      <div className="cmd-search ai-picker-search">
        <span className="s-ico">
          <IconSearch size={16} />
        </span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder={TAI.pickerSearch}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="ai-picker-list">
        {query.trim().length < MIN_QUERY_LENGTH ? (
          <div className="ai-picker-note">{TAI.pickerHint}</div>
        ) : searching ? (
          <div className="ai-picker-note">{TAI.pickerSearching}</div>
        ) : results.length === 0 ? (
          <div className="ai-picker-note">{TAI.pickerEmpty}</div>
        ) : (
          results.map((candidate) => {
            const isSelected = selectedKeys.has(attachmentKey(candidate));
            return (
              <button
                key={attachmentKey(candidate)}
                className={`ai-picker-row${isSelected ? ' on' : ''}`}
                onClick={() =>
                  onToggle({
                    kind: candidate.kind,
                    id: candidate.id,
                    label: candidate.label,
                  })
                }
              >
                <span className="ai-picker-check">
                  {isSelected && <IconCheck size={13} />}
                </span>
                <span className="ai-picker-text">
                  <b>{candidate.label}</b>
                  {candidate.hint && <small>{candidate.hint}</small>}
                </span>
              </button>
            );
          })
        )}
      </div>

      {selected.length > 0 && (
        <div className="ai-picker-selected">
          {TAI.pickerSelected}:{' '}
          {selected
            .map((item) => `${ATTACHMENT_KIND_LABELS[item.kind]} «${item.label}»`)
            .join('، ')}
        </div>
      )}

      <button className="btn" style={{ width: '100%', marginTop: 12 }} onClick={onClose}>
        {TAI.pickerDone}
      </button>
    </ModalSheet>
  );
};
