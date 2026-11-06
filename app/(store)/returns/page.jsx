import ContentPage, { Paragraphs } from '@/components/storefront/ContentPage';
import { getStoreContext } from '@/lib/storefront';

export const metadata = { title: 'Returns', alternates: { canonical: '/returns' } };

export default async function ReturnsPage() {
  const { settings } = await getStoreContext();
  return (
    <ContentPage title="Returns & exchanges">
      <Paragraphs text={settings.pages.returns} />
      <p className="mt-6">International returns may involve return shipping and customs costs; we will confirm these before you send anything back.</p>
    </ContentPage>
  );
}
