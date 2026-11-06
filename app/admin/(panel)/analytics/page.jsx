import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { analytics } from '@/db/queries/admin';
import { countryName } from '@/lib/countries';
import { formatMoney } from '@/lib/currency';
import BarChart from '@/components/admin/BarChart';
import { PageHead, Stat } from '@/components/admin/ui';

export const metadata = { title: 'Sales analytics' };

export default async function AnalyticsAdmin({ searchParams }) {
  await requirePermission('finance.view');
  const sp = await searchParams;
  const days = [7, 30, 90, 365].includes(Number(sp.days)) ? Number(sp.days) : 30;
  const a = await analytics(days);
  const s = a.summary;
  return (
    <>
      <PageHead title="Sales analytics">
        <nav className="flex gap-4 text-sm" aria-label="Period">{[7, 30, 90, 365].map((d) => <Link key={d} href={`/admin/analytics?days=${d}`} className={d === days ? 'text-burgundy underline' : 'hover:text-wine'}>{d === 365 ? '12 months' : `${d} days`}</Link>)}</nav>
      </PageHead>
      <p className="mb-6 text-sm text-muted">Only payments verified with Paystack count. Dates are Lagos time. Gross = items + delivery; net = what was paid minus refunds.</p>
      <div className="mb-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Paid orders" value={s.orders} />
        <Stat label="Gross sales" value={formatMoney(s.gross_kobo)} />
        <Stat label="Discounts" value={formatMoney(s.discount_kobo)} />
        <Stat label="Refunds" value={formatMoney(s.refunded_kobo)} />
        <Stat label="Net sales" value={formatMoney(s.net_kobo)} />
      </div>
      <BarChart data={a.daily} title={`Net sales per day, last ${days} days`} />
      <details className="mt-3 text-sm"><summary className="link cursor-pointer">Show as a table</summary>
        <table className="table mt-3"><thead><tr><th>Day</th><th>Orders</th><th className="text-right">Net</th></tr></thead>
          <tbody>{a.daily.filter((d) => d.orders > 0).map((d) => <tr key={d.day}><td>{d.day}</td><td>{d.orders}</td><td className="text-right">{formatMoney(d.net_kobo)}</td></tr>)}</tbody></table>
      </details>
      <div className="mt-12 grid gap-10 xl:grid-cols-3">
        <section><h2 className="mb-3 font-display text-2xl">Top items</h2>
          <table className="table"><thead><tr><th>Item</th><th>Qty</th><th className="text-right">Revenue</th></tr></thead>
            <tbody>{a.top.map((t) => <tr key={t.name}><td>{t.name}</td><td>{t.qty}</td><td className="text-right">{formatMoney(t.revenue_kobo)}</td></tr>)}</tbody></table>
          {!a.top.length && <p className="text-sm text-muted">No sales in this period.</p>}
        </section>
        <section><h2 className="mb-3 font-display text-2xl">By destination</h2>
          <table className="table"><thead><tr><th>Country</th><th>Orders</th><th className="text-right">Net</th></tr></thead>
            <tbody>{a.countries.map((c) => <tr key={c.country}><td>{countryName(c.country)}</td><td>{c.orders}</td><td className="text-right">{formatMoney(c.net_kobo)}</td></tr>)}</tbody></table>
        </section>
        <section><h2 className="mb-3 font-display text-2xl">Payment channels</h2>
          <table className="table"><thead><tr><th>Channel</th><th>Payments</th><th className="text-right">Amount</th></tr></thead>
            <tbody>{a.channels.map((c) => <tr key={c.channel + c.currency}><td>{c.channel}</td><td>{c.payments}</td><td className="text-right">{formatMoney(c.amount_minor, c.currency)}</td></tr>)}</tbody></table>
        </section>
      </div>
    </>
  );
}
