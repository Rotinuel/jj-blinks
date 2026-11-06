import CheckoutForm from '@/components/checkout/CheckoutForm';
import { getCurrentUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { getStoreContext } from '@/lib/storefront';

export const metadata = { title: 'Checkout', robots: { index: false } };

export default async function CheckoutPage() {
  const [user, { settings }] = await Promise.all([getCurrentUser(), getStoreContext()]);
  const addresses = user
    ? await query(
        `SELECT id, label, full_name, phone, country_code, region, city, postal_code, line1, line2, is_default
           FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, id DESC`,
        [user.id]
      )
    : [];
  return (
    <div className="wrap pt-12">
      <h1 className="mb-10 font-display text-title">Checkout</h1>
      <CheckoutForm
        user={user ? { name: user.name, email: user.email, phone: user.phone } : null}
        addresses={addresses.map((a) => ({ ...a, country_code: a.country_code.trim() }))}
        customsNotice={settings.shipping.customs_notice}
        processingNote={settings.shipping.processing_note}
      />
    </div>
  );
}
