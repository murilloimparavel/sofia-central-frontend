# Reconciliação em Tempo Real e Cache de Escopo (Sprints 6A & 6B)

Este documento registra a implementação técnica da atualização reativa em tempo real da lista de conversas e do sistema de cache em memória por escopo (Scope Cache / SWR) no EvoCRM.

---

## 1. Problemas Resolvidos

### 1.1. Falta de Reconciliação na Atribuição (Fila -> Atendente)
- **Sintoma:** Quando um atendente atribuía uma conversa da aba **Fila** para si mesmo (ou para outro colega), a conversa continuava aparecendo na lista da Fila. O atendente precisava trocar de aba ou dar F5 para que a conversa assumida saísse da Fila.
- **Causa Raiz:** O hook `useAssignmentHandlers` apenas chamava `conversations.assignAgent(...)`, que por sua vez disparava a action `UPDATE_CONVERSATION` no reducer. O reducer mantinha o registro no array em memória, sem avaliar se a conversa ainda satisfazia os filtros ativos (`assignee_type: 'unassigned'`).
- **Solução:** Integração da função `reconcileWithActiveView` no `useAssignmentHandlers`, expulsando imediatamente a conversa da visualização local quando ela não casa mais com o escopo atual, além de sincronizar os caches das outras abas.

### 1.2. Falta de Resolução Segura de `assignee_id`
- **Sintoma:** Conversas atribuídas via WebSocket ou com payloads parciais do backend por vezes continuavam casando com o filtro `unassigned` ou não casavam com `me`.
- **Causa Raiz:** Em `doesConversationMatchFilters`, checava-se apenas `conversation.assignee_id`. Em diversos eventos do backend (ActionCable) e serializadores, o ID vinha em `conversation.assignee.id` ou `conversation.meta.assignee.id`.
- **Solução:** `doesConversationMatchFilters` agora resolve o ID de forma unificada:
  ```ts
  const assigneeId =
    conversation.assignee_id ?? conversation.assignee?.id ?? (conversation as any).meta?.assignee?.id;
  ```

### 1.3. Troca de Abas com Flicker de Skeleton
- **Sintoma:** A cada clique entre as abas (| Chats | Fila | Todas |), o frontend ativava `isApplyingFilters = true` e substituía a lista inteira por 8 cards de Skeleton, gerando desconforto visual e sensação de lentidão.
- **Causa Raiz:** A condicional em `ChatSidebar.tsx` exibia o skeleton sempre que `isApplyingFilters` era verdadeiro, mesmo quando já existiam conversas válidas na tela.
- **Solução:** 
  - Condicional ajustada para `(filters.state.isApplyingFilters && visibleConversations.length === 0)`.
  - Se há dados prévios, a interface mantém a lista visível sem desmontar.

### 1.4. Ausência de Cache de Escopo (SWR)
- **Sintoma:** Ao alternar de *Chats* para *Fila* e voltar para *Chats*, o sistema descartava todos os dados e refazia a requisição de rede do zero.
- **Solução:** Criação do módulo `src/utils/chat/conversationScopeCache.ts` com estratégia **Stale-While-Revalidate**:
  1. **Passo 1 (0ms):** Se a aba já foi carregada nos últimos 5 minutos, os dados do cache são injetados instantaneamente no estado. A troca de tela é imediata.
  2. **Passo 2 (Segundo plano):** A requisição de rede é disparada em background para buscar novas mensagens e atualizar contadores sem travar a interface.

---

## 2. Arquitetura do Scope Cache (`conversationScopeCache.ts`)

O cache gerencia as 3 visões fundamentais do operador:
- `'mine'`: conversas atribuídas ao atendente logado (`assignee_type=me&status=open`).
- `'unassigned'`: conversas na fila aguardando operador (`assignee_type=unassigned&status=open`).
- `'all'`: visão geral da empresa (`assignee_type=all&status=all`).

### Funções Principais:
- `getScopeCache(scopeId)`: Retorna entrada em cache se dentro do TTL (5 minutos).
- `setScopeCache(scopeId, entry)`: Salva conversas, paginação e query.
- `evictFromScopeCache(scopeId, conversationId)`: Remove pontualmente uma conversa do cache de uma aba.
- `addOrUpdateInScopeCache(scopeId, conversation)`: Adiciona ou atualiza uma conversa no cache de uma aba específica.

### Sincronização Cruzada entre Abas:
- **Ao atribuir conversa da Fila para mim:**
  1. Remove do cache da Fila (`evictFromScopeCache('unassigned', id)`).
  2. Adiciona ao cache dos meus chats (`addOrUpdateInScopeCache('mine', conv)`).
  3. Atualiza no cache global (`addOrUpdateInScopeCache('all', conv)`).
- **Ao marcar como Concluída/Resolvida:**
  1. Remove do cache de chats ativos (`evictFromScopeCache('mine', id)`).
  2. Remove do cache da Fila (`evictFromScopeCache('unassigned', id)`).
  3. Atualiza o status no cache global (`addOrUpdateInScopeCache('all', { ...conv, status: 'resolved' })`).

---

## 3. Arquivos Alterados

1. **`src/utils/chat/conversationScopeCache.ts`**:
   - Módulo central de cache em memória por escopo.
2. **`src/utils/chat/conversationScopeCache.spec.ts`**:
   - Suíte de 4 testes unitários cobrindo leitura, escrita, evicção e atualização no cache.
3. **`src/utils/chat/conversationMatch.ts`**:
   - Fortalecimento da extração de `assigneeId` (cobrindo `assignee_id`, `assignee.id` e `meta.assignee.id`).
4. **`src/utils/chat/conversationMatch.spec.ts`**:
   - 4 novos testes unitários validando matches de `me`, `unassigned` e `assigned`.
5. **`src/hooks/chat/useAssignmentHandlers.ts`**:
   - Inclusão do `reconcileWithActiveView` e sincronização cruzada de cache ao atribuir agente ou equipe.
6. **`src/hooks/chat/useAssignmentHandlers.spec.ts`**:
   - 5 novos testes unitários validando a auto-remoção da Fila e de Chats em tempo real.
7. **`src/hooks/chat/useConversationHandlers.ts`**:
   - Sincronização de cache ao marcar como resolvido, pendente ou aberto.
8. **`src/hooks/chat/useFilterHandlers.ts`**:
   - Aplicação imediata de dados em cache (SWR 0ms) ao trocar de aba de escopo.
9. **`src/contexts/chat/WebSocketContext.tsx`**:
   - Garantia de preenchimento seguro de `assignee_id` a partir de `data.meta.assignee.id`.
10. **`src/pages/Customer/Chat/Chat.tsx`**:
    - Limpeza de seleção (`clearSelectionAndGoToList`) quando uma conversa selecionada é atribuída a outro atendente ou movida para pendente/pausada.
11. **`src/components/chat/chat-sidebar/ChatSidebar.tsx`**:
    - Renderização não-destrutiva de skeletons durante aplicação de filtros.

---

## 4. Validação

- **Testes Unitários:** 35/35 testes aprovados (`vitest run` em 1.05s).
- **Typecheck:** `tsc -b` executado com 0 erros.
- **Build de Produção:** `vite build` gerado com sucesso em 10.08s.
