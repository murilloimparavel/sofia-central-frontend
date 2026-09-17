# Formatação de Mensagens do WhatsApp e Respostas Rápidas no EvoCRM

> Documentação técnica da correção e padronização visual das mensagens do chat no painel do EvoCRM.

---

## 📌 1. Contexto e Problema Identificado

### O Sintoma
Nas conversas via WhatsApp (Evolution API), as **Respostas Rápidas** (`canned_responses`) e mensagens com formatação rica eram visualizadas pelo cliente de forma limpa, com parágrafos bem definidos, quebras de linha espaçadas e cabeçalhos em negrito.

No entanto, dentro do painel do atendente no CRM:
1. O texto aparecia como um **bloco único e contínuo**, com todas as quebras de linha (`\n\n`) colapsadas em espaços simples pelo navegador.
2. Formatações do WhatsApp como `*Confirmação de Pagamento*` apareciam com **asteriscos literais** em vez de negrito.
3. Itálicos (`_texto_`), tachados (`~texto~`) e códigos monospaçados não eram interpretados.

---

## 🔍 2. Causa Raiz

Foram identificados 3 pontos de falha no pipeline de renderização e composição:

### 2.1. Falso Positivo de Template de E-mail (`MessageText.tsx`)
O componente `MessageText.tsx` continha a seguinte condição para identificar templates de e-mail gerados por editor HTML:
```typescript
const isHtmlContent = safeContent.trim().startsWith('<!DOCTYPE') ||
                      safeContent.trim().startsWith('<html') ||
                      (safeContent.includes('<') && safeContent.includes('</') && safeContent.length > 50);
```
Como as mensagens enviadas pelo editor do CRM saem encapsuladas em `<p>...</p>`, qualquer mensagem com mais de 50 caracteres era classificada erroneamente como um **template completo de e-mail marketing**.

O container de e-mail (`.email-html-content`) utiliza `white-space: normal` (padrão HTML), o que instrui o navegador a colapsar todos os caracteres `\n` internos em um único espaço em branco.

### 2.2. Ausência de Parser de WhatsApp Markdown
O componente de texto do CRM possuía apenas um extrator de URLs (`URL_REGEX`). Não havia suporte no chat para:
- `*negrito*` ➔ `<strong>`
- `_itálico_` ➔ `<em>`
- `~tachado~` ➔ `<del>`
- ````código em bloco```` e ```código inline``` ➔ `<code>`

### 2.3. Serialização de Respostas Rápidas no Composer (`RichTextEditor.tsx`)
Ao selecionar uma resposta rápida no composer (usando o gatilho `/`), o método `setContent` do ProseMirror inseria todo o texto multiline em um único nó de parágrafo:
```typescript
content: [{ type: 'paragraph', content: [{ type: 'text', text: content }] }]
```
Isso gerava uma estrutura inconsistente `<p>Texto todo\n\ncom quebras</p>`, dificultando a edição pelo operador antes do envio.

---

## 🛠️ 3. Solução Implementada

### 3.1. Utilitário Canônico: `formatChatMessage.ts`
Criado em `src/components/chat/messages/formatChatMessage.ts`:
- **Sanitização Segura**: Remove `<script>`, `<style>` e manipuladores de eventos inline (`onclick`, `onerror`, etc.).
- **Tokenização de Tags HTML**: Divide o conteúdo entre tags HTML existentes (`<p>`, `<a>`, `<strong>`) e nós de texto puro.
- **Proteção Contextual**: Não aplica markdown nem recria links dentro de tags `<a>`, `<pre>` ou `<code>` pré-existentes.
- **WhatsApp Markdown Regex**:
  - Negrito: `(^|[^\w*])\*([^\s*](?:[^\n*]*?[^\s*])?)\*(?=[^\w*]|$)`
  - Itálico: `(^|[^\w_])_([^\s_](?:[^\n_]*?[^\s_])?)_(?=[^\w_]|$)` (preserva nomes em `snake_case`)
  - Tachado: `(^|[^\w~])~([^\s~](?:[^\n~]*?[^\s~])?)~(?=[^\w~]|$)`
  - Código: blocos ```` ```...``` ```` e inline `` `...` ``.
- **Auto-linking e Link Previews**: Converte URLs `https?://` em links clicáveis com `target="_blank"` e extrai a lista `detectedUrls` para exibição de cards de preview.

### 3.2. Renderizador Atualizado: `MessageText.tsx`
- Restringe templates de e-mail estritamente a documentos reais (`<!DOCTYPE`, `<html>`) ou mensagens com `contentType === 'incoming_email'`.
- Renderiza todas as mensagens do chat (inclusive notas privadas) através de `formatChatMessage`.
- Garante o wrapper com as classes `.rich-content`, `whitespace-pre-wrap` e `break-words`.

### 3.3. Estilização CSS: `RichTextEditor.css`
Atualizado para garantir que elementos de parágrafo e containers ricos herdem a preservação de espaços:
```css
.rich-content {
  white-space: pre-wrap;
  word-break: break-word;
}

.rich-content p {
  margin: 0.25rem 0;
  white-space: pre-wrap;
  word-break: break-word;
}

.rich-content del {
  text-decoration: line-through;
  opacity: 0.85;
}

.rich-content pre {
  background-color: hsl(var(--muted));
  padding: 0.5rem;
  border-radius: 0.375rem;
  font-size: 0.8125rem;
  font-family: monospace;
  overflow-x: auto;
  margin: 0.25rem 0;
  white-space: pre-wrap;
}

.rich-content a {
  color: #3b82f6;
  text-decoration: underline;
  word-break: break-all;
}
```

### 3.4. Editor ProseMirror: `RichTextEditor.tsx`
Atualizado o método `setContent`:
- Quando recebe texto multiline (como respostas rápidas ou colagem), formata o markdown e divide as quebras duplas `\n\n+` em parágrafos separados (`<p>...</p>`), e quebras simples `\n` em quebras forçadas (`hard_break` / `<br>`).
- O operador passa a ver o texto perfeitamente espaçado e formatado no próprio composer antes de disparar a mensagem.

---

## 🧪 4. Suíte de Testes Automatizados

Foram criados e validados os seguintes arquivos de teste no Vitest:
- `src/components/chat/messages/formatChatMessage.spec.ts`: 16 testes cobrindo todos os tipos de markdown, emojis, pontuação, equações matemáticas (ex: `5 * 5`), nomes de variáveis, links, notas privadas e o caso real da mensagem `2424`.
- `src/components/chat/messages/MessageText.spec.tsx`: 7 testes validando a montagem em React, renderização de `<strong>`, links com preview, notas privadas e e-mails legítimos.
- `src/components/chat/rich-text-editor/RichTextEditor.spec.tsx`: 7 testes validando o contrato de estado vazio, serialização limpa e divisão de texto multiline em múltiplos parágrafos.
