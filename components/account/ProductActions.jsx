'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { submitReviewAction, toggleWishlistAction } from '@/app/actions/account';

function Pending({ children, pendingText, className }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending}>{pending ? pendingText : children}</button>;
}

export function WishlistButton({ productId, slug, signedIn, wished }) {
  if (!signedIn) {
    return <Link href={`/login?next=${encodeURIComponent(`/products/${slug}`)}`} className="link text-sm">Sign in to save to your wishlist</Link>;
  }
  return (
    <form action={toggleWishlistAction}>
      <input type="hidden" name="productId" value={productId} />
      <input type="hidden" name="slug" value={slug} />
      <Pending className="link text-sm" pendingText="Saving…">{wished ? 'Saved to your wishlist — remove' : 'Save to wishlist'}</Pending>
    </form>
  );
}

export function ReviewForm({ productId, slug, signedIn, purchased }) {
  const [state, action] = useActionState(submitReviewAction, null);
  if (!signedIn) return <p className="text-sm"><Link className="link" href={`/login?next=${encodeURIComponent(`/products/${slug}#reviews`)}`}>Sign in</Link> to review a piece you bought.</p>;
  if (!purchased) return <p className="text-sm text-muted">You can review this piece after buying it.</p>;
  if (state?.ok) return <p className="notice notice-ok" role="status">{state.message}</p>;
  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="productId" value={productId} />
      <fieldset>
        <legend className="label mb-2">Rating</legend>
        <div className="flex gap-3">
          {[5, 4, 3, 2, 1].map((n) => (
            <label key={n} className="flex items-center gap-1 text-sm">
              <input type="radio" name="rating" value={n} required className="accent-burgundy" /> {n}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="field">
        <label className="label" htmlFor="rv-title">Title (optional)</label>
        <input id="rv-title" name="title" maxLength={120} className="input" />
      </div>
      <div className="field">
        <label className="label" htmlFor="rv-body">Your review</label>
        <textarea id="rv-body" name="body" required minLength={10} maxLength={2000} className="input" />
      </div>
      {state && !state.ok && <p className="error-text" role="alert">{state.message}</p>}
      <Pending className="btn btn-primary btn-sm justify-self-start" pendingText="Sending…">Submit review</Pending>
    </form>
  );
}
