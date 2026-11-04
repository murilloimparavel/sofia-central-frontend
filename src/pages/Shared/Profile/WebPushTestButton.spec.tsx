import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { WebPushTestButton } from './WebPushTestButton';
import { sendWebPushTest } from '@/services/notifications/webPushService';
vi.mock('@/services/notifications/webPushService', () => ({ sendWebPushTest: vi.fn() }));

beforeEach(() => { vi.clearAllMocks(); });
describe('profile push test button', () => {
  it('requires push enrollment on this device', () => {
    render(<WebPushTestButton enabled={false} />);
    expect(screen.getByRole('button', { name: 'Enviar notificação de teste' })).toBeDisabled();
  });
  it('schedules a real push and tells the user to lock the screen', async () => {
    vi.mocked(sendWebPushTest).mockResolvedValueOnce(10);
    render(<WebPushTestButton enabled />);
    fireEvent.click(screen.getByRole('button', { name: 'Enviar notificação de teste' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Bloqueie a tela');
    expect(screen.getByRole('status')).toHaveTextContent('10 segundos');
    expect(sendWebPushTest).toHaveBeenCalledOnce();
  });
  it('prevents duplicate clicks while the request is pending', async () => {
    let finish!: (seconds: number) => void;
    vi.mocked(sendWebPushTest).mockReturnValueOnce(new Promise(resolve => { finish = resolve; }));
    render(<WebPushTestButton enabled />);
    fireEvent.click(screen.getByRole('button'));
    expect(screen.getByRole('button')).toBeDisabled();
    fireEvent.click(screen.getByRole('button'));
    expect(sendWebPushTest).toHaveBeenCalledOnce();
    finish(10);
    await waitFor(() => expect(screen.getByRole('button')).toBeEnabled());
  });
  it('supports standard API error envelopes', async () => {
    vi.mocked(sendWebPushTest).mockRejectedValueOnce({ response: { data: { success: false, error: { message: 'Sessão expirada.' } } } });
    render(<WebPushTestButton enabled />);
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Sessão expirada.');
  });
  it('shows a refused test as an error rather than claiming delivery', async () => {
    vi.mocked(sendWebPushTest).mockRejectedValueOnce({ response: { data: { error: 'Aguarde 30 segundos.' } } });
    render(<WebPushTestButton enabled />);
    fireEvent.click(screen.getByRole('button'));
    expect(await screen.findByRole('alert')).toHaveTextContent('Aguarde 30 segundos.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
