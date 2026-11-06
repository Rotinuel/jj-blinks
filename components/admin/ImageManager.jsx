'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { uploadFile } from '@/components/ui/Uploader';
import { imageAction } from '@/app/actions/admin/catalog';

export default function ImageManager({ productId, images }) {
  const router = useRouter();
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function upload(files, replaceImageId) {
    setError(null);
    setBusy(replaceImageId ? `Replacing…` : `Uploading ${files.length}…`);
    for (const f of files) {
      try { await uploadFile(f, { purpose: 'product', productId, replaceImageId }); }
      catch (e) { setError(`${f.name}: ${e.message}`); }
    }
    setBusy(null);
    router.refresh();
  }

  return (
    <div>
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {images.map((img, i) => (
          <li key={img.id} className="border border-line bg-white p-2 text-xs">
            <div className="relative aspect-[4/5] bg-ivory-deep"><Image src={img.url} alt={img.alt || ''} fill sizes="12rem" className="object-cover" /></div>
            {i === 0 && <p className="mt-1 text-burgundy">Main image</p>}
            <form action={imageAction} className="mt-2 flex gap-1">
              <input type="hidden" name="product_id" value={productId} /><input type="hidden" name="image_id" value={img.id} /><input type="hidden" name="op" value="alt" />
              <label className="sr-only" htmlFor={`alt-${img.id}`}>Alt text</label>
              <input id={`alt-${img.id}`} name="alt" defaultValue={img.alt || ''} placeholder="Describe the photo" className="input min-h-8 px-2 py-1 text-xs" />
              <button className="link">Save</button>
            </form>
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
              {['first', 'up', 'down'].map((op) => (
                <form key={op} action={imageAction}>
                  <input type="hidden" name="product_id" value={productId} /><input type="hidden" name="image_id" value={img.id} /><input type="hidden" name="op" value={op} />
                  <button className="link" disabled={(op !== 'down' && i === 0) || (op === 'down' && i === images.length - 1)}>{op === 'first' ? 'Make main' : op === 'up' ? 'Earlier' : 'Later'}</button>
                </form>
              ))}
              <label className="link cursor-pointer">Replace<input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && upload([e.target.files[0]], img.id)} /></label>
              <form action={imageAction} onSubmit={(e) => { if (!confirm('Delete this image?')) e.preventDefault(); }}>
                <input type="hidden" name="product_id" value={productId} /><input type="hidden" name="image_id" value={img.id} /><input type="hidden" name="op" value="delete" />
                <button className="text-danger underline">Delete</button>
              </form>
            </div>
          </li>
        ))}
      </ul>
      <label className="mt-4 inline-flex cursor-pointer items-center border border-dashed border-charcoal/40 px-4 py-3 text-sm hover:border-burgundy">
        <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="sr-only" disabled={Boolean(busy)} onChange={(e) => e.target.files?.length && upload([...e.target.files].slice(0, 10))} />
        {busy || 'Upload photos'}
      </label>
      <p className="hint mt-1">JPG, PNG or WebP. Large photos are resized in your browser before upload. Portrait (4:5) crops look best.</p>
      {error && <p className="error-text mt-2" role="alert">{error}</p>}
    </div>
  );
}
