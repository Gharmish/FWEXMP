import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';
import ar from '@/messages/ar.json';
import en from '@/messages/en.json';
import { EMPTY_CRITERIA } from '@/features/experiences/lib/search';
import { ActiveFilters } from './active-filters';

function render(locale: 'ar' | 'en'): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={locale}
      messages={locale === 'ar' ? ar : en}
      timeZone="Asia/Riyadh"
    >
      <ActiveFilters
        criteria={{ ...EMPTY_CRITERIA, city: 'abha' }}
        cities={['Abha']}
        onRemove={() => {}}
      />
    </NextIntlClientProvider>,
  );
}

describe('<ActiveFilters> city token', () => {
  it('shows the Arabic city name on an Arabic page', () => {
    const html = render('ar');
    expect(html).toContain('أبها');
    expect(html).not.toContain('Abha');
  });

  it('keeps the English city name on an English page', () => {
    expect(render('en')).toContain('Abha');
  });
});
