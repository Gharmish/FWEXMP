'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CheckoutReady } from '@/features/payments/actions';

declare global {
  interface Window {
    wpwlOptions?: Record<string, unknown>;
  }
}

export interface PaymentWidgetProps {
  checkout: CheckoutReady;
  /** Loading copy shown until the widget script renders. */
  loadingLabel: string;
  /** Shown if the widget script fails to load (e.g. flaky network). */
  errorLabel: string;
  /** Retry action label. */
  retryLabel: string;
}

/**
 * HyperPay COPYandPAY widget. The widget script mutates the DOM heavily
 * (it replaces `form.paymentWidgets` and injects iframes/siblings). React
 * must NOT own that subtree or its reconciler crashes during commit — so
 * we mount into a bare `div` ref and build the `form` imperatively; React
 * never sees its children.
 *
 * `window.wpwlOptions` is set with `paymentTarget: "_top"` (full-page 3DS
 * redirect, per the HyperPay onboarding email) *before* the script loads.
 * Brand order is Mada-first, as required by Saudi Payments.
 *
 * If the script fails to load we surface a retry rather than leaving the
 * shopper stuck on a loading label forever — `attempt` re-runs the effect.
 */
export function PaymentWidget({
  checkout,
  loadingLabel,
  errorLabel,
  retryLabel,
}: PaymentWidgetProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    setStatus('loading');
    window.wpwlOptions = { paymentTarget: '_top' };

    // Build the widget form imperatively so React doesn't manage it.
    const form = document.createElement('form');
    form.className = 'paymentWidgets';
    form.setAttribute('data-brands', checkout.brands);
    form.action = checkout.returnUrl;
    mount.appendChild(form);

    const script = document.createElement('script');
    script.src = `${checkout.scriptBaseUrl}v1/paymentWidgets.js?checkoutId=${encodeURIComponent(checkout.checkoutId)}`;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => setStatus('ready');
    script.onerror = () => setStatus('error');
    document.body.appendChild(script);

    return () => {
      script.remove();
      mount.replaceChildren();
      delete window.wpwlOptions;
    };
  }, [checkout.checkoutId, checkout.scriptBaseUrl, checkout.brands, checkout.returnUrl, attempt]);

  return (
    <div className="flex flex-col gap-4">
      {status === 'loading' && (
        <div className="flex flex-col gap-3" role="status" aria-live="polite">
          <p className="text-sarat-black-600 text-sm">{loadingLabel}</p>
          {/* Field-shaped placeholders so the panel reads as "loading a form"
              rather than looking broken on a slow connection. */}
          <div className="bg-sarat-black/5 rounded-input h-11 w-full animate-pulse motion-reduce:animate-none" />
          <div className="bg-sarat-black/5 rounded-input h-11 w-full animate-pulse motion-reduce:animate-none" />
        </div>
      )}

      {status === 'error' && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-al-qatt-red-800 text-sm">{errorLabel}</p>
          <Button
            type="button"
            variant="secondary"
            size="lg"
            onClick={() => setAttempt((a) => a + 1)}
          >
            {retryLabel}
          </Button>
        </div>
      )}

      {/* COPYandPAY mounts its fields into the form we append here. React
          owns this div but never its children — see the comment above. */}
      <div ref={mountRef} className={cn(status === 'error' && 'hidden')} />
    </div>
  );
}
