import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StarRating } from './star-rating';

describe('<StarRating>', () => {
  it('announces the rating once and hides the five decorative glyphs', () => {
    const html = renderToStaticMarkup(<StarRating rating={4.6} label="4.6 out of 5" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="4.6 out of 5"');
    expect(html.match(/aria-hidden="true"/g)).toHaveLength(5);
    // 4.6 floors to four filled stars.
    expect(html.match(/fill-saffron-gold-600/g)).toHaveLength(4);
  });

  it('clamps out-of-range values and paints the low tone in the error colour', () => {
    expect(
      renderToStaticMarkup(<StarRating rating={9} label="x" />).match(/fill-saffron-gold-600/g),
    ).toHaveLength(5);
    expect(renderToStaticMarkup(<StarRating rating={-2} label="x" />)).not.toContain(
      'fill-saffron-gold-600',
    );
    expect(renderToStaticMarkup(<StarRating rating={1} label="x" tone="low" />)).toContain(
      'fill-al-qatt-red',
    );
  });
});
