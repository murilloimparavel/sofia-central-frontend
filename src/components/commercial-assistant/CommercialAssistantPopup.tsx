import { lazy, Suspense, useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent } from 'react';
import ChunkLoadErrorBoundary from '@/components/ChunkLoadErrorBoundary';
import './CommercialAssistantPopup.css';

const CommercialAssistantPanel = lazy(() => import('./CommercialAssistantPanel'));
const POSITION_STORAGE_KEY = 'commercial-assistant-trigger-position';
const DEFAULT_POSITION = { right: 88, bottom: 96 };
const DOCK_EDGE = 28;

interface TriggerPosition {
  right: number;
  bottom: number;
}

interface DragStart {
  pointerId: number;
  x: number;
  y: number;
  right: number;
  bottom: number;
  moved: boolean;
  currentRight: number;
}

function HeadsetIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 14v-3a9 9 0 0 1 18 0v3" />
      <path d="M5 13h2a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H6a3 3 0 0 1-3-3v-2a3 3 0 0 1 2-3Z" />
      <path d="M19 13h-2a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h1a3 3 0 0 0 3-3v-2a3 3 0 0 0-2-3Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg aria-hidden="true" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="m18 6-12 12M6 6l12 12" />
    </svg>
  );
}

interface CommercialAssistantPopupProps {
  initiallyOpen?: boolean;
}

