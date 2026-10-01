import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('RideX render error', error, info);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <main className="min-h-screen bg-paper p-6 text-ink">
          <h1 className="font-display text-2xl">Something went wrong</h1>
          <p className="mt-2 max-w-md">
            Reload the page. If this keeps happening, the last action did not finish — try again
            after checking your connection.
          </p>
        </main>
      );
    }
    return this.props.children;
  }
}
