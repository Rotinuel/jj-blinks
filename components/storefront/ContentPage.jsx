export default function ContentPage({ title, intro, children, aside }) {
  return (
    <div className="wrap grid gap-12 pt-14 lg:grid-cols-12">
      <header className="lg:col-span-4">
        <h1 className="font-display text-title">{title}</h1>
        {intro && <p className="mt-4 text-muted">{intro}</p>}
        {aside}
      </header>
      <div className="prose-body max-w-[40rem] text-[1.05rem] lg:col-span-7 lg:col-start-6">{children}</div>
    </div>
  );
}

export function Paragraphs({ text }) {
  return String(text || '').split(/\n{2,}/).filter(Boolean).map((p, i) => <p key={i} className="whitespace-pre-line">{p}</p>);
}
