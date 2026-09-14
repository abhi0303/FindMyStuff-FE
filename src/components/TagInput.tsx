import { useState, type KeyboardEvent } from 'react';
import { Chip } from './ui/Feedback';

interface Props {
  label: string;
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  hint?: string;
  suggestions?: string[];
}

/** Free text in, a clean list out. Enter or comma commits; the server lowercases too. */
export function TagInput({ label, value, onChange, placeholder, hint, suggestions }: Props) {
  const [draft, setDraft] = useState('');

  const commit = (raw: string) => {
    const cleaned = raw.trim().toLowerCase().replace(/,$/, '');
    if (!cleaned || value.includes(cleaned)) {
      setDraft('');
      return;
    }
    onChange([...value, cleaned]);
    setDraft('');
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(draft);
    } else if (e.key === 'Backspace' && !draft && value.length) {
      onChange(value.slice(0, -1));
    }
  };

  const unused = suggestions?.filter((s) => !value.includes(s)) ?? [];

  return (
    <div className="field">
      <span className="field-label">{label} <span className="field-optional">· optional</span></span>

      {value.length > 0 && (
        <div className="row wrap gap-2" style={{ marginBottom: 4 }}>
          {value.map((tag) => (
            <Chip key={tag} onRemove={() => onChange(value.filter((t) => t !== tag))}>{tag}</Chip>
          ))}
        </div>
      )}

      <input
        className="input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit(draft)}
        placeholder={placeholder}
        aria-label={label}
      />

      {unused.length > 0 && (
        <div className="row wrap gap-2" style={{ marginTop: 4 }}>
          {unused.slice(0, 6).map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="chip"
              style={{ cursor: 'pointer', borderColor: 'var(--border-strong)' }}
              onClick={() => commit(suggestion)}
            >
              + {suggestion}
            </button>
          ))}
        </div>
      )}

      {hint && <span className="field-hint">{hint}</span>}
    </div>
  );
}
