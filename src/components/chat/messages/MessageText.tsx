import React, { useMemo } from 'react';
import { Copy, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/hooks/useLanguage';
import { formatChatMessage, sanitizeChatMessageHTML } from './formatChatMessage';
import '../rich-text-editor/RichTextEditor.css';

function LinkPreview({ url }: { url: string }) {
  const { t } = useLanguage('chat');
  let hostname = '';
  let addressDetails = '';
  try {
    const parsed = new URL(url);
    hostname = parsed.hostname;
    addressDetails = `${parsed.pathname === '/' ? '' : parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }

  const handleCopy = async (event: React.MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      if (!navigator.clipboard?.writeText) throw new Error('Clipboard is unavailable');
      await navigator.clipboard.writeText(url);
      toast.success(t('chatArea.messageLink.copied'));
    } catch {
      toast.error(t('chatArea.messageLink.copyFailed'));
    }
  };

  return (
    <div className="my-1 flex w-full max-w-lg items-start gap-2 rounded-lg border border-current/20 bg-black/10 p-2.5 transition-colors hover:bg-black/15">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex min-w-0 flex-1 items-start gap-2 rounded-sm text-inherit no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-black/10 text-current">
          <ExternalLink className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block break-all text-xs font-semibold leading-4">{hostname}</span>
          {addressDetails && (
            <span className="mt-1 block max-h-24 overflow-y-auto whitespace-pre-wrap break-all text-[11px] leading-4 text-current/80">
              {addressDetails}
            </span>
          )}
        </span>
      </a>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={t('chatArea.messageLink.copy')}
        title={t('chatArea.messageLink.copy')}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-current/20 bg-black/10 px-2 py-1.5 text-xs font-medium text-current transition-colors hover:bg-black/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current"
      >
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="hidden sm:inline">{t('chatArea.messageLink.copy')}</span>
      </button>
    </div>
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
