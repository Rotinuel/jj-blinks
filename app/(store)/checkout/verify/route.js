// Paystack redirects the customer here with ?reference=… after payment. The redirect itself
// proves nothing: we ask Paystack's API for the transaction and confirm only on a match.
import { NextResponse } from 'next/server';
import { verifyAndConfirm } from '@/lib/orders';
import { notifyPaymentConfirmed } from '@/lib/notifications';
import { getOrderByPaymentReference } from '@/db/queries/orders';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const url = new URL(request.url);
  const reference = url.searchParams.get('reference') || url.searchParams.get('trxref') || '';
  let result = { status: 'unknown' };
  try {
    result = await verifyAndConfirm(reference);
    if (result.newlyPaid) await notifyPaymentConfirmed(result.orderId);
  } catch (err) {
    console.error('payment verification failed', err?.message);
    result = { status: 'error' };
  }
  const order = reference ? await getOrderByPaymentReference(reference) : null;
  const dest = new URL(['paid', 'already_paid'].includes(result.status) ? '/checkout/success' : '/checkout/failed', url.origin);
  if (order) {
    dest.searchParams.set('order', order.order_number);
    dest.searchParams.set('token', order.tracking_token);
  }
  dest.searchParams.set('status', result.status);
  return NextResponse.redirect(dest, { status: 303 });
}
