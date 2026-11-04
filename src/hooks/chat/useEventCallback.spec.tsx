import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useEventCallback } from './useEventCallback';

describe('useEventCallback', () => {
  it('keeps identity while calling the latest committed handler', () => {
    const { result, rerender } = renderHook(
      ({ selectedId }) => useEventCallback(() => selectedId),
      { initialProps: { selectedId: 'first' } },
    );
    const handler = result.current;

    rerender({ selectedId: 'second' });

    expect(result.current).toBe(handler);
    expect(handler()).toBe('second');
  });
});
