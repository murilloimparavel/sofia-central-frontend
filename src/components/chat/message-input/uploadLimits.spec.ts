import { describe, expect, it } from 'vitest';
import {
  isAttachmentBatchWithinLimit,
  MAX_TOTAL_ATTACHMENT_SIZE_BYTES,
} from './uploadLimits';

describe('attachment upload size limits', () => {
  it('allows a batch exactly at the 90 MiB limit', () => {
    expect(isAttachmentBatchWithinLimit([], [{ size: MAX_TOTAL_ATTACHMENT_SIZE_BYTES }])).toBe(true);
  });

  it('rejects a new selection when its combined size exceeds 90 MiB', () => {
    expect(
      isAttachmentBatchWithinLimit(
        [{ size: 50 * 1024 * 1024 }],
        [{ size: 40 * 1024 * 1024 + 1 }],
      ),
    ).toBe(false);
  });

  it('allows an empty batch', () => {
    expect(isAttachmentBatchWithinLimit([], [])).toBe(true);
  });
});
