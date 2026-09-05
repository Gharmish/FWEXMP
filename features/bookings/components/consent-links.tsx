import type { ReactNode } from 'react';
import { Link } from '@/lib/i18n';

/**
 * The three binding documents every consent line links to — Terms,
 * Privacy, Cancellation — as next-intl rich-text renderers keyed by the
 * `<terms>`, `<privacy>`, `<cancellation>` tags the message strings use.
 *
 * One builder for every consent surface (booking form, payment step,
 * widget step) so the links behave identically everywhere:
 *   - open in a new tab — reading what you're agreeing to must never
 *     navigate away and destroy a filled form (bfcache is least reliable
 *     in exactly the WhatsApp in-app browser the pay link arrives in);
 *   - announce that behaviour to assistive tech (`newTabLabel`, rendered
 *     sr-only inside each link — WCAG G201), since with the passive
 *     consent line the links are the only interactive part of the
 *     sentence.
 *
 * Server-safe: no hooks, no client directive.
 */
type ConsentDocument = '/terms' | '/privacy' | '/cancellation-policy';

function consentLink(href: ConsentDocument, className: string, newTabLabel: string) {
  const ConsentLink = (chunks: ReactNode) => (
    <Link href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {chunks}
      <span className="sr-only"> {newTabLabel}</span>
    </Link>
  );
  return ConsentLink;
}

export function consentLinkRenderers(
  className: string,
  newTabLabel: string,
): Record<'terms' | 'privacy' | 'cancellation', (chunks: ReactNode) => ReactNode> {
  return {
    terms: consentLink('/terms', className, newTabLabel),
    privacy: consentLink('/privacy', className, newTabLabel),
    cancellation: consentLink('/cancellation-policy', className, newTabLabel),
  };
}
