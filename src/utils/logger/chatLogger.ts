/**
 * Chat Structured Logger
 * Provides categorized, contextual logs for debugging real-time sync,
 * WebSockets, message flows, and performance bottlenecks without cluttering
 * production consoles.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogContext {
  conversationId?: string | number;
  messageId?: string | number;
  status?: string | number;
  [key: string]: unknown;
}

class ChatLogger {
  private isDev = Boolean(import.meta.env?.DEV);

  private formatPrefix(namespace: string): string {
    return `[Chat::${namespace}]`;
  }

  private log(level: LogLevel, namespace: string, message: string, context?: LogContext): void {
    const prefix = this.formatPrefix(namespace);
    const timestamp = new Date().toISOString().split('T')[1].replace('Z', '');

    if (level === 'error') {
      console.error(`${prefix} [${timestamp}] ❌ ${message}`, context ?? '');
      return;
    }

    if (level === 'warn') {
      console.warn(`${prefix} [${timestamp}] ⚠️ ${message}`, context ?? '');
      return;
    }

    if (!this.isDev) {
      return;
    }

    if (level === 'info') {
      console.info(`${prefix} [${timestamp}] ℹ️ ${message}`, context ?? '');
    } else {
      console.debug(`${prefix} [${timestamp}] 🔍 ${message}`, context ?? '');
    }
  }

  // WebSocket & ActionCable sync
  ws(message: string, context?: LogContext): void {
    this.log('debug', 'WebSocket', message, context);
  }

  wsError(message: string, context?: LogContext): void {
    this.log('error', 'WebSocket', message, context);
  }

  // Messages lifecycle (load, optimistic add, reconcile, status change)
  messages(message: string, context?: LogContext): void {
    this.log('debug', 'Messages', message, context);
  }

  messagesWarn(message: string, context?: LogContext): void {
    this.log('warn', 'Messages', message, context);
  }

  messagesError(message: string, context?: LogContext): void {
    this.log('error', 'Messages', message, context);
  }

  // UI state & navigation (sidebar, URL sync, scope switch)
  ui(message: string, context?: LogContext): void {
    this.log('debug', 'UI', message, context);
  }

  uiWarn(message: string, context?: LogContext): void {
    this.log('warn', 'UI', message, context);
  }

  uiError(message: string, context?: LogContext): void {
    this.log('error', 'UI', message, context);
  }

  // Performance & re-renders
  perf(message: string, context?: LogContext): void {
    this.log('debug', 'Perf', message, context);
  }
}

export const chatLogger = new ChatLogger();
