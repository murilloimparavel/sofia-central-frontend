# Anti-Flicker & Otimização de Renderização – SOFIA Central

> **Data:** Setembro 2026  
> **Branch:** `feat/antiflicker-optimizations`  
> **Commit:** `dd8030a3`  
> **Impacto:** Eliminação de piscamento visual em boot, navegação e chat

---

## 1. Diagnóstico das Causas Raiz

Foram identificadas **5 fontes primárias de flickering** no frontend antes desta intervenção:

| # | Causa | Componente | Impacto |
|---|---|---|---|
| 1 | **FOUC** — Classe `.dark` aplicada tarde (após bundle JS) | `index.html`, `main.tsx` | Clarão branco em F5 |
| 2 | **Classe CSS inválida** no `LoadingScreen` | `LoadingScreen.tsx` | Fundo transparente no dark mode |
| 3 | **`transition-colors` nos containers raiz** | `MainLayout.tsx` | Animação de cor (150ms) a cada navegação |
| 4 | **Objetos de contexto não memoizados** | `ChatContext`, `WebSocketContext`, `ConversationsContext`, `FiltersContext`, `UIContext` | Re-renders em cascata a cada tick WS (5s) |
| 5 | **Chaves DOM instáveis** na lista de mensagens | `MessageList.tsx`, `MessageBubble.tsx` | Unmount/remount de bolhas ao rolar histórico |

---

## 2. Sprint 1 — Boot & FOUC

### 2.1 Script Bloqueante no `<head>` (`index.html`)

**Problema:** `initTheme()` era chamado em `main.tsx` após o carregamento do bundle JS (~8 MB). Durante esse tempo, o `document.documentElement` não possuía a classe `.dark`, resultando em fundo branco visível para usuários com tema escuro.

**Solução:** Script inline adicionado ao `<head>` do `index.html`, executado sincronamente antes de qualquer renderização:

```html
<script>
  (function() {
    try {
      var saved = localStorage.getItem('theme');
      var prefersDark = window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (saved === 'dark' || (!saved && prefersDark)) {
        document.documentElement.classList.add('dark');
        document.documentElement.style.backgroundColor = '#0b0f19';
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.style.backgroundColor = '#ffffff';
      }
    } catch (e) {}
  })();
</script>
```

**Resultado:** Nenhum frame branco é exibido, independentemente do tamanho do bundle.

### 2.2 Correção do `LoadingScreen.tsx`

**Problema:** A classe `bg-neutral-background-default` não existe no Tailwind v4 do projeto, causando fundo transparente (branco no dark mode) no componente de loading e no Suspense fallback do `ChatPage`.

**Correção:**
```tsx
// Antes
'flex flex-col items-center justify-center bg-neutral-background-default'
// Depois
'flex flex-col items-center justify-center bg-background text-foreground'
```

Ícone de loading também corrigido de `text-primary-interaction-default dark:text-primary-surface-default` para `text-primary`.

### 2.3 Remoção de `transition-colors` do `MainLayout.tsx`

**Problema:** As três tags de container raiz possuíam `transition-colors duration-150 ease-in-out`. Ao navegar entre rotas, o React remontava o layout (por ter 74 instâncias de `<MainLayout>` em `routes/index.tsx`), e a transição animava a cor de fundo por 150ms, criando a percepção visual de piscamento.

**Correção:** Removida a classe das três tags:
- `div.flex.flex-col.h-dvh.bg-background`
- `div.flex.flex-1.min-h-0.relative`
- `main.flex-1.min-h-0.overflow-auto.bg-background`

---

## 3. Sprint 2 — Estabilidade Referencial dos Contextos

### 3.1 Memoização com `useMemo` nos Providers

**Problema:** Todos os contextos criavam um novo objeto literal a cada render do provider. Como o WebSocket dispara eventos a cada ~5 segundos (heartbeat de conexão, eventos de digitação, presença), toda a árvore de componentes filhos do `ChatProvider` re-renderizava continuamente.

**Contextos corrigidos:**

| Contexto | Arquivo |
|---|---|
| `WebSocketContext` | `src/contexts/chat/WebSocketContext.tsx` |
| `ConversationsContext` | `src/contexts/chat/ConversationsContext.tsx` |
| `FiltersContext` | `src/contexts/chat/FiltersContext.tsx` |
| `UIContext` | `src/contexts/chat/UIContext.tsx` |
| `ChatContext` (`useChatIntegration`) | `src/contexts/chat/ChatContext.tsx` |

Padrão aplicado:
```tsx
// Antes
const contextValue: WebSocketContextValue = {
  state, sendTypingOn, sendTypingOff, ...
};

// Depois
const contextValue: WebSocketContextValue = useMemo(
  () => ({ state, sendTypingOn, sendTypingOff, ... }),
  [state, sendTypingOn, sendTypingOff, ...],
);
```

### 3.2 Estabilização dos Handlers WebSocket com `useRef`

