// Store settings live in the `settings` table (one JSONB row per section) and are merged
// over these defaults. The defaults contain only facts supplied by the business; anything
// unknown (social accounts, policies, rates) is left empty for the owner to fill in.
import { json, query } from './db.js';

export const DEFAULT_SETTINGS = {
  store: {
    name: 'JJ BLINKS',
    tagline: 'Headwear & branded apparel',
    email: 'olajumokeshosilva45@gmail.com',
    phone: '08032242010',
    phone_alt: '09017821631',
    whatsapp: '2348032242010',
    address: '4, Ajayi Tinuade Street, Olambe, Ogun, Nigeria',
    hours: '',
  },
  social: { instagram: '', facebook: '', tiktok: '', x: '', youtube: '' },
  announcement: {
    enabled: true,
    text: 'Custom and bulk orders welcome — enquire on WhatsApp',
    link: '/custom-orders',
  },
  currency: {
    fx_source: 'none', // 'none' | 'open_er_api' | 'manual'
    manual_rates: { USD: null, GBP: null, EUR: null, CAD: null }, // units of currency per 1 NGN
    manual_updated_at: null,
  },
  payments: {
    usd_enabled: false,          // turn on only after Paystack enables USD on the merchant account
    payment_window_minutes: 60,  // unpaid orders release their stock after this
    quote_payment_days: 3,       // time to pay once a shipping quotation is issued
  },
  shipping: {
    processing_note: '',
    customs_notice:
      'International orders may be subject to customs duties, import taxes and handling fees charged by the destination country. Unless we confirm otherwise in writing, these charges are not included in our prices or shipping fees and are the responsibility of the recipient. Delivery can be delayed while a parcel clears customs.',
  },
  home: {
    hero: {
      eyebrow: '',
      headline: 'A Crown of Culture. A Statement of Style.',
      subheading:
        'Autogele, turbans, fascinators and traditional caps for celebrations, ceremonies and the days in between — with custom pieces made to your brief.',
      image_url: null,
      image_alt: '',
    },
    custom_feature: {
      heading: 'Made to your occasion',
      text: 'Share your colours, fabric and inspiration and we will advise on what can be made, quote it, and only ask for payment once you approve the quotation.',
      image_url: null,
      image_alt: '',
    },
    apparel: {
      heading: 'Branded apparel & corporate orders',
      text: 'T-shirts and polos with your logo or event branding, and coordinated headwear for teams, families and asoebi groups.',
      image_url: null,
      image_alt: '',
    },
    story: {
      heading: 'The house of JJ BLINKS',
      body:
        'JJ BLINKS creates headwear that carries culture with confidence — autogele and turbans ready to wear, fascinators for the occasion, and caps for the men who complete the look. Alongside the headwear, we brand T-shirts and polos for businesses, families and celebrations.\n\nEvery order begins with a conversation: the occasion, the outfit, the colours. Reach us on WhatsApp or through the custom order form and we will guide you from idea to finished piece.',
      image_url: null,
      image_alt: '',
    },
    occasions: [
      { title: 'Weddings & engagements', text: 'Bridal headpieces and coordinated asoebi headwear.', href: '/collections/bridal-and-occasion-headwear' },
      { title: 'Owambe & celebrations', text: 'Statement autogele and turbans for the party.', href: '/collections/autogele' },
      { title: 'Ceremony & tradition', text: 'Traditional caps and embellished pieces.', href: '/collections/traditional-mens-caps' },
    ],
    newsletter: {
      enabled: true,
      heading: 'New pieces, first',
      text: 'Occasional emails about new arrivals and collections. Unsubscribe at any time.',
    },
  },
  pages: {
    about: '',
    returns:
      'Our returns and exchanges policy is being finalised. Before you order, please contact us on WhatsApp or by email and we will confirm what applies to your purchase. Custom-made and personalised items are made to your specification.',
    faqs: [],
  },
};

const SECTIONS = Object.keys(DEFAULT_SETTINGS);

function merge(base, over) {
  if (Array.isArray(base) || Array.isArray(over)) return over ?? base;
  if (base && typeof base === 'object' && over && typeof over === 'object') {
    const out = { ...base };
    for (const [k, v] of Object.entries(over)) out[k] = k in base ? merge(base[k], v) : v;
    return out;
  }
  return over === undefined ? base : over;
}

export async function getSettings() {
  const rows = await query('SELECT key, value FROM settings WHERE key = ANY($1::text[])', [SECTIONS]);
  const out = structuredClone(DEFAULT_SETTINGS);
  for (const r of rows) out[r.key] = merge(DEFAULT_SETTINGS[r.key], r.value);
  return out;
}

export async function saveSettingsSection(key, value, actorId = null) {
  if (!SECTIONS.includes(key)) throw new Error(`Unknown settings section: ${key}`);
  await query(
    `INSERT INTO settings (key, value, updated_by) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW()`,
    [key, json(value), actorId]
  );
}
