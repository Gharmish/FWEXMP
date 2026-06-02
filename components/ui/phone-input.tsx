'use client';

import { useMemo, useState, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';
import type { Locale } from '@/lib/i18n';
import { COUNTRIES, DEFAULT_COUNTRY, countryName, flagEmoji, parseE164, toE164 } from '@/lib/phone';

/** No-op store subscription — hydration state never changes after mount. */
const subscribeNoop = () => () => {};

export interface PhoneInputProps {
  /** Form field name for the canonical E.164 value (posted via a hidden input). */
  name: string;
  /** id for the national-number input — pair with the field's <label htmlFor>. */
  id: string;
  locale: Locale;
  /** Initial ISO country; defaults to Saudi Arabia (`+966`). */
  defaultCountry?: string;
  /** Stored E.164 value to re-hydrate (e.g. after a server validation error). */
  defaultValue?: string;
  required?: boolean;
  /** Placeholder for the national-number input (no leading zero). */
  placeholder?: string;
  /** Accessible label for the country selector. */
  countryLabel: string;
  invalid?: boolean;
  'aria-describedby'?: string;
}

/**
 * Phone field with an international dialling-code selector. Defaults to Saudi
 * Arabia (BRIEF §5) but lists every country except Israel (see `lib/phone`).
 * The national number is entered without a leading zero; the component posts a
 * single canonical E.164 string (`+<country><national>`) via a hidden input so
 * forms and server actions see one clean value.
 *
 * The flag is a Unicode regional-indicator glyph; the country name and dial
 * code are always shown as text so the option is usable even where flag glyphs
 * don't render.
 */
export function PhoneInput({
  name,
  id,
  locale,
  defaultCountry = DEFAULT_COUNTRY,
  defaultValue,
  required,
  placeholder,
  countryLabel,
  invalid,
  'aria-describedby': describedBy,
}: PhoneInputProps) {
  const parsed = defaultValue ? parseE164(defaultValue) : undefined;
  const [iso, setIso] = useState<string>(parsed?.iso ?? defaultCountry);
  const [national, setNational] = useState<string>(parsed?.national ?? '');

  // `Intl.DisplayNames`/`Intl.Collator` resolve differently across the Node
  // (SSR) and browser ICU builds — both the localized name text and the sort
  // order can diverge, which would trip a hydration mismatch. So we render
  // only the selected country on the server + first client render (identical
  // on both), then expand to the full, localized, sorted list after mount.
  // `useSyncExternalStore` returns false during SSR + first client render and
  // true once hydrated — the canonical hydration check, without a state-in-
  // effect cascade.
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  // Sort by localized country name; the default country is pinned first.
  const options = useMemo(() => {
    const collator = new Intl.Collator(locale);
    return [...COUNTRIES]
      .map((c) => ({ ...c, name: countryName(c.iso, locale) }))
      .sort((a, b) => {
        if (a.iso === defaultCountry) return -1;
        if (b.iso === defaultCountry) return 1;
        return collator.compare(a.name, b.name);
      });
  }, [locale, defaultCountry]);

  const visibleOptions = mounted ? options : options.filter((c) => c.iso === iso);

  const e164 = toE164(iso, national) ?? '';

  return (
    <div className="flex items-stretch gap-2" dir="ltr">
      <input type="hidden" name={name} value={e164} />

      <select
        aria-label={countryLabel}
        aria-invalid={invalid ? 'true' : undefined}
        value={iso}
        onChange={(event) => setIso(event.target.value)}
        className={cn(
          'rounded-input border-sarat-black/20 bg-fog-white text-sarat-black h-11 w-36 shrink-0 truncate [border-width:0.5px] ps-3 pe-2 text-base',
          'aria-invalid:border-al-qatt-red',
        )}
      >
        {visibleOptions.map((c) => (
          // `suppressHydrationWarning`: the localized name text can differ
          // between the server and browser ICU builds; the value is stable.
          <option key={c.iso} value={c.iso} suppressHydrationWarning>
            {/* Dial code right after the flag so it stays visible when the
                trigger truncates a long country name. */}
            {`${flagEmoji(c.iso)} +${c.dial} ${c.name}`}
          </option>
        ))}
      </select>

      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        required={required}
        value={national}
        onChange={(event) => setNational(event.target.value)}
        placeholder={placeholder}
        aria-invalid={invalid ? 'true' : undefined}
        aria-describedby={describedBy}
        className={cn(
          'rounded-input border-sarat-black/20 bg-fog-white text-sarat-black h-11 w-full min-w-0 flex-1 [border-width:0.5px] px-4 text-base',
          'placeholder:text-sarat-black-600 disabled:pointer-events-none disabled:opacity-50',
          'aria-invalid:border-al-qatt-red',
        )}
      />
    </div>
  );
}
