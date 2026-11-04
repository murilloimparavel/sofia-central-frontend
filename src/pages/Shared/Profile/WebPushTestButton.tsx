import { useState } from 'react';
import { Button } from '@evoapi/design-system';
import { Bell } from 'lucide-react';
import { extractError } from '@/utils/apiHelpers';
import { sendWebPushTest } from '@/services/notifications/webPushService';

export function WebPushTestButton({ enabled, busy = false }: { enabled: boolean; busy?: boolean }) {
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);

  const sendTest = async () => {
    setSending(true);
    setMessage('');
    setFailed(false);
    try {
      const delay = await sendWebPushTest();
      setMessage(`Teste agendado para este aparelho. Bloqueie a tela: o envio será feito em ${delay} segundos.`);
    } catch (error) {
      setFailed(true);
      setMessage(error ? extractError(error).message : 'Não foi possível agendar o teste.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-2">
      <Button variant="outline" disabled={!enabled || busy || sending} onClick={() => { void sendTest(); }}>
        <Bell className="mr-2 h-4 w-4" aria-hidden="true" />
        {sending ? 'Agendando teste...' : 'Enviar notificação de teste'}
      </Button>
      {!enabled && <p className="text-sm text-muted-foreground">Ative as notificações neste aparelho para enviar um teste.</p>}
      {message && <p role={failed ? 'alert' : 'status'} className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
