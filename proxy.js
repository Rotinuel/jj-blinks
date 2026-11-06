// Next.js 16 request proxy (formerly middleware). Optimistic redirect only: the real
// authorisation checks happen on the server in every protected page and action.
import { NextResponse } from 'next/server';

export function proxy(request) {
  const { pathname, search } = request.nextUrl;
  const hasSession = request.cookies.has('jjb_session');
  if (!hasSession && pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    return NextResponse.redirect(new URL(`/admin/login?next=${encodeURIComponent(pathname + search)}`, request.url));
  }
  if (!hasSession && pathname.startsWith('/account')) {
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(pathname + search)}`, request.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/admin/:path*', '/account/:path*'] };
