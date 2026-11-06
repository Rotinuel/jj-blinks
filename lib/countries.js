// Country data for international checkout. Names come from the runtime's Intl data.

const CODES = `AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE
KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT
MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU
RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA
UG US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW`
  .split(/\s+/)
  .filter(Boolean);

let names = null;
function displayNames() {
  if (names) return names;
  const dn = new Intl.DisplayNames(['en'], { type: 'region' });
  names = new Map(CODES.map((c) => [c, c === 'XK' ? 'Kosovo' : dn.of(c) || c]));
  return names;
}

export function countryName(code) {
  return displayNames().get(String(code || '').toUpperCase()) || code || '';
}

export function isValidCountry(code) {
  return displayNames().has(String(code || '').toUpperCase());
}

export function listCountries() {
  return [...displayNames().entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Calling codes for common destinations, used only to pre-fill the phone field. */
export const DIAL_CODES = {
  NG: '234', GB: '44', US: '1', CA: '1', IE: '353', FR: '33', DE: '49', IT: '39', ES: '34', NL: '31',
  BE: '32', PT: '351', SE: '46', NO: '47', DK: '45', FI: '358', AT: '43', CH: '41', PL: '48', GH: '233',
  ZA: '27', KE: '254', AE: '971', AU: '61', CM: '237', BJ: '229', TG: '228', CI: '225', SN: '221',
  IN: '91', SA: '966', QA: '974', NZ: '64', JM: '1', TT: '1',
};

export const NG_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno', 'Cross River', 'Delta',
  'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT (Abuja)', 'Gombe', 'Imo', 'Jigawa', 'Kaduna', 'Kano', 'Katsina',
  'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa', 'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers',
  'Sokoto', 'Taraba', 'Yobe', 'Zamfara',
];

/** Postal formats for destinations where the code is required. Others: optional. */
const POSTAL_REQUIRED = {
  US: /^\d{5}(-\d{4})?$/,
  CA: /^[A-Za-z]\d[A-Za-z][ -]?\d[A-Za-z]\d$/,
  GB: /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/,
  DE: /^\d{5}$/, FR: /^\d{5}$/, IT: /^\d{5}$/, ES: /^\d{5}$/, FI: /^\d{5}$/,
  NL: /^\d{4}\s?[A-Za-z]{2}$/,
  BE: /^\d{4}$/, AT: /^\d{4}$/, CH: /^\d{4}$/, DK: /^\d{4}$/, NO: /^\d{4}$/, AU: /^\d{4}$/,
  SE: /^\d{3}\s?\d{2}$/, PL: /^\d{2}-\d{3}$/, PT: /^\d{4}-\d{3}$/,
};

/** Destinations that do not use postal codes — the field is hidden. */
const NO_POSTAL = new Set(`AE AG AO AW BF BI BJ BO BS BW BZ CD CF CG CI CK CM DJ DM ER FJ GD GM GN GQ GY HK
KI KM KN KP LC ML MO MR MW NR NU QA RW SB SC SL SO SR ST SY TD TG TK TL TO TT TV UG VU YE ZW`.split(/\s+/));

export function addressFormat(code) {
  const cc = String(code || '').toUpperCase();
  const regionLabel =
    { NG: 'State', US: 'State', AU: 'State', CA: 'Province', GB: 'County', IE: 'County' }[cc] ||
    'State / Province / Region';
  const regionRequired = ['NG', 'US', 'CA', 'AU'].includes(cc);
  const postalLabel = { US: 'ZIP code', GB: 'Postcode', IE: 'Eircode' }[cc] || 'Postal code';
  const postal = NO_POSTAL.has(cc) ? 'hidden' : POSTAL_REQUIRED[cc] ? 'required' : 'optional';
  return {
    regionLabel,
    regionRequired,
    regionOptions: cc === 'NG' ? NG_STATES : null,
    postalLabel,
    postal,
    dialCode: DIAL_CODES[cc] || null,
  };
}

export function validatePostal(code, value) {
  const cc = String(code || '').toUpperCase();
  const v = String(value || '').trim();
  const fmt = addressFormat(cc);
  if (fmt.postal === 'hidden') return { ok: true, value: '' };
  if (!v) return fmt.postal === 'required' ? { ok: false, error: `${fmt.postalLabel} is required.` } : { ok: true, value: '' };
  if (v.length > 12) return { ok: false, error: `${fmt.postalLabel} looks too long.` };
  const re = POSTAL_REQUIRED[cc];
  if (re && !re.test(v)) return { ok: false, error: `Enter a valid ${fmt.postalLabel.toLowerCase()}.` };
  if (!/^[A-Za-z0-9 \-]+$/.test(v)) return { ok: false, error: `Enter a valid ${fmt.postalLabel.toLowerCase()}.` };
  return { ok: true, value: v.toUpperCase() };
}
