import { requireUser } from '@/lib/auth';
import { query } from '@/lib/db';
import { countryName } from '@/lib/countries';
import { defaultAddressAction, deleteAddressAction } from '@/app/actions/account';
import { AddressForm } from '@/components/account/AccountForms';

export const metadata = { title: 'Addresses' };

export default async function AddressesPage() {
  const user = await requireUser('/account/addresses');
  const rows = await query('SELECT * FROM addresses WHERE user_id = $1 ORDER BY is_default DESC, id DESC', [user.id]);
  return (
    <>
      <h1 className="font-display text-title">Addresses</h1>
      {rows.length > 0 && (
        <ul className="mt-8 grid gap-6 sm:grid-cols-2">
          {rows.map((a) => (
            <li key={a.id} className="border border-line bg-white p-5 text-sm">
              <p className="font-medium">{a.label || 'Address'}{a.is_default && <span className="tag tag-wine ml-2">Default</span>}</p>
              <address className="mt-2 not-italic text-muted">
                {a.full_name}<br />{a.line1}{a.line2 ? `, ${a.line2}` : ''}<br />{[a.city, a.region, a.postal_code].filter(Boolean).join(', ')}<br />{countryName(a.country_code.trim())}<br />{a.phone}
              </address>
              <div className="mt-4 flex gap-4">
                {!a.is_default && <form action={defaultAddressAction}><input type="hidden" name="id" value={a.id} /><button className="link">Make default</button></form>}
                <form action={deleteAddressAction}><input type="hidden" name="id" value={a.id} /><button className="link">Delete</button></form>
              </div>
            </li>
          ))}
        </ul>
      )}
      <section className="mt-12 max-w-2xl">
        <h2 className="mb-6 font-display text-2xl">Add an address</h2>
        <AddressForm />
      </section>
    </>
  );
}
