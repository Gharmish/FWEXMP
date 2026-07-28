import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { redirect } from '@/lib/i18n';
import type { Locale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { hasSupabaseAuth } from '@/lib/env';
import { getCurrentUser } from '@/features/auth/queries';
import { sanitizeNextPath } from '@/features/auth/lib/next-path';
import { SignInForm } from '@/app/[locale]/(auth)/sign-in/sign-in-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'auth.meta' });
  const title = t('title');
  return {
    title,
    // Auth surfaces shouldn't be indexed.
    robots: { index: false, follow: false },
  };
}

interface SearchParams {
  /** Where to send the user after sign-in. Locale-scoped, relative. */
  next?: string;
}

export default async function SignInPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const loc = locale as Locale;
  const { next: rawNext } = await searchParams;
  // Locale-less, open-redirect-safe target. The locale-aware `redirect()`
  // re-adds the active locale, so `next` must not carry one of its own.
  const next = sanitizeNextPath(rawNext);

  // Already signed in? Send them straight to `next` (or home).
  const user = await getCurrentUser();
  if (user) {
    redirect({ href: next, locale: loc });
  }

  const t = await getTranslations('auth');
  const eyebrowClassName = cn(
    'text-sarat-black-600 text-[11px]',
    loc === 'en' && 'tracking-[0.2em] uppercase',
  );

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <p className={eyebrowClassName}>{t('eyebrow')}</p>
        <h1 className="font-display text-4xl font-semibold tracking-[-0.035em] text-balance">
          {t('title')}
        </h1>
        <p className="text-sarat-black-600 text-base leading-relaxed">{t('intro')}</p>
      </div>

      <SignInForm
        locale={loc}
        next={next}
        // The form needs to know whether we're in stub mode so it can
        // show the dev hint ("any 6-digit code works"). The flag lives
        // on the server (env-derived) and gets threaded through here
        // rather than re-read on the client.
        isStubMode={!hasSupabaseAuth()}
        copy={{
          methodPhone: t('methodPhone'),
          methodEmail: t('methodEmail'),
          phoneLabel: t('phoneLabel'),
          phoneHint: t('phoneHint'),
          phonePlaceholder: t('phonePlaceholder'),
          countryLabel: t('countryLabel'),
          emailLabel: t('emailLabel'),
          emailHint: t('emailHint'),
          emailPlaceholder: t('emailPlaceholder'),
          requestSubmit: t('requestSubmit'),
          requestPending: t('requestPending'),
          codeLabel: t('codeLabel'),
          codeHint: t('codeHint'),
          codeHintEmail: t('codeHintEmail'),
          codeHintStub: t('codeHintStub'),
          verifySubmit: t('verifySubmit'),
          verifyPending: t('verifyPending'),
          changeIdentifier: t('changeIdentifier'),
          resend: t('resend'),
          resent: t('resent'),
          errors: {
            validation: t('errors.validation'),
            invalidPhone: t('errors.invalidPhone'),
            invalidEmail: t('errors.invalidEmail'),
            invalidCode: t('errors.invalidCode'),
            rateLimited: t('errors.rateLimited'),
            server: t('errors.server'),
          },
        }}
      />
    </div>
  );
}
