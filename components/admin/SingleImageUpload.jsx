'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { uploadFile } from '@/components/ui/Uploader';

/** Upload/replace one image for a collection or a homepage slot. */
export default function SingleImageUpload({ fields, label = 'Upload image', hasImage }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  return (
    <div>
      <label className="link cursor-pointer text-sm">
        <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={busy}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setBusy(true); setError(null);
            try { await uploadFile(f, fields); router.refresh(); } catch (err) { setError(err.message); }
            setBusy(false);
          }} />
        {busy ? 'Uploading…' : hasImage ? 'Replace image' : label}
      </label>
      {error && <p className="error-text">{error}</p>}
    </div>
  );
}
