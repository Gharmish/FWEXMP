import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Localized } from './localized';

describe('<Localized>', () => {
  it('renders bare text when the shown language is the page language', () => {
    expect(renderToStaticMarkup(<Localized locale="ar" en="Sunrise" ar="الشروق" />)).toBe('الشروق');
    expect(renderToStaticMarkup(<Localized locale="en" en="Sunrise" ar="الشروق" />)).toBe(
      'Sunrise',
    );
  });

  it('marks an English fallback inside an Arabic page with lang and dir', () => {
    const html = renderToStaticMarkup(
      <Localized locale="ar" en="Sunrise" ar="TODO(ar): Sunrise" />,
    );
    expect(html).toBe('<span lang="en" dir="ltr">Sunrise</span>');
  });

  it('marks real Arabic shown on an English page', () => {
    const html = renderToStaticMarkup(<Localized locale="en" en="" ar="الشروق" />);
    expect(html).toBe('<span lang="ar" dir="rtl">الشروق</span>');
  });
});
