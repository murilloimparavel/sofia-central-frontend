# Arquitetura e Engenharia do Módulo de Chat v2 (Sofia Central / EvoCRM)

Este documento registra formalmente a refatoração arquitetural executada no módulo de Chat do frontend da Sofia Central (`sofia-central-frontend`), seguindo as diretrizes de componetização, desacoplamento e robustez operacional.

---

## 1. Contexto e Motivação

Historicamente, o módulo de chat concentrava lógicas críticas de gerenciamento de estado, sincronização de URL, cálculos de timestamp e manipulação de eventos WebSocket diretamente em arquivos monolíticos:
- `Chat.tsx` (mais de 1.100 linhas);
- `MessagesContext.tsx` (mais de 1.100 linhas);
- `ConversationsContext.tsx` (mais de 1.000 linhas).

Essa concentração causava:
1. **Risco de loops de render e re-renderizações em cascata**: Qualquer alteração em `selectedConversationId` disparava renderizações em componentes não correlacionados.
2. **Fragilidade em ordenação de mensagens**: Lógica de parsing de datas/timestamps acoplada ao reducer (`parseInt('2026-10-05T...')`), gerando ordenações espúrias para datas no formato ISO-8601.
3. **Dificuldade de diagnóstico em produção**: Falta de loggers padronizados e categorizados por domínio (WebSocket, Mensagens, UI, Performance).

---

## 2. Decisões Arquiteturais por Sprint

### Sprint 1: Isolamento do MessagesContext & Logger Estruturado
- **Logger Namespaced (`src/utils/logger/chatLogger.ts`)**:
  Criada uma camada de logging estruturado com suporte a níveis (`debug`, `info`, `warn`, `error`) e namespaces específicos:
  - `chatLogger.ws`: Monitoramento do ciclo de vida da conexão ActionCable / WebSocket.
  - `chatLogger.messages`: Rastreamento de adições, atualizações de status (delivered/read) e paginação de mensagens.
  - `chatLogger.ui`: Interações visuais, resize e deep links.
  - `chatLogger.perf`: Medições de tempo de renderização e prefetch.
- **Utilitário Puro de Timestamps (`src/contexts/chat/messageTimestampUtils.ts`)**:
  Extração de comparadores e parsers de data puros com tolerância robusta tanto a timestamps Unix em segundos (`1711234567`) quanto ISO-8601 UTC (`2026-10-05T12:00:00Z`).
- **Reducer Puro (`src/contexts/chat/MessagesContextReducer.ts`)**:
  Extração de todo o chaveamento de ações do `MessagesContext` para funções puras e 100% cobertas por testes unitários (`MessagesContextReducer.spec.ts`).

### Sprint 2: Seletores Granulares no ChatContext
- **Seletores Especializados (`src/contexts/chat/ChatContext.tsx`)**:
  Criação de hooks atômicos para evitar que componentes que dependem apenas de flags visuais assinem mudanças na lista completa de mensagens:
  - `useChatMessages()`: Apenas mensagens e paginação.
  - `useChatConversations()`: Apenas conversas, status e lista.
  - `useChatFilters()`: Apenas filtros ativos e presets.
  - `useChatUI()`: Estados de drawer, mobile view e visibilidade de abas.
  - `useChatWebSocket()`: Estado de conexão do socket.
  - `useSelectedConversation()` & `useSelectedConversationId()`: Seletores diretos da conversa ativa.

### Sprint 3: Atomização do `Chat.tsx` em Hooks Dedicados
- **`useSidebarResize.ts`**:
  Isolou o cálculo do arraste da coluna de conversas (clamp entre 280px e 560px), com throttle via `requestAnimationFrame` e persistência no `localStorage` sob a chave `evo_chat_sidebar_width_v1`.
- **`useChatUrlSync.ts`**:
  Centralizou a resolução de segment presets (`?segment=mine`, `?segment=robot`, etc.), a sincronização bidirecional do `conversationId` com a rota `/conversations/:id` e a proteção contra race conditions durante transições manuais de rota.

### Sprint 4: Tipagem Estrita e Garantia de Qualidade
- Validação integral com TypeScript (`npx tsc --noEmit` sem erros).
- Validação de 100% dos testes unitários e de integração de componentes de chat com Vitest.
- Resolução e prevenção de regressões em avatares de contato (`ContactAvatar.tsx` e `ContactAvatar.spec.tsx`).

---

## 3. Diretrizes para Futuras Extensões

1. **Adição de Novas Ações de Mensagens**:
   Sempre adicionar o tipo em `MessagesAction`, implementar o case puro em `MessagesContextReducer.ts` e adicionar o teste correspondente em `MessagesContextReducer.spec.ts` antes de consumir na UI.
2. **Consumo de Estados no Chat**:
   Prefira sempre utilizar os seletores específicos (`useSelectedConversation()`, `useChatMessages()`) ao invés do monolítico `useChatContext()` para garantir a menor área de re-renderização possível.
3. **Logs Operacionais**:
   Utilizar sempre `chatLogger` em vez de `console.log` para permitir filtragem rápida no console do navegador e facilitar o suporte remoto aos operadores.
