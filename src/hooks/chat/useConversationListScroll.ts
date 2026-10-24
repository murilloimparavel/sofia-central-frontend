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
  isVisible?: boolean;
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
  isVisible = true,
}: UseConversationListScrollOptions): UseConversationListScrollResult {
  const lastScrollTopRef = useRef(0);
  const pendingSnapshotRef = useRef<ScrollSnapshot | null>(null);
  const pendingRestoreTopRef = useRef<number | null>(null);
  const previousResetKeyRef = useRef(resetKey);
  const previousContainerRef = useRef<HTMLDivElement | null>(null);

  const storageKey = `crm-conversation-list-scroll:${resetKey}`;

  const readStoredScrollTop = useCallback(() => {
    try {
      const value = Number(sessionStorage.getItem(storageKey) || 0);
      return Number.isFinite(value) ? Math.max(0, value) : 0;
    } catch {
      return 0;
    }
  }, [storageKey]);

  const persistScrollTop = useCallback(
    (scrollTop: number) => {
      try {
        sessionStorage.setItem(storageKey, String(Math.max(0, scrollTop)));
      } catch {
        // Storage can be unavailable in private browsing or restricted frames.
      }
    },
    [storageKey],
  );

  const rememberScrollPosition = useCallback(() => {
    const container = containerRef.current;
    if (container && isVisible) {
      // On mobile, hiding the sidebar while the chat is open can make the
      // browser report scrollTop=0. Keep the captured position until the list
      // is visible and its anchor has been restored.
      if (pendingSnapshotRef.current && container.scrollTop === 0) return;
      const pendingTop = pendingRestoreTopRef.current;
      if (pendingTop != null && container.scrollTop === 0 &&
          container.scrollHeight - container.clientHeight < pendingTop) return;
      if (container.scrollTop === 0 && lastScrollTopRef.current > 0 &&
          container.scrollHeight <= container.clientHeight) return;
      // A manual scroll wins over a restoration waiting for more list items.
      pendingRestoreTopRef.current = null;
      lastScrollTopRef.current = container.scrollTop;
      persistScrollTop(container.scrollTop);
    }
  }, [containerRef, isVisible, persistScrollTop]);

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
    pendingRestoreTopRef.current = null;
    lastScrollTopRef.current = container.scrollTop;
    persistScrollTop(container.scrollTop);
  }, [containerRef, persistScrollTop]);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (previousResetKeyRef.current !== resetKey || previousContainerRef.current !== container) {
      previousResetKeyRef.current = resetKey;
      previousContainerRef.current = container;
      lastScrollTopRef.current = readStoredScrollTop();
      pendingSnapshotRef.current = null;
      pendingRestoreTopRef.current = lastScrollTopRef.current;
    }

    // A display:none list may have zero dimensions and a browser-reset
    // scrollTop. Defer anchor/top restoration until it becomes visible.
    if (!isVisible) return;

    const snapshot = pendingSnapshotRef.current;
    if (snapshot) {
      const anchor = snapshot.anchorId
        ? Array.from(
            container.querySelectorAll<HTMLElement>('[data-conversation-card="true"]'),
          ).find(card => card.dataset.conversationId === snapshot.anchorId)
        : null;

      if (anchor && snapshot.anchorOffset != null) {
        const currentOffset = anchor.getBoundingClientRect().top - container.getBoundingClientRect().top;
        container.scrollTop += currentOffset - snapshot.anchorOffset;
      } else {
        pendingRestoreTopRef.current = snapshot.scrollTop;
      }
      pendingSnapshotRef.current = null;
      if (anchor && container.scrollHeight - container.clientHeight >= snapshot.scrollTop) {
        lastScrollTopRef.current = container.scrollTop;
        persistScrollTop(container.scrollTop);
      } else if (anchor) {
        pendingRestoreTopRef.current = snapshot.scrollTop;
      }
    }

    // A list temporarily replaced by an empty/loading state can make the
    // browser reset scrollTop. Restore only this actual reset, not every data
    // update (which would fight the operator's own scrolling).
    if (!snapshot && pendingRestoreTopRef.current == null &&
        lastScrollTopRef.current > 0 && container.scrollTop === 0) {
      pendingRestoreTopRef.current = lastScrollTopRef.current;
    }

    const target = pendingRestoreTopRef.current;
    if (target == null) return;

    // An empty list clamps scrollTop to zero. Keep the saved target until the
    // async conversations arrive instead of persisting that temporary zero.
    if (container.scrollHeight - container.clientHeight < target - 1) return;
    container.scrollTop = target;
    if (Math.abs(container.scrollTop - target) <= 1) {
      pendingRestoreTopRef.current = null;
      lastScrollTopRef.current = container.scrollTop;
    }
  }, [containerRef, isVisible, listVersion, persistScrollTop, readStoredScrollTop, resetKey]);

  return { rememberScrollPosition, captureBeforeSelection };
}
