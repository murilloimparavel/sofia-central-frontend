# Otimização de Performance no Carregamento de Conversas (Baseado no Chatwoot)

## 📌 1. Contexto e Problema Identificado

Durante o uso intenso do CRM pelos operadores e atendentes, foram observados três sintomas de degradação de experiência:
1. **Lentidão ao alternar conversas**: Ao clicar em uma conversa da barra lateral, havia um atraso perceptível e exibição de spinners de carregamento mesmo para conversas recentemente abertas.
2. **Re-renderizações em cascata e alto consumo de CPU**: O `getMessages` filtrava e re-ordenava todo o array de mensagens a cada render do `ChatContext`, gerando referências de array sempre novas (`[] !== []`), forçando o `ChatArea`, `MessageList` e todos os balões a renderizarem novamente sem necessidade.
3. **Necessidade de F5 para receber novas mensagens**: Quedas momentâneas do WebSocket faziam com que mensagens recebidas ficassem de fora da conversa aberta sem um mecanismo de recuperação incremental automática.

---

## 💡 2. Arquitetura Inspirada no Chatwoot

Após análise comparativa direta com o padrão do Chatwoot (via GitHub CLI sem download de dependências extras), foi implementada uma estratégia em três pilares:

```text
[ Clique do Atendente ]
         │
         ▼
Existe cache em memória?
   ├── SIM ──> Exibe no frame 0 (0ms, sem spinner)
   │             │
   │             ▼
   │          Cache tem > 10s?
   │             ├── SIM ──> Sincroniza silenciosamente via API (after: lastMessageId)
   │             └── NÃO ──> Mantém estado atual
   │
   └── NÃO ──> Busca completa inicial (loading restrito ao 1º acesso)
```

```text
[ WebSocket Reconectou ]
         │
         ▼
Identifica conversa ativa aberta
         │
         ▼
Dispara syncConversationMessages(id) com after: lastMessageId
         │
         ▼
Mescla mensagens novas via MERGE_NEW_MESSAGES sem piscar a tela
```

---

## 🛠️ 3. Modificações Implementadas

### 3.1. `src/contexts/chat/MessagesContext.tsx`
- **Cache Instantâneo (0ms)**: Ao chamar `loadMessages`, se já existirem mensagens no dicionário `state.messages[conversationId]`, o retorno é imediato.
- **Reconciliação Incremental (`syncConversationMessages`)**:
  - Localiza o último ID persistido (`status !== 'progress'`).
  - Consulta o backend com `after: lastPersistedMessage.id`.
  - Compartilha promessas em voo via `syncRequestsRef` para evitar requisições idênticas duplicadas.
- **Action `MERGE_NEW_MESSAGES` no Reducer**:
  - Mescla novas mensagens por ID (`Map`).
  - Faz reconciliação automática de mensagens pendentes em envio que chegam confirmadas via `echo_id`.
  - Ordena uma única vez no reducer, mantendo `state.messages` sempre pré-ordenado.
- **Estabilidade de Referência em `getMessages`**:
  - Removeu a ordenação repetitiva `[...validMessages].sort(...)` do getter.
  - Retorna diretamente `state.messages[key] || EMPTY_MESSAGES` (O(1)).
  - Mantém a igualdade referencial (`prev === next`), impedindo re-renders de toda a árvore do chat.
- **Remoção de Sobrecarga (`protectedDispatch`)**:
  - Substituído pelo `dispatch` padrão do `useReducer`, eliminando timeouts de 1 segundo com `Math.random()`.
- **`prefetchMessages`**:
  - Permite carregar mensagens antecipadamente em segundo plano sem disparar flags de loading visual na UI.
- **Memoização do `contextValue`**:
  - Envolvido em `useMemo` com dependências controladas.

### 3.2. `src/contexts/chat/ChatContext.tsx`
- **Listener de Reconexão do WebSocket**:
  - Monitora transição de `isWebSocketConnected` de `false` para `true`.
  - Dispara `messages.syncConversationMessages(selectedConversationId)` automaticamente para preencher gaps de mensagens.
- **Normalização de IDs em `selectedMessages`**:
  - Suporta busca tanto por `uuid` canônico quanto por `id` numérico com fallback seguro, sempre retornando arrays estáveis.

### 3.3. `src/pages/Customer/Chat/Chat.tsx`
- **Prefetch Inteligente da Próxima Conversa (Princípio 80/20)**:
  - Após 600ms de abertura da conversa atual (em momento ocioso do navegador), localiza a próxima conversa visível na lista e faz o prefetch silencioso.
  - Ao clicar na conversa adjacente, o carregamento passa a ser instantâneo (0ms).

---

## 🧪 4. Cobertura de Testes Automatizados

Criada a suíte de testes unitários dedicada:
- `src/contexts/chat/MessagesContext.spec.tsx`
  - Cache instantâneo e ausência de chamadas REST duplicadas.
  - Estabilidade de referência do array de mensagens.
  - Sincronização incremental com parâmetro `after`.
  - Prefetch silencioso sem afetar estados de loading.

Todas as suítes de chat (`ConversationsContext.spec.tsx`, `ChatContext.contactUpdated.spec.tsx`, `WebSocketContext.spec.tsx`, `Chat.spec.tsx`, `MessagesContext.spec.tsx`) foram validadas e totalizam **57 testes unitários passando com 100% de sucesso**.
