import { formatMoney, indicativePrice } from '@/lib/currency';

/**
 * NGN is always the price of record. When the visitor chose another currency and a current
 * rate is available, an approximate conversion is shown beside it — clearly marked.
 */
export default function Price({ kobo, compareKobo, ctx, from = false, size = 'base' }) {
  const approx = ctx ? indicativePrice(kobo, ctx.currency, ctx.fx) : null;
  const big = size === 'lg';
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span className={big ? 'text-2xl' : ''}>
        {from && <span className="text-muted text-sm">From </span>}
        {formatMoney(kobo, 'NGN')}
      </span>
      {compareKobo ? (
        <s className="text-muted text-sm" aria-label={`Was ${formatMoney(compareKobo, 'NGN')}`}>
          {formatMoney(compareKobo, 'NGN')}
        </s>
      ) : null}
      {approx && (
        <span className="text-muted text-sm" title="Indicative conversion. You are charged in the currency shown at checkout.">
          {formatMoney(approx.amountMinor, approx.currency, { approx: true })}
        </span>
      )}
    </span>
  );
}
