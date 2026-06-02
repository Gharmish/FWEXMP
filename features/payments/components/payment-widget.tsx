'use client';

import { useEffect, useRef, useState } from 'react';
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
 */
export function PaymentWidget({ checkout, loadingLabel }: PaymentWidgetProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

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
    script.onload = () => setReady(true);
    document.body.appendChild(script);

    return () => {
      script.remove();
      mount.replaceChildren();
      delete window.wpwlOptions;
    };
  }, [checkout.checkoutId, checkout.scriptBaseUrl, checkout.brands, checkout.returnUrl]);

  return (
    <div className="flex flex-col gap-4">
      {!ready && (
        <p className="text-sarat-black-600 text-sm" role="status">
          {loadingLabel}
        </p>
      )}
      {/* COPYandPAY mounts its fields into the form we append here. React
          owns this div but never its children — see the comment above. */}
      <div ref={mountRef} />
    </div>
  );
}