**Problema:** O `useEffect` que registrava handlers no WebSocket dependia de `[websocket, messages, conversations, currentUser, ...]`. Cada nova mensagem WS alterava o estado de `conversations`, criando novas referências, o que re-executava o `useEffect`, cancelando e re-registrando todos os listeners continuamente.

**Solução:** Adição de refs que são atualizadas a cada render de forma transparente (sem disparar efeitos):

```tsx
const messagesRef = useRef(messages);
messagesRef.current = messages;
const conversationsRef = useRef(conversations);
conversationsRef.current = conversations;
const currentUserRef = useRef(currentUser);
currentUserRef.current = currentUser;
const reconcileContactUpdatedRef = useRef(reconcileContactUpdated);
reconcileContactUpdatedRef.current = reconcileContactUpdated;
```

Os handlers passaram a consumir `xRef.current` em vez das variáveis diretamente, e as dependências do `useEffect` foram reduzidas para apenas:
```tsx
}, [websocket.registerHandlers, shouldReloadMessageForMissingImageData]);
```

---

## 4. Sprint 3 — Estabilidade do DOM no Chat

### 4.1 Chaves Estáveis no `MessageList.tsx`

**Problema:** As mensagens usavam `key={\`${message.id}-${index}\`}`. Ao carregar histórico anterior (scroll para cima via `onLoadMore`), novas mensagens eram *prepended* ao array, alterando os índices de todas as mensagens existentes. O React interpretava isso como nós diferentes e desmontava/remontava todos os `div` das mensagens.

**Correção:**
```tsx
// Antes
<div key={`${message.id}-${index}`} data-message-id={message.id}>
// Depois
<div key={message.id || index} data-message-id={message.id}>
```

O mesmo foi aplicado para mensagens de sistema (`key={`system-${message.id || index}`}`).

### 4.2 Memoização do `MessageBubble.tsx`

**Problema:** `MessageBubble` era um componente puro sem memoização. Cada nova mensagem recebida disparava um re-render de *todas* as bolhas na lista (podendo ser 50-200+), pois o array `allMessages` era recriado a cada update.

**Solução:** Exportação via `React.memo` com comparador customizado que:
- Compara campos relevantes da mensagem: `id`, `status`, `content`, `created_at`, `attachments`
- Compara props de layout: `isOwn`, `isFromBot`, `isFromAgent`, `showAvatar`, etc.
- Só compara `allMessages` quando a mensagem tem uma referência de reply (`in_reply_to`)

```tsx
function areMessageBubblePropsEqual(prev: MessageBubbleProps, next: MessageBubbleProps): boolean {
  if (prev.message.id !== next.message.id) return false;
  if (prev.message.status !== next.message.status) return false;
  // ...
  const hasReply = !!(
    prev.message.content_attributes?.in_reply_to ||
    prev.message.content_attributes?.in_reply_to_external_id
  );
  if (hasReply && prev.allMessages !== next.allMessages) return false;
  return true;
}

export default React.memo(MessageBubble, areMessageBubblePropsEqual);
```

---

## 5. Critérios de Aceite Verificados

| Critério | Status |
|---|---|
| Zero clarão branco em F5 com tema escuro | ✅ Eliminado via script inline |
| `LoadingScreen` com fundo correto em dark mode | ✅ Classe corrigida |
| Navegação sem transição de cor animada | ✅ `transition-colors` removido |
| Contextos estáveis — sem re-renders por tick WS | ✅ `useMemo` em todos os 5 providers |
| Handlers WS registrados uma única vez | ✅ Refs + deps mínimas no `useEffect` |
| Scroll no histórico sem piscar bolhas existentes | ✅ Chave estável `message.id` |
| Nova mensagem re-renderiza apenas a nova bolha | ✅ `React.memo` com comparador |

---

## 6. Build e Testes

- **Build de produção:** ✅ `npm run build` — zero erros TypeScript em todas as 3 sprints
- **Testes unitários:** 2536 passando | 43 falhas pré-existentes (falhas em `opusRecorder.spec.ts` e `NewChannel.spec.tsx` confirmadas também na branch `deploy/ghcr-frontend` sem nossas alterações)

---

## 7. Arquivos Modificados

| Arquivo | Sprint | Tipo de mudança |
|---|---|---|
| `index.html` | 1 | Script inline anti-FOUC |
| `src/components/LoadingScreen.tsx` | 1 | Classe CSS |
| `src/components/layout/MainLayout.tsx` | 1 | Remoção de `transition-colors` |
| `src/contexts/chat/WebSocketContext.tsx` | 2 | `useMemo` no contextValue |
| `src/contexts/chat/ConversationsContext.tsx` | 2 | `useMemo` no contextValue |
| `src/contexts/chat/FiltersContext.tsx` | 2 | `useMemo` no contextValue |
| `src/contexts/chat/UIContext.tsx` | 2 | `useMemo` no contextValue |
| `src/contexts/chat/ChatContext.tsx` | 2 | `useMemo` + refs estáveis para WS handlers |
| `src/components/chat/messages/MessageList.tsx` | 3 | Chave estável `message.id` |
| `src/components/chat/messages/MessageBubble.tsx` | 3 | `React.memo` + comparador |
