import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useConversationListScroll } from './useConversationListScroll';

describe('useConversationListScroll', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('restores the saved position after the list remounts during navigation', () => {
    const firstContainer = document.createElement('div');
    const firstRef = { current: firstContainer };
    const first = renderHook(() =>
      useConversationListScroll({
        containerRef: firstRef,
        listVersion: 1,
        resetKey: 'robot-active',
      }),
    );

    firstContainer.scrollTop = 3200;
    act(() => first.result.current.rememberScrollPosition());
    first.unmount();

    const secondContainer = document.createElement('div');
    const secondRef = { current: secondContainer };
    renderHook(() =>
      useConversationListScroll({
        containerRef: secondRef,
        listVersion: 2,
        resetKey: 'robot-active',
      }),
    );

    expect(secondContainer.scrollTop).toBe(3200);
  });
});
