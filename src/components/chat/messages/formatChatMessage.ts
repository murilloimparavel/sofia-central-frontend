export interface FormattedMessageResult {
  html: string;
  detectedUrls: string[];
}

export const URL_REGEX = /https?:\/\/[^\s<>"')\]]+/gi;

const BOLD_REGEX = /(^|[^\w*])\*([^\s*](?:[^\n*]*?[^\s*])?)\*(?=[^\w*]|$)/g;
const ITALIC_REGEX = /(^|[^\w_])_([^\s_](?:[^\n_]*?[^\s_])?)_(?=[^\w_]|$)/g;
const STRIKE_REGEX = /(^|[^\w~])~([^\s~](?:[^\n~]*?[^\s~])?)~(?=[^\w~]|$)/g;
const CODE_BLOCK_REGEX = /```([^\n`]+[\s\S]*?|[\s\S]*?)```/g;
const INLINE_CODE_REGEX = /`([^`\n]+)`/g;
const HTML_TAG_REGEX = /(<[^>]+>)/g;

export function sanitizeChatMessageHTML(html: string): string {
  if (!html) return '';

  let sanitized = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  sanitized = sanitized.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '');
  sanitized = sanitized.replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '');

  return sanitized;
}

/**
 * Parses and formats chat messages for display:
 * 1. Sanitizes HTML (removes scripts/styles/handlers).
 * 2. Preserves existing safe HTML tags (<p>, <br>, <strong>, etc.).
 * 3. Formats WhatsApp markdown in text nodes:
 *    - ```code block``` and `inline code`
 *    - *bold* -> <strong>
 *    - _italic_ -> <em>
 *    - ~strikethrough~ -> <del>
 * 4. Detects and links URLs (https?://...) while collecting them for LinkPreview.
 */
export function formatChatMessage(
  content: string,
  options?: { isPrivateNote?: boolean }
): FormattedMessageResult {
  const safeContent = String(content || '');
  if (!safeContent) {
    return { html: '', detectedUrls: [] };
  }

  let sanitized = sanitizeChatMessageHTML(safeContent);

  if (options?.isPrivateNote) {
    sanitized = sanitized.replace(/color\s*:[^;"']*;?/gi, '');
  }

  const detectedUrls: string[] = [];

  // Split into alternating [text, tag, text, tag, ...]
  const parts = sanitized.split(HTML_TAG_REGEX);
  let inAnchor = false;
  let inCode = false;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (i % 2 === 1) {
      // It is an HTML tag
      if (/^<a\b/i.test(part)) {
        inAnchor = true;
        const hrefMatch = part.match(/href=["'](https?:\/\/[^"']+)["']/i);
        if (hrefMatch && !detectedUrls.includes(hrefMatch[1])) {
          detectedUrls.push(hrefMatch[1]);
        }
      } else if (/^<\/a>/i.test(part)) {
        inAnchor = false;
      } else if (/^<(pre|code)\b/i.test(part)) {
        inCode = true;
      } else if (/^<\/(pre|code)>/i.test(part)) {
        inCode = false;
      }
    } else if (part) {
      // It is text content outside tags
      let text = part;

      if (inCode) {
        // Inside existing code tags, leave untouched
        continue;
      }

      // 1. Code blocks and inline code
      const codeTokens: string[] = [];
      text = text.replace(CODE_BLOCK_REGEX, (_, code) => {
        const token = `\u0000CODE_BLOCK_${codeTokens.length}\u0000`;
        codeTokens.push(
          `<pre class="bg-muted/50 p-2 rounded text-xs font-mono my-1 overflow-x-auto whitespace-pre-wrap"><code>${code}</code></pre>`
        );
        return token;
      });

      text = text.replace(INLINE_CODE_REGEX, (_, code) => {
        const token = `\u0000INLINE_CODE_${codeTokens.length}\u0000`;
        codeTokens.push(
          `<code class="bg-muted/50 px-1 py-0.5 rounded text-xs font-mono">${code}</code>`
        );
        return token;
      });

      // 2. URLs (if not already inside an anchor tag)
      const urlTokens: string[] = [];
      if (!inAnchor) {
        text = text.replace(URL_REGEX, (url) => {
          if (!detectedUrls.includes(url)) {
            detectedUrls.push(url);
          }
          const token = `\u0000URL_TOKEN_${urlTokens.length}\u0000`;
          urlTokens.push(
            `<a href="${url}" target="_blank" rel="noopener noreferrer" class="text-blue-500 underline break-all hover:text-blue-400">${url}</a>`
          );
          return token;
        });
      }

      // 3. WhatsApp Markdown: bold, italic, strikethrough
      text = text.replace(BOLD_REGEX, '$1<strong>$2</strong>');
      text = text.replace(ITALIC_REGEX, '$1<em>$2</em>');
      text = text.replace(STRIKE_REGEX, '$1<del>$2</del>');

      // 4. Restore URL tokens
      if (urlTokens.length > 0) {
        text = text.replace(/\u0000URL_TOKEN_(\d+)\u0000/g, (_, idx) => urlTokens[Number(idx)] || '');
      }

      // 5. Restore Code tokens
      if (codeTokens.length > 0) {
        text = text.replace(/\u0000(CODE_BLOCK|INLINE_CODE)_(\d+)\u0000/g, (_, __, idx) => codeTokens[Number(idx)] || '');
      }

      parts[i] = text;
    }
  }

  return {
    html: parts.join(''),
    detectedUrls,
  };
}
