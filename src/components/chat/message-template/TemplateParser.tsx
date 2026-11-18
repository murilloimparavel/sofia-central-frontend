import React, { useState, useMemo, useEffect } from 'react';
import { Button } from '@evoapi/design-system/button';
import { Input } from '@evoapi/design-system/input';
import type { MessageTemplate, MessageTemplateComponent } from '@/types/channels/inbox';
import { useLanguage } from '@/hooks/useLanguage';
import {
  buildInitialVariableParams,
  extractTemplateVariables,
} from '@/utils/templateVariables';

interface TemplateParserProps {
  template: MessageTemplate;
  channelType?: string;
  onSend: (payload: {
    message: string;
    templateParams: {
      id: string;
      name: string;
      category: string;
      language: string;
      namespace: string;
      processed_params: Record<string, string>;
    };
  }) => void;
  onReset: () => void;
  loading?: boolean;
}

const TemplateParser: React.FC<TemplateParserProps> = ({ template, channelType, onSend, onReset, loading }) => {
  const { t } = useLanguage('chat');
  const [params, setParams] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, boolean>>({});
  const [touched, setTouched] = useState(false);

  const isEmailTemplate = channelType === 'Channel::Email';

  // Get HTML content for email templates (only for variable extraction)
  const getEmailHtmlContent = useMemo(() => {
    if (!isEmailTemplate) return '';

    const metadata = template.metadata as Record<string, unknown> | undefined;

    // Priority 1: HTML from metadata.html_content
    if (metadata?.html_content && typeof metadata.html_content === 'string') {
      return metadata.html_content;
    }

    // Priority 2: Check if content is HTML (legacy)
    if (template.content) {
      const content = template.content.trim();
      if (content.startsWith('<!DOCTYPE') || content.startsWith('<!doctype') || content.startsWith('<html')) {
        return content;
      }
    }

    return '';
  }, [template, isEmailTemplate]);

  const variables = useMemo(() => {
    if (isEmailTemplate && getEmailHtmlContent) {
      return extractTemplateVariables({
        content: getEmailHtmlContent,
        variables: template.variables,
      });
    }

    return extractTemplateVariables(template);
  }, [template, isEmailTemplate, getEmailHtmlContent]);

  const previewComponents = useMemo(() => {
    const components = template.components
      ? Array.isArray(template.components)
        ? template.components
        : Object.values(template.components)
      : [];
    const body = components.find(component => component.type === 'BODY')?.text || template.content || '';

    return {
      header: components.find(component => component.type === 'HEADER')?.text || '',
      body,
      footer: components.find(component => component.type === 'FOOTER')?.text || '',
      buttons: components.find(component => component.type === 'BUTTONS')?.buttons || [],
    };
  }, [template]);

  const renderPreviewText = (text: string) =>
    text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (placeholder, name: string) => {
      const variable = variables.find(item => item.name === name);
      if (Object.prototype.hasOwnProperty.call(params, name)) {
        return params[name]?.trim() || placeholder;
      }

      return variable?.default_value || variable?.example || placeholder;
    });

  // Inicializar params quando o template mudar
  useEffect(() => {
    if (variables.length > 0) {
      setParams(buildInitialVariableParams(variables));
      setErrors({});
      setTouched(false);
    }
  }, [variables]);

  // Validar se todos os campos estão preenchidos
  const isValid = useMemo(() => {
    if (variables.length === 0) return true;

    return Object.values(params).every(value => value.trim() !== '');
  }, [params, variables]);

  // Handler para enviar
  const handleSend = () => {
    // Se há variáveis, validar antes de enviar
    if (variables.length > 0) {
      setTouched(true);

      if (!isValid) {
        // Marcar campos vazios como erro
        const newErrors: Record<string, boolean> = {};
        Object.entries(params).forEach(([key, value]) => {
          if (!value.trim()) {
            newErrors[key] = true;
          }
        });
        setErrors(newErrors);
        return;
      }
    }

    // Construir payload
    // Backend will process the template and populate content
    // For email templates, backend uses HTML from metadata.html_content
    // For WhatsApp, backend processes template components
    const payload = {
      message: '', // Backend will populate from template
      templateParams: {
        id: template.id ?? '', // EVO-1235: canonical key — backend resolves id-first (global-aware)
        name: template.name,
        category: template.category || 'UTILITY',
        language: template.language,
        namespace: template.namespace || '',
        processed_params: params,
      },
    };

    onSend(payload);
  };

  // Handler para atualizar um parâmetro
  const handleParamChange = (key: string, value: string) => {
    setParams(prev => ({ ...prev, [key]: value }));

    // Limpar erro deste campo se ele foi preenchido
    if (value.trim() && errors[key]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[key];
        return newErrors;
      });
    }
  };

  return (
    <div className="w-full">
      {/* Campos de variáveis */}
      {variables.length > 0 && (
        <div className="mb-4 space-y-3">
          <p className="text-sm font-semibold">
            {t('messageTemplates.parser.variablesLabel')}
          </p>

          {variables.map(variable => (
            <div key={variable.name} className="flex items-center gap-2">
              <span className="bg-muted text-muted-foreground inline-block rounded-md text-xs py-2 px-4 min-w-[60px] text-center font-medium">
                {variable.label || variable.name}
              </span>
              <Input
                type="text"
                value={params[variable.name] ?? ''}
                onChange={e => handleParamChange(variable.name, e.target.value)}
                placeholder={
                  variable.example ||
                  variable.default_value ||
                  t('messageTemplates.parser.variablePlaceholder', { variable: variable.name })
                }
                className={`flex-1 ${errors[variable.name] ? 'border-destructive' : ''}`}
              />
            </div>
          ))}

          {touched && !isValid && (
            <p className="bg-destructive/10 rounded-md text-destructive p-3 text-center text-sm">
              {t('messageTemplates.parser.formErrorMessage')}
            </p>
          )}
        </div>
      )}

      <section className="mb-5" aria-label={t('messageTemplates.parser.previewLabel')}>
        <p className="mb-2 text-sm font-semibold">{t('messageTemplates.parser.previewLabel')}</p>
        <div className="rounded-xl border border-emerald-900/10 bg-[#e9f5ec] p-3 dark:border-emerald-100/10 dark:bg-emerald-950/30">
          <div className="ml-auto max-w-[92%] rounded-xl rounded-tr-sm border border-black/5 bg-white px-3 py-2.5 text-sm text-slate-900 shadow-sm dark:border-white/10 dark:bg-slate-800 dark:text-slate-100">
            {previewComponents.header && (
              <p className="mb-1.5 font-semibold">{renderPreviewText(previewComponents.header)}</p>
            )}
            <p className="whitespace-pre-wrap">{renderPreviewText(previewComponents.body)}</p>
            {previewComponents.footer && (
              <p className="mt-2 text-xs text-muted-foreground">
                {renderPreviewText(previewComponents.footer)}
              </p>
            )}
            {previewComponents.buttons.length > 0 && (
              <div className="mt-3 space-y-1.5 border-t border-border pt-2">
                {previewComponents.buttons.map(
                  (button: NonNullable<MessageTemplateComponent['buttons']>[number], index: number) => (
                    <div
                      key={`${button.text}-${index}`}
                      className="rounded-md border border-border px-2 py-1.5 text-center text-xs font-medium text-primary"
                    >
                      {button.text}
                    </div>
                  ),
                )}
              </div>
            )}
          </div>
          <p className="mt-2 text-right text-[11px] text-emerald-950/55 dark:text-emerald-100/55">
            {t('messageTemplates.parser.previewTime')}
          </p>
        </div>
      </section>

      {/* Botões de ação */}
      <footer className="flex justify-end gap-2">
        <Button
          variant="ghost"
          onClick={onReset}
          className="text-muted-foreground hover:text-foreground"
          disabled={loading}
        >
          {t('messageTemplates.parser.goBackLabel')}
        </Button>
        <Button onClick={handleSend} disabled={(variables.length > 0 && touched && !isValid) || loading}>
          {t('messageTemplates.parser.sendMessageLabel')}
        </Button>
      </footer>
    </div>
  );
};

export default TemplateParser;
