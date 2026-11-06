import Image from 'next/image';

/**
 * Stand-in shown wherever a real photograph has not been uploaded yet: a woven lozenge
 * pattern (a nod to stone-work and aso-oke) with an initial set large in the display face.
 * `label` is announced to screen readers; `caption` (optional) is printed small.
 */
export function Placeholder({ label = 'Photograph coming soon', mark, caption, dark = false, className = '' }) {
  const glyph = mark ?? String(label || '').trim().charAt(0);
  return (
    <div role="img" aria-label={label} className={`placeholder ${dark ? 'woven-dark text-gold' : 'woven-light text-wine'} ${className}`}>
      {glyph && (
        <span aria-hidden="true" className="placeholder-mark font-display italic leading-none">
          {glyph}
        </span>
      )}
      {caption && <span className="absolute inset-x-0 bottom-5 px-4 text-center text-[11px] tracking-wide opacity-75">{caption}</span>}
    </div>
  );
}

/** Fills its (positioned, sized) parent. Falls back to the designed placeholder. */
export function Photo({ src, alt = '', sizes = '100vw', priority = false, className = '', placeholderLabel, placeholderMark, placeholderCaption, dark }) {
  if (!src) return <Placeholder label={placeholderLabel || alt || undefined} mark={placeholderMark} caption={placeholderCaption} dark={dark} />;
  return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} className={`object-cover ${className}`} />;
}
