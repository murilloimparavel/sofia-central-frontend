import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ChunkLoadErrorBoundary from './ChunkLoadErrorBoundary';

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

function BrokenPanel(): React.ReactElement {
  throw new Error('chunk import failed');
}

describe('ChunkLoadErrorBoundary', () => {
  it('shows a page reload action when a panel throws', () => {
    render(
      <ChunkLoadErrorBoundary>
        <BrokenPanel />
      </ChunkLoadErrorBoundary>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Este painel não carregou.');
    expect(screen.getByRole('button', { name: 'Recarregar página' })).toBeInTheDocument();
  });
});
