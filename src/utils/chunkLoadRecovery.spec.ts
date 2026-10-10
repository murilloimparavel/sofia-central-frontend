import { beforeEach, describe, expect, it, vi } from 'vitest';
import { recoverFromVitePreloadError } from './chunkLoadRecovery';

const STORAGE_KEY = 'sofia:vite-preload-recovery-at';

describe('recoverFromVitePreloadError', () => {
  let values: Map<string, string>;
  let storage: Pick<Storage, 'getItem' | 'setItem'>;
  let reload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    values = new Map();
    storage = {
      getItem: vi.fn((key) => values.get(key) ?? null),
      setItem: vi.fn((key, value) => values.set(key, value)),
    };
    reload = vi.fn();
  });

  it('reloads once and prevents the stale chunk error from surfacing', () => {
    const event = new Event('vite:preloadError', { cancelable: true });

    expect(recoverFromVitePreloadError(event, storage, reload, 100_000)).toBe(true);

    expect(event.defaultPrevented).toBe(true);
    expect(values.get(STORAGE_KEY)).toBe('100000');
    expect(reload).toHaveBeenCalledOnce();
  });

  it('does not reload repeatedly when the same chunk still fails', () => {
    values.set(STORAGE_KEY, '100000');
    const event = new Event('vite:preloadError', { cancelable: true });

    expect(recoverFromVitePreloadError(event, storage, reload, 110_000)).toBe(false);

    expect(event.defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it('allows recovery again after the cooldown', () => {
    values.set(STORAGE_KEY, '100000');
    const event = new Event('vite:preloadError', { cancelable: true });

    expect(recoverFromVitePreloadError(event, storage, reload, 130_000)).toBe(true);
    expect(reload).toHaveBeenCalledOnce();
  });

  it('leaves the original error handling in place if storage is unavailable', () => {
    const event = new Event('vite:preloadError', { cancelable: true });
    const unavailableStorage = {
      getItem: vi.fn(() => { throw new Error('Storage unavailable'); }),
      setItem: vi.fn(),
    };

    expect(recoverFromVitePreloadError(event, unavailableStorage, reload, 100_000)).toBe(false);
    expect(event.defaultPrevented).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
