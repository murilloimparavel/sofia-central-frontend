# Guia Operacional: Injeção de Variáveis de Ambiente no Coolify (Prevenção de Erro 405 / Credenciais Inválidas)

> **Data:** 18 de Setembro de 2026  
> **Sistema:** EvoCRM Frontend (`ghcr.io/murilloimparavel/sofia-central-frontend`) / Coolify VPS  

---

## 1. Funcionamento dos Placeholders no Docker

A imagem Docker é compilada com placeholders estáticos:
- `VITE_API_URL_PLACEHOLDER`
- `VITE_AUTH_API_URL_PLACEHOLDER`
- `VITE_EVOAI_API_URL_PLACEHOLDER`
- `VITE_AGENT_PROCESSOR_URL_PLACEHOLDER`
- `VITE_SEARCH_API_URL_PLACEHOLDER`
- `VITE_WS_URL_PLACEHOLDER`

No `entrypoint.sh` do container, o script executa substituições via `sed -i` nos arquivos compilados (`.js`), injetando os valores das variáveis de ambiente repassadas ao container.

## 2. Causa Raiz do Erro "Credenciais Inválidas / Erro 405"

- Se o container for recriado sem passar as variáveis `-e`, o `sed` não substitui os placeholders.
- O navegador faz requisições para URLs inexistentes ou para a raiz do servidor web, recebendo 404/405.
- O gateway de API em produção é **`https://api-crm.caldasindica.com`** (e não `crm.caldasindica.com`).

## 3. Instruções de Operação (O que fazer / O que NÃO fazer)

### ⛔ O QUE NÃO FAZER
- **NUNCA** rodar `docker run` ou recriar o container `evocrm_frontend-tzbydmxtjuilf4xq2gow9gcs` sem as flags de ambiente `-e`.

### ✅ O QUE FAZER
Sempre manter e repassar o bloco completo de variáveis:
```bash
-e VITE_APP_ENV=production \
-e VITE_API_URL=https://api-crm.caldasindica.com \
-e VITE_AUTH_API_URL=https://api-crm.caldasindica.com \
-e VITE_EVOAI_API_URL=https://api-crm.caldasindica.com \
-e VITE_AGENT_PROCESSOR_URL=https://api-crm.caldasindica.com \
-e VITE_SEARCH_API_URL=https://search-api.caldasindica.com \
-e VITE_WS_URL=https://api-crm.caldasindica.com \
-e COOLIFY_CONTAINER_NAME=evocrm_frontend-tzbydmxtjuilf4xq2gow9gcs \
-e COOLIFY_RESOURCE_UUID=tzbydmxtjuilf4xq2gow9gcs \
--network coolify
```
