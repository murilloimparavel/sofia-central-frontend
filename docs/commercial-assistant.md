# Assistente comercial no CRM

O assistente é montado pelo `MainLayout` e renderizado como React no popup do CRM. Ele usa o cliente Axios `src/services/core/api.ts`, que inclui a sessão autenticada do atendente. Não há iframe, origem externa, configuração Vite exclusiva nem credenciais de Stays/ImobSys no bundle.

## Contrato de API esperado

O backend autenticado do CRM deve disponibilizar estas rotas sob `/api/v1`:

| Método e rota | Corpo | Resposta esperada |
| --- | --- | --- |
| `POST /commercial-assistant/reservation` | `{ reservationCode }` | `{ reservation }` |
| `POST /commercial-assistant/alternative` | `{ reservationCode, inventory? }` | `{ reservation, alternatives, count? }` |
| `POST /commercial-assistant/availability` | `{ from, to, adults, children, childAges, source, inventory? , filters? }` | `{ from, to, listings, quoted?, notice? }` |

Esses endpoints devem autorizar o usuário pela sessão do CRM e consultar os provedores no servidor usando segredos do ambiente servidor. A interface não chama os provedores diretamente. O backend disponível em `scripts/web-server.mjs` é um serviço local independente, não uma API autenticada do CRM; ele não é usado pelo popup.

Até essas rotas existirem no backend implantado, o cliente exibirá uma mensagem clara de rota ausente. O preview local independente foi removido para manter um único frontend do assistente.

## Demonstração local do CRM

`public/local-demo.html` e `scripts/local-demo-api.mjs` continuam sendo uma simulação isolada da interface principal do CRM, com dados fictícios em SQLite. O servidor escuta somente em loopback e não integra Stays, ImobSys ou o assistente comercial.
