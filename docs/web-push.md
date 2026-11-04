# Web Push — SOFIA Central

Implementação com Push API, service worker e VAPID já existente no CRM Rails.
Não depende de Firebase próprio, OneSignal ou aplicativo nativo. Nenhuma chave privada
é entregue ao frontend. O worker não armazena páginas, mensagens ou credenciais offline.

## Comportamento

Em Perfil → Notificações, ativar o aparelho e escolher os tipos de alerta.
Permissão concedida sozinha não significa aparelho inscrito. Se nenhum tipo estiver
selecionado, o perfil explica como habilitar alertas de mensagens e novas conversas.
Preferências existentes são preservadas. Destinatários seguem as regras do CRM:
responsável/participantes e membros da caixa quando a conversa está sem responsável.
A proteção existente contra duplicidade de criação de conversa continua valendo.

O título inclui tipo de canal e nome da caixa, por exemplo `WhatsApp · Reservas`.
O conteúdo da mensagem fica oculto. Tocar abre `/conversations/{display_id}`.
O alerta via WebSocket não cria uma segunda notificação do sistema no aparelho inscrito.
Logout/expiração detectada desativa o worker e cancela a inscrição local; exclusão
remota é limitada às inscrições do usuário autenticado. Inscrições expiradas/inválidas
são removidas no envio; erro de autorização VAPID não apaga inscrições válidas.

No iPhone (iOS 16.4+), adicionar à Tela de Início e abrir pelo ícone antes de ativar.
No Android, usar navegador com Push API. O site deve usar HTTPS. O worker e o manifest
possuem regras Nginx sem cache imutável. Ícones de 192 e 512 pixels reutilizam a arte existente.

## Botão de teste no perfil

Com o aparelho inscrito, usar **Enviar notificação de teste** em Perfil → Notificações.
O servidor agenda um push VAPID real para dez segundos depois, permitindo bloquear a tela.
O botão não cria uma mensagem ou conversa nem modifica preferências. O teste é enviado
somente à inscrição atual do usuário, com intervalo mínimo de trinta segundos entre solicitações.
A mensagem na tela confirma o agendamento; a apresentação do alerta deve ser conferida no aparelho.
Tocar no alerta de teste abre novamente o perfil. A inscrição é verificada outra vez no job,
para não enviar após logout, remoção ou transferência do aparelho para outra conta.

## Validação local

```sh
pnpm exec vitest run src/services/notifications/webPushService.spec.ts
node --test scripts/tests/web-push.test.mjs
node scripts/tests/web-push-browser.mjs
pnpm run build
```

O smoke usa um servidor local efêmero e o Chrome instalado; permite `CHROME_PATH`.
Verifica ativação real do worker, confirmação da configuração por MessageChannel,
estado persistido e manifest/ícones. Não comprova entrega por APNs/FCM.
No backend, rodar RSpec com Ruby 3.4.4 e PostgreSQL de teste, incluindo:
`spec/requests/api/v1/web_push_spec.rb`,
`spec/services/notification/push_notification_service_web_push_spec.rb` e
`spec/services/messages/new_message_notification_service_spec.rb`.

## Resultados da release

- Ruby 3.4.4 e dependências verificadas.
- 22 exemplos Rails/PostgreSQL passaram em banco local exclusivo, sem dados reais.
  Cobrem autenticação, persistência VAPID, inscrição/renovação, troca de usuário,
  exclusão isolada e job de push para mensagem ao atendente responsável.
- 9 testes Vitest e 4 testes Node do worker passaram.
- Build com pnpm frozen-lockfile passou. O specifier eslint foi corrigido sem
  atualizar versões transitivas; package-lock.json já estava consistente com package.json.
- RuboCop e ESLint direcionados passaram. A baseline de lint foi reduzida.
- As imagens usam as bases de produção verificadas e tags imutáveis por SHA.

## Antes de publicar

- Conferir `FRONTEND_URL` do Rails apontando para a origem real do frontend e manter
  `VAPID_KEYS` persistido; publicar backend com GET/POST/DELETE de inscrições antes
  do frontend. Não gerar ou rotacionar VAPID durante o deploy.
- Validar em iPhone e Android reais: ativação, permissão negada, nova mensagem na
  conversa atribuída e não atribuída, canal no alerta, app fechado, tela bloqueada,
  clique, sessão expirada, logout, troca de usuário e ausência de alertas duplicados.
- Validar isolamento de exclusão com duas contas no banco de teste.
- Não há promessa de entrega instantânea: Foco, permissões, rede e economia de
  energia do aparelho afetam a apresentação dos alertas.

A confirmação de entrega com tela bloqueada depende de teste em aparelhos reais após a publicação.
