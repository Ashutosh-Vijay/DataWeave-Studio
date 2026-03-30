import { useState, useEffect } from 'react';

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

export function SplashScreen({ isReady, hasError }: SplashScreenProps) {
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);
  const [hidden, setHidden] = useState(false);

  // Simulated progress that accelerates when actually ready
  useEffect(() => {
    if (hidden) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (isReady || hasError) {
          // Fast-forward to 100
          const next = prev + (100 - prev) * 0.3;
          return next >= 99.5 ? 100 : next;
        }
        // Slow climb: fast at first, decelerates approaching 85%
        if (prev < 25) return prev + 2.5;
        if (prev < 50) return prev + 1.2;
        if (prev < 70) return prev + 0.6;
        if (prev < 85) return prev + 0.2;
        return prev; // Stall at 85% until ready
      });
    }, 80);

    return () => clearInterval(interval);
  }, [isReady, hasError, hidden]);

  // Update stage text based on progress
  useEffect(() => {
    if (progress < 15) setStage(0);
    else if (progress < 45) setStage(1);
    else if (progress < 90) setStage(2);
    else setStage(3);
  }, [progress]);

  // Fade out when progress hits 100
  useEffect(() => {
    if (progress >= 100 && !fadeOut) {
      setFadeOut(true);
      setTimeout(() => setHidden(true), 600);
    }
  }, [progress, fadeOut]);

  if (hidden) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#080C18] transition-opacity duration-500 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
    >
      {/* Subtle animated background particles */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="splash-particles" />
      </div>

      {/* Logo */}
      <div className="relative mb-8">
        {/* Glow behind logo */}
        <div className="absolute inset-0 scale-150 rounded-3xl bg-gradient-to-br from-[#00D4FF]/10 to-[#7C3AED]/10 blur-3xl" />
        <img
          src="/logo.svg"
          alt="DataWeave Studio"
          width="140"
          height="140"
          className="relative rounded-2xl splash-logo"
        />
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-white tracking-tight mb-1 relative">
        DataWeave Studio
      </h1>
      <p className="text-sm text-gray-500 mb-10 relative">Desktop Edition</p>

      {/* Progress bar */}
      <div className="w-72 relative mb-4">
        {/* Track */}
        <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
          {/* Fill with flowing animation */}
          <div
            className="h-full rounded-full splash-progress-bar transition-all duration-200 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Status text */}
      <div className="flex items-center gap-2 relative">
        {progress < 100 && (
          <div className="w-3 h-3 rounded-full border-2 border-t-transparent border-[#00D4FF] animate-spin" />
        )}
        <span className="text-xs text-gray-400">
          {hasError ? 'Started with warnings' : STAGES[stage]}
        </span>
        <span className="text-xs text-gray-600 ml-1">
          {Math.round(progress)}%
        </span>
      </div>
    </div>
  );
}
