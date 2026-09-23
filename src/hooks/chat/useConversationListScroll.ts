import {
  useCallback,
  useLayoutEffect,
  useRef,
  type RefObject,
} from 'react';

interface ScrollSnapshot {
  scrollTop: number;
  anchorId: string | null;
  anchorOffset: number | null;
}

interface UseConversationListScrollOptions {
  containerRef: RefObject<HTMLDivElement | null>;
  listVersion: unknown;
  resetKey?: string;
}

interface UseConversationListScrollResult {
  rememberScrollPosition: () => void;
  captureBeforeSelection: () => void;
}

/**
 * Preserves the operator's position while the conversation collection is
 * reconciled by unread, REST or WebSocket updates. Deliberate navigation can
 * still reset the list by changing the container/list context in the parent.
 */
export function useConversationListScroll({
  containerRef,
  listVersion,
  resetKey = '',
}: UseConversationListScrollOptions): UseConversationListScrollResult {
  const lastScrollTopRef = useRef(0);
  const pendingSnapshotRef = useRef<ScrollSnapshot | null>(null);
  const previousResetKeyRef = useRef(resetKey);

  const rememberScrollPosition = useCallback(() => {
    const container = containerRef.current;
    if (container) lastScrollTopRef.current = container.scrollTop;
  }, [containerRef]);

  const captureBeforeSelection = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    const containerRect = container.getBoundingClientRect();
    const firstVisibleCard = Array.from(
      container.querySelectorAll<HTMLElement>('[data-conversation-card="true"]'),
    ).find(card => card.getBoundingClientRect().bottom > containerRect.top);

    pendingSnapshotRef.current = {
      scrollTop: container.scrollTop,
      anchorId: firstVisibleCard?.dataset.conversationId ?? null,
      anchorOffset: firstVisibleCard
        ? firstVisibleCard.getBoundingClientRect().top - containerRect.top
        : null,
    };
    lastScrollTopRef.current = container.scrollTop;
  }, [containerRef]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (previousResetKeyRef.current !== resetKey) {
      previousResetKeyRef.current = resetKey;
      lastScrollTopRef.current = 0;
      pendingSnapshotRef.current = null;
      container.scrollTop = 0;
      return;
    }

    const snapshot = pendingSnapshotRef.current;
    const restore = () => {
      const current = containerRef.current;
      if (!current) return;

      const anchor = snapshot?.anchorId
        ? Array.from(
            current.querySelectorAll<HTMLElement>('[data-conversation-card="true"]'),
          ).find(card => card.dataset.conversationId === snapshot.anchorId)
        : null;

      if (anchor && snapshot?.anchorOffset != null) {
        const currentOffset = anchor.getBoundingClientRect().top - current.getBoundingClientRect().top;
        current.scrollTop += currentOffset - snapshot.anchorOffset;
      } else {
        current.scrollTop = snapshot?.scrollTop ?? lastScrollTopRef.current;
      }
      lastScrollTopRef.current = current.scrollTop;
    };

    restore();
    const frame = requestAnimationFrame(restore);
    // A âncora atravessa apenas esta reconciliação. Depois dela, o último
    // scrollTop passa a ser a fonte de verdade, permitindo nova rolagem manual.
    pendingSnapshotRef.current = null;
    return () => cancelAnimationFrame(frame);
  }, [containerRef, listVersion, resetKey]);

  return { rememberScrollPosition, captureBeforeSelection };
}
