import { Message } from '@/types/chat/api';

/**
 * Normaliza o timestamp de criação de uma mensagem para segundos Unix (number).
 * Trata Unix timestamp numérico, strings numéricas e strings ISO 8601.
 */
export const normalizeMessageTimestamp = (message: Message): number => {
  const createdAt = message.created_at;

  // Se já é número (Unix timestamp em segundos), retornar direto
  if (typeof createdAt === 'number') {
    return createdAt;
  }

  // Se é string, verificar se é ISO Date ou string numérica
  if (typeof createdAt === 'string') {
    // Se contém hífen ou T, é ISO Date string
    if (createdAt.includes('-') || createdAt.includes('T')) {
      const dateParsed = new Date(createdAt).getTime() / 1000;
      if (!isNaN(dateParsed) && dateParsed > 0) {
        return dateParsed;
      }
    }

    const parsed = parseInt(createdAt, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  // Fallback: usar timestamp atual (mensagem sem timestamp válido vai para o final)
  return Date.now() / 1000;
};

/**
 * Comparador puro para ordenação de mensagens:
 * Mais antigo primeiro, com mensagens em progresso ('progress') mantidas no final.
 */
export const compareMessagesByTimestamp = (a: Message, b: Message): number => {
  const aSending = a.status === 'progress';
  const bSending = b.status === 'progress';
  if (aSending && !bSending) return 1;
  if (!aSending && bSending) return -1;

  const aTimestamp = normalizeMessageTimestamp(a);
  const bTimestamp = normalizeMessageTimestamp(b);
  return aTimestamp - bTimestamp;
};
