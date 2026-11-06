import { Bodoni_Moda, Jost } from 'next/font/google';
import './globals.css';

const bodoni = Bodoni_Moda({ subsets: ['latin'], variable: '--font-bodoni', display: 'swap', style: ['normal', 'italic'] });
const jost = Jost({ subsets: ['latin'], variable: '--font-jost', display: 'swap' });

const base = (process.env.APP_URL || 'http://localhost:3000').replace(/\/+$/, '');

export const metadata = {
  metadataBase: new URL(base),
  title: { default: 'JJ BLINKS — Autogele, turbans, caps & branded apparel', template: '%s · JJ BLINKS' },
  description:
    'Autogele, turbans, fascinators, Zara caps and traditional men’s caps from JJ BLINKS, Nigeria. Custom and bulk orders, delivery in Nigeria and to selected international destinations.',
  alternates: { canonical: '/' },
  openGraph: { type: 'website', siteName: 'JJ BLINKS', locale: 'en_NG' },
  robots: { index: true, follow: true },
};

export const viewport = { themeColor: '#650F18', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }) {
  return (
    <html lang="en-NG" className={`${bodoni.variable} ${jost.variable}`} suppressHydrationWarning>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
