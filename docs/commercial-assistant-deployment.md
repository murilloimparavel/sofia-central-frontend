# Assistente comercial no deploy

O iframe do assistente precisa de uma origem HTTPS configurada no container do CRM. Defina `VITE_COMMERCIAL_ASSISTANT_URL=https://assistente.seudominio.com` no ambiente de execução do container; use somente a origem, sem caminho, query, credenciais ou fragmento. O `docker-entrypoint.sh` injeta esse valor no bundle construído e autoriza apenas essa origem em `frame-src`. A URL fica ausente no `.env.example` para que localhost não seja usado silenciosamente em produção.

Configure também `VITE_APP_ENV=production` no container para manter a CSP de produção do CRM. Se a origem estiver ausente, o popup informa que falta configuração e não tenta abrir `127.0.0.1` no navegador do atendente. URLs que não usem HTTPS fazem o container falhar ao iniciar.

O servidor que hospeda o assistente precisa permitir que o domínio real do CRM o incorpore. Configure sua resposta HTTP com uma política equivalente a `Content-Security-Policy: frame-ancestors 'self' https://crm.seudominio.com` e remova cabeçalhos `X-Frame-Options` incompatíveis. Faça a mesma configuração para a origem de preview, se necessário. Essa política é servida pelo host do assistente e não pode ser alterada pelo `nginx.conf` deste repositório.

Após configurar ambos os domínios, valide no ambiente de preview/deploy: o CRM deve carregar o iframe sem erro de CSP no console do navegador, e a resposta do assistente deve conter a diretiva `frame-ancestors` com a origem HTTPS exata do CRM.
