const RECOVERY_STORAGE_KEY = 'sofia:vite-preload-recovery-at';
const RECOVERY_COOLDOWN_MS = 30_000;

export function recoverFromVitePreloadError(
  event: Event,
  storage: Pick<Storage, 'getItem' | 'setItem'>,
  reload: () => void,
  now = Date.now(),
): boolean {
  try {
    const previousAttempt = Number(storage.getItem(RECOVERY_STORAGE_KEY));
    if (Number.isFinite(previousAttempt) && previousAttempt > 0 && now >= previousAttempt && now - previousAttempt < RECOVERY_COOLDOWN_MS) {
      return false;
    }

    storage.setItem(RECOVERY_STORAGE_KEY, String(now));
  } catch {
    // If storage is unavailable, leave the preload error to the normal error boundary.
    return false;
  }

  event.preventDefault();
  reload();
  return true;
}
