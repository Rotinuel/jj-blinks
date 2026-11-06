export default function Loading() {
  return (
    <div className="wrap pt-12" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <div className="h-12 w-1/3 animate-pulse bg-ivory-deep" />
      <div className="mt-10 grid grid-cols-2 gap-6 lg:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => <div key={i} className="aspect-[4/5] animate-pulse bg-ivory-deep" />)}
      </div>
    </div>
  );
}
