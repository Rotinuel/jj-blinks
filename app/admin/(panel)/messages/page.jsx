import { requirePermission } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatDateTime } from '@/lib/utilities';
import { messageHandledAction } from '@/app/actions/admin/store';
import SubmitButton from '@/components/admin/SubmitButton';
import { Flash, PageHead } from '@/components/admin/ui';

export const metadata = { title: 'Messages' };

export default async function MessagesAdmin({ searchParams }) {
  await requirePermission('messages.view');
  const sp = await searchParams;
  const [messages, subs] = await Promise.all([
    query('SELECT * FROM contact_messages ORDER BY status, created_at DESC LIMIT 200'),
    query('SELECT email, consented_at FROM newsletter_subscribers WHERE unsubscribed_at IS NULL ORDER BY consented_at DESC LIMIT 1000'),
  ]);
  return (
    <>
      <PageHead title="Messages" />
      <Flash sp={sp} />
      <ul className="divide-y divide-line">
        {messages.map((m) => (
          <li key={m.id} className={`py-5 ${m.status === 'handled' ? 'opacity-60' : ''}`}>
            <p className="text-sm text-muted">{formatDateTime(m.created_at)} · {m.name} · <a className="link" href={`mailto:${m.email}?subject=${encodeURIComponent(`Re: ${m.subject || 'Your message to JJ BLINKS'}`)}`}>{m.email}</a>{m.phone && ` · ${m.phone}`}</p>
            {m.subject && <p className="mt-1 font-medium">{m.subject}</p>}
            <p className="mt-1 whitespace-pre-line">{m.message}</p>
            {m.status === 'new' && <form action={messageHandledAction} className="mt-2"><input type="hidden" name="id" value={m.id} /><SubmitButton className="btn btn-outline btn-sm">Mark handled</SubmitButton></form>}
          </li>
        ))}
      </ul>
      {!messages.length && <p className="text-muted">No messages yet.</p>}
      <section className="mt-12"><h2 className="mb-3 font-display text-2xl">Newsletter subscribers ({subs.length})</h2>
        {subs.length ? <textarea readOnly className="input h-40 font-mono text-xs" aria-label="Subscriber emails" value={subs.map((s) => s.email).join('\n')} /> : <p className="text-muted">None yet.</p>}
        <p className="mt-2 text-xs text-muted">Copy these into your email tool. Everyone listed ticked the consent box.</p>
      </section>
    </>
  );
}
