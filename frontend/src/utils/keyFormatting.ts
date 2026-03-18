import type { Task, TaskType } from '../types/task';
import type { KeystrokeEvent } from '../types/keystroke';

export function formatKeyLabel(key: string): string | null {
  if (key === ' ') return 'Space';
  if (key === 'Backspace') return '←';
  if (key === 'Escape') return 'Esc';
  if (key === 'ArrowLeft') return 'Left';
  if (key === 'ArrowRight') return 'Right';
  if (key === 'ArrowUp') return 'Up';
  if (key === 'ArrowDown') return 'Down';
  if (key === 'Control') return 'Ctrl';
  if (key === 'Meta') return null;
  if (key === 'Alt') return 'Alt';
  if (key === 'Shift') return 'Shift';
  return key;
}

export function formatTaskTypeLabel(taskType: TaskType): string {
  if (taskType === 'navigate') return 'Navigate';
  if (taskType === 'delete') return 'Delete';
  if (taskType === 'insert') return 'Insert';
  return 'Change';
}

export function expandRecommendedSequence(recommendedSequence: string[]): string[] {
  return recommendedSequence.flatMap((token) => token.split(''));
}

export function formatKeysForDisplay(keys: string[]): string {
  const toDisplayToken = (token: string): string => {
    if (token === 'Backspace') return '←';
    return token;
  };
  const isFindLikeMotion = (token: string | undefined): boolean => {
    return token === 'f' || token === 'F' || token === 't' || token === 'T';
  };

  const compacted: string[] = [];
  let i = 0;
  while (i < keys.length) {
    const key = keys[i];
    if (!key) {
      i += 1;
      continue;
    }
    const previousKey = i > 0 ? keys[i - 1] : undefined;
    if (/^[1-9]$/.test(key) && !isFindLikeMotion(previousKey)) {
      let countToken = key;
      let j = i + 1;
      while (j < keys.length && /^[0-9]$/.test(keys[j] ?? '')) {
        countToken += keys[j];
        j += 1;
      }
      compacted.push(toDisplayToken(countToken));
      i = j;
      continue;
    }
    compacted.push(toDisplayToken(key));
    i += 1;
  }
  return compacted.join(' ');
}

export function buildKeySequence(events: KeystrokeEvent[], maxVisible = 30): string {
  const keyLabels = events
    .map((event) => formatKeyLabel(event.key))
    .filter((label): label is string => Boolean(label));
  if (keyLabels.length <= maxVisible) {
    return formatKeysForDisplay(keyLabels);
  }
  return `${formatKeysForDisplay(keyLabels.slice(0, maxVisible))} ... (+${keyLabels.length - maxVisible})`;
}

export function buildOptimalInfo(task: Task): { optimalSequence?: string; ourSolutionKeyCount?: number } {
  const hasOptimal =
    Array.isArray(task.recommendedSequence) &&
    typeof task.recommendedWeight === 'number';
  if (!hasOptimal) return {};

  const optimalKeys = task.recommendedSequence as string[];
  const expandedOptimalKeys = expandRecommendedSequence(optimalKeys);
  const displayOptimalKeys = expandedOptimalKeys.map((key) => (key === ' ' ? 'Space' : key));
  return {
    optimalSequence: formatKeysForDisplay(displayOptimalKeys),
    ourSolutionKeyCount: expandedOptimalKeys.length,
  };
}
