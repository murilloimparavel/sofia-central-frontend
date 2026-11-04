import { renderHook, act } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useConversationListScroll } from './useConversationListScroll';

function setScrollHeight(element: HTMLElement, height: number) {
  Object.defineProperty(element, 'scrollHeight', { value: height, configurable: true });
  Object.defineProperty(element, 'clientHeight', { value: 400, configurable: true });
}

describe('useConversationListScroll', () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it('restores the saved position after the list remounts during navigation', () => {
    const firstContainer = document.createElement('div');
    setScrollHeight(firstContainer, 4000);
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
    setScrollHeight(secondContainer, 4000);
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

  it('keeps the saved position while the remounted list is still empty', () => {
    sessionStorage.setItem('crm-conversation-list-scroll:robot-active', '3200');
    const container = document.createElement('div');
    setScrollHeight(container, 400);
    const containerRef = { current: container };
    const { result, rerender } = renderHook(
      ({ listVersion }) => useConversationListScroll({ containerRef, listVersion, resetKey: 'robot-active' }),
      { initialProps: { listVersion: 1 } },
    );

    act(() => result.current.rememberScrollPosition());
    expect(container.scrollTop).toBe(0);
    expect(sessionStorage.getItem('crm-conversation-list-scroll:robot-active')).toBe('3200');

    setScrollHeight(container, 4000);
    rerender({ listVersion: 2 });
    expect(container.scrollTop).toBe(3200);
  });

  it('does not overwrite a newer scroll position on an unrelated list update', () => {
    const container = document.createElement('div');
    setScrollHeight(container, 2000);
    const containerRef = { current: container };
    const { result, rerender } = renderHook(
      ({ listVersion }) => useConversationListScroll({ containerRef, listVersion, resetKey: 'active' }),
      { initialProps: { listVersion: 1 } },
    );

    container.scrollTop = 180;
    act(() => result.current.rememberScrollPosition());
    container.scrollTop = 220;
    rerender({ listVersion: 2 });

    expect(container.scrollTop).toBe(220);
  });

  it('recovers when a temporary empty list resets the scrollbar', () => {
    const container = document.createElement('div');
    setScrollHeight(container, 2000);
    const containerRef = { current: container };
    const { result, rerender } = renderHook(
      ({ listVersion }) => useConversationListScroll({ containerRef, listVersion, resetKey: 'active' }),
      { initialProps: { listVersion: 1 } },
    );

    container.scrollTop = 350;
    act(() => result.current.rememberScrollPosition());
    setScrollHeight(container, 400);
    container.scrollTop = 0;
    act(() => result.current.rememberScrollPosition());
    rerender({ listVersion: 2 });
    expect(sessionStorage.getItem('crm-conversation-list-scroll:active')).toBe('350');

    setScrollHeight(container, 2000);
    rerender({ listVersion: 3 });
    expect(container.scrollTop).toBe(350);
  });

  it('keeps the captured position while the mobile list is hidden and restores it when shown', () => {
    const container = document.createElement('div');
    setScrollHeight(container, 4000);
    const containerRef = { current: container };
    const { result, rerender } = renderHook(
      ({ isVisible }) => useConversationListScroll({
        containerRef,
        listVersion: 1,
        resetKey: 'queue-active',
        isVisible,
      }),
      { initialProps: { isVisible: true } },
    );

    container.scrollTop = 1200;
    act(() => result.current.captureBeforeSelection());
    rerender({ isVisible: false });

    // Some browsers report zero after the list is display:none. That transient
    // value must not replace the position captured before opening the chat.
    container.scrollTop = 0;
    act(() => result.current.rememberScrollPosition());
    expect(sessionStorage.getItem('crm-conversation-list-scroll:queue-active')).toBe('1200');

    rerender({ isVisible: true });
    expect(container.scrollTop).toBe(1200);
  });
});
