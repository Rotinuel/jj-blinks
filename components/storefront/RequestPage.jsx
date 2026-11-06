import { listCategories } from '@/db/queries/catalog';
import { getStoreContext } from '@/lib/storefront';
import { whatsappLink } from '@/lib/utilities';
import RequestForm from './RequestForm';

export default async function RequestPage({ kind, title, intro, points, product }) {
  const [{ settings }, cats] = await Promise.all([getStoreContext(), listCategories({ includeService: false })]);
  const wa = whatsappLink(settings.store.whatsapp, kind === 'bulk' ? 'Hello JJ BLINKS, I would like a quotation for a bulk order.' : 'Hello JJ BLINKS, I would like to discuss a custom order.');
  return (
    <div className="wrap grid gap-14 pt-14 lg:grid-cols-12">
      <div className="lg:col-span-4">
        <div className="lg:sticky lg:top-28">
          <h1 className="font-display text-title">{title}</h1>
          <p className="mt-5 text-muted">{intro}</p>
          <ol className="mt-8 space-y-4 border-l border-gold pl-5 text-sm">
            {points.map((p) => <li key={p}>{p}</li>)}
          </ol>
          {wa && <a href={wa} target="_blank" rel="noopener noreferrer" className="link mt-8 inline-block text-sm">Prefer to talk? Message us on WhatsApp</a>}
        </div>
      </div>
      <div className="lg:col-span-7 lg:col-start-6">
        <RequestForm kind={kind} productTypes={cats.map((c) => c.name)} defaultProduct={product} />
      </div>
    </div>
  );
}
