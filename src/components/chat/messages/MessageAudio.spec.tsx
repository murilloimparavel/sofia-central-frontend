import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import MessageAudio from './MessageAudio';
import { Attachment } from '@/types/chat/api';
import { useAudioPlaybackStore } from '@/store/audioPlaybackStore';
import { toast } from 'sonner';

vi.mock('sonner', () => ({
  toast: { warning: vi.fn(), success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

const mockAttachments: Attachment[] = [
  {
    id: 'att-1',
    message_id: 'msg-1',
    file_type: 'audio',
    extension: 'ogg',
    data_url: 'https://example.com/audio1.ogg',
    thumb_url: null,
    file_size: 10240,
    fallback_title: 'audio1.ogg',
    coordinates_lat: 0,
    coordinates_long: 0,
    meta: { duration: 45 },
  },
  {
    id: 'att-2',
    message_id: 'msg-2',
    file_type: 'audio',
    extension: 'ogg',
    data_url: 'https://example.com/audio2.ogg',
    thumb_url: null,
    file_size: 20480,
    fallback_title: 'audio2.ogg',
    coordinates_lat: 0,
    coordinates_long: 0,
    meta: { duration: 90 },
  },
];

describe('MessageAudio Mobile & Reliability', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAudioPlaybackStore.getState().stopActiveAudio();
  });

  it('renders audio attachments with 44x44 play button and formatted duration', () => {
    render(<MessageAudio attachments={mockAttachments} />);

    const playButtons = screen.getAllByLabelText('Reproduzir áudio');
    expect(playButtons).toHaveLength(2);
    expect(playButtons[0]).toHaveClass('h-11');
    expect(playButtons[0]).toHaveClass('w-11');

    // Duração pré-carregada do meta do backend (45s -> 0:45)
    expect(screen.getByText('0:45')).toBeInTheDocument();
    expect(screen.getByText('1:30')).toBeInTheDocument();
  });

  it('supports cycling playback rates (1x -> 1.5x -> 2x -> 2.5x -> 1x)', () => {
    render(<MessageAudio attachments={[mockAttachments[0]]} />);

    const rateButton = screen.getByLabelText(/Velocidade de reprodução/i);
    expect(rateButton).toHaveTextContent('1x');

    fireEvent.click(rateButton);
    expect(rateButton).toHaveTextContent('1,5x');

    fireEvent.click(rateButton);
    expect(rateButton).toHaveTextContent('2x');
  });

  it('registers active audio in useAudioPlaybackStore to prevent concurrent playback', async () => {
    window.HTMLMediaElement.prototype.play = vi.fn(function (this: HTMLAudioElement) {
      Object.defineProperty(this, 'paused', { configurable: true, value: false });
      return Promise.resolve();
    });
    window.HTMLMediaElement.prototype.pause = vi.fn(function (this: HTMLAudioElement) {
      Object.defineProperty(this, 'paused', { configurable: true, value: true });
    });
    window.HTMLMediaElement.prototype.load = vi.fn();

    render(<MessageAudio attachments={mockAttachments} />);

    const playButtons = screen.getAllByLabelText('Reproduzir áudio');
    await act(async () => {
      fireEvent.click(playButtons[0]);
    });

    expect(useAudioPlaybackStore.getState().activeUrl).toBe('https://example.com/audio1.ogg');
    expect(useAudioPlaybackStore.getState().isPlaying).toBe(true);
  });

  it('does not call load() explicitly before play() on a user tap', async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const load = vi.fn();
    window.HTMLMediaElement.prototype.play = play;
    window.HTMLMediaElement.prototype.pause = vi.fn();
    window.HTMLMediaElement.prototype.load = load;

    render(<MessageAudio attachments={[mockAttachments[0]]} />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Reproduzir áudio'));
    });

    expect(play).toHaveBeenCalledTimes(1);
    expect(load).not.toHaveBeenCalled();
  });

  it('reports playback rejection and resets the loading state', async () => {
    window.HTMLMediaElement.prototype.play = vi.fn().mockRejectedValue(new Error('decode failed'));
    window.HTMLMediaElement.prototype.pause = vi.fn();
    window.HTMLMediaElement.prototype.load = vi.fn();

    render(<MessageAudio attachments={[mockAttachments[0]]} />);

    await act(async () => {
      fireEvent.click(screen.getByLabelText('Reproduzir áudio'));
    });

    expect(toast.error).toHaveBeenCalled();
    expect(screen.getByLabelText('Reproduzir áudio')).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('keeps playback paused if the play promise resolves after the user paused', async () => {
    let resolvePlay!: () => void;
    const play = vi.fn(() => new Promise<void>((resolve) => {
      resolvePlay = resolve;
    }));
    const pause = vi.fn();
    window.HTMLMediaElement.prototype.play = play;
    window.HTMLMediaElement.prototype.pause = pause;
    window.HTMLMediaElement.prototype.load = vi.fn();

    render(<MessageAudio attachments={[mockAttachments[0]]} />);

    fireEvent.click(screen.getByLabelText('Reproduzir áudio'));
    fireEvent.click(screen.getByLabelText('Reproduzir áudio'));

    await act(async () => {
      resolvePlay();
      await Promise.resolve();
    });

    expect(play).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Reproduzir áudio')).toBeInTheDocument();
    expect(useAudioPlaybackStore.getState().activeUrl).toBeNull();
  });

  it('does not start another audio while a different attachment is still loading', async () => {
    const play = vi.fn(() => new Promise<void>(() => undefined));
    window.HTMLMediaElement.prototype.play = play;
    window.HTMLMediaElement.prototype.pause = vi.fn();
    window.HTMLMediaElement.prototype.load = vi.fn();

    render(<MessageAudio attachments={mockAttachments} />);

    fireEvent.click(screen.getAllByLabelText('Reproduzir áudio')[0]);
    fireEvent.click(screen.getAllByLabelText('Reproduzir áudio')[1]);

    expect(play).toHaveBeenCalledTimes(1);
    expect(useAudioPlaybackStore.getState().activeUrl).toBe('https://example.com/audio1.ogg');
  });
});
