import { configuredProviders } from '@/lib/oauth';

/** "Continue with Google / Facebook". Renders nothing until the provider keys are set. */
export default function SocialButtons({ next = '/account' }) {
  const providers = configuredProviders();
  if (!providers.length) return null;
  return (
    <div className="grid gap-3">
      {providers.map((p) => (
        <a key={p.id} href={`/api/auth/${p.id}/start?next=${encodeURIComponent(next)}`} className="btn btn-outline w-full text-charcoal">
          Continue with {p.label}
        </a>
      ))}
      <p className="relative my-2 text-center text-xs text-muted before:absolute before:left-0 before:right-0 before:top-1/2 before:border-t before:border-line">
        <span className="relative bg-white px-3">or use your password</span>
      </p>
    </div>
  );
}
