// Payment-provider boundary. Checkout and order logic talk to `paymentProvider()` only, so a
// second provider can be added here without touching the catalogue or cart.
import * as paystack from './paystack.js';

const providers = { paystack };

let override = null;
/** Tests replace the provider with a fake implementing the same functions. */
export function setPaymentProvider(p) {
  override = p;
}

export function paymentProvider(name = process.env.PAYMENT_PROVIDER || 'paystack') {
  if (override) return override;
  const p = providers[name];
  if (!p) throw new Error(`Unknown payment provider: ${name}`);
  return { name, ...p };
}

export function paymentsConfigured() {
  return paymentProvider().isConfigured();
}
