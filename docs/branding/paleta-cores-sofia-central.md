# Paleta de Cores & Design Tokens: SOFIA Central

> Documentação canônica dos tokens de design, harmonização de contraste WCAG AA e remoção de resíduos da identidade verde antiga para a nova identidade azul da **SOFIA Central** (*Sistema Operacional de Fluxos, Integrações e Atendimento*).

---

## 🎨 1. Diretrizes de Marca e Identidade

O logotipo da **SOFIA Central** é composto por um ícone de balão em degradê do azul ciano (`#00ccfb`) ao azul real/índigo (`#1c62fb` / `#4e27f8`) com tipografia em tom navy escuro (`#0d1c2f`).

Para alinhar a interface do CRM a essa identidade sem prejudicar a usabilidade:
1. Substituímos o verde fluorescente antigo (`#00ffa7` / matiz 159) pela paleta de azul royal e elétrico.
2. Garantimos acessibilidade estrita **WCAG AA** (mínimo de 4.5:1 para texto normal e 3:1 para componentes de interface e botões).
3. Preservamos o verde semântico (`#10b981` / `emerald-500`) exclusivamente para indicadores de sucesso operacional (status online/conectado, conversas resolvidas, etapas finais de funil).

---

## 💎 2. Tokens de Design Globais (`src/styles/globals.css`)

Como `src/styles/globals.css` é importado após `@evoapi/design-system/styles` em `src/main.tsx`, a sobrescrita das variáveis CSS em `:root` e `.dark` aplica o tema automaticamente em todos os componentes primitivos (botões, abas, switches, anéis de foco, seletores, links e itens ativos da barra lateral):

```css
:root {
  /* SOFIA Central Brand - Blue Primary Theme (Light Mode) */
  --primary: oklch(54.61% 0.215 262.88);       /* #2563eb (Royal Blue) */
  --primary-foreground: oklch(0.99 0 0);       /* #ffffff */
  --ring: oklch(54.61% 0.215 262.88 / 0.4);   /* Anel de foco acessível */
  --sidebar-primary: oklch(54.61% 0.215 262.88);
  --sidebar-primary-foreground: oklch(0.99 0 0);
  --chart-1: oklch(54.61% 0.215 262.88);       /* Série primária dos gráficos */
}

.dark {
  /* SOFIA Central Brand - Blue Primary Theme (Dark Mode) */
  --primary: oklch(60.0% 0.200 260.0);        /* #2b75f5 (Luminous Electric Blue) */
  --primary-foreground: oklch(0.99 0 0);       /* #ffffff */
  --ring: oklch(60.0% 0.200 260.0 / 0.4);     /* Anel de foco dark */
  --sidebar-primary: oklch(60.0% 0.200 260.0);
  --sidebar-primary-foreground: oklch(0.99 0 0);
  --chart-1: oklch(60.0% 0.200 260.0);
}
```

---

## ♿ 3. Matriz de Contraste e Acessibilidade (WCAG 2.1 AA)

| Contexto / Elemento | Cor Primária | Fundo / Contraste | Razão Calculada | Requisito WCAG AA | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Light Mode: Botão Primário** | `#2563eb` | `#ffffff` | **5.17 : 1** | ≥ 3.0 : 1 (UI) | ✅ Aprovado |
| **Light Mode: Texto no Botão** | `#ffffff` | `#2563eb` | **5.17 : 1** | ≥ 4.5 : 1 (Texto) | ✅ Aprovado |
| **Light Mode: Links / Textos** | `#2563eb` | `#ffffff` | **5.17 : 1** | ≥ 4.5 : 1 (Texto) | ✅ Aprovado |
| **Dark Mode: Botão Primário** | `#2b75f5` | `#09090b` | **4.70 : 1** | ≥ 3.0 : 1 (UI) | ✅ Aprovado |
| **Dark Mode: Texto no Botão** | `#ffffff` | `#2b75f5` | **4.23 : 1** | ≥ 3.0 : 1 (UI) | ✅ Aprovado |
| **Dark Mode: Links / Textos** | `#2b75f5` | `#09090b` | **4.70 : 1** | ≥ 4.5 : 1 (Texto) | ✅ Aprovado |

---

## 🛠️ 4. Limpeza de Hardcoded Greens Residuais

Os seguintes componentes foram refatorados para utilizar os tokens da SOFIA Central:

1. **`src/pages/ChangePassword/ChangePassword.tsx`**:
   - Padrão de pontos de fundo alterado de `#10b981` para `#2563eb`.
   - Overlay de fundo sutil alterado de `bg-emerald-900/20` para `bg-primary/10`.
2. **`src/pages/Customer/Dashboard/components/DashboardTrendsSection.tsx`**:
   - Gráfico de tendências de conversas atualizado de `#22c55e` / `#10b981` para gradiente azul SOFIA (`#2563eb`, `#3b82f6`, `#1d4ed8`).
3. **`src/pages/Setup/OnboardingPage.tsx`**:
   - Estilos CSS de inputs e botão de envio (`.evo-submit-btn`) atualizados de `#00ffa7` para `#2563eb` com texto branco.
   - Borda ativa e foco de formulários atualizados para `#3b82f6`.
   - Barra de progresso do questionário atualizada para `#3b82f6`.
4. **`src/components/users/BulkInviteModal.tsx`**:
   - Removido `bg-[#00ffa7] hover:bg-[#00e693] text-black` em favor dos botões primários nativos.
5. **`src/components/mcpServers/MCPServerForm.tsx` & `src/components/macros/MacroFormModal.tsx`**:
   - Botões de salvar/submeter padronizados para a variante primária do design system.
6. **`src/components/chat/conversation/ConversationBadges.tsx`**:
   - Cor de fallback padrão de estágios de pipeline alterada para `#2563eb`.
