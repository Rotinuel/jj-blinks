import Listing from '@/components/products/Listing';

export const metadata = {
  title: 'Shop',
  description: 'Autogele, turbans, fascinators, Zara caps, traditional men’s caps and branded apparel from JJ BLINKS.',
  alternates: { canonical: '/shop' },
};

export default async function ShopPage({ searchParams }) {
  return <Listing title="Shop all pieces" basePath="/shop" searchParams={await searchParams} showSearch showCategories />;
}
