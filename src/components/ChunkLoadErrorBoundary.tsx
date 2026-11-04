import React, { type ReactNode } from 'react';

interface ChunkLoadErrorBoundaryProps {
  children: ReactNode;
}

interface ChunkLoadErrorBoundaryState {
  hasError: boolean;
}

export default class ChunkLoadErrorBoundary extends React.Component<
  ChunkLoadErrorBoundaryProps,
  ChunkLoadErrorBoundaryState
> {
  state: ChunkLoadErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): ChunkLoadErrorBoundaryState {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center text-sm" role="alert">
          <p>Este painel não carregou.</p>
          <button
            className="rounded-md border px-3 py-1.5 font-medium hover:bg-muted"
            onClick={() => window.location.reload()}
            type="button"
          >
            Recarregar página
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
