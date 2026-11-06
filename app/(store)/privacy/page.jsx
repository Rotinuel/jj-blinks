import ContentPage from '@/components/storefront/ContentPage';
import { getStoreContext } from '@/lib/storefront';

export const metadata = { title: 'Privacy', alternates: { canonical: '/privacy' } };

export default async function PrivacyPage() {
  const { settings } = await getStoreContext();
  const s = settings.store;
  return (
    <ContentPage title="Privacy" intro="How this website handles your information.">
      <p>{s.name} operates this website. This notice describes what the site collects and why. Questions: <a className="link" href={`mailto:${s.email}`}>{s.email}</a>.</p>
      <h2>What we collect</h2>
      <ul>
        <li>Order details: your name, email, phone number, delivery address, delivery instructions and the items you buy.</li>
        <li>Account details if you register: name, email, optional phone, saved addresses and wishlist. Passwords are stored only as a one-way hash.</li>
        <li>Custom and bulk order requests, including any reference photos or logo files you upload.</li>
        <li>Messages you send through the contact form, and your email if you join the newsletter.</li>
        <li>Basic technical data needed to run and protect the site, such as your IP address for rate limiting and sign-in security.</li>
      </ul>
      <h2>Payments</h2>
      <p>Payments are handled by Paystack. Your card details go directly to Paystack; this site never receives or stores them. We keep the payment reference, amount, currency and status.</p>
      <h2>Cookies and browser storage</h2>
      <p>The site uses a sign-in cookie when you log in, a cookie remembering your display currency, and a cookie that links uploads to your request. Your bag is stored in your browser. We do not use advertising or tracking cookies.</p>
      <h2>Who we share it with</h2>
      <p>Paystack (payments), our hosting and database providers (Vercel and Neon), our email provider when email is enabled, and couriers who need your delivery details. We do not sell your information.</p>
      <h2>Your choices</h2>
      <p>You can update your details and addresses in your account, unsubscribe from emails at any time, and ask us to access, correct or delete your information by emailing {s.email}. Some order records must be kept for accounting.</p>
      <p className="text-sm text-muted">This notice should be reviewed by the business against the Nigeria Data Protection Act 2023 and any other laws that apply to its customers.</p>
    </ContentPage>
  );
}
