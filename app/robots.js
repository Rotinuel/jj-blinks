import { appUrl } from '@/lib/utilities';

export default function robots() {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/account', '/api', '/checkout', '/cart', '/track/', '/requests/'] }],
    sitemap: appUrl('/sitemap.xml'),
  };
}
