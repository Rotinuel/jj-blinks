import Link from 'next/link';
import ContentPage from '@/components/storefront/ContentPage';
import { getStoreContext } from '@/lib/storefront';

export const metadata = { title: 'FAQs', alternates: { canonical: '/faqs' } };

// How the shop works — facts about this website's process. The business can add its own
// questions in the admin (Content → FAQs); those appear first.
const BUILT_IN = [
  ['Do I need an account to order?', 'No. You can check out as a guest. An account lets you save addresses, see all your orders and keep a wishlist.'],
  ['Which currency will I be charged in?', 'Prices are set in Nigerian naira (NGN) and you are charged in NGN unless checkout offers another currency. Converted prices shown on the site are approximate, and your bank may apply its own exchange rate and fees.'],
  ['How much is delivery?', 'Delivery options for your address are shown at checkout before you pay. For some destinations we quote delivery after you order; you pay only once you accept the total.'],
  ['Will I pay customs or import duty?', 'International parcels may be charged duties, taxes or handling fees by the destination country. These are not included in our prices unless we confirm otherwise in writing.'],
  ['How do custom and bulk orders work?', 'Send a request with your brief. We reply with a quotation, and you pay only if you accept it. You can follow progress from the link we give you.'],
  ['How do I track my order?', 'Use the link in your confirmation, sign in to your account, or enter your order number and email on the order tracking page.'],
  ['Is payment secure?', 'Payments are processed by Paystack. We never see or store your card details, and an order is marked as paid only after we confirm the payment with Paystack.'],
];

export default async function FaqsPage() {
  const { settings } = await getStoreContext();
  const custom = (settings.pages.faqs || []).filter((f) => f.q && f.a).map((f) => [f.q, f.a]);
  const all = [...custom, ...BUILT_IN];
  const jsonLd = { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: all.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) };
  return (
    <ContentPage title="Questions" intro={<>Something else? <Link href="/contact" className="link">Ask us</Link>.</>}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <div className="divide-y divide-line border-y border-line">
        {all.map(([q, a]) => (
          <details key={q} className="py-5">
            <summary className="cursor-pointer list-none font-display text-xl">{q}</summary>
            <p className="mt-3 text-muted">{a}</p>
          </details>
        ))}
      </div>
    </ContentPage>
  );
}
