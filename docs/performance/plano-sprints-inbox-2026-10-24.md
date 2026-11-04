# Plano de sprints — velocidade e usabilidade do inbox

## Objetivo e limites

Tornar a primeira abertura e a troca entre conversas perceptivelmente rápidas no Sofia Central, inclusive em iPhone Safari e Android Chrome. O recorte inclui lista e filtros do inbox, histórico, mídias, compositor e navegação para/de conversas. Preservar a identidade visual e os fluxos existentes. Não alterar contatos fora do inbox, nem publicar ou fazer deploy neste ciclo.

Este plano continua o [ciclo anterior](./plano-execucao-inbox-2026-10-24.md). Os 134 testes direcionados e o build desse ciclo passaram, mas ainda faltam medições autenticadas em aparelhos reais. O `dist` local usado como referência tem um arquivo de entrada com 8.267.130 bytes (2.078.212 bytes com `gzip -n -9`); esse número deve ser reproduzido com o mesmo método antes de ser tratado como linha de base de produção.

## Métricas e critérios de aceite

Instrumentar separadamente primeira abertura, conversa fria, conversa em cache, troca rápida A→B→A, troca de filtro, envio e rolagem em histórico longo. Registrar p50/p75/p95 de toque ou clique até a primeira mensagem visível, tempo de API, duração de renderização e quantidade de elementos no DOM. Segmentar por desktop, iPhone Safari e Android Chrome, por rede e pelo tamanho do histórico. Medir em build de produção com sessão e dados de teste autorizados, sem gravar conteúdo de mensagens na telemetria. A linha de base local e a emulação não substituem a validação autenticada em aparelhos reais; se sessão ou aparelhos não estiverem disponíveis, registrar o gate mobile como pendente e não declarar as metas cumpridas.

Metas iniciais para orientar a execução, sujeitas à linha de base do sprint 0:

- Troca de conversa em cache: p75 até 150 ms e p95 até 300 ms entre interação e primeira mensagem visível.
- INP: p75 até 200 ms em mobile e desktop, referência geral de responsividade, sem confundi-lo com o tempo de chegada dos dados.
- Primeira abertura: reduzir o JavaScript de entrada comprimido e seu tempo de execução; estabelecer orçamento numérico após o mapa de chunks.
- Histórico longo: rolagem estável, sem salto de âncora ao carregar mensagens antigas ou mídia, e DOM limitado à janela necessária.
- Consistência: nenhum histórico vazio permanente após mensagem recebida/reconexão; nenhuma resposta atrasada pode substituir seleção ou mensagens mais recentes; nenhum dado de outra conta pode aparecer após troca de sessão.
- Usabilidade: digitação, áudio, imagem, nota, envio, teclado e rolagem funcionam em larguras de 320, 375, 390 e 412 px, sem perda de rascunho.

## Orquestração e gates

Cada sprint usa um subagente de codificação com escopo de arquivos delimitado e um subagente de revisão independente. O agente principal integra, confere o diff, executa as checagens e faz um commit local apenas após o gate. Agentes em paralelo não editam os mesmos arquivos. Mudanças preexistentes em `src/pages/Customer/Contacts/Contacts.tsx` ficam intocadas. Nenhum sprint inclui push, PR, publicação ou deploy.

