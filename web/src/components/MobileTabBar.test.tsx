import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MobileTabBar } from './MobileTabBar';

describe('MobileTabBar', () => {
  it('renders all 4 workspace mode tabs with correct active state', () => {
    const handleSetMode = vi.fn();
    render(<MobileTabBar mode="speed_grading" setMode={handleSetMode} />);

    expect(screen.getByText('Matrix')).toBeInTheDocument();
    expect(screen.getByText('Speed')).toBeInTheDocument();
    expect(screen.getByText('360°-Akte')).toBeInTheDocument();
    expect(screen.getByText('Gewichtung')).toBeInTheDocument();

    const speedTab = screen.getByTestId('mobile-tab-speed');
    expect(speedTab).toHaveAttribute('aria-current', 'page');

    const matrixTab = screen.getByTestId('mobile-tab-matrix');
    expect(matrixTab).not.toHaveAttribute('aria-current');
  });

  it('triggers setMode callback when a tab is clicked', () => {
    const handleSetMode = vi.fn();
    render(<MobileTabBar mode="matrix" setMode={handleSetMode} />);

    const student360Tab = screen.getByTestId('mobile-tab-student360');
    fireEvent.click(student360Tab);

    expect(handleSetMode).toHaveBeenCalledWith('student_360');
  });
});
