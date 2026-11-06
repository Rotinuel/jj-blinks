import RequestPage from '@/components/storefront/RequestPage';

export const metadata = {
  title: 'Custom orders',
  description: 'Request custom autogele, turbans, fascinators, caps and branded apparel from JJ BLINKS. Quotation first, payment only when you approve.',
  alternates: { canonical: '/custom-orders' },
};

export default async function CustomOrdersPage({ searchParams }) {
  const sp = await searchParams;
  return (
    <RequestPage
      kind="custom"
      title="Custom orders"
      intro="Headwear made for your outfit and your occasion. Tell us what you have in mind and we will come back with what we can make, the price and the timing."
      points={['You send the brief and any reference photos.', 'We review it and email a quotation.', 'You accept the quotation and pay securely online.', 'We make it and keep you updated until delivery.']}
      product={typeof sp.product === 'string' ? sp.product.slice(0, 120) : ''}
    />
  );
}
