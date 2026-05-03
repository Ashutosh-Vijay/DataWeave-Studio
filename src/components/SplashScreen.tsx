import { useState, useEffect, useMemo } from 'react';
import { pickRandomLoader } from './Loaders';

interface SplashScreenProps {
  isReady: boolean;
  hasError: boolean;
}

const STAGES = [
  'Initializing...',
  'Loading editor components...',
  'Warming up DataWeave CLI...',
  'Almost ready...',
];

/** Resolve a CSS variable to a concrete color (the SVG loaders need real
 *  values, not `var(--accent)` strings). */
function readCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export function SplashScreen({ isReady, hasError }: SplashScreenProps) {
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);
  const [hidden, setHidden] = useState(false);

  // Pick one of three loaders, stable for this mount
  const Loader = useMemo(() => pickRandomLoader(), []);
  // Resolve theme colors once so the SVG loaders render with the app's palette
  const colors = useMemo(() => ({
    accent: readCssVar('--accent', '#10b981'),
    fg: readCssVar('--content', '#f3efe6'),
  }), []);

  useEffect(() => {
    if (hidden) return;
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (isReady || hasError) {
          const next = prev + (100 - prev) * 0.3;
          return next >= 99.5 ? 100 : next;
        }
        if (prev < 25) return prev + 2.5;
        if (prev < 50) return prev + 1.2;
        if (prev < 70) return prev + 0.6;
        if (prev < 85) return prev + 0.2;
        return prev;
      });
    }, 80);
    return () => clearInterval(interval);
  }, [isReady, hasError, hidden]);

  useEffect(() => {
    if (progress < 15) setStage(0);
    else if (progress < 45) setStage(1);
    else if (progress < 90) setStage(2);
    else setStage(3);
  }, [progress]);

  useEffect(() => {
    if (progress >= 100 && !fadeOut) {
      setFadeOut(true);
      setTimeout(() => setHidden(true), 600);
    }
  }, [progress, fadeOut]);

  if (hidden) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-bg transition-opacity duration-500 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Atmospheric background */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(1200px 800px at 50% 50%, color-mix(in oklch, var(--content) 3%, transparent), transparent 70%),' +
            'radial-gradient(600px 400px at 50% 110%, color-mix(in oklch, var(--accent) 6%, transparent), transparent 70%)',
        }}
      />

      {/* Loader centerpiece */}
      <div className="relative" style={{ width: 280, height: 280 }}>
        <Loader accent={colors.accent} fg={colors.fg} size={280} />
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-content tracking-tight mt-8 mb-1 relative">
        DataWeave Studio
      </h1>
      <p className="text-sm text-content-faint mb-10 relative">Desktop Edition</p>

      {/* Progress bar */}
      <div className="w-72 relative mb-4">
        <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
          <div
            className="h-full rounded-full splash-progress-bar transition-all duration-200 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Status text */}
      <div className="flex items-center gap-2 relative">
        <span className="text-xs text-content-muted">
          {hasError ? 'Started with warnings' : STAGES[stage]}
        </span>
        <span className="text-xs text-content-ghost ml-1 font-mono">
          {Math.round(progress)}%
        </span>
      </div>
    </div>
  );
}
