# Plano técnico de performance do inbox — 24/10/2026

## Escopo e critérios

O recorte é a tela de conversas do Sofia Central: lista, troca de conversa, histórico, respostas, anexos e compositor. O layout e os fluxos visuais devem permanecer iguais. Contatos fora do inbox, publicação e deploy ficam fora deste ciclo.

Critérios de aceite deste ciclo:

1. Cliques rápidos e respostas HTTP fora de ordem não podem trocar a seleção, o filtro ou os detalhes mais recentes por dados antigos.
2. Uma resposta inicial atrasada não pode apagar mensagens recebidas pelo WebSocket ou mensagens locais em envio.
3. Prefetch e abertura simultâneos da mesma conversa devem compartilhar o GET; histórico vazio também deve ser reutilizado.
4. O cache de históricos deve limitar conversas inativas e preservar a conversa aberta e mensagens ainda em envio ou com falha.
5. Atualizações de mensagens não devem obrigar sidebar, cabeçalho, seletores de arquivo e cartões inalterados a renderizar de novo.
6. Componentes de uso eventual devem ser carregados sob demanda; cores das notas devem usar tokens com os mesmos valores visuais.

## Diagnóstico no código

| Área | Causa observada | Tratamento |
| --- | --- | --- |
| `ConversationsContext` / `FiltersContext` | Respostas concorrentes podiam chegar fora de ordem; um bloqueio de 50 ms descartava seleção rápida | Geração por requisição e seleção imediata |
| `MessagesContext` | GET inicial e prefetch podiam duplicar busca; o resultado tardio substituía eventos em tempo real; cache sem limite de conversas | Requisição compartilhada, mesclagem, geração de limpeza e LRU de 16 conversas |
| `ChatContext` / `Chat` | Seletores passavam pelo contexto agregado e ações ganhavam nova identidade durante atualizações | Assinatura direta dos subcontextos e callbacks estáveis |
| `ConversationCard` / `MessageBubble` | Comparadores omitiam mudanças relevantes ou invalidavam respostas por qualquer mudança na lista | Referência imutável do item, índice de respostas e teste de renderização |
| `MessageInput` | Componente de preview era recriado no render; pickers e modais participavam da digitação | Extração do preview e dos pickers; importação dinâmica de modais e emoji |
| `MessageText` | `useMemo` era chamado após retorno condicional para HTML de email | Ordem de hooks estável |

## Ciclo de execução

1. **Consistência de navegação e filtros:** corrigir seleção e respostas obsoletas; testar corrida entre requisições.
2. **Cache de mensagens:** compartilhar GET, reconciliar WebSocket, paginar sem duplicação, invalidar e limitar cache.
3. **Isolamento de renderização:** separar assinaturas de contexto, estabilizar ações e verificar cartões afetados.
4. **Compositor, linha do tempo e tokens:** separar componentes por responsabilidade, indexar replies, carregar recursos eventuais sob demanda e centralizar cores existentes.
5. **Revisão e validação:** revisar diffs de cada frente, registrar commits locais, rodar testes, lint do recorte e build; não publicar.

## Evidência de validação

- 134 testes direcionados do inbox passaram em 18 arquivos. O teste da lista confirma que, ao mudar a seleção de A para B, somente esses dois cartões renderizam. O teste de bolha confirma que uma mensagem sem relação com a resposta não renderiza novamente a bolha anterior.
- `pnpm run build` passou, incluindo `tsc -b`. O build gerou chunks separados para `EmojiPicker`, `ScheduleMessageModal` e `MessageTemplateModal`.
- O lint direcionado dos componentes novos e das frentes de cache, compositor e linha do tempo passou. O lint global do repositório ainda apresenta 34 erros, incluindo infrações antigas em arquivos do inbox e de outros módulos; ele não é um gate verde desta entrega.
- Não há benchmark de latência real em Safari, Chrome ou Android nesta execução. Ganhos de tempo percebido devem ser confirmados com sessão autenticada, histórico longo e rede representativa antes de afirmar números em milissegundos.

## Próxima medição recomendada

Com dados de teste e uma sessão autenticada, registrar no React Profiler e na aba Performance: duração do clique até a primeira mensagem visível, quantidade de renders por troca, p95 do GET inicial, memória após alternar entre mais de 16 conversas e rolagem de histórico com centenas de mensagens. Se a linha do tempo longa continuar custosa, testar virtualização com preservação de altura e posição de rolagem em desktop e mobile antes de adotá-la.
