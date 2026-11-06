import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { logoutAction } from '@/app/actions/auth';

export const metadata = { robots: { index: false } };

const NAV = [
  ['/account', 'Overview'],
  ['/account/orders', 'Orders'],
  ['/account/wishlist', 'Wishlist'],
  ['/account/addresses', 'Addresses'],
  ['/account/details', 'Details & password'],
];

export default async function AccountLayout({ children }) {
  const user = await requireUser('/account');
  return (
    <div className="wrap grid gap-10 pt-12 md:grid-cols-[13rem_1fr]">
      <aside>
        <p className="font-display text-2xl">{user.name.split(' ')[0]}</p>
        <nav aria-label="Account" className="mt-6">
          <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm md:flex-col">
            {NAV.map(([href, label]) => <li key={href}><Link href={href} className="hover:text-wine">{label}</Link></li>)}
          </ul>
        </nav>
        <form action={logoutAction} className="mt-6"><button className="link text-sm">Sign out</button></form>
      </aside>
      <div>{children}</div>
    </div>
  );
}
