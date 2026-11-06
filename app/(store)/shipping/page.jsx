import Link from 'next/link';
import ContentPage from '@/components/storefront/ContentPage';
import { getStoreContext } from '@/lib/storefront';
import { loadShippingConfig, deliveryEstimateText } from '@/lib/shipping';
import { countryName } from '@/lib/countries';
import { formatMoney } from '@/lib/currency';

export const metadata = { title: 'Shipping & customs', description: 'Where JJ BLINKS delivers, delivery options and customs information for international orders.', alternates: { canonical: '/shipping' } };

function describe(m) {
  if (m.type === 'quote') return 'Quoted for your address after you order';
  if (m.type === 'pickup') return 'Free collection';
  if (m.type === 'flat') return `${formatMoney(m.flat_rate_kobo)}${m.free_over_kobo ? `, free over ${formatMoney(m.free_over_kobo)}` : ''}`;
  return `Calculated at checkout${m.free_over_kobo ? `, free over ${formatMoney(m.free_over_kobo)}` : ''}`;
}

export default async function ShippingPage() {
  const [{ settings }, cfg] = await Promise.all([getStoreContext(), loadShippingConfig()]);
  const zones = cfg.zones.filter((z) => z.is_active && z.methods.some((m) => m.is_active));
  return (
    <ContentPage title="Shipping & customs" intro="Exact options and costs for your address are shown at checkout before you pay.">
      {settings.shipping.processing_note && <p>{settings.shipping.processing_note}</p>}
      <h2>Where we deliver</h2>
      {zones.length ? (
        <div className="space-y-8">
          {zones.map((z) => (
            <section key={z.id}>
              <h3 className="font-display text-xl">{z.name}</h3>
              <p className="text-sm text-muted">{z.is_fallback ? 'Other destinations, subject to confirmation' : z.countries.map(countryName).join(', ')}</p>
              <ul>
                {z.methods.filter((m) => m.is_active).map((m) => (
                  <li key={m.id}>{m.name}: {describe(m)}{deliveryEstimateText(m) ? `, about ${deliveryEstimateText(m)} after dispatch` : ''}</li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : <p>Delivery options are being set up. <Link href="/contact" className="link">Contact us</Link> about delivery to your location.</p>}
      {cfg.blocked.length > 0 && <p className="mt-6 text-sm text-muted">We cannot currently deliver to: {cfg.blocked.map((b) => countryName(b.country_code.trim())).join(', ')}.</p>}
      <h2>Customs, duties and taxes</h2>
      <p>{settings.shipping.customs_notice}</p>
      <h2>Tracking</h2>
      <p>When your order ships we add the carrier and tracking number to your order page. <Link href="/track" className="link">Track an order</Link>.</p>
    </ContentPage>
  );
}
