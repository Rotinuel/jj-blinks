import ContentPage from '@/components/storefront/ContentPage';
import ContactForm from '@/components/storefront/ContactForm';
import { getStoreContext } from '@/lib/storefront';
import { whatsappLink } from '@/lib/utilities';

export const metadata = { title: 'Contact', description: 'Contact JJ BLINKS by phone, WhatsApp or email.', alternates: { canonical: '/contact' } };

export default async function ContactPage() {
  const { settings } = await getStoreContext();
  const s = settings.store;
  const wa = whatsappLink(s.whatsapp, 'Hello JJ BLINKS');
  return (
    <ContentPage
      title="Contact"
      intro="Questions about a piece, an order, sizing or delivery — we are happy to help."
      aside={
        <address className="mt-8 space-y-3 text-sm not-italic">
          <p>{s.address}</p>
          <p><a className="link" href={`tel:${s.phone}`}>{s.phone}</a>{s.phone_alt && <> or <a className="link" href={`tel:${s.phone_alt}`}>{s.phone_alt}</a></>}</p>
          <p><a className="link" href={`mailto:${s.email}`}>{s.email}</a></p>
          {wa && <p><a className="btn btn-primary btn-sm" href={wa} target="_blank" rel="noopener noreferrer">Chat on WhatsApp</a></p>}
          {s.hours && <p className="text-muted">{s.hours}</p>}
        </address>
      }
    >
      <ContactForm />
    </ContentPage>
  );
}
