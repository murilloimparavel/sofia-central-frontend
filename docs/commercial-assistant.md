# Assistente comercial no CRM

O assistente é montado pelo `MainLayout` e renderizado como React no popup do CRM. Ele usa o cliente Axios `src/services/core/api.ts`, que inclui a sessão autenticada do atendente, e envia as consultas para a Search API configurada em `VITE_SEARCH_API_URL`. Não há iframe nem credenciais de Stays/ImobSys no bundle.

## Contrato de API esperado

`VITE_SEARCH_API_URL` deve ser a origem da Search API (por exemplo, `https://search-api.caldasindica.com`). A Search API disponibiliza as rotas autenticadas:

| Método e rota | Corpo | Resposta esperada |
| --- | --- | --- |
| `POST /api/v1/commercial-assistant/reservation` | `{ reservationCode }` | `{ success, data: { reservation } }` |
| `POST /api/v1/commercial-assistant/alternative` | `{ reservationCode, amenity? }` | `{ success, data: { reservation, alternatives } }` |
| `POST /api/v1/commercial-assistant/availability` | `{ from, to, adults, children, childAges, source, inventory?, filters? }` | `{ success, data: { alternatives, period } }` |

Esses endpoints validam o Bearer do CRM via Evo Auth e consultam Stays/ImobSys no servidor, usando segredos do ambiente do Search API. CORS deve permitir a origem do CRM. Na Imob, condomínio e um imóvel por condomínio são os únicos filtros opcionais confirmados; idades infantis são agregadas ao total de hóspedes.

O frontend não contém tokens de integração estáticos. O popup informa quando a Search API não estiver configurada ou publicada.
