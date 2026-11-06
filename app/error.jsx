'use client';

export default function Error({ reset }) {
  return (
    <main className="wrap grid min-h-[60vh] place-content-center py-24 text-center">
      <h1 className="font-display text-3xl">Something went wrong loading this page.</h1>
      <p className="mt-3 text-muted">Try again. If it keeps happening, contact us.</p>
      <button className="btn btn-primary mx-auto mt-8" onClick={() => reset()}>Try again</button>
    </main>
  );
}