export default function CommercialAssistantPopup({ initiallyOpen = false }: CommercialAssistantPopupProps) {
  const [isOpen, setIsOpen] = useState(initiallyOpen);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isDocked, setIsDocked] = useState(false);
  const [position, setPosition] = useState<TriggerPosition>(DEFAULT_POSITION);
  const [panelPosition, setPanelPosition] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const dragRef = useRef<DragStart | null>(null);
  const suppressClickRef = useRef(false);

  const clampPosition = useCallback((next: TriggerPosition): TriggerPosition => {
    const button = buttonRef.current;
    const width = button?.offsetWidth ?? 190;
    const height = button?.offsetHeight ?? 48;
    const margin = 12;
    return {
      right: Math.max(margin, Math.min(window.innerWidth - width - margin, next.right)),
      bottom: Math.max(margin, Math.min(window.innerHeight - height - margin, next.bottom)),
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 641px)');
    const updateViewport = () => setIsDesktop(media.matches);
    updateViewport();
    media.addEventListener('change', updateViewport);
    return () => media.removeEventListener('change', updateViewport);
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(POSITION_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<TriggerPosition> & { docked?: boolean };
        if (Number.isFinite(parsed.right) && Number.isFinite(parsed.bottom)) {
          setPosition(clampPosition({ right: parsed.right!, bottom: parsed.bottom! }));
        }
        setIsDocked(parsed.docked === true);
      }
    } catch {
      // Ignore malformed or unavailable local preference storage.
    }
  }, [clampPosition]);

  useEffect(() => {
    if (!isDesktop) return;
    try {
      window.localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify({ ...position, docked: isDocked }));
    } catch {
      // The assistant stays usable when browser storage is disabled.
    }
  }, [isDesktop, isDocked, position]);

  useEffect(() => {
    if (!isOpen || !isDesktop) {
      setPanelPosition(null);
      return;
    }

    const updatePanelPosition = () => {
      const trigger = buttonRef.current?.getBoundingClientRect();
      const panel = panelRef.current?.getBoundingClientRect();
      if (!trigger || !panel) return;
      const margin = 16;
      const gap = 12;
      const left = Math.max(margin, Math.min(window.innerWidth - panel.width - margin, trigger.right - panel.width));
      const top = Math.max(margin, Math.min(window.innerHeight - panel.height - margin, trigger.top - panel.height - gap));
      setPanelPosition({ left, top });
    };

    const frame = window.requestAnimationFrame(updatePanelPosition);
    window.addEventListener('resize', updatePanelPosition);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePanelPosition);
    };
  }, [isDesktop, isOpen, position]);

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || isDocked) return;
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      right: window.innerWidth - rect.right,
      bottom: window.innerHeight - rect.bottom,
      moved: false,
      currentRight: window.innerWidth - rect.right,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !(event.buttons & 1)) return;
    const deltaX = event.clientX - drag.x;
    const deltaY = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(deltaX, deltaY) < 5) return;

    if (!drag.moved) {
      drag.moved = true;
      suppressClickRef.current = true;
      setIsDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    const nextRight = Math.max(0, drag.right - deltaX);
    const nextBottom = Math.max(12, drag.bottom - deltaY);
    drag.currentRight = nextRight;
    setPosition(clampPosition({ right: nextRight, bottom: nextBottom }));
  };

  const handlePointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      if (drag.currentRight <= DOCK_EDGE) {
        setIsDocked(true);
        setIsOpen(false);
      }
      setIsDragging(false);
      window.setTimeout(() => { suppressClickRef.current = false; }, 0);
    }
    dragRef.current = null;
  };

  const handleTriggerKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!isDesktop || isDocked) return;
    const movement = event.shiftKey ? 24 : 8;
    const offsets: Record<string, TriggerPosition> = {
      ArrowLeft: { right: movement, bottom: 0 },
      ArrowRight: { right: -movement, bottom: 0 },
      ArrowUp: { right: 0, bottom: -movement },
      ArrowDown: { right: 0, bottom: movement },
    };
    const offset = offsets[event.key];
    if (!offset) return;
    event.preventDefault();
    const currentRect = buttonRef.current?.getBoundingClientRect();
    if (!currentRect) return;
    const nextRight = window.innerWidth - currentRect.right + offset.right;
    const nextBottom = window.innerHeight - currentRect.bottom + offset.bottom;
    setPosition(clampPosition({ right: nextRight, bottom: nextBottom }));
    if (nextRight <= DOCK_EDGE) {
      setIsDocked(true);
      setIsOpen(false);
    }
  };

  const close = useCallback(() => {
    setIsOpen(false);
    window.requestAnimationFrame(() => buttonRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [close, isOpen]);

  return (
    <>
      {isOpen && (
        <section
          aria-label="Assistente comercial"
          aria-modal="false"
          id="commercial-assistant-dialog"
          className="commercial-assistant-panel"
          ref={panelRef}
          role="dialog"
          style={isDesktop && panelPosition ? { left: panelPosition.left, top: panelPosition.top, right: 'auto', bottom: 'auto' } : undefined}
        >
          <header className="commercial-assistant-header">
            <div className="commercial-assistant-heading">
              <span className="commercial-assistant-brand-icon">
                <HeadsetIcon />
              </span>
              <div className="commercial-assistant-copy">
                <h2>Assistente comercial</h2>
                <p>Reservas, disponibilidade e alternativas</p>
              </div>
            </div>
            <button
              aria-label="Fechar assistente comercial"
              className="commercial-assistant-close"
              ref={closeButtonRef}
              onClick={close}
              type="button"
            >
              <CloseIcon />
            </button>
          </header>
          <ChunkLoadErrorBoundary>
            <Suspense fallback={<div className="ca-panel-content" aria-busy="true" role="status">Carregando assistente…</div>}>
              <CommercialAssistantPanel />
            </Suspense>
          </ChunkLoadErrorBoundary>
        </section>
      )}

      <button
        ref={buttonRef}
        aria-controls={isOpen ? 'commercial-assistant-dialog' : undefined}
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-label={isOpen ? 'Assistente comercial aberto' : 'Abrir assistente comercial'}
        className={`commercial-assistant-trigger${isDocked ? ' is-docked' : ''}`}
        aria-keyshortcuts="ArrowUp ArrowDown ArrowLeft ArrowRight"
        aria-description={isDocked ? 'Toque para restaurar o assistente' : 'Arraste para mover. Solte junto à borda direita para recolher.'}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onKeyDown={handleTriggerKeyDown}
        onClick={() => {
          if (suppressClickRef.current) {
            suppressClickRef.current = false;
            return;
          }
          if (isDocked) {
            setIsDocked(false);
            setPosition(current => clampPosition({ right: 88, bottom: current.bottom }));
            setIsOpen(true);
            return;
          }
          setIsOpen(current => !current);
        }}
        style={isDesktop || isDocked ? {
          right: isDocked ? (isDesktop ? 0 : 'max(0px, env(safe-area-inset-right, 0px))') : position.right,
          bottom: isDocked && !isDesktop ? 'calc(5.25rem + env(safe-area-inset-bottom, 0px))' : position.bottom,
        } : undefined}
        title={isDocked ? 'Toque para restaurar o assistente' : 'Arraste para mover · Solte na borda direita para recolher'}
        data-docked={isDocked ? 'true' : undefined}
        data-dragging={isDragging ? 'true' : undefined}
        type="button"
      >
        {isOpen ? <CloseIcon /> : <HeadsetIcon />}
        <span>{isOpen ? 'Fechar' : 'Assistente comercial'}</span>
      </button>
    </>
  );
}
