import Listing from '@/components/products/Listing';

export const metadata = { title: 'New in', description: 'The newest pieces from JJ BLINKS.', alternates: { canonical: '/new-arrivals' } };

export default async function NewArrivalsPage({ searchParams }) {
  return <Listing title="New in" basePath="/new-arrivals" searchParams={await searchParams} fixed={{ sort: 'newest' }} showCategories />;
}
