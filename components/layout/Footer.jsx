import Link from 'next/link';
import { getNavCategories, getStoreContext } from '@/lib/storefront';
import { whatsappLink } from '@/lib/utilities';
import { FX_ATTRIBUTION } from '@/lib/currency';
import NewsletterForm from '@/components/storefront/NewsletterForm';

const SOCIAL_LABELS = { instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok', x: 'X', youtube: 'YouTube' };

export default async function Footer() {
  const [{ settings, fx }, collections] = await Promise.all([getStoreContext(), getNavCategories()]);
  const s = settings.store;
  const socials = Object.entries(settings.social).filter(([, url]) => url && /^https:\/\//.test(url));
  const wa = whatsappLink(s.whatsapp, 'Hello JJ BLINKS, I have a question.');
  const nl = settings.home.newsletter;
  return (
    <footer className="mt-24 bg-burgundy text-ivory/85">
      {nl.enabled && (
        <section className="border-b border-ivory/10">
          <div className="wrap mx-auto max-w-2xl py-14 text-center">
            <h2 className="font-display text-3xl text-ivory sm:text-4xl">{nl.heading}</h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-ivory/75">{nl.text}</p>
            <div className="mx-auto mt-6 max-w-lg text-left"><NewsletterForm /></div>
          </div>
        </section>
      )}
      <div className="wrap grid gap-10 py-14 text-sm sm:grid-cols-2 lg:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <p className="font-display text-2xl tracking-[0.24em] text-ivory">JJ BLINKS</p>
          <address className="mt-4 not-italic leading-7">
            {s.address}<br />
            <a href={`tel:${s.phone.replace(/\s/g, '')}`} className="hover:text-gold">{s.phone}</a>
            {s.phone_alt && <> · <a href={`tel:${s.phone_alt.replace(/\s/g, '')}`} className="hover:text-gold">{s.phone_alt}</a></>}<br />
            <a href={`mailto:${s.email}`} className="hover:text-gold">{s.email}</a>
          </address>
          {wa && <a href={wa} className="mt-4 inline-block border-b border-gold pb-0.5 text-ivory hover:text-gold" target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a>}
        </div>
        <nav aria-label="Collections">
          <p className="mb-3 text-ivory">Collections</p>
          <ul className="space-y-2">
            {collections.map((c) => <li key={c.slug}><Link href={`/collections/${c.slug}`} className="hover:text-gold">{c.name}</Link></li>)}
          </ul>
        </nav>
        <nav aria-label="Customer care">
          <p className="mb-3 text-ivory">Customer care</p>
          <ul className="space-y-2">
            <li><Link href="/track" className="hover:text-gold">Track an order</Link></li>
            <li><Link href="/shipping" className="hover:text-gold">Shipping & customs</Link></li>
            <li><Link href="/returns" className="hover:text-gold">Returns</Link></li>
            <li><Link href="/faqs" className="hover:text-gold">FAQs</Link></li>
            <li><Link href="/contact" className="hover:text-gold">Contact</Link></li>
          </ul>
        </nav>
        <nav aria-label="Company">
          <p className="mb-3 text-ivory">JJ BLINKS</p>
          <ul className="space-y-2">
            <li><Link href="/about" className="hover:text-gold">About</Link></li>
            <li><Link href="/custom-orders" className="hover:text-gold">Custom orders</Link></li>
            <li><Link href="/bulk-orders" className="hover:text-gold">Bulk & corporate</Link></li>
            <li><Link href="/privacy" className="hover:text-gold">Privacy</Link></li>
            <li><Link href="/terms" className="hover:text-gold">Terms</Link></li>
          </ul>
          {socials.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-4">
              {socials.map(([k, url]) => (
                <li key={k}><a href={url} target="_blank" rel="noopener noreferrer" className="hover:text-gold">{SOCIAL_LABELS[k] || k}</a></li>
              ))}
            </ul>
          )}
        </nav>
      </div>
      <div className="wrap flex flex-wrap justify-between gap-3 border-t border-ivory/10 py-6 text-xs text-ivory/55">
        <p>© {new Date().getFullYear()} JJ BLINKS. Prices in Nigerian naira (NGN).</p>
        {fx?.source === 'open.er-api.com' && (
          <p>Converted prices are indicative. <a href={FX_ATTRIBUTION.href} className="underline" target="_blank" rel="noopener noreferrer">{FX_ATTRIBUTION.label}</a></p>
        )}
      </div>
    </footer>
  );
}
