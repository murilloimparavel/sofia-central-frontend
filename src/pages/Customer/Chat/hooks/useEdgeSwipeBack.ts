import { useCallback, useRef, type PointerEvent } from 'react';

const EDGE_WIDTH_PX = 24;
const SWIPE_THRESHOLD_PX = 80;
const DIRECTION_RATIO = 1.25;

interface PointerStart {
  pointerId: number;
  x: number;
  y: number;
  horizontalIntent: boolean;
}

/** Detects a deliberate left-edge swipe without taking over native scrolling. */
export function useEdgeSwipeBack(onBack: () => void, enabled: boolean) {
  const pointerStart = useRef<PointerStart | null>(null);

  const onPointerDown = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      pointerStart.current = null;

      if (
        !enabled ||
        event.pointerType === 'mouse' ||
        event.button !== 0 ||
        event.clientX > EDGE_WIDTH_PX
      ) {
        return;
      }

      if (
        event.target instanceof Element &&
        event.target.closest('button, a, input, textarea, select, [contenteditable="true"], [role="button"]')
      ) {
        return;
      }

      pointerStart.current = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        horizontalIntent: false,
      };
    },
    [enabled],
  );

  const onPointerMove = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const start = pointerStart.current;
      if (!enabled || !start || start.pointerId !== event.pointerId) return;

      const deltaX = event.clientX - start.x;
      const deltaY = Math.abs(event.clientY - start.y);
      if (!start.horizontalIntent) {
        if (deltaY > Math.abs(deltaX) * DIRECTION_RATIO) {
          pointerStart.current = null;
          return;
        }
        if (deltaX > deltaY * DIRECTION_RATIO) {
          start.horizontalIntent = true;
          event.currentTarget.setPointerCapture(event.pointerId);
        }
      }
    },
    [enabled],
  );

  const onPointerUp = useCallback(
    (event: PointerEvent<HTMLElement>) => {
      const start = pointerStart.current;
      pointerStart.current = null;

      if (!enabled || !start || start.pointerId !== event.pointerId || !start.horizontalIntent) return;

      const deltaX = event.clientX - start.x;
      const deltaY = Math.abs(event.clientY - start.y);
      if (deltaX >= SWIPE_THRESHOLD_PX && deltaX > deltaY * DIRECTION_RATIO) onBack();
    },
    [enabled, onBack],
  );

  const cancelPointer = useCallback(() => {
    pointerStart.current = null;
  }, []);

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: cancelPointer,
    onLostPointerCapture: cancelPointer,
  };
}
