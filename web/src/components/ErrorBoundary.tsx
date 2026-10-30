import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

export interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode | ((error: Error, reset: () => void) => ReactNode);
  onReset?: () => void;
  resetButtonText?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  showDetails: boolean;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    showDetails: false,
  };

  public static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Gradus21 ErrorBoundary caught an unhandled error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  public reset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  public render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === 'function') {
        return this.props.fallback(this.state.error || new Error('Unbekannter Fehler'), this.reset);
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div
          className="min-h-[50vh] flex items-center justify-center p-4 sm:p-6"
          data-testid="error-boundary-fallback"
        >
          <div
            className="w-full max-w-lg rounded-2xl border p-6 sm:p-8 shadow-lg text-center space-y-5"
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderColor: 'var(--border-subtle)',
            }}
          >
            <div className="w-14 h-14 mx-auto rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center shadow-xs">
              <AlertTriangle className="w-7 h-7" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Etwas ist unerwartet schiefgelaufen
              </h2>
              <p className="text-xs sm:text-sm text-balance" style={{ color: 'var(--text-secondary)' }}>
                Die Ansicht konnte aufgrund eines unerwarteten Fehlers nicht dargestellt werden.
                Deine eingegebenen Noten und Daten sind sicher im verschlüsselten Speicher gesichert.
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={this.reset}
                className="px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition active:scale-95 shadow-sm"
                style={{
                  backgroundColor: 'var(--primary-500)',
                  color: '#FFFFFF',
                }}
              >
                <ArrowLeft className="w-4 h-4" />
                {this.props.resetButtonText || 'Zurück zur Klassen-Matrix'}
              </button>

              <button
                type="button"
                onClick={() => window.location.reload()}
                className="px-4 py-2.5 rounded-xl border font-bold text-xs flex items-center gap-2 transition active:scale-95"
                style={{
                  backgroundColor: 'var(--bg-subtle)',
                  borderColor: 'var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <RefreshCw className="w-3.5 h-3.5" />
                Seite neu laden
              </button>
            </div>

            {this.state.error && (
              <div className="pt-2 text-left">
                <button
                  type="button"
                  onClick={() => this.setState((s) => ({ showDetails: !s.showDetails }))}
                  className="text-[11px] underline opacity-70 hover:opacity-100"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  {this.state.showDetails ? 'Technische Details verbergen' : 'Technische Details anzeigen'}
                </button>
                {this.state.showDetails && (
                  <pre className="mt-2 p-3 rounded-lg bg-black/5 dark:bg-white/5 text-[10px] font-mono overflow-x-auto max-h-40 text-red-600 dark:text-red-400 whitespace-pre-wrap">
                    {this.state.error.toString()}
                    {this.state.errorInfo?.componentStack}
                  </pre>
                )}
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
