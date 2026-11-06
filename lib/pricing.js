// Pure pricing rules. All amounts are integer kobo. No I/O here so the rules are easy to test.

export const MAX_LINE_QUANTITY = 50;

export function unitPriceKobo(product, variant) {
  if (variant && variant.price_kobo !== null && variant.price_kobo !== undefined) return Number(variant.price_kobo);
  return Number(product.price_kobo);
}

/** A "was" price is shown only when the business set a real higher comparison price. */
export function comparePriceKobo(product, variant) {
  const unit = unitPriceKobo(product, variant);
  const cmp = variant?.compare_at_kobo ?? product.compare_at_kobo;
  return cmp && Number(cmp) > unit ? Number(cmp) : null;
}

export function lineTotalKobo(unitKobo, quantity) {
  const total = Number(unitKobo) * Number(quantity);
  if (!Number.isSafeInteger(total) || total < 0) throw new Error('Invalid line total');
  return total;
}

/**
 * Evaluate a coupon against a cart.
 * ctx = { subtotalKobo, shippingKobo (number|null), email, now, priorUsesByEmail }
 * Returns { ok, reason?, discountKobo, shippingDiscountKobo }.
 */
export function evaluateCoupon(coupon, ctx) {
  const fail = (reason) => ({ ok: false, reason, discountKobo: 0, shippingDiscountKobo: 0 });
  if (!coupon) return fail('This code is not valid.');
  const now = ctx.now ? new Date(ctx.now) : new Date();
  if (!coupon.is_active) return fail('This code is no longer active.');
  if (coupon.starts_at && now < new Date(coupon.starts_at)) return fail('This code is not active yet.');
  if (coupon.ends_at && now >= new Date(coupon.ends_at)) return fail('This code has expired.');
  if (coupon.usage_limit && Number(coupon.used_count) >= Number(coupon.usage_limit)) {
    return fail('This code has reached its usage limit.');
  }
  if (coupon.usage_limit_per_email && ctx.email && Number(ctx.priorUsesByEmail || 0) >= Number(coupon.usage_limit_per_email)) {
    return fail('You have already used this code.');
  }
  const subtotal = Number(ctx.subtotalKobo);
  if (subtotal < Number(coupon.min_subtotal_kobo || 0)) {
    return fail('Your order does not meet the minimum spend for this code.');
  }

  if (coupon.type === 'percent') {
    let d = Math.floor((subtotal * Number(coupon.value)) / 100);
    if (coupon.max_discount_kobo) d = Math.min(d, Number(coupon.max_discount_kobo));
    return { ok: true, discountKobo: Math.min(d, subtotal), shippingDiscountKobo: 0 };
  }
  if (coupon.type === 'fixed') {
    return { ok: true, discountKobo: Math.min(Number(coupon.value), subtotal), shippingDiscountKobo: 0 };
  }
  if (coupon.type === 'free_shipping') {
    if (ctx.shippingKobo === null || ctx.shippingKobo === undefined) {
      // Shipping not yet known (manual quotation): code is valid, applied once shipping is set.
      return { ok: true, discountKobo: 0, shippingDiscountKobo: 0, pendingShipping: true };
    }
    return { ok: true, discountKobo: 0, shippingDiscountKobo: Number(ctx.shippingKobo) };
  }
  return fail('This code is not valid.');
}

/**
 * total = subtotal − discount − shippingDiscount + shipping. Shipping may be null (quote pending),
 * in which case total is null.
 */
export function computeTotals({ subtotalKobo, discountKobo = 0, shippingDiscountKobo = 0, shippingKobo }) {
  const subtotal = Number(subtotalKobo);
  const discount = Math.min(Number(discountKobo), subtotal);
  if (shippingKobo === null || shippingKobo === undefined) {
    return { subtotalKobo: subtotal, discountKobo: discount, shippingKobo: null, totalKobo: null };
  }
  const shipping = Number(shippingKobo);
  const shipDisc = Math.min(Number(shippingDiscountKobo), shipping);
  const total = subtotal - discount + shipping - shipDisc;
  return {
    subtotalKobo: subtotal,
    discountKobo: discount + shipDisc, // recorded discount includes waived shipping
    shippingKobo: shipping,
    totalKobo: total,
  };
}

/** Validate customer-entered customisations against the product's configured options. */
export function validateCustomizations(options, input) {
  const values = {};
  const errors = [];
  const given = input && typeof input === 'object' ? input : {};
  for (const opt of Array.isArray(options) ? options : []) {
    const raw = given[opt.key];
    const value = typeof raw === 'string' ? raw.trim() : '';
    if (!value) {
      if (opt.required) errors.push(`${opt.label} is required.`);
      continue;
    }
    if (opt.type === 'select') {
      if (!Array.isArray(opt.choices) || !opt.choices.includes(value)) {
        errors.push(`Choose a valid option for ${opt.label}.`);
        continue;
      }
    } else {
      const max = Math.min(Number(opt.max_length) || 200, 500);
      if (value.length > max) {
        errors.push(`${opt.label} must be ${max} characters or fewer.`);
        continue;
      }
    }
    values[opt.key] = value;
  }
  return { values, errors };
}

export function variantLabel(optionValues) {
  if (!optionValues || typeof optionValues !== 'object') return null;
  const parts = Object.values(optionValues).filter(Boolean);
  return parts.length ? parts.join(' / ') : null;
}
