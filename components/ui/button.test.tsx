import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Button } from './button';

describe('<Button>', () => {
  it('defaults to type=button so a form never submits by accident', () => {
    expect(renderToStaticMarkup(<Button>Go</Button>)).toContain('type="button"');
  });

  it('marks a pending submit busy and disabled', () => {
    const html = renderToStaticMarkup(
      <Button type="submit" pending>
        Saving
      </Button>,
    );
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('disabled=""');
  });

  it('lets an explicit disabled prop win over pending', () => {
    const html = renderToStaticMarkup(
      <Button pending disabled={false}>
        Retry
      </Button>,
    );
    expect(html).not.toContain('disabled=""');
    expect(html).toContain('aria-busy="true"');
  });
});
