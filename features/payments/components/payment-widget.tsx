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
  /** Divider between the Apple Pay button and the card form ("or pay with card"). */
  orCardLabel: string;
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
 * Brand order is Apple Pay first, then cards Mada-first as required by
 * Saudi Payments.
 *
 * Apple Pay renders as its own button above the card fields (the two
 * checkout options). The widget hides the APPLEPAY container on devices
 * that can't pay (non-Safari, no wallet), so `onReady` only injects the
 * "or pay with card" divider when the button is actually visible —
 * everyone else just sees the card form.
 *
 * If the script fails to load we surface a retry rather than leaving the
 * shopper stuck on a loading label forever — `attempt` re-runs the effect.
 */
export function PaymentWidget({
  checkout,
  loadingLabel,
  errorLabel,
  retryLabel,
  orCardLabel,
}: PaymentWidgetProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    setStatus('loading');
    window.wpwlOptions = {
      paymentTarget: '_top',
      // Passed through to Apple's PaymentRequest by the widget; the amount
      // itself comes from the prepared checkout, never from the browser.
      applePay: {
        version: 3,
        displayName: 'Gharmish',
        total: { label: 'Gharmish' },
        currencyCode: 'SAR',
        countryCode: 'SA',
        supportedNetworks: ['mada', 'masterCard', 'visa'],
        merchantCapabilities: ['supports3DS', 'supportsCredit', 'supportsDebit'],
        // Apple Pay tokens carry no cardholder name unless the sheet is
        // asked for it; without this the gateway receives holder "/" and
        // declines with 100.100.401 (holder too short). The sheet
        // auto-fills the name from the wallet card — no extra typing.
        requiredBillingContactFields: ['name'],
        style: 'black',
      },
      onReady: () => {
        // Divider between the Apple Pay button and the card fields — only
        // when the widget actually renders the button. On non-Apple
        // browsers the APPLEPAY container stays in the DOM (visible but
        // zero-height, holding only a hidden iframe), so the container
        // alone is not a signal; the `.wpwl-apple-pay-button` element is.
        // A `:has()` rule in globals.css hides the divider again if the
        // button disappears after injection, and flex `order` rules put
        // the Apple Pay container and divider visually above the card
        // form (the widget's own DOM order is card-first).
        const applePayButton = mount.querySelector('.wpwl-apple-pay-button');
        const card = mount.querySelector('.wpwl-container-card');
        if (!applePayButton || !card || mount.querySelector('[data-pay-divider]')) return;
        const divider = document.createElement('div');
        divider.setAttribute('data-pay-divider', '');
        divider.className = 'my-3 flex items-center gap-3';
        const line = () => {
          const el = document.createElement('span');
          el.className = 'bg-sarat-black/10 h-px flex-1';
          el.setAttribute('aria-hidden', 'true');
          return el;
        };
        const label = document.createElement('span');
        label.className = 'text-sarat-black-600 text-sm';
        label.textContent = orCardLabel;
        divider.append(line(), label, line());
        card.parentElement?.insertBefore(divider, card);
      },
    };

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
  }, [
    checkout.checkoutId,
    checkout.scriptBaseUrl,
    checkout.brands,
    checkout.returnUrl,
    orCardLabel,
    attempt,
  ]);

  return (
    <div className="flex flex-col gap-4">
      {status === 'loading' && (
        <div className="flex flex-col gap-3" role="status" aria-live="polite">
          <p className="text-sarat-black-600 text-sm">{loadingLabel}</p>
          {/* Placeholders shaped like the form COPYandPAY actually renders
              (Apple Pay + divider + card fields + pay button). Two bare rows
              reserved ~100px for a ~350px widget, so everything below the
              fold jumped when the script landed — size the stand-in like
              the real thing and the swap is calm. */}
          <div className="bg-sarat-black/5 rounded-input h-11 w-full animate-pulse motion-reduce:animate-none" />
          <div className="bg-sarat-black/10 mx-auto h-px w-2/3" aria-hidden />
          <div className="bg-sarat-black/5 rounded-input h-11 w-full animate-pulse motion-reduce:animate-none" />
          <div className="bg-sarat-black/5 rounded-input h-11 w-full animate-pulse motion-reduce:animate-none" />
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
          owns this div but never its children — see the comment above.
          `payment-widget-mount` anchors the globals.css rules that order
          Apple Pay above the card form (the widget replaces our form with
          unclassed markup, so there is no widget-owned hook to target). */}
      <div ref={mountRef} className={cn('payment-widget-mount', status === 'error' && 'hidden')} />
    </div>
  );
}
