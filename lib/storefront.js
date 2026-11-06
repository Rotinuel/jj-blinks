// Per-request storefront context (settings, display currency, FX snapshot), deduplicated
// within a render with React cache(). App-only: uses next/headers.
import { cache } from 'react';
import { cookies } from 'next/headers';
import { getSettings } from './settings.js';
import { currentFxSnapshot } from './fx.js';
import { DISPLAY_CURRENCIES } from './currency.js';
import { listCategories } from '../db/queries/catalog.js';

export const CURRENCY_COOKIE = 'jjb_currency';

export const getStoreContext = cache(async () => {
  const settings = await getSettings();
  const jar = await cookies();
  const wanted = jar.get(CURRENCY_COOKIE)?.value;
  const currency = DISPLAY_CURRENCIES.includes(wanted) ? wanted : 'NGN';
  const fxEnabled = settings.currency.fx_source !== 'none';
  let fx = null;
  if (fxEnabled && (currency !== 'NGN' || settings.payments.usd_enabled)) {
    fx = await currentFxSnapshot(settings).catch(() => null);
  }
  return { settings, currency, fx, fxEnabled };
});

export const getNavCategories = cache(async () => listCategories({ includeService: false }));
