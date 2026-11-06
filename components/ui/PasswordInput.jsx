'use client';

import { useState } from 'react';

/** Password field with a show/hide toggle. */
export default function PasswordInput({ id, name, autoComplete = 'current-password', className = '', ...rest }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input id={id} name={name} type={visible ? 'text' : 'password'} autoComplete={autoComplete}
        autoCapitalize="none" spellCheck={false} className={`input pr-12 ${className}`} {...rest} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Hide password' : 'Show password'}
        aria-pressed={visible}
        aria-controls={id}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-muted hover:text-burgundy"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12Z" />
          <circle cx="12" cy="12" r="2.8" />
          {visible && <path d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  );
}
