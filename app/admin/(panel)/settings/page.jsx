import { requirePermission } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { getSettings } from '@/lib/settings';
import { recentFxSnapshots } from '@/lib/fx';
import { paymentsConfigured } from '@/lib/payments';
import { fromAddress, fromMismatchWarning, smtpConfig } from '@/lib/email';
import { blobConfigured } from '@/lib/storage';
import { DISPLAY_CURRENCIES, FX_ATTRIBUTION } from '@/lib/currency';
import { appUrl, formatDateTime } from '@/lib/utilities';
import { refreshFxAction, saveCurrencyAction, savePaymentsAction, saveStoreAction, sendTestEmailAction } from '@/app/actions/admin/store';
import SubmitButton from '@/components/admin/SubmitButton';
import { Field, Flash, PageHead } from '@/components/admin/ui';

export const metadata = { title: 'Settings' };

export default async function SettingsAdmin({ searchParams }) {
  const user = await requirePermission('settings.manage');
  const [sp, settings, snaps] = await Promise.all([searchParams, getSettings(), recentFxSnapshots(5)]);
  const st = settings.store;
  const cur = settings.currency;
  const perUnit = (c) => (cur.manual_rates?.[c] ? (1 / cur.manual_rates[c]).toFixed(2) : '');
  const smtp = smtpConfig();
  const mailWarning = fromMismatchWarning();
  return (
    <>
      <PageHead title="Settings" />
      <Flash sp={sp} />
      <section className="mb-12 grid gap-2 text-sm">
        <h2 className="mb-2 font-display text-2xl">Integrations</h2>
        <p>Paystack: {paymentsConfigured() ? 'connected' : 'not connected — set PAYSTACK_SECRET_KEY'}. Webhook URL: <code className="break-all">{appUrl('/api/webhooks/paystack')}</code></p>
        <p>Image storage (Vercel Blob): {blobConfigured() ? 'connected' : process.env.NODE_ENV === 'production' ? 'not connected — uploads disabled' : 'not connected — development uploads saved locally'}</p>
      </section>

      <section className="mb-12 max-w-4xl text-sm">
        <h2 className="mb-2 font-display text-2xl">Email</h2>
        {smtp ? (
          <>
            <p>Sending as <strong>{fromAddress(process.env, st.name)}</strong> through {smtp.host}:{smtp.port}.</p>
            {process.env.EMAIL_REPLY_TO && <p>Replies go to {process.env.EMAIL_REPLY_TO}.</p>}
            {/gmail\.com$/i.test(smtp.host) && <p className="mt-1 text-muted">Gmail allows about 500 emails a day from a personal account. That covers a growing store; move to info@jjblinks.com on a business mailbox before you outgrow it.</p>}
            {mailWarning && <p className="notice mt-3">{mailWarning}</p>}
            <form action={sendTestEmailAction} className="mt-4 flex flex-wrap items-end gap-3">
              <Field label="Send a test email to" name="to" type="email" defaultValue={user.email} className="w-72" />
              <SubmitButton className="btn btn-outline btn-sm mb-1" pendingText="Sending…">Send test email</SubmitButton>
            </form>
          </>
        ) : (
          <p>Not set up — no emails are sent. Add <code>SMTP_HOST</code>, <code>SMTP_USER</code> and <code>SMTP_PASSWORD</code> in Vercel, then redeploy. See the README, section 7.</p>
        )}
        <p className="mt-3 text-muted">The address customers see on the site and in the footer is the store email below; change it there when you move to info@jjblinks.com.</p>
      </section>

      <form action={saveStoreAction} className="mb-12 grid max-w-4xl gap-4 sm:grid-cols-2">
        <h2 className="font-display text-2xl sm:col-span-2">Store details</h2>
        <Field label="Store name" name="name" defaultValue={st.name} />
        <Field label="Tagline" name="tagline" defaultValue={st.tagline} />
        <Field label="Email" name="email" type="email" defaultValue={st.email} required />
        <Field label="WhatsApp (international digits)" name="whatsapp" defaultValue={st.whatsapp} hint="e.g. 2348032242010" />
        <Field label="Phone" name="phone" defaultValue={st.phone} />
        <Field label="Alternative phone" name="phone_alt" defaultValue={st.phone_alt} />
        <Field label="Address" name="address" defaultValue={st.address} className="sm:col-span-2" />
        <Field label="Opening hours (optional)" name="hours" defaultValue={st.hours} className="sm:col-span-2" />
        <h3 className="mt-4 font-medium sm:col-span-2">Social links (leave empty if you do not use one)</h3>
        {['instagram', 'facebook', 'tiktok', 'x', 'youtube'].map((k) => <Field key={k} label={k === 'x' ? 'X' : k[0].toUpperCase() + k.slice(1)} name={`social_${k}`} defaultValue={settings.social[k]} placeholder="https://" />)}
        <SubmitButton className="btn btn-primary justify-self-start sm:col-span-2">Save store details</SubmitButton>
      </form>

      <form action={saveCurrencyAction} className="mb-6 grid max-w-4xl gap-4 sm:grid-cols-2">
        <h2 className="font-display text-2xl sm:col-span-2">Currency display</h2>
        <p className="text-sm text-muted sm:col-span-2">Prices are always set and recorded in NGN. Other currencies ({DISPLAY_CURRENCIES.filter((c) => c !== 'NGN').join(', ')}) are shown as approximate conversions only.</p>
        <Field label="Exchange-rate source" name="fx_source" className="sm:col-span-2">
          <select id="fx_source" name="fx_source" defaultValue={cur.fx_source} className="input">
            <option value="none">None — show NGN only</option>
            <option value="open_er_api">Live daily rates from ExchangeRate-API (open.er-api.com)</option>
            <option value="manual">Rates I enter below</option>
          </select>
        </Field>
        {DISPLAY_CURRENCIES.filter((c) => c !== 'NGN').map((c) => <Field key={c} label={`Manual: ₦ per 1 ${c}`} name={`rate_${c}`} defaultValue={perUnit(c)} inputMode="decimal" />)}
        <p className="text-xs text-muted sm:col-span-2">{cur.manual_updated_at && `Manual rates last changed ${formatDateTime(cur.manual_updated_at)}. `}Live rates: <a className="link" href={FX_ATTRIBUTION.href} target="_blank" rel="noopener noreferrer">{FX_ATTRIBUTION.label}</a>, updated once a day; attribution is shown in the store footer.</p>
        <SubmitButton className="btn btn-primary justify-self-start">Save currency settings</SubmitButton>
      </form>
      {cur.fx_source === 'open_er_api' && (
        <div className="mb-12 max-w-4xl text-sm">
          <form action={refreshFxAction}><SubmitButton className="btn btn-outline btn-sm" pendingText="Fetching…">Refresh live rates now</SubmitButton></form>
          {snaps.length > 0 && <ul className="mt-3 text-muted">{snaps.map((s) => <li key={s.id}>{formatDateTime(s.fetched_at)} ({s.source}): {Object.entries(s.rates).map(([c, r]) => `${c} ≈ ₦${(1 / r).toFixed(0)}`).join(', ')}</li>)}</ul>}
        </div>
      )}

      <form action={savePaymentsAction} className="grid max-w-4xl gap-4 sm:grid-cols-2">
        <h2 className="font-display text-2xl sm:col-span-2">Payments</h2>
        {!can(user.role, 'settings.payments') && <p className="notice sm:col-span-2">Only a super admin can change payment settings.</p>}
        <Field label="Unpaid order hold (minutes)" name="payment_window_minutes" type="number" min={15} max={1440} defaultValue={settings.payments.payment_window_minutes} hint="Stock is released if payment is not completed in time." />
        <Field label="Time to pay after a quotation (days)" name="quote_payment_days" type="number" min={1} max={30} defaultValue={settings.payments.quote_payment_days} />
        <label className="flex items-start gap-2 text-sm sm:col-span-2"><input type="checkbox" name="usd_enabled" defaultChecked={settings.payments.usd_enabled} className="mt-1" />
          <span>Offer payment in USD at checkout. Turn on only after Paystack has enabled USD settlement on your account; the USD amount is calculated from the exchange-rate source above and fixed when the order is placed.</span></label>
        {can(user.role, 'settings.payments') && <SubmitButton className="btn btn-primary justify-self-start">Save payment settings</SubmitButton>}
      </form>
    </>
  );
}
