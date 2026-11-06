import Link from 'next/link';
import ContentPage from '@/components/storefront/ContentPage';
import { getStoreContext } from '@/lib/storefront';

export const metadata = { title: 'Terms', alternates: { canonical: '/terms' } };

export default async function TermsPage() {
  const { settings } = await getStoreContext();
  const s = settings.store;
  return (
    <ContentPage title="Terms of sale" intro={`${s.name}, ${s.address}`}>
      <h2>Prices and payment</h2>
      <p>Prices are in Nigerian naira (NGN). Converted prices are indicative only. Your order is confirmed once we verify payment with our payment provider. If a price was displayed in error, we will contact you before fulfilling the order.</p>
      <h2>Availability</h2>
      <p>Items are reserved for you while you complete payment. Unpaid orders are released after the payment window shown at checkout.</p>
      <h2>Delivery</h2>
      <p>Delivery costs and estimates are shown before you pay or quoted for your approval. Estimates start from dispatch and are not guaranteed. See <Link href="/shipping" className="link">shipping & customs</Link>.</p>
      <h2>Customs</h2>
      <p>{settings.shipping.customs_notice}</p>
      <h2>Custom and bulk orders</h2>
      <p>Custom work starts after you accept a quotation and pay. Quotations are valid until the date shown. Handmade and personalised items may vary slightly from reference images.</p>
      <h2>Returns</h2>
      <p>See our <Link href="/returns" className="link">returns policy</Link>.</p>
      <h2>Contact</h2>
      <p><a className="link" href={`mailto:${s.email}`}>{s.email}</a> · {s.phone}</p>
      <p className="text-sm text-muted">These terms are a starting point and should be reviewed by the business and its legal adviser.</p>
    </ContentPage>
  );
}
