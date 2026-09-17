import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import MessageText from './MessageText';

describe('MessageText Component', () => {
  it('renders a plain text message', () => {
    render(<MessageText content="Olá, tudo bem?" />);
    expect(screen.getByText('Olá, tudo bem?')).toBeInTheDocument();
  });

  it('renders WhatsApp bold formatting (*text*) as <strong>', () => {
    const { container } = render(<MessageText content="Mensagem com *texto em negrito* aqui." />);
    const strong = container.querySelector('strong');
    expect(strong).toBeInTheDocument();
    expect(strong?.textContent).toBe('texto em negrito');
  });

  it('renders canned response from conversation 2424 with preserved HTML and bold', () => {
    const cannedContent =
      '<p>🟡 *Confirmação de Pagamento Parcial Recebido*!\n\nRecebemos o pagamento inicial e agora vamos te orientar nos próximos passos:\n\n*Pagamento Final*: O saldo restante deverá ser quitado até 3 dias antes do check-in.</p>';

    const { container } = render(<MessageText content={cannedContent} />);
    const strongs = container.querySelectorAll('strong');
    expect(strongs.length).toBeGreaterThanOrEqual(2);
    expect(strongs[0]?.textContent).toBe('Confirmação de Pagamento Parcial Recebido');
    expect(strongs[1]?.textContent).toBe('Pagamento Final');

    // Rich content container must have .rich-content class
    expect(container.querySelector('.rich-content')).toBeInTheDocument();
    // Inner <p> should exist
    expect(container.querySelector('p')).toBeInTheDocument();
  });

  it('renders URLs as links and displays LinkPreview', () => {
    const content = 'Consulte nosso site em https://crcn.com.br';
    const { container } = render(<MessageText content={content} />);

    const link = container.querySelector('a[href="https://crcn.com.br"]');
    expect(link).toBeInTheDocument();

    // LinkPreview shows hostname
    expect(screen.getByText('crcn.com.br')).toBeInTheDocument();
  });

  it('renders full email documents via email-html-content-wrapper', () => {
    const emailContent = '<!DOCTYPE html><html><body><h1>Email Title</h1></body></html>';
    const { container } = render(<MessageText content={emailContent} contentType="email" />);

    expect(container.querySelector('.email-html-content-wrapper')).toBeInTheDocument();
    expect(screen.getByText('Email Title')).toBeInTheDocument();
  });

  it('renders incoming email via contentAttributes', () => {
    const { container } = render(
      <MessageText
        content=""
        contentType="incoming_email"
        contentAttributes={{
          email: {
            html_content: {
              full: '<p>Mensagem recebida por e-mail</p>',
            },
          },
        }}
      />
    );

    expect(container.querySelector('.email-html-content-wrapper')).toBeInTheDocument();
    expect(screen.getByText('Mensagem recebida por e-mail')).toBeInTheDocument();
  });

  it('renders private note without color overrides', () => {
    const noteContent = '<p style="color: blue;">Nota privada</p>';
    const { container } = render(<MessageText content={noteContent} isPrivateNote={true} />);

    const p = container.querySelector('p');
    expect(p?.getAttribute('style')).not.toContain('color: blue');
  });
});
