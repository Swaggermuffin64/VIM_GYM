import React from 'react';
import { Task } from '../types/task';

interface TaskBannerProps {
  task: Task | null;
  isComplete: boolean;
  onNextTask: () => void;
  taskProgress?: number;
  numTasks?: number;
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '16px 24px',
    marginBottom: '16px',
    borderRadius: '8px',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
    border: '1px solid #0f3460',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '8px',
  },
  taskType: {
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '1px',
    color: '#ff6b6b',
    background: 'rgba(255, 107, 107, 0.1)',
    padding: '4px 8px',
    borderRadius: '4px',
  },
  description: {
    fontSize: '18px',
    fontWeight: 500,
    color: '#e0e0e0',
    fontFamily: '"JetBrains Mono", "Fira Code", monospace',
  },
  complete: {
    background: 'linear-gradient(135deg, #0a3d2e 0%, #16213e 100%)',
    border: '1px solid #00ff88',
  },
  completeText: {
    color: '#00ff88',
  },
  button: {
    padding: '8px 16px',
    fontSize: '14px',
    fontWeight: 600,
    color: '#1a1a2e',
    background: '#00ff88',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
  },
  hint: {
    marginTop: '8px',
    fontSize: '13px',
    color: '#888',
    fontStyle: 'italic',
  },
};

export const TaskBanner: React.FC<TaskBannerProps> = ({
  task,
  isComplete,
  onNextTask,
  taskProgress,
  numTasks,
}) => {
  if (!task) {
    return (
      <div style={styles.container}>
        <div style={styles.description}>Loading task...</div>
      </div>
    );
  }

  const showProgress = taskProgress !== undefined && numTasks !== undefined;
  const taskLabel = task.type === 'navigate' ? 'Navigate' : 'Delete';

  return (
    <div
      style={{ ...styles.container, ...(isComplete ? styles.complete : {}) }}
    >
      <div style={styles.header}>
        <span style={styles.taskType}>
          {taskLabel}
          {showProgress && ` (${taskProgress + 1}/${numTasks})`}
        </span>
        {isComplete && (
          <button style={styles.button} onClick={onNextTask}>
            Next Task →
          </button>
        )}
      </div>
      <div
        style={{
          ...styles.description,
          ...(isComplete ? styles.completeText : {}),
        }}
      >
        {isComplete ? 'Complete! ' : ''}
        {task.description}
      </div>
      {!isComplete && task.type === 'navigate' && (
        <div style={styles.hint}>
          Use vim motions like <code>gg</code>, <code>G</code>, <code>w</code>,{' '}
          <code>f</code>, <code>$</code> to navigate
        </div>
      )}
      {!isComplete && task.type === 'delete' && (
        <div style={styles.hint}>
          Use vim delete commands like <code>dw</code>, <code>dd</code>,{' '}
          <code>d$</code>, <code>di{'{'}</code>, <code>da(</code> to delete
        </div>
      )}
      {isComplete && (
        <div style={styles.hint}>
          Press <code>Enter</code> for next task
        </div>
      )}
    </div>
  );
};
