// Small hand-written validators (no schema library). Every server action and route handler
// validates its input with these before touching the database.
import { addressFormat, isValidCountry, validatePostal } from './countries.js';

const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[A-Za-z]{2,}$/;

export function cleanString(v, max = 500) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/\u0000/g, '').trim().slice(0, max);
}

export function normalizeEmail(v) {
  const s = cleanString(v, 254).toLowerCase();
  return EMAIL_RE.test(s) ? s : null;
}

/**
 * Normalise to E.164 (+<country><number>). Accepts spaces, dashes, brackets, a leading 00, and
 * national numbers with a leading 0 when a default country dial code is known.
 */
export function normalizePhone(v, countryCode) {
  let s = cleanString(v, 32).replace(/[\s\-().]/g, '');
  if (!s) return null;
  if (s.startsWith('00')) s = '+' + s.slice(2);
  if (!s.startsWith('+')) {
    const dial = addressFormat(countryCode).dialCode;
    if (!dial) return null;
    s = s.startsWith('0') ? `+${dial}${s.slice(1)}` : `+${dial}${s}`;
  }
  if (!/^\+[1-9]\d{7,14}$/.test(s)) return null;
  // National number lengths for the main markets (others: E.164 range only).
  if (s.startsWith('+234') && !/^\+234[1-9]\d{9}$/.test(s)) return null; // Nigeria: 10 digits
  if (s.startsWith('+1') && !/^\+1[2-9]\d{9}$/.test(s)) return null;      // US / Canada: 10 digits
  if (s.startsWith('+44') && !/^\+44[1-9]\d{8,9}$/.test(s)) return null;  // UK
  return s;
}

/**
 * validate(input, spec) → { data, errors }
 * spec: { field: { type: 'string'|'email'|'int'|'phone'|'enum'|'bool'|'date', required, max, min, values, label } }
 */
export function validate(input, spec) {
  const data = {};
  const errors = {};
  const get = (k) => (typeof input?.get === 'function' ? input.get(k) : input?.[k]);
  for (const [key, rule] of Object.entries(spec)) {
    const label = rule.label || key.replace(/_/g, ' ');
    const raw = get(key);
    const empty = raw === null || raw === undefined || String(raw).trim() === '';
    if (empty) {
      if (rule.required) errors[key] = `${capital(label)} is required.`;
      else data[key] = rule.type === 'bool' ? false : null;
      continue;
    }
    switch (rule.type) {
      case 'email': {
        const e = normalizeEmail(raw);
        if (!e) errors[key] = 'Enter a valid email address.';
        else data[key] = e;
        break;
      }
      case 'int': {
        const s = String(raw).trim();
        const n = /^-?\d+$/.test(s) ? Number(s) : NaN;
        if (!Number.isSafeInteger(n)) errors[key] = `${capital(label)} must be a whole number.`;
        else if (rule.min !== undefined && n < rule.min) errors[key] = `${capital(label)} must be at least ${rule.min}.`;
        else if (rule.max !== undefined && n > rule.max) errors[key] = `${capital(label)} must be at most ${rule.max}.`;
        else data[key] = n;
        break;
      }
      case 'enum': {
        const s = String(raw);
        if (!rule.values.includes(s)) errors[key] = `Choose a valid ${label}.`;
        else data[key] = s;
        break;
      }
      case 'bool':
        data[key] = raw === true || raw === 'true' || raw === 'on' || raw === '1';
        break;
      case 'date': {
        const s = String(raw).trim();
        const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00Z') : null;
        if (!d || Number.isNaN(d.getTime())) errors[key] = `Enter a valid ${label}.`;
        else data[key] = s;
        break;
      }
      default: {
        const s = cleanString(raw, rule.max ?? 500);
        if (rule.min && s.length < rule.min) errors[key] = `${capital(label)} must be at least ${rule.min} characters.`;
        else if (String(raw).trim().length > (rule.max ?? 500)) errors[key] = `${capital(label)} is too long.`;
        else data[key] = s;
      }
    }
  }
  return { data, errors, ok: Object.keys(errors).length === 0 };
}

function capital(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Validate an international shipping address. */
export function validateAddress(input) {
  const get = (k) => (typeof input?.get === 'function' ? input.get(k) : input?.[k]);
  const errors = {};
  const country = cleanString(get('country_code'), 2).toUpperCase();
  if (!isValidCountry(country)) errors.country_code = 'Choose your country.';
  const fmt = addressFormat(country);

  const { data, errors: e1 } = validate(input, {
    full_name: { required: true, max: 120, label: 'full name' },
    city: { required: true, max: 80 },
    line1: { required: true, max: 160, label: 'street address' },
    line2: { max: 160 },
    region: { required: fmt.regionRequired, max: 80, label: fmt.regionLabel.toLowerCase() },
  });
  Object.assign(errors, e1);

  if (fmt.regionOptions && data.region && !fmt.regionOptions.includes(data.region)) {
    errors.region = `Choose a valid ${fmt.regionLabel.toLowerCase()}.`;
  }
  const phone = normalizePhone(get('phone'), country);
  if (!phone) errors.phone = 'Enter a phone number with country code, e.g. +44 7700 900123.';
  const postal = validatePostal(country, get('postal_code'));
  if (!postal.ok) errors.postal_code = postal.error;

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    address: {
      full_name: data.full_name,
      phone,
      country_code: country,
      region: data.region || '',
      city: data.city,
      postal_code: postal.ok ? postal.value : '',
      line1: data.line1,
      line2: data.line2 || '',
    },
  };
}

/**
 * Sign-in identifier: an email address or a phone number. Phone numbers without a country
 * code are read as Nigerian. Returns { email } or { phone } or null.
 */
export function parseIdentifier(value) {
  const s = cleanString(value, 254);
  if (!s) return null;
  if (s.includes('@')) {
    const email = normalizeEmail(s);
    return email ? { email } : null;
  }
  const phone = normalizePhone(s, 'NG');
  return phone ? { phone } : null;
}

export function validatePassword(pw) {
  const s = String(pw || '');
  if (s.length < 10) return 'Use at least 10 characters.';
  if (s.length > 200) return 'Password is too long.';
  if (!/[A-Za-z]/.test(s) || !/\d/.test(s)) return 'Include at least one letter and one number.';
  return null;
}
