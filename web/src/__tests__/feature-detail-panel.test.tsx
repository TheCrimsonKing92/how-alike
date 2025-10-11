import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import FeatureDetailPanel from '@/components/FeatureDetailPanel';
import type { FeatureNarrative } from '@/workers/types';

describe('FeatureDetailPanel', () => {
  it('renders nothing when narrative is undefined', () => {
    const { container } = render(<FeatureDetailPanel narrative={undefined} congruenceScore={undefined} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('displays morphological congruence score', () => {
    const narrative: FeatureNarrative = {
      overall: 'High morphological congruence',
      featureSummaries: {},
      axisDetails: {},
    };

    render(<FeatureDetailPanel narrative={narrative} congruenceScore={0.88} />);

    expect(screen.getByText(/Morphological congruence: 88.0%/i)).toBeInTheDocument();
  });

  it('displays overall narrative', () => {
    const narrative: FeatureNarrative = {
      overall: 'High morphological congruence across all features',
      featureSummaries: {},
      axisDetails: {},
    };

    render(<FeatureDetailPanel narrative={narrative} congruenceScore={0.90} />);

    expect(screen.getByText('High morphological congruence across all features')).toBeInTheDocument();
  });

  it('displays shared characteristics', () => {
    const narrative: FeatureNarrative = {
      overall: 'Moderate similarity',
      featureSummaries: {},
      axisDetails: {},
      sharedCharacteristics: 'Both share positive canthal tilt and average eye size',
    };

    render(<FeatureDetailPanel narrative={narrative} congruenceScore={0.65} />);

    expect(screen.getByText('Both share positive canthal tilt and average eye size')).toBeInTheDocument();
  });

  it('renders feature summaries in collapsible sections', () => {
    const narrative: FeatureNarrative = {
      overall: 'Mixed similarity',
      featureSummaries: {
        eyes: 'Eyes are highly similar',
        nose: 'Nose differ significantly',
      },
      axisDetails: {
        eyes: [],
        nose: [],
      },
    };

    render(<FeatureDetailPanel narrative={narrative} congruenceScore={0.60} />);

    expect(screen.getByText('eyes')).toBeInTheDocument();
    expect(screen.getByText('Eyes are highly similar')).toBeInTheDocument();
    expect(screen.getByText('nose')).toBeInTheDocument();
    expect(screen.getByText('Nose differ significantly')).toBeInTheDocument();
  });

  it('expands feature details on click', async () => {
    const user = userEvent.setup();

    const narrative: FeatureNarrative = {
      overall: 'Moderate similarity',
      featureSummaries: {
        eyes: 'Eyes are similar',
      },
      axisDetails: {
        eyes: ['Both have positive canthal tilt', 'Eye size: average vs wide (subtle difference)'],
      },
    };

    render(<FeatureDetailPanel narrative={narrative} congruenceScore={0.75} />);

    // Details should not be visible initially
    expect(screen.queryByText('Both have positive canthal tilt')).not.toBeInTheDocument();

    // Click the button to expand
    const button = screen.getByRole('button', { name: /eyes/i });
    await user.click(button);

    // Details should now be visible
    expect(screen.getByText('• Both have positive canthal tilt')).toBeInTheDocument();
    expect(screen.getByText('• Eye size: average vs wide (subtle difference)')).toBeInTheDocument();
  });

  it('collapses expanded feature on second click', async () => {
    const user = userEvent.setup();

    const narrative: FeatureNarrative = {
      overall: 'Moderate similarity',
      featureSummaries: {
        eyes: 'Eyes are similar',
      },
      axisDetails: {
        eyes: ['Both have positive canthal tilt'],
      },
    };

    render(<FeatureDetailPanel narrative={narrative} congruenceScore={0.75} />);

    const button = screen.getByRole('button', { name: /eyes/i });

    // Expand
    await user.click(button);
    expect(screen.getByText('• Both have positive canthal tilt')).toBeInTheDocument();

    // Collapse
    await user.click(button);
    expect(screen.queryByText('• Both have positive canthal tilt')).not.toBeInTheDocument();
  });

  it('allows expanding multiple features independently', async () => {
    const user = userEvent.setup();

    const narrative: FeatureNarrative = {
      overall: 'Mixed similarity',
      featureSummaries: {
        eyes: 'Eyes are similar',
        nose: 'Nose differ',
      },
      axisDetails: {
        eyes: ['Canthal tilt matches'],
        nose: ['Nose width differs'],
      },
    };

    render(<FeatureDetailPanel narrative={narrative} congruenceScore={0.60} />);

    const eyesButton = screen.getByRole('button', { name: /eyes/i });
    const noseButton = screen.getByRole('button', { name: /nose/i });

    // Expand eyes
    await user.click(eyesButton);
    expect(screen.getByText('• Canthal tilt matches')).toBeInTheDocument();
    expect(screen.queryByText('• Nose width differs')).not.toBeInTheDocument();

    // Expand nose (eyes should collapse)
    await user.click(noseButton);
    expect(screen.queryByText('• Canthal tilt matches')).not.toBeInTheDocument();
    expect(screen.getByText('• Nose width differs')).toBeInTheDocument();
  });

  it('handles empty axis details gracefully', async () => {
    const user = userEvent.setup();

    const narrative: FeatureNarrative = {
      overall: 'Moderate similarity',
      featureSummaries: {
        eyes: 'Eyes are similar',
      },
      axisDetails: {
        eyes: [],
      },
    };

    render(<FeatureDetailPanel narrative={narrative} congruenceScore={0.70} />);

    const button = screen.getByRole('button', { name: /eyes/i });
    await user.click(button);

    // Should not render empty detail section
    const detailSection = screen.queryByText('•');
    expect(detailSection).not.toBeInTheDocument();
  });

  it('capitalizes feature names', () => {
    const narrative: FeatureNarrative = {
      overall: 'Moderate similarity',
      featureSummaries: {
        eyes: 'Similar',
        nose: 'Different',
        mouth: 'Partial match',
        jaw: 'Similar',
      },
      axisDetails: {
        eyes: [],
        nose: [],
        mouth: [],
        jaw: [],
      },
    };

    render(<FeatureDetailPanel narrative={narrative} congruenceScore={0.65} />);

    // All feature names should be present (capitalized by CSS)
    expect(screen.getByText('eyes')).toBeInTheDocument();
    expect(screen.getByText('nose')).toBeInTheDocument();
    expect(screen.getByText('mouth')).toBeInTheDocument();
    expect(screen.getByText('jaw')).toBeInTheDocument();
  });
});
