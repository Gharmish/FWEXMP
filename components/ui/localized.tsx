import { isArPlaceholder, pickLocalized } from '@/lib/ar-placeholder';

interface LocalizedProps {
  locale: string;
  en: string;
  ar: string;
}

/**
 * Render a bilingual field with `pickLocalized`'s fallback rule, marking
 * the text with `lang`/`dir` whenever the language shown differs from
 * the page's (2026-09 engineering audit I18N-07): an English title inside
 * an Arabic page is then read in English by screen readers and shaped
 * LTR by the browser instead of inheriting the RTL run.
 */
export function Localized({ locale, en, ar }: LocalizedProps) {
  const text = pickLocalized(locale, en, ar);
  const arReal = ar.trim() !== '' && !isArPlaceholder(ar);
  const lang = text === ar && arReal ? 'ar' : 'en';
  if (text === '' || lang === locale) return <>{text}</>;
  return (
    <span lang={lang} dir={lang === 'ar' ? 'rtl' : 'ltr'}>
      {text}
    </span>
  );
}
