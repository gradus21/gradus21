import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FlowRibbonLogo } from './FlowRibbonLogo';

describe('FlowRibbonLogo component', () => {
  it('renders SVG icon and wordmark by default', () => {
    const { container } = render(<FlowRibbonLogo />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(screen.getByText('Gradus')).toBeInTheDocument();
    expect(screen.getByText('21')).toBeInTheDocument();
  });

  it('renders without wordmark when showWordmark=false', () => {
    const { container } = render(<FlowRibbonLogo showWordmark={false} />);
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();
    expect(screen.queryByText('Gradus')).not.toBeInTheDocument();
  });

  it('applies custom size to SVG element', () => {
    const { container } = render(<FlowRibbonLogo size={64} />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveAttribute('width', '64');
    expect(svg).toHaveAttribute('height', '64');
  });
});
