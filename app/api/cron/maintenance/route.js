// Daily housekeeping (Vercel Cron, see vercel.json). Vercel sends Authorization: Bearer $CRON_SECRET.
import { NextResponse } from 'next/server';
import { releaseExpiredOrders } from '@/lib/orders';
import { purgeOldRateLimits } from '@/lib/rate-limit';
import { purgeExpiredSessions } from '@/lib/session';
import { query } from '@/lib/db';
import { deleteFile } from '@/lib/storage';
import { safeEqual } from '@/lib/utilities';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get('authorization') || '';
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let expired = 0;
  do { expired = await releaseExpiredOrders(50); } while (expired === 50);
  await purgeOldRateLimits();
  await purgeExpiredSessions();
  // Anonymous uploads never attached to a submitted request are removed after a day.
  const orphans = await query(
    `DELETE FROM media_assets WHERE attached = FALSE AND purpose IN ('custom_reference','logo') AND created_at < NOW() - INTERVAL '1 day' RETURNING url`
  );
  for (const o of orphans) await deleteFile(o.url);
  return NextResponse.json({ ok: true, orphansRemoved: orphans.length });
}
