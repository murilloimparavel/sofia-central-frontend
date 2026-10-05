import { render, screen, fireEvent, act } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import MessageAudio from './MessageAudio';
import { Attachment } from '@/types/chat/api';
import { useAudioPlaybackStore } from '@/store/audioPlaybackStore';

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
    window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
    window.HTMLMediaElement.prototype.pause = vi.fn();
    window.HTMLMediaElement.prototype.load = vi.fn();

    render(<MessageAudio attachments={mockAttachments} />);

    const playButtons = screen.getAllByLabelText('Reproduzir áudio');
    await act(async () => {
      fireEvent.click(playButtons[0]);
    });

    expect(useAudioPlaybackStore.getState().activeUrl).toBe('https://example.com/audio1.ogg');
    expect(useAudioPlaybackStore.getState().isPlaying).toBe(true);
  });
});
