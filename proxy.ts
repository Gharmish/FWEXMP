import createMiddleware from 'next-intl/middleware';
import { routing } from '@/lib/i18n';

export default createMiddleware(routing);

export const config = {
  // Run on every path except API routes, Next internals, the AI manifest,
  // and anything that looks like a static file (has a dot).
  matcher: ['/((?!api|_next|_vercel|llms.txt|.*\\..*).*)'],
};
