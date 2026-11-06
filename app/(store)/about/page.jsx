import Link from 'next/link';
import ContentPage, { Paragraphs } from '@/components/storefront/ContentPage';
import { getStoreContext } from '@/lib/storefront';

export const metadata = { title: 'About', description: 'About JJ BLINKS — autogele, turbans, fascinators, caps and branded apparel.', alternates: { canonical: '/about' } };

export default async function AboutPage() {
  const { settings } = await getStoreContext();
  const text = settings.pages.about || settings.home.story.body;
  return (
    <ContentPage title="About JJ BLINKS" intro={settings.store.address}>
      <Paragraphs text={text} />
      <p className="mt-8"><Link href="/custom-orders" className="link">Start a custom order</Link> or <Link href="/contact" className="link">get in touch</Link>.</p>
    </ContentPage>
  );
}
