import React, { useEffect, useMemo, useRef, useState } from 'react';
import '../styles/theme.css';

// PUBLIC_INTERFACE
export default function AssigneeSelector({
  label = 'Assign users',
  placeholder = 'Type to add user emails',
  value = [],
  onChange,
  id,
  suggestions = ['me', 'alice@example.com', 'bob@example.com', 'carol@example.com'],
  ariaLabel = 'Assignee selector',
}) {
  /** Accessible multi-select for assignees with chips and remove controls. Keyboard friendly input. */
  const [query, setQuery] = useState('');
  const [focusedSuggestion, setFocusedSuggestion] = useState(0);
  const inputRef = useRef(null);

  const filtered = useMemo(() => {
    const lower = query.toLowerCase();
    return suggestions
      .filter((s) => !value.includes(s))
      .filter((s) => s.toLowerCase().includes(lower))
      .slice(0, 6);
  }, [query, suggestions, value]);

  useEffect(() => {
    setFocusedSuggestion(0);
  }, [query]);

  const add = (item) => {
    const v = (value || []).slice();
    if (!v.includes(item)) {
      const next = [...v, item];
      onChange && onChange(next);
    }
    setQuery('');
    inputRef.current && inputRef.current.focus();
  };

  const remove = (item) => {
    const next = (value || []).filter((x) => x !== item);
    onChange && onChange(next);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[focusedSuggestion]) {
        add(filtered[focusedSuggestion]);
      } else if (query.trim()) {
        add(query.trim());
      }
    } else if (e.key === 'Backspace' && !query && value.length > 0) {
      remove(value[value.length - 1]);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocusedSuggestion((i) => Math.min(i + 1, Math.max(filtered.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocusedSuggestion((i) => Math.max(i - 1, 0));
    }
  };

  return (
    <div className="assignee-selector" aria-label={ariaLabel}>
      {label && (
        <label htmlFor={id} className="assignee-label">
          {label}
        </label>
      )}
      <div className="assignee-input-wrap" role="combobox" aria-expanded={filtered.length > 0}>
        <div className="chips-wrap">
          {(value || []).map((v) => (
            <span key={v} className="chip" role="listitem" aria-label={`Assignee ${v}`} title={v}>
              <span className="chip-avatar" aria-hidden="true">
                {v
                  .split('@')[0]
                  .split('.')
                  .map((p) => p[0])
                  .join('')
                  .slice(0, 2)
                  .toUpperCase()}
              </span>
              <span className="chip-text">{v}</span>
              <button
                type="button"
                className="chip-remove"
                aria-label={`Remove ${v}`}
                onClick={() => remove(v)}
                title="Remove"
              >
                ×
              </button>
            </span>
          ))}
          <input
            id={id}
            ref={inputRef}
            className="assignee-input"
            type="text"
            placeholder={placeholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            aria-autocomplete="list"
            aria-controls={`${id}-listbox`}
            aria-activedescendant={
              filtered[focusedSuggestion] ? `${id}-opt-${focusedSuggestion}` : undefined
            }
          />
        </div>
        {filtered.length > 0 && (
          <ul className="assignee-suggestions" role="listbox" id={`${id}-listbox`}>
            {filtered.map((s, idx) => (
              <li
                key={s}
                id={`${id}-opt-${idx}`}
                role="option"
                aria-selected={idx === focusedSuggestion}
                className={`suggestion ${idx === focusedSuggestion ? 'focused' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  add(s);
                }}
              >
                <span className="chip-avatar small" aria-hidden="true">
                  {s
                    .split('@')[0]
                    .split('.')
                    .map((p) => p[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase()}
                </span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
