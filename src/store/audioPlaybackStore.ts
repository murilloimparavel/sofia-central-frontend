import { create } from 'zustand';

interface AudioPlaybackStore {
  activeUrl: string | null;
  isPlaying: boolean;
  pauseHandler: (() => void) | null;
  registerActiveAudio: (url: string, pause: () => void) => void;
  stopActiveAudio: () => void;
  clearActiveAudio: (url: string) => void;
}

export const useAudioPlaybackStore = create<AudioPlaybackStore>((set, get) => ({
  activeUrl: null,
  isPlaying: false,
  pauseHandler: null,

  registerActiveAudio: (url: string, pause: () => void) => {
    const { activeUrl, pauseHandler } = get();
    if (activeUrl && activeUrl !== url && pauseHandler) {
      try {
        pauseHandler();
      } catch (err) {
        console.warn('Erro ao pausar áudio anterior:', err);
      }
    }
    set({
      activeUrl: url,
      isPlaying: true,
      pauseHandler: pause,
    });
  },

  stopActiveAudio: () => {
    const { pauseHandler } = get();
    if (pauseHandler) {
      try {
        pauseHandler();
      } catch (err) {
        console.warn('Erro ao parar áudio ativo:', err);
      }
    }
    set({
      activeUrl: null,
      isPlaying: false,
      pauseHandler: null,
    });
  },

  clearActiveAudio: (url: string) => {
    const { activeUrl } = get();
    if (activeUrl === url) {
      set({
        activeUrl: null,
        isPlaying: false,
        pauseHandler: null,
      });
    }
  },
}));
