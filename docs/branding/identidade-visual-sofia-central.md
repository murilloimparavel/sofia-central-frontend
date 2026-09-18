# Identidade Visual e Repositório Privado: SOFIA Central

> Documentação oficial da transição de marca do EvoCRM para **SOFIA Central** (SOFIA: *Sistema Operacional de Fluxos, Integrações e Atendimento*) no frontend, desvinculação do fork para repositório 100% privado e pipeline de imagens no GitHub Container Registry (GHCR).

---

## 📌 1. Transição de Repositório

O repositório do frontend foi desvinculado da rede pública de forks e agora reside em um repositório **100% privado e autônomo**:
- **Repositório GitHub**: [`murilloimparavel/sofia-central-frontend`](https://github.com/murilloimparavel/sofia-central-frontend) (Privado, `isFork: false`)
- **Imagem de Container (GHCR)**: `ghcr.io/murilloimparavel/sofia-central-frontend`
- **Ambiente de Produção**: `https://crm.caldasindica.com` (VPS `vps-caldas`)

---

## 🎨 2. Ativos Visuais e Logos

Foram geradas e integradas as versões oficiais da marca:

### 2.1. Logos
- **Modo Escuro (Dark Mode)**: [`src/assets/sofia_logo_dark.png`](file:///Users/murilloalves/Projects/evo-crm-community-fork-clean/evo-ai-frontend-community/src/assets/sofia_logo_dark.png)
  - Tipografia em branco ("SOFIA") com ícone "S" em gradiente e subtítulo *"Sistema Operacional de Fluxos, Integrações e Atendimento"*.
- **Modo Claro (Light Mode)**: [`src/assets/sofia_logo_light.png`](file:///Users/murilloalves/Projects/evo-crm-community-fork-clean/evo-ai-frontend-community/src/assets/sofia_logo_light.png)
  - Tipografia em preto/grafite ("SOFIA") com ícone "S" em gradiente e subtítulo *"Sistema Operacional de Fluxos, Integrações e Atendimento."*.

### 2.2. Favicons
- `public/favicon.png`: Ícone "S" de alta resolução (512x512).
- `public/favicon-192.png`: Resolução para dispositivos móveis/PWA.
- `public/favicon-32.png`: Resolução padrão para navegadores desktop.
- `public/favicon.svg` e `public/logo.svg`: SVG vetorial contendo o símbolo da Sofia.

---

## 🧩 3. Componente `AppLogo.tsx`

O componente [`AppLogo.tsx`](file:///Users/murilloalves/Projects/evo-crm-community-fork-clean/evo-ai-frontend-community/src/components/AppLogo.tsx) detecta automaticamente o tema ativo via `useDarkMode` e renderiza a variante apropriada com proteção de proporção:

```tsx
export function AppLogo({ className, alt = 'SOFIA Central', style, forceTheme }: AppLogoProps) {
  const { theme } = useDarkMode();
  const effectiveTheme = forceTheme ?? theme;
  const src = effectiveTheme === 'dark' ? logoDark : logoLight;

  return (
    <img
      src={src}
      alt={alt}
      className={className ? `${className} object-contain` : 'object-contain'}
      style={style}
    />
  );
}
```

---

## 📝 4. Rebranding Textual ("SOFIA Central")

- **Sigla**: **SOFIA** é a sigla oficial para *Sistema Operacional de Fluxos, Integrações e Atendimento*. Portanto, a grafia canônica é **SOFIA Central** em maiúsculas na sigla.
- **`<title>` da Aba**: Alterado em `index.html` para `SOFIA Central`.
- **Arquivos de Localização (`src/i18n/locales/`)**:
  - `layout.json`: `"brand": "SOFIA Central"`
  - `tours.json`: `"title": "Bem-vindo à SOFIA Central!"`
  - `setup.json`: Atualizado rodapé com referência à instância da SOFIA Central.
  - `onboarding.json`: Objetivos e botões de início direcionados para a SOFIA Central.

---

## 🔐 5. Autenticação Docker na VPS (Coolify)

Para que a VPS baixe imagens de containers de um repositório privado no GHCR sem erro de autenticação:
```bash
echo "$GITHUB_TOKEN" | ssh vps-caldas 'docker login ghcr.io -u murilloimparavel --password-stdin'
```
O arquivo `/root/.docker/config.json` armazena as credenciais seguras para execução contínua pelo Docker / Coolify.
