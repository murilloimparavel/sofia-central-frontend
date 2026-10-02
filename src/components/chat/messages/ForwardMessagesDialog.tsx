import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
} from '@evoapi/design-system';
import { Loader2, Search, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { useLanguage } from '@/hooks/useLanguage';
import { contactsService } from '@/services/contacts';
import { chatService } from '@/services/chat/chatService';
import type { Message } from '@/types/chat/api';
import type { Contact } from '@/types/contacts';

interface ForwardMessagesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  messages: Message[];
  initialMessage: Message | null;
}

const MAX_CONTACTS = 5;
const MAX_MESSAGES = 10;

export default function ForwardMessagesDialog({
  open,
  onOpenChange,
  messages,
  initialMessage,
}: ForwardMessagesDialogProps) {
  const { t } = useLanguage('chat');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Contact[]>([]);
  const [selectedContacts, setSelectedContacts] = useState<Contact[]>([]);
  const [selectedMessageIds, setSelectedMessageIds] = useState<string[]>([]);
  const [searching, setSearching] = useState(false);
  const [sending, setSending] = useState(false);

  const eligibleMessages = useMemo(() => {
    const candidates = messages.filter(message =>
      message.message_type !== 'activity' &&
      message.message_type !== 'template' &&
      !message.private &&
      message.content_attributes?.deleted !== true &&
      message.content_attributes?.revoked_by_contact !== true &&
      message.status !== 'progress',
    );
    const recent = candidates.slice(-MAX_MESSAGES);

    if (initialMessage && !recent.some(message => message.id === initialMessage.id)) {
      return [...recent.slice(-(MAX_MESSAGES - 1)), initialMessage];
    }

    return recent;
  }, [messages, initialMessage]);

  useEffect(() => {
    if (open) {
      setSelectedMessageIds(initialMessage ? [String(initialMessage.id)] : []);
      return;
    }

    setQuery('');
    setResults([]);
    setSelectedContacts([]);
    setSelectedMessageIds([]);
    setSending(false);
  }, [open, initialMessage]);

  const search = useCallback(async (value: string) => {
    if (value.trim().length < 2) {
      setResults([]);
      return;
    }

    setSearching(true);
    try {
      const response = await contactsService.searchContacts({
        q: value.trim(),
        page: 1,
        per_page: 10,
        type: 'person',
      });
      setResults((response.data || []).filter(contact => contact.phone_number));
    } catch {
      setResults([]);
      toast.error(t('messages.forward.searchError'));
    } finally {
      setSearching(false);
    }
  }, [t]);

  useEffect(() => {
    if (!open) return;

    const timer = window.setTimeout(() => {
      void search(query);
    }, 250);

    return () => window.clearTimeout(timer);
  }, [open, query, search]);

  const toggleContact = (contact: Contact) => {
    setSelectedContacts(current => {
      if (current.some(item => item.id === contact.id)) {
        return current.filter(item => item.id !== contact.id);
      }
      return current.length < MAX_CONTACTS ? [...current, contact] : current;
    });
    setQuery('');
    setResults([]);
  };

  const toggleMessage = (id: string) => {
    setSelectedMessageIds(current => {
      if (current.includes(id)) return current.filter(item => item !== id);
      return current.length < MAX_MESSAGES ? [...current, id] : current;
    });
  };

  const handleSend = async () => {
    const conversationId = initialMessage?.conversation_id;
    if (!conversationId || !selectedMessageIds.length || !selectedContacts.length) return;

    setSending(true);
    try {
      await chatService.forwardMessages(
        conversationId,
        selectedMessageIds,
        selectedContacts.map(contact => contact.id),
      );
      toast.success(t('messages.forward.queued', { count: selectedContacts.length }));
      onOpenChange(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('messages.forward.sendError'));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('messages.forward.title')}</DialogTitle>
          <DialogDescription>{t('messages.forward.description')}</DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">{t('messages.forward.messages')}</h3>
            <span className="text-xs text-muted-foreground">
              {selectedMessageIds.length}/{MAX_MESSAGES}
            </span>
          </div>
          <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border p-2">
            {eligibleMessages.map(message => {
              const id = String(message.id);
              const checked = selectedMessageIds.includes(id);
              const label = message.content?.trim() ||
                message.attachments?.[0]?.fallback_title ||
                t('messages.forward.attachment');

              return (
                <label key={id} className="flex cursor-pointer items-start gap-2 rounded px-2 py-1.5 text-sm hover:bg-accent">
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={!checked && selectedMessageIds.length >= MAX_MESSAGES}
                    onChange={() => toggleMessage(id)}
                    className="mt-1 accent-primary"
                  />
                  <span className="line-clamp-2">{label}</span>
                </label>
              );
            })}
          </div>
        </section>

        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium">{t('messages.forward.recipients')}</h3>
            <span className="text-xs text-muted-foreground">
              {selectedContacts.length}/{MAX_CONTACTS}
            </span>
          </div>

          {selectedContacts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {selectedContacts.map(contact => (
                <span key={contact.id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs">
                  {contact.name}
                  <button
                    type="button"
                    aria-label={t('messages.forward.removeContact', { name: contact.name })}
                    onClick={() => toggleContact(contact)}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder={t('messages.forward.searchPlaceholder')}
              className="pl-9"
              disabled={selectedContacts.length >= MAX_CONTACTS}
            />
            {(searching || results.length > 0) && (
              <div className="absolute z-20 mt-1 max-h-52 w-full overflow-auto rounded-md border bg-popover shadow-md">
                {searching ? (
                  <div className="flex justify-center p-3">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                ) : results
                  .filter(contact => !selectedContacts.some(item => item.id === contact.id))
                  .map(contact => (
                    <button
                      type="button"
                      key={contact.id}
                      onClick={() => toggleContact(contact)}
                      className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-accent"
                    >
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={(contact.thumbnail || contact.avatar_url) ?? undefined} />
                        <AvatarFallback>{contact.name?.[0]?.toUpperCase() || '?'}</AvatarFallback>
                      </Avatar>
                      <span className="min-w-0">
                        <span className="block truncate text-sm">{contact.name}</span>
                        <span className="block text-xs text-muted-foreground">{contact.phone_number}</span>
                      </span>
                    </button>
                  ))}
              </div>
            )}
          </div>
        </section>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={sending}>
            {t('messages.forward.cancel')}
          </Button>
          <Button
            onClick={() => void handleSend()}
            disabled={sending || !selectedMessageIds.length || !selectedContacts.length}
          >
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            {t('messages.forward.send')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
