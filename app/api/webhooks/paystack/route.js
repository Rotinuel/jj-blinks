// Paystack webhook. Configure in Paystack Dashboard → Settings → API Keys & Webhooks:
//   https://<your-domain>/api/webhooks/paystack
// The signature is verified against the raw body; events are de-duplicated; charge.success is
// re-verified with Paystack's API before an order is marked paid.
import { NextResponse } from 'next/server';
import { handleProviderWebhook } from '@/lib/orders';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  const raw = await request.text();
  if (raw.length > 256 * 1024) return NextResponse.json({ ok: false }, { status: 413 });
  try {
    const { httpStatus, result } = await handleProviderWebhook(raw, request.headers.get('x-paystack-signature'));
    return NextResponse.json({ ok: httpStatus === 200, result }, { status: httpStatus });
  } catch (err) {
    console.error('webhook processing failed', err?.message);
    // 500 makes Paystack retry later; processing is idempotent.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
