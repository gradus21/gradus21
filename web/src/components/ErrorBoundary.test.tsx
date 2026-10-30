import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ErrorBoundary } from './ErrorBoundary';

const FaultyComponent = ({ shouldThrow }: { shouldThrow: boolean }) => {
  if (shouldThrow) {
    throw new Error('Test crash in child component');
  }
  return <div>Normal Content</div>;
};

describe('ErrorBoundary', () => {
  // Prevent console.error from polluting test logs during deliberate test throw
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalError;
  });

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <FaultyComponent shouldThrow={false} />
      </ErrorBoundary>
    );

    expect(screen.getByText('Normal Content')).toBeInTheDocument();
  });

  it('catches render errors and renders fallback UI with reset button', () => {
    const onResetMock = vi.fn();

    render(
      <ErrorBoundary onReset={onResetMock}>
        <FaultyComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    expect(screen.getByTestId('error-boundary-fallback')).toBeInTheDocument();
    expect(screen.getByText('Etwas ist unerwartet schiefgelaufen')).toBeInTheDocument();
    expect(screen.getByText('Zurück zur Klassen-Matrix')).toBeInTheDocument();

    const resetBtn = screen.getByText('Zurück zur Klassen-Matrix');
    fireEvent.click(resetBtn);

    expect(onResetMock).toHaveBeenCalledTimes(1);
  });

  it('toggles technical details on click', () => {
    render(
      <ErrorBoundary>
        <FaultyComponent shouldThrow={true} />
      </ErrorBoundary>
    );

    const toggleBtn = screen.getByText('Technische Details anzeigen');
    fireEvent.click(toggleBtn);

    expect(screen.getByText(/Test crash in child component/)).toBeInTheDocument();
    expect(screen.getByText('Technische Details verbergen')).toBeInTheDocument();
  });
});
