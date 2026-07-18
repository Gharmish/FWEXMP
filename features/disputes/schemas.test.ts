import { describe, expect, it } from 'vitest';
import {
  createDisputeSchema,
  DISPUTE_MESSAGE_MAX,
  resolveDisputeSchema,
} from '@/features/disputes/schemas';

const REF = '11111111-1111-4111-8111-111111111111';

describe('createDisputeSchema', () => {
  it('accepts a valid report and trims the message', () => {
    const result = createDisputeSchema.safeParse({
      reference: REF,
      message: '  The host never showed up.  ',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.message).toBe('The host never showed up.');
  });

  it('rejects a message under 10 characters (after trimming)', () => {
    expect(createDisputeSchema.safeParse({ reference: REF, message: 'too short' }).success).toBe(
      false,
    );
    expect(createDisputeSchema.safeParse({ reference: REF, message: '   padded   ' }).success).toBe(
      false,
    );
  });

  it('rejects a message over the max length', () => {
    expect(
      createDisputeSchema.safeParse({
        reference: REF,
        message: 'x'.repeat(DISPUTE_MESSAGE_MAX + 1),
      }).success,
    ).toBe(false);
  });

  it('rejects a non-uuid reference', () => {
    expect(
      createDisputeSchema.safeParse({ reference: 'GH-ABC123', message: 'A real problem here.' })
        .success,
    ).toBe(false);
  });
});

describe('resolveDisputeSchema', () => {
  it('accepts with and without notes', () => {
    expect(resolveDisputeSchema.safeParse({ disputeId: REF, issueRefund: false }).success).toBe(
      true,
    );
    const withNotes = resolveDisputeSchema.safeParse({
      disputeId: REF,
      adminNotes: ' Refunded in full. ',
      issueRefund: true,
    });
    expect(withNotes.success).toBe(true);
    if (withNotes.success) expect(withNotes.data.adminNotes).toBe('Refunded in full.');
  });

  it('rejects over-long notes and a non-uuid dispute id', () => {
    expect(
      resolveDisputeSchema.safeParse({
        disputeId: REF,
        adminNotes: 'x'.repeat(DISPUTE_MESSAGE_MAX + 1),
        issueRefund: false,
      }).success,
    ).toBe(false);
    expect(resolveDisputeSchema.safeParse({ disputeId: 'nope', issueRefund: false }).success).toBe(
      false,
    );
  });
});
