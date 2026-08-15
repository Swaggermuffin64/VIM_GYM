import React, { useEffect, useRef } from 'react';

interface RaceCountdownProps {
  seconds: number;
}

const colors = {
  accent: '#a78bfa',
  accentLight: '#c4b5fd',
  textPrimary: '#f1f5f9',
};

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(10, 10, 15, 0.92)',
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
    backdropFilter: 'blur(4px)',
  },
  countdown: {
    fontSize: '180px',
    fontWeight: 900,
    fontFamily: '"JetBrains Mono", monospace',
    color: colors.textPrimary,
    textShadow: `0 0 60px ${colors.accent}80, 0 0 120px ${colors.accent}40`,
    animation: 'countdownPulse 1s ease-in-out',
  },
  go: {
    color: colors.accentLight,
    textShadow: `0 0 60px ${colors.accent}, 0 0 120px ${colors.accent}80`,
  },
  label: {
    fontSize: '18px',
    fontWeight: 500,
    fontFamily: '"JetBrains Mono", monospace',
    color: colors.accent,
    marginTop: '24px',
    letterSpacing: '4px',
    textTransform: 'uppercase' as const,
  },
};

let sharedAudioContext: AudioContext | null = null;
let audioUnlockListenersInstalled = false;

function getOrCreateAudioContext(): AudioContext | null {
  if (sharedAudioContext) return sharedAudioContext;
  const Ctx =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!Ctx) return null;
  sharedAudioContext = new Ctx();
  return sharedAudioContext;
}

function installGlobalAudioUnlockListeners(): void {
  if (audioUnlockListenersInstalled || typeof window === 'undefined') return;
  audioUnlockListenersInstalled = true;

  const unlockAudio = () => {
    const ctx = getOrCreateAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
  };

  window.addEventListener('pointerdown', unlockAudio, true);
  window.addEventListener('keydown', unlockAudio, true);
}

function playCountdownTick(ctx: AudioContext, second: number): void {
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();

  oscillator.type = 'sine';
  oscillator.frequency.value = second === 0 ? 880 : 660;

  const duration = second === 0 ? 0.22 : 0.14;
  const now = ctx.currentTime;

  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  oscillator.connect(gain);
  gain.connect(ctx.destination);
  oscillator.start(now);
  oscillator.stop(now + duration);
}

installGlobalAudioUnlockListeners();

export const RaceCountdown: React.FC<RaceCountdownProps> = ({ seconds }) => {
  const lastPlayedSecondRef = useRef<number | null>(null);

  useEffect(() => {
    if (lastPlayedSecondRef.current === seconds) return;
    lastPlayedSecondRef.current = seconds;

    // Browser autoplay policies can block audio until user interaction;
    // silently skip in that case so countdown UI still works normally.
    void (async () => {
      try {
        const ctx = getOrCreateAudioContext();
        if (!ctx) return;

        if (ctx.state === 'suspended') {
          await ctx.resume();
        }

        if (ctx.state !== 'running') return;
        playCountdownTick(ctx, seconds);
      } catch {
        // No-op: sound is optional polish, not core gameplay behavior.
      }
    })();
  }, [seconds]);

  return (
    <div style={styles.overlay}>
      <style>
        {`
          @keyframes countdownPulse {
            0% { transform: scale(0.5); opacity: 0; }
            50% { transform: scale(1.05); opacity: 1; }
            100% { transform: scale(1); opacity: 1; }
          }
        `}
      </style>
      <div
        key={seconds}
        style={{
          ...styles.countdown,
          ...(seconds === 0 ? styles.go : {}),
        }}
      >
        {seconds === 0 ? 'GO!' : seconds}
      </div>
      {seconds > 0 && <div style={styles.label}>Get Ready</div>}
    </div>
  );
};
