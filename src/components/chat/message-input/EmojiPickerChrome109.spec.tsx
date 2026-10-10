import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import EmojiPickerChrome109 from './EmojiPickerChrome109';

vi.mock('./EmojiPicker', async () => {
  await new Promise(resolve => setTimeout(resolve, 100));
  return { default: () => <div>emoji picker loaded</div> };
});
vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));

describe('EmojiPickerChrome109', () => {
  it('does not mount or request the picker while it is closed', () => {
    render(
      <EmojiPickerChrome109 isOpen={false} onClose={vi.fn()} onEmojiSelect={vi.fn()} />,
    );

    expect(screen.queryByText('emoji picker loaded')).toBeNull();
  });

  it('loads and renders the picker when the operator opens it', async () => {
    render(
      <EmojiPickerChrome109 isOpen onClose={vi.fn()} onEmojiSelect={vi.fn()} />,
    );

    expect(screen.getByRole('status')).toHaveTextContent('messageInput.emojiPicker.loading');
    await waitFor(() => expect(screen.getByText('emoji picker loaded')).toBeTruthy());
  });
});
