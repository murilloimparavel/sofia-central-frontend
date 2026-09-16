# Especificação e Otimização dos Escopos do Inbox (| Chats | Fila | Todas |)

Este documento registra a arquitetura, regras de negócio e otimização técnica das abas de navegação primária do Inbox no EvoCRM.

---

## 1. Contexto e Decisão de Produto (Opção A — Foco Operacional)

Anteriormente, as três abas de escopo apresentavam comportamentos ambíguos:
- A aba **Fila** incluía filtros com array de status (`['open', 'pending']`), o que acionava a rota de filtro avançado (`POST /conversations/filter`), gerando latência elevada de ~1.5s a 3s no carregamento.
- A aba **Chats** não continha status explícito, fazendo o frontend assumir `status: 'all'`, o que trazia centenas de conversas resolvidas do passado para a caixa pessoal do atendente.
- A aba **Todas** trazia todas as conversas sem distinção de status.

### Decisão Validada
Adotou-se a **Opção A (Foco Operacional)**:
1. **Chats**: Foco no fluxo de trabalho ativo do atendente logado (somente conversas em aberto para resposta imediata).
2. **Fila**: Atendimentos que acabaram de chegar e continuam em aberto aguardando um atendente assumir.
3. **Todas**: Visão gerencial global com todos os atendimentos da organização e todos os status.

---

## 2. Matriz de Configuração dos Escopos

| Aba | Significado Operacional | Status | Atendente (`assignee_type`) | Endpoint Chamado |
| :--- | :--- | :--- | :--- | :--- |
| **`Chats`** | Meus atendimentos ativos | `open` | `me` | `GET /conversations?status=open&assignee_type=me` |
| **`Fila`** | Aguardando operador | `open` | `unassigned` | `GET /conversations?status=open&assignee_type=unassigned` |
| **`Todas`** | Visão global da empresa | `all` | `all` | `GET /conversations?status=all&assignee_type=all` |

---

## 3. Otimização de Roteamento (GET vs POST)

### O Problema Anterior
No arquivo `src/utils/chat/filterConverters.ts`, a função `shouldUseAdvancedFilters` continha:
```ts
if (filters.length > 1) return true;
```
Essa checagem ingênua forçava **qualquer filtro com mais de 1 critério** a disparar um `POST /conversations/filter`, mesmo quando todos os parâmetros (`status` e `assignee_type`) eram simples, combinados com `AND` e suportados nativamente com índices B-tree na rota `GET /conversations`.

### A Solução Implementada
A função `shouldUseAdvancedFilters` foi refatorada para avaliar a compatibilidade real dos atributos com o endpoint `GET`:
- Atributos suportados via `GET`: `status`, `assignee_type`, `assignee_id`, `inbox_id`, `team_id`, `labels`, `unread`, `unanswered`, `is_group`.
- Operadores suportados via `GET`: `equal_to` (com conjunção `AND`).
- Roteamento inteligente:
  - Se todos os filtros pertencerem ao conjunto suportado e usarem `equal_to` com `AND`: **utiliza `GET /conversations`** (tempo de resposta ~100ms a 200ms).
  - Se contiverem campos complexos (`priority`, `created_at`, atributos personalizados) ou operadores complexos (`or`, `contains`, `is_greater_than`): **utiliza `POST /conversations/filter`**.

---

## 4. Arquivos Alterados

1. `src/components/chat/chat-sidebar/conversationSegmentsHelpers.ts`:
   - Atualizado `CONVERSATION_SCOPE_PRESETS` com `mine`, `unassigned` e `all`.
   - Removida função não utilizada `statusValuesFilter`.
2. `src/utils/chat/filterConverters.ts`:
   - Refatorada a função `shouldUseAdvancedFilters` para suportar multi-filtro simples via `GET`.
3. `src/components/chat/chat-sidebar/conversationSegmentsHelpers.spec.ts`:
   - Adicionados 5 novos testes cobrindo os 3 escopos operacionais, o roteamento rápido por GET e a conversão exata de query params.
4. `src/components/chat/chat-sidebar/ChatSidebar.spec.tsx`:
   - Substituídos testes legados de pipeline context menu por testes unitários da barra de abas de escopo (`ConversationScopeTabs`).

---

## 5. Validação e Testes
- **Testes Unitários:** 10/10 testes em `conversationSegmentsHelpers.spec.ts` e 14/14 em `ChatSidebar.spec.tsx` aprovados via Vitest.
- **Typecheck & Bundle:** `tsc -b && vite build` finalizado com código de saída 0 em 11.27s.
- **Backend VPS:** Verificado via Rails runner na VPS que `ConversationFinder` processa os 3 escopos instantaneamente com as queries indexadas.
