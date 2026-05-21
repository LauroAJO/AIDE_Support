import { Component } from 'react';

// Contains render-time errors to the routed section instead of unmounting the
// whole app (which shows a blank page). Shows a recoverable message.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('AIDE error boundary:', error, info);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
          <h1 className="text-xl font-bold text-ink">Algo deu errado</h1>
          <p className="max-w-sm text-sm text-ink2">
            Ocorreu um erro ao carregar esta seção. Tente recarregar a página.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-hover"
          >
            Recarregar
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
