# Especificação Técnica: Aba "Robô" no Inbox (| Chats | Fila | Robô | Todas |)

> **Data:** 18 de Setembro de 2026  
> **Módulo:** Chat Sidebar / Navegação Primária por Escopo  
> **Status:** Implementado e Testado Localmente (Sem Deploy em Produção)

---

## 1. Objetivo de Negócio

Adicionar uma quarta aba de escopo na barra superior da lista de conversas, posicionada estrategicamente entre **Fila** e **Todas**, com o nome **Robô** e o ícone de robô (`Bot` da biblioteca `lucide-react`).

### Ordenação Canônica:
`[ Chats ] [ Fila ] [ Robô ] [ Todas ]`

### Propósito Operacional:
Permitir que os supervisores, corretores e operadores visualizem em uma única lista todas as conversas que estão ativamente sob atendimento da IA Sofia ou de seus subagentes (status `pending`), sem misturar com a fila de transbordo humano (`unassigned` + `open`) e sem a sobrecarga de atendimentos já concluídos da visão global.

---

## 2. Matriz dos Quatro Escopos

| Aba | Significado Operacional | Status | Atendente (`assignee_type`) | Endpoint Chamado |
| :--- | :--- | :--- | :--- | :--- |
| **`Chats`** | Meus atendimentos ativos | `open` | `me` | `GET /conversations?status=open&assignee_type=me` |
| **`Fila`** | Aguardando operador humano | `open` | `unassigned` | `GET /conversations?status=open&assignee_type=unassigned` |
| **`Robô`** | Conversas sob controle da IA | `pending` | `all` | `GET /conversations?status=pending&assignee_type=all` |
| **`Todas`** | Visão gerencial global da empresa | `all` | `all` | `GET /conversations?status=all&assignee_type=all` |

---

## 3. Arquitetura Técnica e Roteamento Rápido (GET vs POST)

1. **Roteamento `GET` Rápido:**
   O preset `bot` utiliza `assignee_type: 'all'` e `status: 'pending'`. A função `shouldUseAdvancedFilters` identifica esses atributos como nativos do endpoint padrão indexado no banco de dados (`GET /conversations?status=pending&assignee_type=all`), evitando o pesado `POST /conversations/filter` e respondendo com latência mínima (< 150ms).

2. **Detecção Reativa do Escopo Ativo (`getActiveConversationScope`):**
   ```typescript
   export const getActiveConversationScope = (
     active: ConversationFilter[],
   ): ConversationScopeId | null => {
     const statusFilterItem = active.find(f => f.attribute_key === 'status');
     const statusValue =
       statusFilterItem &&
       (Array.isArray(statusFilterItem.values) ? statusFilterItem.values[0] : statusFilterItem.values);

     if (statusValue === 'pending') return 'bot';

     const filter = active.find(f => f.attribute_key === 'assignee_type' || f.attribute_key === 'assignee_id');
     const value = filter && (Array.isArray(filter.values) ? filter.values[0] : filter.values);
     if (value === 'me') return 'mine';
     if (value === 'unassigned') return 'unassigned';
     if (value === 'all') return 'all';
     return null;
   };
   ```

3. **Sincronização do Scope Cache (SWR em Memória):**
   - Quando uma conversa entra em status `pending`, ela é inserida no cache de escopo `'bot'` (`addOrUpdateInScopeCache('bot', conv)`).
   - Quando uma conversa sai de `pending` para `open` (assumida por humano) ou `resolved` (concluída), ela é automaticamente evicta do cache do robô (`evictFromScopeCache('bot', convId)`).

4. **Design Responsivo do Componente (`grid-cols-4`):**
   - No componente `ConversationScopeTabs.tsx`, o container foi adaptado de `grid-cols-3` para `grid-cols-4` com espaçamento responsivo `gap-1 px-1.5 py-2` e tipografia `text-xs sm:text-sm font-medium`, garantindo que os rótulos não sofram quebra inadequada em resoluções compactas.

---

## 4. Arquivos Alterados

1. `src/types/chat/api.ts`: Adicionado `'bot'` ao tipo `QuickFilterTab`.
2. `src/components/chat/chat-sidebar/conversationSegmentsHelpers.ts`:
   - Adicionado `'bot'` ao `ConversationScopeId`.
   - Adicionado preset `CONVERSATION_SCOPE_PRESETS.bot`.
   - Atualizado `getActiveConversationScope` para reconhecer `status: 'pending'`.
3. `src/components/chat/chat-sidebar/ConversationScopeTabs.tsx`:
   - Adicionado ícone `Bot` de `lucide-react`.
   - Aba `'bot'` inserida entre `'unassigned'` e `'all'`.
   - Ajustado grid para `grid-cols-4`.
4. `src/contexts/chat/ChatContext.tsx`: Sincronização em tempo real do cache da aba `'bot'`.
5. `src/hooks/chat/useConversationHandlers.ts`: Evicção e adição no cache de `'bot'` em alterações manuais de status.
6. `src/i18n/locales/`:
   - `pt-BR/chat.json`: `"bot": "Robô"`
   - `en/chat.json`: `"bot": "Bot"`
   - `es/chat.json`: `"bot": "Robot"`
   - `pt/chat.json`: `"bot": "Robô"`
7. `src/components/chat/chat-sidebar/conversationSegmentsHelpers.spec.ts`: Testes unitários para os 4 escopos.
8. `src/components/chat/chat-sidebar/ConversationScopeTabs.spec.tsx`: Testes unitários do componente visual.
