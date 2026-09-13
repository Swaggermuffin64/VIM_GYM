// @vitest-environment jsdom
/**
 * Tests for SessionCompleteSummary, the post-race results view shared by
 * practice and daily modes. Practice shows the full per-task breakdown
 * (solutions, discrepancies, replay sandboxes) plus the aggregate stats row
 * and restart/home buttons; daily turns all of that off via
 * config.showTaskBreakdown so the end screen is only the mode's completion
 * extras.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { cleanup, render as rtlRender, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type {
  RaceSessionConfig,
  RaceCompletionInfo,
} from '../racing/raceSessionConfig';
import type { PositionTask, TaskSummary } from '../types/task';

// The replay sandbox mounts a real CodeMirror editor; stub it out.
vi.mock('./SummaryTaskSandbox', () => ({
  SummaryTaskSandbox: () => <div data-testid="task-sandbox" />,
}));

const { SessionCompleteSummary } = await import('./SessionCompleteSummary');

function makeTask(id: string): PositionTask {
  return {
    id,
    type: 'navigate',
    description: 'Move to the target',
    codeSnippet: 'const x = 1;',
    targetPosition: { line: 1, col: 4 },
    targetOffset: 4,
  };
}

function makeTaskSummary(id: string): TaskSummary {
  return {
    taskIndex: 1,
    taskId: id,
    taskType: 'navigate',
    task: makeTask(id),
    durationMs: 2000,
    keyCount: 6,
    keySequence: 'w w e',
    optimalSequence: 'f x',
    ourSolutionKeyCount: 2,
  };
}

function makeConfig(overrides: Partial<RaceSessionConfig>): RaceSessionConfig {
  return {
    mode: 'practice',
    title: 'Practice Mode',
    subtitle: 'sub',
    summaryTitle: 'Practice Summary',
    showTaskBreakdown: true,
    fetchSession: async () => ({ tasks: [], gameId: null }),
    submitCompletion: async () => null,
    allowNewTasks: true,
    allowSameTasksReplay: true,
    ...overrides,
  };
}

function renderSummary({
  config,
  completionInfo = null,
}: {
  config: RaceSessionConfig;
  completionInfo?: RaceCompletionInfo | null;
}) {
  return rtlRender(
    <MemoryRouter>
      <SessionCompleteSummary
        config={config}
        completionInfo={completionInfo}
        finalTimeMs={12300}
        taskSummaries={[makeTaskSummary('t1')]}
        onRestartSameTasks={() => {}}
        onRestartNewTasks={() => {}}
      />
    </MemoryRouter>
  );
}

afterEach(() => {
  cleanup();
});

describe('SessionCompleteSummary', () => {
  it('shows the mode summary title and total time', () => {
    renderSummary({ config: makeConfig({ summaryTitle: 'Race Summary' }) });
    expect(screen.getByText('Race Summary')).toBeInTheDocument();
    expect(screen.getByText('Total Time')).toBeInTheDocument();
    expect(screen.getByText('12.3s')).toBeInTheDocument();
  });

  it('shows the per-task breakdown with solutions when showTaskBreakdown is true', () => {
    renderSummary({ config: makeConfig({ showTaskBreakdown: true }) });
    expect(screen.getByText('Your Solution')).toBeInTheDocument();
    expect(screen.getByText('Our Solution')).toBeInTheDocument();
    expect(screen.getByText('Discrepancy')).toBeInTheDocument();
    expect(screen.getByText('Avg Discrepancy')).toBeInTheDocument();
    expect(screen.getByTestId('task-sandbox')).toBeInTheDocument();
  });

  it('hides the breakdown, the stats row, and Home when showTaskBreakdown is false', () => {
    renderSummary({
      config: makeConfig({
        showTaskBreakdown: false,
        renderCompletionExtras: () => (
          <div data-testid="mode-extras">extras</div>
        ),
      }),
    });
    expect(screen.queryByText('Your Solution')).not.toBeInTheDocument();
    expect(screen.queryByText('Our Solution')).not.toBeInTheDocument();
    expect(screen.queryByText('Discrepancy')).not.toBeInTheDocument();
    expect(screen.queryByTestId('task-sandbox')).not.toBeInTheDocument();
    // The aggregate stats row and navigation buttons are the mode's clutter;
    // its extras carry the whole screen.
    expect(screen.queryByText('Total Time')).not.toBeInTheDocument();
    expect(screen.queryByText('Avg Keys/s')).not.toBeInTheDocument();
    expect(screen.queryByText('Avg Keys')).not.toBeInTheDocument();
    expect(screen.queryByText('Avg Discrepancy')).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Home' })
    ).not.toBeInTheDocument();
    expect(screen.getByTestId('mode-extras')).toBeInTheDocument();
  });

  it('passes the final time to the mode completion extras', () => {
    const renderCompletionExtras = vi.fn(() => null);
    renderSummary({ config: makeConfig({ renderCompletionExtras }) });
    expect(renderCompletionExtras).toHaveBeenCalledWith(null, 12300);
  });

  it('hides the restart buttons when the mode disallows them', () => {
    renderSummary({
      config: makeConfig({
        allowNewTasks: false,
        allowSameTasksReplay: false,
      }),
    });
    expect(screen.queryByText('Restart')).not.toBeInTheDocument();
    expect(screen.queryByText('Restart Same Tasks')).not.toBeInTheDocument();
  });

  it('renders the mode completion extras', () => {
    renderSummary({
      config: makeConfig({
        renderCompletionExtras: () => (
          <div data-testid="mode-extras">extras</div>
        ),
      }),
    });
    expect(screen.getByTestId('mode-extras')).toBeInTheDocument();
  });
});
