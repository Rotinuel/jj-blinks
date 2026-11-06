'use client';

import { useRef, useState } from 'react';

const MAX_EDGE = 2400;
const TARGET_BYTES = 1.5 * 1024 * 1024;

/** Downscale large photos in the browser before upload (keeps requests well under 4 MB). */
export async function prepareFile(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, MAX_EDGE / Math.max(bmp.width, bmp.height));
    if (scale === 1 && file.size <= TARGET_BYTES) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * scale);
    canvas.height = Math.round(bmp.height * scale);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.86));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.webp', { type: 'image/webp' }) : file;
  } catch {
    return file;
  }
}

export async function uploadFile(file, fields) {
  const fd = new FormData();
  fd.set('file', await prepareFile(file));
  for (const [k, v] of Object.entries(fields)) if (v !== undefined && v !== null) fd.set(k, String(v));
  const res = await fetch('/api/uploads', { method: 'POST', body: fd });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Upload failed.');
  return data;
}

/**
 * Multi-file uploader for public forms. Calls onChange with [{ id, url, name, type }].
 */
export default function Uploader({ purpose, label, hint, max = 5, accept = 'image/jpeg,image/png,image/webp', value, onChange }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function onFiles(list) {
    setError(null);
    const files = [...list].slice(0, Math.max(0, max - value.length));
    if (!files.length) return;
    setBusy(true);
    const added = [];
    for (const f of files) {
      try {
        const r = await uploadFile(f, { purpose });
        added.push({ id: r.id, url: r.url, name: f.name, type: f.type });
      } catch (e) {
        setError(`${f.name}: ${e.message}`);
      }
    }
    onChange([...value, ...added]);
    setBusy(false);
    if (input.current) input.current.value = '';
  }

  return (
    <div className="field">
      <span className="label">{label}</span>
      {hint && <span className="hint">{hint}</span>}
      {value.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-3">
          {value.map((f) => (
            <li key={f.id} className="relative">
              {f.type === 'application/pdf' ? (
                <span className="flex h-20 w-20 items-center justify-center border border-line bg-white text-xs">PDF</span>
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f.url} alt={f.name} className="h-20 w-20 object-cover" />
              )}
              <button type="button" className="absolute -right-2 -top-2 h-6 w-6 bg-charcoal text-xs text-ivory" aria-label={`Remove ${f.name}`}
                onClick={() => onChange(value.filter((x) => x.id !== f.id))}>×</button>
            </li>
          ))}
        </ul>
      )}
      {value.length < max && (
        <label className="mt-2 inline-flex cursor-pointer items-center gap-3 border border-dashed border-charcoal/40 px-4 py-3 text-sm hover:border-burgundy">
          <input ref={input} type="file" accept={accept} multiple={max > 1} className="sr-only" disabled={busy} onChange={(e) => onFiles(e.target.files)} />
          {busy ? 'Uploading…' : `Add files (${value.length}/${max})`}
        </label>
      )}
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}
