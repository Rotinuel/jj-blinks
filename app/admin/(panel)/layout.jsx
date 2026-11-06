import Link from 'next/link';
import { requireStaff } from '@/lib/auth';
import { can, ROLE_LABELS } from '@/lib/permissions';
import { logoutAction } from '@/app/actions/auth';

export const metadata = { title: { default: 'Admin', template: '%s · Admin · JJ BLINKS' }, robots: { index: false } };

const NAV = [
  ['Overview', [['/admin', 'Dashboard', 'dashboard.view'], ['/admin/analytics', 'Sales analytics', 'finance.view']]],
  ['Sales', [['/admin/orders', 'Orders', 'orders.view'], ['/admin/requests', 'Custom & bulk', 'custom.view'], ['/admin/customers', 'Customers', 'customers.view'], ['/admin/coupons', 'Discounts', 'coupons.manage']]],
  ['Catalogue', [['/admin/products', 'Products', 'products.view'], ['/admin/categories', 'Collections', 'categories.manage'], ['/admin/inventory', 'Inventory', 'inventory.manage'], ['/admin/reviews', 'Reviews', 'reviews.moderate']]],
  ['Store', [['/admin/shipping', 'Shipping', 'shipping.manage'], ['/admin/content', 'Homepage & pages', 'content.manage'], ['/admin/settings', 'Settings', 'settings.manage'], ['/admin/messages', 'Messages', 'messages.view']]],
  ['Team', [['/admin/team', 'Staff & roles', 'staff.manage'], ['/admin/audit', 'Audit log', 'audit.view']]],
];

export default async function AdminLayout({ children }) {
  const user = await requireStaff();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <aside className="border-b border-line bg-charcoal text-ivory/80 lg:min-h-dvh lg:border-b-0">
        <div className="flex items-center justify-between px-6 py-5 lg:block">
          <Link href="/admin" className="font-display text-2xl tracking-[0.2em] text-ivory">JJ BLINKS</Link>
          <p className="text-xs text-ivory/50 lg:mt-1">{user.name} · {ROLE_LABELS[user.role]}</p>
        </div>
        <nav aria-label="Admin" className="max-h-[40vh] overflow-y-auto px-6 pb-6 lg:max-h-none">
          {NAV.map(([group, links]) => {
            const visible = links.filter(([, , perm]) => can(user.role, perm));
            if (!visible.length) return null;
            return (
              <div key={group} className="mt-5">
                <p className="text-xs text-ivory/45">{group}</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {visible.map(([href, label]) => <li key={href}><Link href={href} className="hover:text-gold">{label}</Link></li>)}
                </ul>
              </div>
            );
          })}
          <div className="mt-8 space-y-2 border-t border-ivory/10 pt-5 text-sm">
            <Link href="/" className="block hover:text-gold">View store</Link>
            <form action={logoutAction}><button className="hover:text-gold">Sign out</button></form>
          </div>
        </nav>
      </aside>
      <main className="px-5 py-8 sm:px-10">{children}</main>
    </div>
  );
}
