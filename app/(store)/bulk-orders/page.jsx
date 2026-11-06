import RequestPage from '@/components/storefront/RequestPage';

export const metadata = {
  title: 'Bulk & corporate orders',
  description: 'Bulk headwear and branded T-shirts and polos for companies, events, families and asoebi groups. Request a quotation from JJ BLINKS.',
  alternates: { canonical: '/bulk-orders' },
};

export default function BulkOrdersPage() {
  return (
    <RequestPage
      kind="bulk"
      title="Bulk & corporate orders"
      intro="Coordinated headwear and branded apparel for teams, events, families and asoebi groups. Send the details and we will prepare a quotation."
      points={['Share quantities, sizes, colours and branding.', 'We confirm feasibility, price and lead time.', 'You approve the quotation and pay.', 'We produce, quality-check and deliver.']}
    />
  );
}
