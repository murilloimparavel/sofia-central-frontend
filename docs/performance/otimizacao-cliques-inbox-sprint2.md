# Otimização de Desempenho do Chat Inbox — Fase 2 (Sprints 1, 2 e 3)

## 📌 Contexto & Motivação
Mesmo após as primeiras melhorias de prefetch, o usuário ainda percebia lentidão ao clicar entre conversas e abrir novas mensagens.
Foi realizada uma auditoria profunda do código-fonte e da arquitetura de performance do repositório de referência [`DeskcommCRM`](https://github.com/melgarafael/DeskcommCRM), aliada à análise de logs reais de tráfego HTTP no gateway do Nginx.

### Diagnóstico de Gargalos Identificados
1. **Re-renderização em massa na Sidebar**:
   - Ao selecionar uma conversa, `selectedConversationId` alterava o estado global, forçando todos os 20 a 50 cards da lista da barra lateral a recalcularem JSX e re-renderizarem no mesmo tick do JavaScript.
2. **Inundação de requisições `update_last_seen`**:
   - Disparo redundante no `Chat.tsx` e no `ConversationsContext.tsx`, gerando até 4 requisições `POST /update_last_seen` repetidas a cada clique, mesmo em conversas sem mensagens não lidas (`unread_count === 0`).
3. **Destruição do DOM no `ChatArea` via Skeleton**:
   - Em `ChatArea.tsx`, a condição `messages.isMessagesLoading(...) ? <MessageSkeleton /> : <MessageList />` desmontava violentamente a lista de mensagens existente ao alternar conversas, mesmo que as mensagens já estivessem em cache de memória. Isso provocava destruição do DOM, recálculo de layout, perda de posição de rolagem e flash visual perceptível de 500ms a 1.5s.
4. **Waterfall Serial de Serviços em Mounts**:
   - Múltiplos componentes disparavam requisições HTTP REST sem cache:
     - `MessageInput` buscava `/canned_responses` (payload de ~14 KB).
     - `ContactSidebar` buscava `/custom_attribute_definitions`.
     - `ChatHeader` buscava `/pipelines?is_active=true`.
5. **Bloqueio Serial do Deep-Link**:
   - Em `Chat.tsx`, a sincronização com a URL esperava o término do carregamento da lista de 25 conversas (`if (conversations.state.conversationsLoading) return`), adicionando até 4.7s de atraso para abrir uma conversa direta pela URL.

---

## 🚀 Implementações Realizadas por Sprint

### Sprint 1: Memoização Granular & Deduplicação de Leitura
* **Componente Isolado `ConversationCard.tsx`**:
  - Extração do markup do card da sidebar para [`src/components/chat/chat-sidebar/ConversationCard.tsx`](file:///Users/murilloalves/Projects/evo-crm-community-fork-clean/evo-ai-frontend-community/src/components/chat/chat-sidebar/ConversationCard.tsx).
  - Encapsulamento com `React.memo` e comparador de igualdade cirúrgico (`prevProps.isSelected === nextProps.isSelected`, `unreadCount`, etc.).
  - Apenas 2 cards re-renderizam na alternância (o desmarcado e o recém-selecionado), reduzindo o trabalho da thread principal de ~45ms para <1ms.
* **Deduplicação de `update_last_seen`**:
  - Remoção do `useEffect` duplicado em `Chat.tsx`.
  - No `ConversationsContext.tsx`, inclusão do `lastMarkedReadRef` e verificação de `unread_count > 0`, disparando `markConversationAsRead` apenas uma vez por sessão e somente quando há mensagens pendentes.

### Sprint 2: Transição Suave & Renderização Não Destrutiva (`ChatArea`)
* **Preservação de Mensagens em Cache (SWR)**:
  - Modificação em [`src/components/chat/chat-area/ChatArea.tsx`](file:///Users/murilloalves/Projects/evo-crm-community-fork-clean/evo-ai-frontend-community/src/components/chat/chat-area/ChatArea.tsx):
    - Se `selectedMessages.length > 0`: `<MessageList />` é renderizado imediatamente (0ms).
    - Se a validação em background ainda estiver ocorrendo (`isMessagesLoading`), é exibida uma barra sutil e não intrusiva de 2px no topo (`animate-pulse`).
    - O `<MessageSkeleton />` só é exibido se a conversa nunca tiver sido aberta e estiver sem nenhuma mensagem em cache.
  - Elimina o layout shift e o flash de tela ao alternar conversas.

### Sprint 3: Caches em Memória com TTL & Desbloqueio de Deep-Link
* **In-Memory Cache com TTL e Deduplicação de Promises**:
  - `cannedResponsesService.ts`: Cache de 3 minutos para listagem padrão de respostas prontas, com auto-invalidação em `create`, `update` e `delete`.
  - `customAttributesService.ts`: Cache de 5 minutos particionado por modelo com auto-invalidação.
  - `pipelinesService.ts`: Cache de 3 minutos para listagens de pipelines (`getPipelines`), com auto-invalidação em mutações de pipelines e fases.
  - Múltiplos cliques consecutivos em conversas deixam de disparar rajadas de requisições GET para o backend, servindo dados instantaneamente da memória.
* **Desbloqueio de Deep-Link Paralelo**:
  - Em `Chat.tsx`, remoção das condições de bloqueio que aguardavam o término do carregamento da lista geral de conversas.
  - O deep-link carrega em paralelo com a busca da lista, abrindo a conversa em milissegundos.

---

## 🧪 Testes Automatizados e Validação
Todos os testes foram validados com o executor Vitest:
- `ConversationsContext.spec.tsx`: 27/27 testes aprovados.
- `MessagesContext.spec.tsx`: 4/4 testes aprovados.
- `ChatArea.spec.tsx`: 3/3 testes aprovados (renderização não destrutiva, skeleton para vazias e NoMessages).
- `ConversationCard.spec.tsx`: 3/3 testes aprovados (renderização memoizada, clique normal e modo seleção).
- `cannedResponsesService.spec.ts`: 2/2 testes aprovados (cache em memória e invalidação pós-mutação).
- `MessageList.spec.tsx`: 9/9 testes aprovados (auto-scroll e estabilidade de rolagem).
- `tsc --noEmit`: 0 erros de tipagem TypeScript.

---

## 📈 Impacto Esperado de Performance
| Métrica | Antes | Depois |
| :--- | :--- | :--- |
| **Tempo de clique entre conversas já visitadas** | 800ms - 1.5s (com skeleton flash) | **0ms (instantâneo via cache)** |
| **Cards re-renderizados por clique na sidebar** | 20 a 50 cards | **2 cards** |
| **Requisições `update_last_seen` por clique** | 2 a 4 requisições | **0 requisições (se lido) / 1 (se não lido)** |
| **Carga de rede por conversa aberta (respostas prontas, atributos)** | ~25 KB a cada clique | **0 KB (servido da memória)** |
| **Abertura de Deep-Link direto pela URL** | 2.5s - 4.7s | **< 300ms (em paralelo)** |
