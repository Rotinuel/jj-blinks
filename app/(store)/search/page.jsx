import Listing from '@/components/products/Listing';

export const metadata = { title: 'Search', robots: { index: false, follow: true }, alternates: { canonical: '/search' } };

export default async function SearchPage({ searchParams }) {
  const sp = await searchParams;
  return (
    <Listing
      title={sp.q ? 'Search results' : 'Search the collection'}
      basePath="/search"
      searchParams={sp}
      showSearch
      showCategories
      emptyText="Search by name, collection or style."
    />
  );
}
