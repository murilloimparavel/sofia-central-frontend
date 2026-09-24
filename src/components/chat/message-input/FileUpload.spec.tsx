import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import FileUpload from './FileUpload';

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}));

describe('FileUpload document validation', () => {
  it('allows files up to 40 MiB and rejects files above that limit', () => {
    const onFilesSelected = vi.fn();
    const { container } = render(
      <FileUpload
        inputId="large-file-input"
        maxFileSize={40}
        category="document"
        enableGlobalDropZone={false}
        onFilesSelected={onFilesSelected}
      />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const atLimit = new File(['x'], 'large.pdf', { type: 'application/pdf' });
    Object.defineProperty(atLimit, 'size', { value: 40 * 1024 * 1024 });
    fireEvent.change(input, { target: { files: [atLimit] } });
    expect(onFilesSelected).toHaveBeenCalledWith([atLimit]);

    onFilesSelected.mockClear();
    const overLimit = new File(['x'], 'too-large.pdf', { type: 'application/pdf' });
    Object.defineProperty(overLimit, 'size', { value: 40 * 1024 * 1024 + 1 });
    fireEvent.change(input, { target: { files: [overLimit] } });
    expect(onFilesSelected).not.toHaveBeenCalled();
  });

  it.each(['application/pdf', 'application/x-pdf', ''])(
    'accepts a PDF when the browser reports MIME type %s',
    mimeType => {
    const onFilesSelected = vi.fn();
    const { container } = render(
      <FileUpload
        inputId="pdf-input"
        category="document"
        enableGlobalDropZone={false}
        onFilesSelected={onFilesSelected}
      />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['pdf'], 'reserva.pdf', { type: mimeType });

    fireEvent.change(input, { target: { files: [file] } });

    expect(onFilesSelected).toHaveBeenCalledWith([file]);
    },
  );

  it('rejects an unsupported file even when it has an allowed-looking name', () => {
    const onFilesSelected = vi.fn();
    const { container } = render(
      <FileUpload
        inputId="pdf-input-invalid"
        category="document"
        enableGlobalDropZone={false}
        onFilesSelected={onFilesSelected}
      />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['not a pdf'], 'reserva.pdf.exe', { type: 'application/x-msdownload' });

    fireEvent.change(input, { target: { files: [file] } });

    expect(onFilesSelected).not.toHaveBeenCalled();
  });

  it.each([['foto.png', 'image/png'], ['video.mp4', 'video/mp4']])(
    'allows %s in document mode',
    (name, mimeType) => {
      const onFilesSelected = vi.fn();
      const { container } = render(
        <FileUpload inputId={`document-mode-${name}`} category="document" enableGlobalDropZone={false} onFilesSelected={onFilesSelected} />,
      );
      const input = container.querySelector('input[type="file"]') as HTMLInputElement;
      const file = new File(['original bytes'], name, { type: mimeType });

      fireEvent.change(input, { target: { files: [file] } });

      expect(onFilesSelected).toHaveBeenCalledWith([file]);
    },
  );

  it.each([
    ['proposta.docx', 'application/octet-stream'],
    ['planilha.xlsx', ''],
    ['apresentacao.pptx', 'application/octet-stream'],
    ['dados.csv', 'text/csv'],
    ['contrato.rtf', 'text/rtf'],
    ['contrato.rtf', 'application/rtf'],
    ['contrato.rtf', 'application/octet-stream'],
    ['contrato.rtf', ''],
  ])('accepts supported document %s with MIME %s', (name, mimeType) => {
    const onFilesSelected = vi.fn();
    const { container } = render(
      <FileUpload
        inputId={`document-input-${name}`}
        category="document"
        enableGlobalDropZone={false}
        onFilesSelected={onFilesSelected}
      />,
    );
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['document'], name, { type: mimeType });

    fireEvent.change(input, { target: { files: [file] } });

    expect(onFilesSelected).toHaveBeenCalledWith([file]);
  });
});
