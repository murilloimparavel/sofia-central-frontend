import { describe, it, expect } from 'vitest';
import { formatChatMessage, sanitizeChatMessageHTML } from './formatChatMessage';

describe('formatChatMessage', () => {
  it('handles empty and falsy input safely', () => {
    expect(formatChatMessage('')).toEqual({ html: '', detectedUrls: [] });
    // @ts-expect-error test undefined
    expect(formatChatMessage(undefined)).toEqual({ html: '', detectedUrls: [] });
  });

  it('formats WhatsApp bold text (*text*)', () => {
    const result = formatChatMessage('*Texto em negrito*');
    expect(result.html).toBe('<strong>Texto em negrito</strong>');
  });

  it('formats bold text preceded by emojis and followed by punctuation', () => {
    const input = '🟡 *Confirmação de Pagamento Parcial Recebido*!\n\n*Nome:* João *Sobrenome:* Silva';
    const result = formatChatMessage(input);
    expect(result.html).toContain('🟡 <strong>Confirmação de Pagamento Parcial Recebido</strong>!');
    expect(result.html).toContain('<strong>Nome:</strong> João <strong>Sobrenome:</strong> Silva');
  });

  it('does not format arithmetic multiplication as bold', () => {
    const input = '5 * 5 = 25 e 3 * 2 = 6';
    const result = formatChatMessage(input);
    expect(result.html).toBe('5 * 5 = 25 e 3 * 2 = 6');
  });

  it('formats WhatsApp italic text (_text_)', () => {
    const result = formatChatMessage('_Texto em itálico_');
    expect(result.html).toBe('<em>Texto em itálico</em>');
  });

  it('does not treat snake_case variable names as italic', () => {
    const input = 'Verifique a variável canned_responses_id no código.';
    const result = formatChatMessage(input);
    expect(result.html).toBe('Verifique a variável canned_responses_id no código.');
  });

  it('formats WhatsApp strikethrough (~text~)', () => {
    const result = formatChatMessage('Preço: ~R$ 100~ R$ 80');
    expect(result.html).toBe('Preço: <del>R$ 100</del> R$ 80');
  });

  it('formats inline code (`code`) and preserves content without markdown parsing', () => {
    const result = formatChatMessage('Execute o comando `git checkout -b feature_*` agora.');
    expect(result.html).toContain('<code class="bg-muted/50 px-1 py-0.5 rounded text-xs font-mono">git checkout -b feature_*</code>');
    // Ensure asterisk inside code is not converted to <strong>
    expect(result.html).not.toContain('<strong>');
  });

  it('formats multi-line code blocks (```code```)', () => {
    const input = '```\nconst a = 10;\nconst b = 20;\n```';
    const result = formatChatMessage(input);
    expect(result.html).toContain('<pre class="bg-muted/50 p-2 rounded text-xs font-mono my-1 overflow-x-auto whitespace-pre-wrap"><code>\nconst a = 10;\nconst b = 20;\n</code></pre>');
  });

  it('auto-links URLs and collects them into detectedUrls', () => {
    const input = 'Acesse nosso site: https://crcn.com.br/reservas e https://wa.me/5564981289820';
    const result = formatChatMessage(input);
    expect(result.detectedUrls).toEqual([
      'https://crcn.com.br/reservas',
      'https://wa.me/5564981289820',
    ]);
    expect(result.html).toContain('<a href="https://crcn.com.br/reservas" target="_blank" rel="noopener noreferrer" class="text-blue-500 underline break-all hover:text-blue-400">https://crcn.com.br/reservas</a>');
  });

  it('does not break URLs that contain underscores into italic', () => {
    const input = 'Link: https://example.com/api/v1/user_profile_data';
    const result = formatChatMessage(input);
    expect(result.html).toContain('href="https://example.com/api/v1/user_profile_data"');
    expect(result.html).not.toContain('<em>');
  });

  it('preserves existing safe HTML tags and formats markdown inside them', () => {
    const input = '<p>🟡 *Confirmação de Pagamento Parcial Recebido*!\n\nRecebemos o pagamento inicial...</p>';
    const result = formatChatMessage(input);
    expect(result.html).toBe('<p>🟡 <strong>Confirmação de Pagamento Parcial Recebido</strong>!\n\nRecebemos o pagamento inicial...</p>');
  });

  it('does not re-link URLs that are already inside <a> tags', () => {
    const input = '<p>Veja <a href="https://crcn.com.br">nosso site</a> e também https://google.com</p>';
    const result = formatChatMessage(input);
    expect(result.html).toContain('<a href="https://crcn.com.br">nosso site</a>');
    expect(result.html).toContain('<a href="https://google.com" target="_blank" rel="noopener noreferrer" class="text-blue-500 underline break-all hover:text-blue-400">https://google.com</a>');
    expect(result.detectedUrls).toContain('https://crcn.com.br');
    expect(result.detectedUrls).toContain('https://google.com');
  });

  it('sanitizes dangerous HTML tags and handlers', () => {
    const malicious = '<script>alert(1)</script><img src="x" onerror="alert(2)" /><p>Olá *mundo*</p>';
    const result = formatChatMessage(malicious);
    expect(result.html).not.toContain('<script>');
    expect(result.html).not.toContain('onerror');
    expect(result.html).toContain('<p>Olá <strong>mundo</strong></p>');
  });

  it('strips color styles for private notes when option is enabled', () => {
    const note = '<p style="color: red; font-weight: bold;">Nota privada *importante*</p>';
    const result = formatChatMessage(note, { isPrivateNote: true });
    expect(result.html).not.toContain('color: red');
    expect(result.html).toContain('<strong>importante</strong>');
  });

  it('correctly handles the exact canned response from conversation 2424', () => {
    const input = '<p>🟡 *Confirmação de Pagamento Parcial Recebido*!\n\nRecebemos o pagamento inicial e agora vamos te orientar nos próximos passos para garantir uma chegada tranquila e sem imprevistos:\n\n*Pagamento Final*: O saldo restante deverá ser quitado até 3 dias antes do check-in.\n\n*Dados do Titular da Reserva*\n\nNome completo (titular):\nTelefone:\nCPF:</p>';
    const result = formatChatMessage(input);
    expect(result.html).toContain('<strong>Confirmação de Pagamento Parcial Recebido</strong>');
    expect(result.html).toContain('<strong>Pagamento Final</strong>:');
    expect(result.html).toContain('<strong>Dados do Titular da Reserva</strong>');
    expect(result.html).toContain('\n\nRecebemos o pagamento inicial');
    expect(result.html.startsWith('<p>')).toBe(true);
    expect(result.html.endsWith('</p>')).toBe(true);
  });
});
