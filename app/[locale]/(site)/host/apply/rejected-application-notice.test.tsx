import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { RejectedApplicationNotice } from './rejected-application-notice';

const copy = {
  eyebrow: 'Update from the team',
  title: "We can't move forward yet, Sara.",
  description: 'Our team left a note on your application.',
};

describe('<RejectedApplicationNotice>', () => {
  it("shows the reviewer's application-level note", () => {
    const html = renderToStaticMarkup(
      <RejectedApplicationNotice {...copy} reviewerNotes="The IBAN letter is unreadable." />,
    );
    expect(html).toContain('Update from the team');
    expect(html).toContain('The IBAN letter is unreadable.');
  });

  it('renders the status copy without a note', () => {
    const html = renderToStaticMarkup(<RejectedApplicationNotice {...copy} reviewerNotes={null} />);
    expect(html).toContain('Our team left a note on your application.');
    expect(html).not.toContain('text-al-qatt-red-800');
  });
});
