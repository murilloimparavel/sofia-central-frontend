import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { MessageTemplate } from '@/types/channels/inbox';
import TemplateParser from './TemplateParser';

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));

const template: MessageTemplate = {
  id: 'template-1',
  name: 'welcome',
  content: 'Olá, {{1}}',
  language: 'pt_BR',
  variables: [{ name: '1', label: 'Nome', example: 'Mariana' }],
  components: {
    body: { type: 'BODY', text: 'Olá, {{1}}' },
  },
};

describe('TemplateParser', () => {
  it('shows the placeholder in the preview after an example-backed variable is cleared', async () => {
    render(
      <TemplateParser
        template={template}
        channelType="Channel::Whatsapp"
        onSend={vi.fn()}
        onReset={vi.fn()}
      />,
    );

    const variableInput = await screen.findByDisplayValue('Mariana');
    expect(screen.getByText('Olá, Mariana')).toBeTruthy();

    fireEvent.change(variableInput, { target: { value: '' } });

    expect(screen.getByText('Olá, {{1}}')).toBeTruthy();
  });
});
