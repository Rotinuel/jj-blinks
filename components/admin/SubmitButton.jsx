'use client';

import { useFormStatus } from 'react-dom';

export default function SubmitButton({ children, pendingText = 'Saving…', className = 'btn btn-primary', confirm }) {
  const { pending } = useFormStatus();
  return (
    <button
      className={className}
      disabled={pending}
      onClick={(e) => { if (confirm && !window.confirm(confirm)) e.preventDefault(); }}
    >
      {pending ? pendingText : children}
    </button>
  );
}
