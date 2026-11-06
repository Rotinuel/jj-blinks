import Link from 'next/link';
import { requirePermission } from '@/lib/auth';
import { query } from '@/lib/db';
import { formatDate } from '@/lib/utilities';
import { moderateReviewAction } from '@/app/actions/admin/store';
import SubmitButton from '@/components/admin/SubmitButton';
import { Flash, PageHead } from '@/components/admin/ui';

export const metadata = { title: 'Reviews' };

export default async function ReviewsAdmin({ searchParams }) {
  await requirePermission('reviews.moderate');
  const sp = await searchParams;
  const status = ['pending', 'approved', 'rejected'].includes(sp.status) ? sp.status : 'pending';
  const rows = await query(
    `SELECT r.*, p.name AS product_name, p.slug, u.email FROM reviews r JOIN products p ON p.id = r.product_id LEFT JOIN users u ON u.id = r.user_id
      WHERE r.status = $1 ORDER BY r.created_at DESC LIMIT 100`, [status]);
  return (
    <>
      <PageHead title="Reviews" />
      <Flash sp={sp} />
      <nav className="mb-6 flex gap-4 text-sm">{['pending', 'approved', 'rejected'].map((s) => <Link key={s} href={`/admin/reviews?status=${s}`} className={s === status ? 'text-burgundy underline' : 'hover:text-wine'}>{s}</Link>)}</nav>
      <p className="mb-4 text-sm text-muted">Only customers with a paid order for the product can submit reviews. Nothing appears in the store until approved.</p>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.id} className="py-5">
            <p className="text-sm text-muted"><Link className="link" href={`/products/${r.slug}`}>{r.product_name}</Link> · {r.rating}/5 · {r.display_name} ({r.email}) · {formatDate(r.created_at)}{r.verified_purchase && ' · verified purchase'}</p>
            {r.title && <p className="mt-1 font-medium">{r.title}</p>}
            <p className="mt-1 whitespace-pre-line">{r.body}</p>
            <div className="mt-3 flex gap-4">
              {['approved', 'rejected', 'delete'].filter((op) => op !== r.status).map((op) => (
                <form key={op} action={moderateReviewAction}><input type="hidden" name="id" value={r.id} /><input type="hidden" name="op" value={op} />
                  <SubmitButton className={op === 'delete' ? 'text-sm text-danger underline' : 'btn btn-outline btn-sm'} confirm={op === 'delete' ? 'Delete this review permanently?' : undefined}>{op === 'approved' ? 'Approve' : op === 'rejected' ? 'Hide' : 'Delete'}</SubmitButton>
                </form>
              ))}
            </div>
          </li>
        ))}
      </ul>
      {!rows.length && <p className="text-muted">No {status} reviews.</p>}
    </>
  );
}