| Sprint | Implementação | Checagem e saída |
| --- | --- | --- |
| 0 — Linha de base | Mapear chunks e requisições; adicionar medição local de interações do inbox apenas se necessária; registrar cenários frios e quentes com sessão autorizada, quando disponível. | Revisão de coleta sem dados sensíveis; build e teste de instrumentação; distinguir baseline local de validação autenticada e registrar gates pendentes. |
| 1 — Primeira abertura | Separar imports antecipados de páginas não usadas no inbox e recursos eventuais; manter carregamento adequado das rotas. | Comparar bytes gzip, número de requisições e execução JS; testar rotas profundas, retorno e falha de chunk; build, testes de rota e revisão independente. |
| 2 — Cache e navegação | Fazer cache da lista por chave completa (conta, filtros, busca, ordenação/página), com validade e invalidação após mutações; revalidar histórico vazio; compartilhar buscas concorrentes de deep link; controlar prefetch por intenção com limite. | Testes de cache quente/frio, primeira mensagem, WebSocket, reconexão, paginação, busca, ordenação, logout/troca de conta, filtros, deep link concorrente e respostas fora de ordem; medir toque→mensagem e tráfego, sem flicker nem salto de scroll na troca de filtro. |
| 3 — Histórico e mídia | Pilotar janela virtualizada na `MessageList` com altura variável e âncora ao fim/início; carregar metadados de mídias fora de vista sob demanda. Usar a dependência `@tanstack/react-virtual` já presente. | Testes de prepend, novas mensagens, replies aninhadas, salto para mensagem, forward, busca, imagem, áudio, vídeo e notas; profiling de DOM, memória e rolagem. Reverter o piloto se a âncora ou acessibilidade piorar. |
| 4 — Mobile e isolamento de renders | Corrigir o estado inicial de deep link no mobile e ajustar problemas reproduzidos de compositor estreito, teclado e safe area; dividir assinaturas de contexto onde o Profiler mostrar renders caros. | iPhone Safari e Android Chrome reais quando disponíveis; identificar claramente testes em simulador/emulador; teclado aberto/fechado, rotação, 320–412 px, rede lenta/reconexão; comparação visual e de interação. |
| 5 — Fechamento | Consolidar medições e documentação de operação do cache; remover instrumentação temporária se não for útil. | Testes direcionados, lint do diff, typecheck/build, revisão final por subagente e agente principal; relatório antes/depois e riscos residuais. |

## Sequência técnica e decisões

1. Atacar o pacote inicial e o cache antes de ampliar `memo` ou adotar outra biblioteca de estado. `useMemo` não reduz o custo da primeira renderização.
2. Mostrar dados em cache de imediato e revalidar em segundo plano com chaves completas, deduplicação e proteção contra respostas antigas. Limitar o cache por conversas **e** volume de mensagens; limpar por conta/logout. Persistência em IndexedDB só entra se a medição demonstrar necessidade e houver revisão de privacidade.
3. Virtualizar o histórico com IDs estáveis, altura dinâmica, overscan e manutenção de âncora; medir em Safari durante rolagem elástica. A lista de contatos já oferece um exemplo local da biblioteca, mas o chat requer comportamento próprio.
4. Aplicar prefetch com prioridade para conversa focada/visível ou próxima provável e orçamento de rede; no mobile não depender de hover. Evitar prefetch indiscriminado em rede lenta.
5. Usar React Profiler para identificar assinaturas amplas e efeitos encadeados. Considerar `useTransition` apenas para atualizações visuais não urgentes; manter digitação e seleção imediatas.
6. Deixar migração completa para TanStack Query, React Compiler, SSR e service worker como decisões posteriores, condicionadas ao perfil medido. Os princípios de chave, validade, invalidação e prefetch podem ser aplicados ao cache existente.

## Fontes técnicas

- React: [memoização](https://react.dev/reference/react/useMemo), [contexto](https://react.dev/reference/react/useContext) e [Profiler](https://react.dev/reference/react/Profiler).
- web.dev: [divisão de JavaScript](https://web.dev/articles/reduce-javascript-payloads-with-code-splitting/), [INP](https://web.dev/articles/optimize-inp) e [tamanho do DOM](https://web.dev/articles/dom-size-and-interactivity).
- TanStack: [chaves de cache](https://tanstack.com/query/latest/docs/framework/react/guides/query-keys), [invalidação](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation) e [exemplo de chat virtualizado](https://tanstack.com/virtual/latest/docs/framework/react/examples/chat).
- Navegadores: [teclado e viewport no Chrome/Android e Safari](https://developer.chrome.com/blog/viewport-resize-behavior/), [inspeção de iPhone no Safari](https://developer.apple.com/documentation/safari-developer-tools/inspecting-ios) e [depuração remota no Android](https://developer.chrome.com/docs/devtools/remote-debugging).
