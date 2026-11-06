'use client';

import { useId, useMemo, useRef, useState } from 'react';

/** Accessible, searchable country picker (ARIA combobox + listbox). */
export default function CountryCombobox({ countries, value, onChange, error, label = 'Country' }) {
  const id = useId();
  const listId = `${id}-list`;
  const selected = countries.find((c) => c.code === value);
  const [text, setText] = useState(selected?.name || '');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef(null);

  const matches = useMemo(() => {
    const t = text.trim().toLowerCase();
    if (!t || t === selected?.name.toLowerCase()) return countries;
    return countries.filter((c) => c.name.toLowerCase().includes(t) || c.code.toLowerCase() === t);
  }, [text, countries, selected]);

  function choose(c) {
    onChange(c.code);
    setText(c.name);
    setOpen(false);
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, matches.length - 1)); scroll(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); scroll(active - 1); }
    else if (e.key === 'Enter' && open && matches[active]) { e.preventDefault(); choose(matches[active]); }
    else if (e.key === 'Escape') { setOpen(false); setText(selected?.name || ''); }
  }
  function scroll(i) {
    listRef.current?.children[Math.max(0, i)]?.scrollIntoView({ block: 'nearest' });
  }

  return (
    <div className="field relative">
      <label className="label" htmlFor={id}>{label}</label>
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${id}-${matches[active].code}` : undefined}
        aria-invalid={Boolean(error)}
        autoComplete="country-name"
        className="input"
        value={text}
        onChange={(e) => { setText(e.target.value); setOpen(true); setActive(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => { setOpen(false); setText(selected?.name || ''); }, 150)}
        onKeyDown={onKeyDown}
      />
      {open && (
        <ul id={listId} ref={listRef} role="listbox" className="absolute left-0 right-0 top-full z-20 max-h-64 overflow-y-auto border border-line bg-white shadow-lg">
          {matches.length ? matches.map((c, i) => (
            <li
              key={c.code}
              id={`${id}-${c.code}`}
              role="option"
              aria-selected={c.code === value}
              onMouseDown={(e) => { e.preventDefault(); choose(c); }}
              className={`cursor-pointer px-3 py-2 text-sm ${i === active ? 'bg-ivory-deep' : ''} ${c.code === value ? 'font-medium text-burgundy' : ''}`}
            >
              {c.name}
            </li>
          )) : <li className="px-3 py-2 text-sm text-muted">No matching country</li>}
        </ul>
      )}
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
