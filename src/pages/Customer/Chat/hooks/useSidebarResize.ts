import { useState, useRef, useEffect, useCallback } from 'react';

export const SIDEBAR_WIDTH_KEY = 'evo_chat_sidebar_width_v1';
export const SIDEBAR_WIDTH_DEFAULT = 384; // md:w-96 original
export const SIDEBAR_WIDTH_MIN = 280;
export const SIDEBAR_WIDTH_MAX = 560;

export const clampSidebarWidth = (px: number): number =>
  Math.min(SIDEBAR_WIDTH_MAX, Math.max(SIDEBAR_WIDTH_MIN, px));

export function useSidebarResize() {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
    return Number.isFinite(stored) && stored > 0 ? clampSidebarWidth(stored) : SIDEBAR_WIDTH_DEFAULT;
  });
  const [isResizingSidebar, setIsResizingSidebar] = useState(false);

  const resizeStartRef = useRef<{
    startX: number;
    startWidth: number;
    currentWidth: number;
    sidebar: HTMLElement;
  } | null>(null);
  const resizeFrameRef = useRef<number | null>(null);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const sidebar = e.currentTarget.previousElementSibling;
    if (!(sidebar instanceof HTMLElement)) return;
    const currentWidth = sidebar.getBoundingClientRect().width;
    resizeStartRef.current = { startX: e.clientX, startWidth: currentWidth, currentWidth, sidebar };
    setIsResizingSidebar(true);
  }, []);

  useEffect(() => {
    if (!isResizingSidebar) return;

    const handleMouseMove = (e: MouseEvent) => {
      const start = resizeStartRef.current;
      if (!start) return;
      start.currentWidth = clampSidebarWidth(start.startWidth + (e.clientX - start.startX));
      if (resizeFrameRef.current == null) {
        resizeFrameRef.current = requestAnimationFrame(() => {
          start.sidebar.style.setProperty('--chat-sidebar-width', `${start.currentWidth}px`);
          resizeFrameRef.current = null;
        });
      }
    };

    const handleMouseUp = () => {
      if (resizeFrameRef.current != null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      const start = resizeStartRef.current;
      if (start) {
        start.sidebar.style.setProperty('--chat-sidebar-width', `${start.currentWidth}px`);
        const finalWidth = clampSidebarWidth(Math.round(start.sidebar.getBoundingClientRect().width));
        setSidebarWidth(finalWidth);
        localStorage.setItem(SIDEBAR_WIDTH_KEY, String(finalWidth));
      }
      resizeStartRef.current = null;
      setIsResizingSidebar(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('blur', handleMouseUp);

    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', handleMouseUp);
      if (resizeFrameRef.current != null) {
        cancelAnimationFrame(resizeFrameRef.current);
        resizeFrameRef.current = null;
      }
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
    };
  }, [isResizingSidebar]);

  return {
    sidebarWidth,
    isResizingSidebar,
    handleResizeMouseDown,
  };
}
