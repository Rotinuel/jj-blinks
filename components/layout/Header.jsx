import Link from 'next/link';
import { getNavCategories, getStoreContext } from '@/lib/storefront';
import { DISPLAY_CURRENCIES } from '@/lib/currency';
import { getCurrentUser } from '@/lib/auth';
import { BagLink, CategoriesMenu, CurrencySelect, MobileMenu } from './HeaderClient';
import { HeartIcon, SearchIcon, UserIcon } from '@/components/ui/icons';
import CollectionLinks from './CollectionLinks';

const LINKS = [
  { href: '/shop', label: 'Shop' },
  { href: '/new-arrivals', label: 'New in' },
  { href: '/custom-orders', label: 'Custom orders' },
  { href: '/bulk-orders', label: 'Bulk & corporate' },
  { href: '/about', label: 'About' },
];

function SearchBar({ id, className = '' }) {
  return (
    <form action="/search" method="get" role="search" className={`relative ${className}`}>
      <label htmlFor={id} className="sr-only">Search JJ BLINKS</label>
      <input
        id={id}
        name="q"
        type="search"
        placeholder="Search autogele, turbans, caps…"
        className="h-11 w-full rounded-full border-2 border-charcoal/80 bg-white pl-5 pr-14 text-[0.95rem] placeholder:text-muted focus:border-burgundy focus:outline-none"
      />
      <button type="submit" aria-label="Search" className="absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-full bg-burgundy text-ivory hover:bg-wine">
        <SearchIcon />
      </button>
    </form>
  );
}

export default async function Header() {
  const [{ settings, currency, fxEnabled }, collections, user] = await Promise.all([
    getStoreContext(),
    getNavCategories(),
    getCurrentUser(),
  ]);
  const a = settings.announcement;
  return (
    <>
      {a.enabled && a.text && (
        <div className="bg-burgundy text-ivory">
          <p className="wrap py-2 text-center text-[0.82rem]">
            {a.link ? <Link href={a.link} className="hover:underline">{a.text}</Link> : a.text}
          </p>
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-line bg-white">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-2 focus:bg-white focus:px-3 focus:py-2">
          Skip to content
        </a>
        <div className="wrap flex items-center gap-3 py-3 sm:gap-5">
          <MobileMenu links={LINKS} collections={collections} />
          <Link href="/" className="shrink-0 font-display text-[1.45rem] leading-none tracking-[0.18em] text-burgundy sm:text-[1.7rem]" aria-label="JJ BLINKS home">
            JJ BLINKS
          </Link>
          <CategoriesMenu collections={collections} />
          <SearchBar id="site-search" className="hidden flex-1 md:block" />
          <div className="ml-auto flex items-center gap-1 sm:gap-2 md:ml-0">
            <CurrencySelect currency={currency} currencies={DISPLAY_CURRENCIES} enabled={fxEnabled} />
            <Link href={user ? '/account' : '/login'} className="hidden items-center gap-1.5 rounded-full px-3 py-2 text-sm hover:bg-ivory-deep sm:inline-flex">
              <UserIcon /> <span>{user ? user.name.split(' ')[0] : 'Sign in'}</span>
            </Link>
            <Link href={user ? '/account/wishlist' : '/login?next=/account/wishlist'} aria-label="Wishlist" className="grid h-10 w-10 place-items-center rounded-full hover:bg-ivory-deep">
              <HeartIcon />
            </Link>
            <BagLink />
          </div>
        </div>
        <div className="wrap pb-3 md:hidden">
          <SearchBar id="site-search-mobile" />
        </div>
        <nav aria-label="Collections" className="border-t border-line/70">
          <div className="wrap py-1.5">
            <CollectionLinks
              items={[
                ...collections.map((c) => ({ href: `/collections/${c.slug}`, label: c.name })),
                { href: '/custom-orders', label: 'Custom orders', accent: true },
                { href: '/bulk-orders', label: 'Bulk & corporate', accent: true },
              ]}
            />
          </div>
        </nav>
      </header>
    </>
  );
}
