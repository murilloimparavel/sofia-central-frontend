import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@evoapi/design-system/button';
import { toast } from 'sonner';
import { Attachment } from '@/types/chat/api';
import { useLanguage } from '@/hooks/useLanguage';
import { useAudioPlaybackStore } from '@/store/audioPlaybackStore';
import { getStableBarHeights } from './audioWaveformUtils';

// Ícones preenchidos customizados
const PlayFilled = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <path d="M5 3l14 9-14 9V3z" />
  </svg>
);

const PauseFilled = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="currentColor"
    className={className}
  >
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
);

interface MessageAudioProps {
  attachments: Attachment[];
}

// Pool global compartilhado para detecção de duração sob demanda (apenas 1 áudio por vez, sem encher o DOM)
let sharedDurationAudio: HTMLAudioElement | null = null;
const getSharedDurationAudio = (): HTMLAudioElement => {
  if (!sharedDurationAudio && typeof document !== 'undefined') {
    sharedDurationAudio = document.createElement('audio');
    sharedDurationAudio.preload = 'metadata';
    sharedDurationAudio.volume = 0;
  }
  return sharedDurationAudio!;
};

// Fila sequencial de duração para evitar esgotamento de hardware de mídia no celular
const durationQueue: Array<{ url: string; attachmentId?: string | number; callback: (dur: number) => void }> = [];
let isProcessingDurationQueue = false;

const processDurationQueue = () => {
  if (isProcessingDurationQueue || durationQueue.length === 0) return;
  isProcessingDurationQueue = true;

  const item = durationQueue.shift();
  if (!item) {
    isProcessingDurationQueue = false;
    return;
  }

  const audio = getSharedDurationAudio();
  let finished = false;

  const cleanup = () => {
    if (finished) return;
    finished = true;
    audio.removeEventListener('loadedmetadata', onLoaded);
    audio.removeEventListener('error', onError);
    audio.removeAttribute('src');
    audio.load(); // Libera decodificador de mídia
    isProcessingDurationQueue = false;
    setTimeout(processDurationQueue, 30);
  };

  const onLoaded = () => {
    const dur = audio.duration;
    if (dur && !isNaN(dur) && isFinite(dur) && dur > 0) {
      item.callback(dur);
    }
    cleanup();
  };

  const onError = () => {
    cleanup();
  };

  audio.addEventListener('loadedmetadata', onLoaded);
  audio.addEventListener('error', onError);
  audio.src = item.url;

  // Timeout de segurança para nunca travar a fila
  setTimeout(() => {
    if (!finished) cleanup();
  }, 4000);
};

// Cache global de durações
const globalDurationsCache: Record<string, number> = {};

