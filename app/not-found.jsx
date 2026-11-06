import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="wrap grid min-h-[60vh] place-content-center py-24 text-center">
      <p className="font-display text-7xl text-burgundy">404</p>
      <h1 className="mt-4 font-display text-3xl">This page could not be found.</h1>
      <p className="mt-3 text-muted">It may have moved, or the link may be incomplete.</p>
      <div className="mt-8 flex justify-center gap-6"><Link className="btn btn-primary" href="/shop">Go to the shop</Link><Link className="link self-center" href="/">Home</Link></div>
    </main>
  );
}
