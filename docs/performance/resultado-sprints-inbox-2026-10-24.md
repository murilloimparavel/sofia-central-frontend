# Resultado dos sprints de performance do inbox

## Escopo entregue

O trabalho cobre a abertura e a navegação do inbox, a lista de conversas, o histórico, mídia, compositor e a entrada comum da aplicação. O layout normal foi preservado. As alterações foram feitas em commits locais separados para permitir revisão e reversão por etapa. O arquivo `src/pages/Customer/Contacts/Contacts.tsx`, que já estava modificado antes deste trabalho, não foi incluído.

- O provider passou a expor assinaturas mais específicas; sidebar, cabeçalho e bolhas evitam trabalho quando recebem dados equivalentes. O compositor carrega controles opcionais sob demanda.
- Seleção de conversa, filtros e respostas concorrentes usam a seleção mais recente. Histórico vazio é revalidado quando chegam mensagens ou a conexão volta. Consultas simultâneas de deep link são compartilhadas.
- Rotas fora do inbox foram separadas do pacote inicial. O idioma ativo é carregado antes da primeira renderização, com inglês como fallback e demais idiomas sob demanda. Notificações e assistente carregam seus painéis quando abertos, com recuperação local em caso de falha do chunk.
- O cache de mensagens inativas tem orçamento de 2.000 mensagens e cerca de 8 MiB; a conversa ativa e operações em andamento são protegidas. O prefetch adjacente é limitado e respeita `Save-Data` e conexões lentas quando a API do navegador informa isso.
- A lista de conversas tem cache por usuário, conta e consulta exata, com validade de 10 segundos e limite de 32 entradas. Mutações e eventos invalidam ou reconciliam as entradas; uma resposta REST antiga não substitui um evento posterior quando a conciliação não é comprovável. Nessas situações a consulta é repetida de forma limitada e pode exibir erro em vez de dados desatualizados.
- Metadados de áudios fora da área visível deixam de ser consultados antecipadamente. O foco automático do compositor fica restrito ao desktop; deep links e trocas rápidas no mobile mantêm URL e seleção sincronizadas.

## Evidência local

| Medida | Antes | Depois | Interpretação |
| --- | ---: | ---: | --- |
| Arquivo de entrada, antes e depois da divisão de rotas | 2.078.212 B gzip | 1.100.166 B gzip | Redução de 47,1% no arquivo de entrada; não inclui outros chunks necessários para abrir o inbox. |
| JavaScript estático crítico para abrir inbox em `pt-BR`, após divisão de rotas e depois de idioma/painéis sob demanda | 1.330.753 B gzip | 753.958 B gzip | Redução de 43,3% em builds locais comparáveis. Inclui entrada, App, idioma, ChatPage e imports estáticos, sem confundir esse total com bytes transferidos em produção. |
| Primeira montagem de `#root` em Chrome local, 80 ms RTT e 3 Mbps | mediana 11,58 s | mediana 7,43 s | Smoke indicativo sem autenticação; não prova tempo de abertura da conversa nem resultado em celular real. |

O build moderno e o build separado para Chrome 109 passaram. Nove suítes direcionadas do inbox passaram com 103 testes. A revisão de impacto fora do inbox passou em 43 testes de rotas, idioma, configuração de canal, avatar, widget e permissões, sem regressão confirmada. O lint do diff e os checks do PR são gates adicionais antes do merge.

## Decisões e limites

O piloto de virtualização da linha do tempo foi revertido: ele reduziu um salto de prepend, mas redimensionamento de mídia acima da área visível ainda quebrava a âncora de rolagem. Uma nova tentativa precisa de dimensões estáveis de mídia e um controlador único de âncora, com validação em Safari. Não há ganho de virtualização nesta entrega.

Os testes automatizados e a emulação não substituem uma sessão autenticada em iPhone Safari e Android Chrome. Continuam pendentes medições p50/p75/p95 de toque até primeira mensagem visível, INP, rolagem em histórico longo e teste real de áudio, imagem, nota, teclado e rotação. Não há afirmação de carregamento quase instantâneo em produção antes dessa coleta.

O fluxo de foto do canal continua ligado a `ChannelSettings`, `InboxesService` e à configuração do widget. A revisão não encontrou referência quebrada pelas otimizações. Há uma lacuna anterior a este trabalho: o store global de canais pode manter um snapshot por até 15 minutos após salvar; a exibição real da nova foto no widget ainda requer teste com backend e upload autenticado. Essa lacuna não foi misturada ao PR de performance.

## Checagem de publicação

O PR deve usar `main` de `murilloimparavel/sofia-central-frontend` como base e conter apenas os commits de performance. Antes do merge, exigir checks de TypeScript, build moderno, build Chrome 109, Vitest, lint dos arquivos alterados e imagem de revisão do PR. Confirmar ausência de conflitos e que o diff não inclui o arquivo preexistente de Contatos.

Após o merge e a imagem `main-<sha>` estar disponível, a promoção em produção é uma etapa separada: o serviço `evocrm_frontend` do Compose gerenciado pelo Coolify usa uma referência de imagem fixada. A referência observada antes da promoção em 24/10/2026 é `ghcr.io/murilloimparavel/sofia-central-frontend:main-e3ed0a9`, com container ativo e página inicial respondendo HTTP 200. Guardar essa referência e o Compose anterior; promover somente a imagem do frontend, preservar as variáveis já configuradas, confirmar container e página saudáveis e testar login/inbox sem enviar mensagem real. Em falha, restaurar a referência anterior e validar novamente. A promoção concreta deve alterar a [definição fonte do serviço no Coolify](https://coolify.io/docs/services/configuration/docker-compose) e seguir o [procedimento de atualização de serviço](https://coolify.io/docs/services/operations/update-service), para evitar divergência entre a configuração persistida e o Compose gerado no servidor.
