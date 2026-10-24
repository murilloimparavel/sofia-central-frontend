import React, { useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import { formatChatMessage, sanitizeChatMessageHTML } from './formatChatMessage';
import '../rich-text-editor/RichTextEditor.css';

function LinkPreview({ url }: { url: string }) {
  let hostname = '';
  let pathname = '';
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    pathname = parsed.pathname === '/' ? '' : parsed.pathname;
  } catch {
    return null;
  }

  const displayPath = pathname.length > 40 ? pathname.slice(0, 40) + '…' : pathname;

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 mt-1 mb-1 p-2 rounded-md border border-border/50 bg-muted/30 hover:bg-muted/50 transition-colors no-underline max-w-sm"
    >
      <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 overflow-hidden">
        <p className="text-xs font-medium text-foreground truncate">{hostname}</p>
        {displayPath && (
          <p className="text-[11px] text-muted-foreground truncate">{displayPath}</p>
        )}
      </div>
    </a>
  );
}

// `email` is the only nested attribute MessageText reads — but `Message.content_attributes`
// is typed as `MessageContentAttributes` (an open `Record<string, unknown>` plus a few
// known fields). Accept the open shape so callers passing `message.content_attributes`
// type-check, and narrow internally when reading `email`.
interface MessageContentEmail {
  email?: {
    html_content?: {
      full?: string;
      reply?: string;
      quoted?: string;
    };
    text_content?: {
      full?: string;
      reply?: string;
      quoted?: string;
    };
  };
}

interface MessageTextProps {
  content: string;
  isPrivateNote?: boolean;
  contentType?: string;
  contentAttributes?: Record<string, unknown> & MessageContentEmail;
}

const MessageText: React.FC<MessageTextProps> = ({
  content,
  isPrivateNote = false,
  contentType,
  contentAttributes,
}) => {
  // 🔒 PROTEÇÃO: Garantir que content seja sempre string válida
  const safeContent = String(content || '');

  // Render HTML for incoming email messages or full HTML document templates
  const isIncomingEmail = contentType === 'incoming_email' && Boolean(contentAttributes?.email?.html_content?.full);
  const isFullEmailDoc =
    !isPrivateNote &&
    (safeContent.trim().startsWith('<!DOCTYPE') ||
      safeContent.trim().startsWith('<!doctype') ||
      safeContent.trim().startsWith('<html') ||
      safeContent.trim().startsWith('<HTML'));

  // Keep hook order stable when a message switches between email HTML and
  // regular text (for example, after its content arrives from the server).
  const formatted = useMemo(
    () => isIncomingEmail || isFullEmailDoc
      ? null
      : formatChatMessage(safeContent, { isPrivateNote }),
    [safeContent, isPrivateNote, isIncomingEmail, isFullEmailDoc],
  );

  if (isIncomingEmail || isFullEmailDoc) {
    const rawEmailHtml = isIncomingEmail
      ? contentAttributes?.email?.html_content?.full || ''
      : safeContent;
    const sanitizedHTML = sanitizeChatMessageHTML(rawEmailHtml);

    return (
      <div
        className="email-html-content-wrapper"
        style={{
          isolation: 'isolate',
          contain: 'layout style paint',
          position: 'relative',
          maxWidth: '100%',
          overflow: 'auto',
          wordBreak: 'break-word',
          display: 'block',
          boxSizing: 'border-box',
        }}
      >
        <div
          className="email-html-content"
          dangerouslySetInnerHTML={{
            __html: sanitizedHTML,
          }}
          style={{
            fontSize: '13px',
            lineHeight: '1.4',
            display: 'block',
            boxSizing: 'border-box',
          }}
        />
      </div>
    );
  }

  // Format chat message with WhatsApp Markdown, URL linking, and preserved HTML structure
  const { html: formattedHtml, detectedUrls } = formatted!;

  return (
    <div className="whitespace-pre-wrap break-words text-sm">
      <div
        className="rich-content"
        style={isPrivateNote ? { color: 'inherit' } : undefined}
        dangerouslySetInnerHTML={{ __html: formattedHtml }}
      />
      {detectedUrls.length > 0 && (
        <div className="mt-1">
          {detectedUrls.map((url) => (
            <LinkPreview key={url} url={url} />
          ))}
        </div>
      )}
    </div>
  );
};

export default MessageText;
