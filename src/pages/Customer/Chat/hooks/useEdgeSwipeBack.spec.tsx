import { useEdgeSwipeBack } from './useEdgeSwipeBack';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function GestureTarget({ onBack, enabled = true }: { onBack: () => void; enabled?: boolean }) {
  const handlers = useEdgeSwipeBack(onBack, enabled);
  return (
    <div data-testid="gesture-target" {...handlers}>
      <button type="button">Back</button>
    </div>
  );
}

const setPointerCapture = vi.fn();

const pointer = (
  name: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  x: number,
  y: number,
  extra: Record<string, string | number> = {},
  target: Element = screen.getByTestId('gesture-target'),
) => {
  const event = new Event(name, { bubbles: true });
  Object.defineProperties(event, {
    pointerId: { value: 1 },
    pointerType: { value: 'touch' },
    button: { value: 0 },
    clientX: { value: x },
    clientY: { value: y },
    ...Object.fromEntries(Object.entries(extra).map(([key, value]) => [key, { value }])),
  });
  fireEvent(target, event);
};

describe('useEdgeSwipeBack', () => {
  const originalSetPointerCapture = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    'setPointerCapture',
  );

  beforeEach(() => {
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: setPointerCapture,
    });
    setPointerCapture.mockClear();
  });

  afterEach(() => {
    cleanup();
    if (originalSetPointerCapture) {
      Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', originalSetPointerCapture);
    } else {
      delete (HTMLElement.prototype as Partial<HTMLElement>).setPointerCapture;
    }
  });

  it('goes back after a deliberate right swipe from the left edge', () => {
    const onBack = vi.fn();
    render(<GestureTarget onBack={onBack} />);

    pointer('pointerdown', 12, 40);
    pointer('pointermove', 40, 42);
    pointer('pointerup', 100, 43);

    expect(onBack).toHaveBeenCalledOnce();
    expect(setPointerCapture).toHaveBeenCalledOnce();
    expect(setPointerCapture).toHaveBeenCalledWith(1);
  });

  it('ignores gestures that start outside the edge zone', () => {
    const onBack = vi.fn();
    render(<GestureTarget onBack={onBack} />);

    pointer('pointerdown', 25, 40);
    pointer('pointermove', 55, 41);
    pointer('pointerup', 120, 42);

    expect(onBack).not.toHaveBeenCalled();
  });

  it('ignores vertical scrolling that starts at the edge', () => {
    const onBack = vi.fn();
    render(<GestureTarget onBack={onBack} />);

    pointer('pointerdown', 12, 10);
    pointer('pointermove', 14, 35);
    pointer('pointerup', 120, 36);

    expect(onBack).not.toHaveBeenCalled();
  });

  it('ignores horizontal movement shorter than the threshold', () => {
    const onBack = vi.fn();
    render(<GestureTarget onBack={onBack} />);

    pointer('pointerdown', 12, 10);
    pointer('pointermove', 35, 11);
    pointer('pointerup', 80, 12);

    expect(onBack).not.toHaveBeenCalled();
  });

  it('does not capture a short edge tap or a gesture started on a button', () => {
    const onBack = vi.fn();
    render(<GestureTarget onBack={onBack} />);
    const backButton = screen.getByRole('button', { name: 'Back' });

    pointer('pointerdown', 12, 10);
    pointer('pointerup', 14, 10);
    pointer('pointerdown', 12, 10, {}, backButton);
    pointer('pointermove', 50, 10, {}, backButton);
    pointer('pointerup', 110, 10, {}, backButton);

    expect(setPointerCapture).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('ignores mouse input and cancelled pointers', () => {
    const onBack = vi.fn();
    render(<GestureTarget onBack={onBack} />);

    pointer('pointerdown', 12, 10, { pointerType: 'mouse' });
    pointer('pointermove', 40, 10, { pointerType: 'mouse' });
    pointer('pointerup', 120, 10, { pointerType: 'mouse' });

    pointer('pointerdown', 12, 10);
    pointer('pointermove', 40, 10);
    pointer('pointercancel', 40, 10);
    pointer('pointerup', 120, 10);

    expect(onBack).not.toHaveBeenCalled();
  });
});