const MessageAudio: React.FC<MessageAudioProps> = ({ attachments }) => {
  const { t } = useLanguage('chat');
  const [currentPlaying, setCurrentPlaying] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [durations, setDurations] = useState<Record<string, number>>({});
  const audioRef = useRef<HTMLAudioElement>(null);
  const playPromiseRef = useRef<Promise<void> | null>(null);

  const { activeUrl, registerActiveAudio, clearActiveAudio } = useAudioPlaybackStore();

  const formatDuration = (seconds: number): string => {
    if (!seconds || isNaN(seconds) || !isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Se outro componente assumiu a reprodução no store global, pausamos este
  useEffect(() => {
    if (currentPlaying && activeUrl !== currentPlaying && isPlaying) {
      const audio = audioRef.current;
      if (audio) {
        audio.pause();
      }
      setIsPlaying(false);
    }
  }, [activeUrl, currentPlaying, isPlaying]);

  const pauseThisAudio = useCallback(() => {
    const audio = audioRef.current;
    if (audio) {
      try {
        audio.pause();
      } catch (e) {
        console.warn('Erro ao pausar:', e);
      }
    }
    setIsPlaying(false);
    setIsLoading(false);
  }, []);

  const togglePlayback = async (attachment: Attachment) => {
    if (!attachment.data_url) return;
    const audio = audioRef.current;
    if (!audio) return;

    const url = attachment.data_url;

    if (currentPlaying === url && isPlaying) {
      // Pausar
      pauseThisAudio();
      clearActiveAudio(url);
    } else {
      // Notificar store global para parar qualquer outro áudio tocando no sistema
      registerActiveAudio(url, pauseThisAudio);

      if (currentPlaying !== url) {
        audio.src = url;
        if (typeof audio.load === 'function') {
          audio.load();
        }
        setCurrentPlaying(url);
        setCurrentTime(0);
      }

      audio.playbackRate = playbackRate;
      setIsLoading(true);

      try {
        playPromiseRef.current = audio.play();
        await playPromiseRef.current;
        setIsPlaying(true);
        setIsLoading(false);
      } catch (error: any) {
        // Ignorar AbortError originado por nova ação de pause
        if (error?.name === 'AbortError') {
          console.warn('Reprodução interrompida por nova ação');
          return;
        }
        console.error('Erro ao reproduzir áudio:', error);
        toast.error(t('messages.messageAudio.playbackError'), {
          description: t('messages.messageAudio.playbackErrorDescription'),
        });
        setIsPlaying(false);
        setIsLoading(false);
        clearActiveAudio(url);
      }
    }
  };

  const cyclePlaybackRate = () => {
    const rates = [1, 1.5, 2, 2.5];
    const nextRate = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(nextRate);
    if (audioRef.current) audioRef.current.playbackRate = nextRate;
  };

  // Suporte a toque e clique (scrubbing) na onda sonora
  const handleSeek = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>, targetDuration: number) => {
    if (!targetDuration || targetDuration <= 0) return;
    const audio = audioRef.current;
    if (!audio) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const clientX = 'touches' in e && e.touches[0] ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const ratio = clickX / rect.width;
    const newTime = ratio * targetDuration;

    audio.currentTime = newTime;
    setCurrentTime(newTime);
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleLoadedMetadata = () => {
      const dur = audio.duration;
      if (dur && !isNaN(dur) && isFinite(dur)) {
        setDuration(dur);
        if (audio.src) {
          setDurations(prev => ({ ...prev, [audio.src]: dur }));
          globalDurationsCache[audio.src] = dur;
        }
      }
    };

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleCanPlay = () => {
      setIsLoading(false);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      setCurrentPlaying(null);
      if (audio.src) clearActiveAudio(audio.src);
    };

    const handleError = () => {
      setIsPlaying(false);
      setIsLoading(false);
    };

    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('canplay', handleCanPlay);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('error', handleError);

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('canplay', handleCanPlay);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('error', handleError);
    };
  }, [clearActiveAudio]);

  // Carregar durações de forma leve e sequencial
  useEffect(() => {
    attachments.forEach((attachment) => {
      if (!attachment.data_url) return;
      const url = attachment.data_url;

      // 1. Verificar metadata duration se veio do backend
      const metaDuration = (attachment.meta?.duration as number) || (attachment.meta?.seconds as number);
      if (metaDuration && metaDuration > 0) {
        setDurations(prev => ({ ...prev, [url]: metaDuration }));
        globalDurationsCache[url] = metaDuration;
        return;
      }

      // 2. Verificar cache global
      if (globalDurationsCache[url]) {
        setDurations(prev => ({ ...prev, [url]: globalDurationsCache[url] }));
        return;
      }

      // 3. Adicionar à fila sequencial leve sem injetar nós no DOM
      durationQueue.push({
        url,
        attachmentId: attachment.id,
        callback: (dur: number) => {
          globalDurationsCache[url] = dur;
          setDurations(prev => ({ ...prev, [url]: dur }));
        },
      });
      processDurationQueue();
    });
  }, [attachments]);

  return (
    <>
      {/* Elemento de áudio com playsInline para iOS e sem poluição de DOM */}
      <audio ref={audioRef} preload="metadata" playsInline webkit-playsinline="true" />

      <div className="space-y-2">
        {attachments
          .filter(attachment => attachment && attachment.data_url && attachment.data_url.trim() !== '')
          .map((attachment, index) => {
            const isCurrentlyPlaying = currentPlaying === attachment.data_url && isPlaying;
            const itemDuration = durations[attachment.data_url] || (currentPlaying === attachment.data_url ? duration : 0);
            const progressValue = itemDuration > 0 && currentPlaying === attachment.data_url
              ? Math.min(100, Math.max(0, (currentTime / itemDuration) * 100))
              : 0;

            const transcribedText = attachment.transcribed_text || attachment.meta?.transcribed_text;

            // Barras determinísticas baseadas em hash
            const barHeights = getStableBarHeights(attachment.data_url || String(attachment.id || index), 25);

            return (
              <div key={attachment.id || index} className="space-y-2">
                {/* Audio Player Card com touch targets adequados para mobile */}
                <div
                  className="flex items-center gap-3 px-3 py-2 rounded-xl bg-muted/50 hover:bg-muted/70 transition-colors select-none"
                  style={{
                    minWidth: '220px',
                    maxWidth: 'min(320px, calc(100vw - 80px))',
                  }}
                >
                  {/* Botão Play/Pause tamanho 44x44 (Apple HIG / Google Material) */}
                  <Button
                    type="button"
                    variant="default"
                    size="icon"
                    onClick={() => togglePlayback(attachment)}
                    aria-label={isCurrentlyPlaying ? 'Pausar áudio' : 'Reproduzir áudio'}
                    className="h-11 w-11 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground flex-shrink-0 border-0 shadow-sm transition-transform active:scale-95"
                  >
                    {isLoading && currentPlaying === attachment.data_url ? (
                      <div className="w-5 h-5 border-2 border-primary-foreground border-t-transparent rounded-full animate-spin" />
                    ) : isCurrentlyPlaying ? (
                      <PauseFilled className="h-5 w-5" />
                    ) : (
                      <PlayFilled className="h-5 w-5 ml-0.5" />
                    )}
                  </Button>

                  {/* Waveform interativo (Scrubbing tátil) e tempo */}
                  <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                    {/* Barras de onda com suporte a clique e arraste */}
                    <div
                      className="flex items-center gap-0.5 h-7 cursor-pointer touch-none py-1"
                      onClick={(e) => handleSeek(e, itemDuration)}
                      onTouchStart={(e) => handleSeek(e, itemDuration)}
                      onTouchMove={(e) => handleSeek(e, itemDuration)}
                      title="Toque para avançar ou retroceder"
                    >
                      {barHeights.map((barHeight, i) => {
                        const isActive = i < (progressValue / 100) * 25;
                        return (
                          <div
                            key={i}
                            className={`w-1 rounded-full transition-colors duration-100 ${
                              isActive
                                ? 'bg-primary'
                                : 'bg-muted-foreground/30 dark:bg-muted-foreground/25'
                            }`}
                            style={{
                              height: `${barHeight}px`,
                            }}
                          />
                        );
                      })}
                    </div>

                    {/* Tempo de reprodução */}
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground font-mono text-[11px]">
                        {currentPlaying === attachment.data_url ? formatDuration(currentTime) : '0:00'}
                      </span>
                      <span className="text-muted-foreground font-mono text-[11px]">
                        {formatDuration(itemDuration)}
                      </span>
                    </div>
                  </div>

                  {/* Velocidade de reprodução (Touch target confortável) */}
                  <div className="flex items-center flex-shrink-0">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={cyclePlaybackRate}
                      aria-label={`Velocidade de reprodução: ${playbackRate}x`}
                      className="h-8 min-w-10 rounded-full px-2 text-xs font-semibold tabular-nums text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                    >
                      {playbackRate.toString().replace('.', ',')}x
                    </Button>
                  </div>
                </div>

                {/* Texto Transcrito (Whisper) */}
                {transcribedText && (
                  <div className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-1 font-medium">
                      {t('messages.messageAudio.transcription')}
                    </p>
                    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                      {transcribedText}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </>
  );
};

export default MessageAudio;
