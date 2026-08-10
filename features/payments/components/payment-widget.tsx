'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import type { CheckoutReady } from '@/features/payments/actions';

declare global {
  interface Window {
    wpwlOptions?: Record<string, unknown>;
  }
}

export interface PaymentWidgetProps {
  checkout: CheckoutReady;
  /** Widget UI language — COPYandPAY ships its own ar/en field labels. */
  locale: Locale;
  /** Pay-button label carrying the charged amount, e.g. "Pay SAR 480". */
  payLabel: string;
  /** Loading copy shown until the widget script renders. */
  loadingLabel: string;
  /** Shown if the HyperPay widget script fails to load (e.g. flaky network). */
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
 * A checkout carries ONE brand set — APPLEPAY on its own entity, or the
 * Mada-first card brands (Saudi Payments rule) — so the widget renders a
 * single payment option; the method choice lives on the details step.
 *
 * If the script fails to load we surface a retry rather than leaving the
 * shopper stuck on a loading label forever — `attempt` re-runs the effect.
 */
export function PaymentWidget({
  checkout,
  locale,
  payLabel,
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
    window.wpwlOptions = {
      paymentTarget: '_top',
      // Widget chrome language (field labels, validation hints) — ships
      // its own Arabic translations and flips the fields RTL.
      locale,
      // "plain" drops the widget's grey card mock-up and brand <select>;
      // the fields become bare label+input rows that the `.wpwl-*` rules
      // in globals.css restyle to the design system (BRIEF §3).
      style: 'plain',
      // With the brand select gone the scheme is detected from the PAN.
      // `binlist` is required for Mada BIN ranges (Saudi Payments rule:
      // Mada-first, and a Mada card must never be routed as VISA/MASTER).
      brandDetection: true,
      brandDetectionType: 'binlist',
      brandDetectionPriority: ['MADA', 'VISA', 'MASTER'],
      // The PAN + CVV inputs live in cross-origin iframes our stylesheet
      // can't reach; the widget forwards these rules inside. Literal hex
      // mirrors the palette tokens (sarat-black / sarat-black-600 —
      // globals.css) because CSS variables don't cross the iframe
      // boundary; next/font Bricolage can't either, so the stack matches
      // the token fallback. 16px also keeps iOS Safari from zooming the
      // field on focus.
      iframeStyles: {
        'card-number': {
          color: '#0a0a0a',
          'font-size': '16px',
          'font-family': 'ui-sans-serif, system-ui, sans-serif',
        },
        cvv: {
          color: '#0a0a0a',
          'font-size': '16px',
          'font-family': 'ui-sans-serif, system-ui, sans-serif',
        },
        'card-number-placeholder': {
          color: '#686868',
          'font-size': '16px',
          'font-family': 'ui-sans-serif, system-ui, sans-serif',
        },
        'cvv-placeholder': {
          color: '#686868',
          'font-size': '16px',
          'font-family': 'ui-sans-serif, system-ui, sans-serif',
        },
      },
      // Passed through to Apple's PaymentRequest by the widget; the amount
      // itself comes from the prepared checkout, never from the browser.
      //
      // This block mirrors the script HyperPay sent in the 2026-08-10
      // meeting, verbatim except their sample placeholders (MyStore /
      // COMPANY, INC. / amount 0.10 — the real amount auto-fills from the
      // checkout). Their `version: 3` contradicts their own guide's
      // mada-needs-≥5 rule, and `applePayCapabilities` availability mode
      // needed `merchantIdentifier` per the widget source — both applied
      // as instructed; revisit with HyperPay if mada drops off the sheet
      // or the button vanishes.
      //
      // Do NOT add requiredBillingContactFields/submitOnPaymentAuthorized:
      // appending sheet contacts duplicates the checkout's customer/billing
      // parameters and the gateway rejects the submission with 200.300.404
      // (verified 2026-07-14/15). The cardholder name the Apple token lacks
      // is supplied server-side — `card.holder` on the applepay-channel
      // checkout (hyperpay-core).
      applePay: {
        version: 3,
        checkAvailability: 'applePayCapabilities',
        displayName: 'Gharmish',
        total: { label: 'Gharmish' },
        supportedNetworks: ['mada', 'masterCard', 'visa'],
        countryCode: 'SA',
        buttonStyle: 'black',
      },
      onReady: () => {
        // The moment money leaves is where the amount must be visible —
        // the widget's stock "Pay now" becomes "Pay SAR 480" (localized).
        // Guarded: an Apple Pay-only checkout renders no card pay button.
        const payButton = mount.querySelector('.wpwl-button-pay');
        if (payButton) payButton.textContent = payLabel;
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
    // SRI: the browser rejects a widget script that doesn't match the
    // hash the gateway issued for this checkout (HyperPay go-live
    // requirement). Null only for pre-rollout checkouts reused from the
    // DB, which still load un-pinned rather than breaking mid-payment.
    if (checkout.integrity) script.integrity = checkout.integrity;
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
    checkout.integrity,
    checkout.scriptBaseUrl,
    checkout.brands,
    checkout.returnUrl,
    locale,
    payLabel,
    attempt,
  ]);

  return (
    <div className="flex flex-col gap-4">
      {status === 'loading' && (
        <div className="flex flex-col gap-3" role="status" aria-live="polite">
          <p className="text-sarat-black-600 text-sm">{loadingLabel}</p>
          {/* Placeholders shaped like the form COPYandPAY actually renders
              (four labeled card fields + pay button). Two bare rows
              reserved ~100px for a ~350px widget, so everything below the
              fold jumped when the script landed — size the stand-in like
              the real thing and the swap is calm. */}
          <div className="bg-sarat-black/5 rounded-input h-11 w-full animate-pulse motion-reduce:animate-none" />
          <div className="bg-sarat-black/5 rounded-input h-11 w-full animate-pulse motion-reduce:animate-none" />
          <div className="bg-sarat-black/5 rounded-input h-11 w-full animate-pulse motion-reduce:animate-none" />
          <div className="bg-sarat-black/5 rounded-input h-11 w-full animate-pulse motion-reduce:animate-none" />
          <div className="bg-sarat-black/5 rounded-button h-13 w-full animate-pulse motion-reduce:animate-none" />
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
          `payment-widget-mount` anchors the globals.css theming rules (the
          widget replaces our form with unclassed markup, so there is no
          widget-owned hook to target). */}
      <div ref={mountRef} className={cn('payment-widget-mount', status === 'error' && 'hidden')} />
    </div>
  );
}
