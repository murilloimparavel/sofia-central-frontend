import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import CommercialAssistantPopup from './CommercialAssistantPopup';
import { useCommercialAssistantContext } from './CommercialAssistantContext';
import { CommercialAssistantProvider } from './CommercialAssistantProvider';

vi.mock('./CommercialAssistantPanel', () => ({
  default: () => <div>Assistant content</div>,
}));

function ControlledPopup() {
  const [open, setOpen] = useState(false);
  return <CommercialAssistantPopup open={open} onOpenChange={setOpen} />;
}

function MobileAssistantTrigger() {
  const assistant = useCommercialAssistantContext();
  return (
    <button ref={assistant?.mobileTriggerRef} onClick={assistant?.toggle} type="button">
      Open assistant
    </button>
  );
}

describe('CommercialAssistantPopup controlled visibility', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query.includes('max-width'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })));
  });

  it('opens and closes the same popup through its controlled state', async () => {
    render(<ControlledPopup />);

    fireEvent.click(screen.getByRole('button', { name: 'Abrir assistente comercial' }));
    expect(await screen.findByRole('dialog', { name: 'Assistente comercial' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Fechar assistente comercial' }));
    expect(screen.queryByRole('dialog', { name: 'Assistente comercial' })).not.toBeInTheDocument();
  });

  it('returns focus to the mobile header trigger after closing', async () => {
    render(
      <CommercialAssistantProvider>
        <MobileAssistantTrigger />
        <CommercialAssistantPopup />
      </CommercialAssistantProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Open assistant' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Fechar assistente comercial' }));

    await waitFor(() => expect(screen.getByRole('button', { name: 'Open assistant' })).toHaveFocus());
  });
});
