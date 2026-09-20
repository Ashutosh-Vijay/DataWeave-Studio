import { useState, useEffect, useMemo } from 'react';
import { pickRandomLoader } from './Loaders';
import { SeasonalEffects } from './SeasonalEffects';
import { activeSeason } from '../seasons';
import { applyAccentVars } from '../accents';

interface SplashScreenProps {
  isReady: boolean;
  hasError: boolean;
  /** Set only when this is a preview from Settings: the startup screen is
   *  otherwise impossible to look at without restarting the app. */
  onDismiss?: () => void;
}

const STAGES = [
  'Initializing...',
  'Loading editor components...',
  'Warming up DataWeave runtime...',
  'Almost ready...',
];

/** Resolve a CSS variable to a concrete color (the SVG loaders need real
 *  values, not `var(--accent)` strings). */
function readCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}


/**
 * The progress bar, dressed for the day.
 *
 * It is the one thing on the splash that is already moving, so it is the
 * cheapest place to put a festival — a candy cane for Christmas, a fuse of
 * lamps for Diwali, blood filling a tube for the vampire. Each returns a
 * background plus the keyframes that move it; the default is the accent flow
 * defined in index.css.
 */
function seasonalBar(id: string): { style: React.CSSProperties; css: string } | null {
  switch (id) {
    case 'christmas':
      // A candy cane is diagonal stripes travelling along the stick.
      return {
        style: {
          background: 'repeating-linear-gradient(115deg, oklch(56% 0.2 25) 0 9px, oklch(94% 0.015 240) 9px 18px)',
          backgroundSize: '38px 100%',
          animation: 'candyCane 0.9s linear infinite',
          boxShadow:
            'inset 0 0 0 1px oklch(56% 0.2 25 / 0.4), 0 0 10px color-mix(in oklch, oklch(56% 0.2 25) 45%, transparent)',
        },
        css: '@keyframes candyCane { to { background-position: 38px 0; } }',
      };
    case 'vampire':
      // Blood filling a glass tube: dark, wet, with a brighter leading edge.
      return {
        style: {
          background:
            'linear-gradient(90deg, oklch(30% 0.16 18) 0%, oklch(42% 0.21 20) 60%, oklch(58% 0.23 22) 100%)',
          boxShadow:
            'inset 0 1px 0 oklch(72% 0.18 20 / 0.45), 0 0 10px color-mix(in oklch, oklch(45% 0.21 20) 55%, transparent)',
        },
        css: '',
      };
    case 'diwali':
      // A string of lamps along a wire, lighting one after another.
      return {
        style: {
          background:
            'repeating-linear-gradient(90deg, oklch(88% 0.16 85) 0 3px, oklch(72% 0.18 55) 3px 7px, oklch(52% 0.12 50) 7px 16px)',
          backgroundSize: '32px 100%',
          animation: 'diyaString 1.1s linear infinite',
          boxShadow: '0 0 12px color-mix(in oklch, oklch(78% 0.17 65) 55%, transparent)',
        },
        css: '@keyframes diyaString { to { background-position: 32px 0; } }',
      };
    case 'holi':
      // Gulal: every colour at once, sliding.
      return {
        style: {
          background:
            'linear-gradient(90deg, oklch(70% 0.2 330), oklch(72% 0.19 25), oklch(80% 0.17 90), oklch(68% 0.17 145), oklch(65% 0.16 240), oklch(70% 0.2 330))',
          backgroundSize: '200% 100%',
          animation: 'splashFlow 1.8s linear infinite',
        },
        css: '',
      };
    case 'halloween':
      // Candy corn, in bands across the bar.
      return {
        style: {
          background:
            'repeating-linear-gradient(115deg, oklch(72% 0.19 55) 0 10px, oklch(88% 0.15 95) 10px 16px, oklch(93% 0.02 80) 16px 22px)',
          backgroundSize: '44px 100%',
          animation: 'candyCane 1.1s linear infinite',
          boxShadow:
            'inset 0 0 0 1px oklch(58% 0.17 50 / 0.4), 0 0 10px color-mix(in oklch, oklch(72% 0.19 55) 45%, transparent)',
        },
        css: '@keyframes candyCane { to { background-position: 44px 0; } }',
      };
    case 'newyear':
      // A fuse with a spark running along it.
      return {
        style: {
          background:
            'linear-gradient(90deg, oklch(55% 0.16 265) 0%, oklch(62% 0.17 285) 45%, oklch(92% 0.12 95) 92%, oklch(98% 0.06 95) 100%)',
          backgroundSize: '200% 100%',
          animation: 'splashFlow 1.2s linear infinite',
          boxShadow: '0 0 12px color-mix(in oklch, oklch(80% 0.15 90) 55%, transparent)',
        },
        css: '',
      };
    default:
      return null;
  }
}

export function SplashScreen({ isReady, hasError, onDismiss }: SplashScreenProps) {
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [showSlowSubtitle, setShowSlowSubtitle] = useState(false);

  // Hand off from the static index.html boot loader. The React splash is
  // mounted now, so we can drop the early HTML loader without a flash gap.
  useEffect(() => {
    document.getElementById('boot-loader')?.remove();
  }, []);

  // Pick one of three loaders, stable for this mount
  const Loader = useMemo(() => pickRandomLoader(), []);

  // A festival dresses the splash, and only the splash. The accent is written
  // straight onto <html> here so the loader, the progress bar and the glow all
  // pick it up — then put back when the splash lifts, because nobody asked for
  // their editor to change colour. Keeping it is a separate question, asked
  // once, by the offer in App.
  const season = useMemo(() => activeSeason(), []);
  const bar = useMemo(() => (season ? seasonalBar(season.id) : null), [season]);
  useEffect(() => {
    if (!season || hidden) return;
    const root = document.documentElement;
    const before = ['--accent', '--accent-hover', '--accent-dim', '--accent-border']
      .map((k) => [k, root.style.getPropertyValue(k)] as const);
    applyAccentVars(season.accent, !root.classList.contains('light'));
    return () => {
      for (const [k, v] of before) {
        if (v) root.style.setProperty(k, v);
        else root.style.removeProperty(k);
      }
    };
  }, [season, hidden]);
  // Resolve theme colors once so the SVG loaders render with the app's palette
  const colors = useMemo(() => ({
    accent: season ? `oklch(72% ${season.accent.chroma} ${season.accent.hue})` : readCssVar('--accent', '#10b981'),
    fg: readCssVar('--content', '#f3efe6'),
  }), [season]);

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

  // After 5 seconds without ready, surface a "still loading" subtitle so
  // the user knows we're alive and waiting on the JVM rather than frozen.
  // Slow corporate laptops with AV scanning every spawned process can take
  // 8-15s for the JVM to come up.
  useEffect(() => {
    if (isReady || hasError) return;
    const t = setTimeout(() => setShowSlowSubtitle(true), 5000);
    return () => clearTimeout(t);
  }, [isReady, hasError]);

  if (hidden) return null;

  return (
    <div
      className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-bg transition-opacity duration-500 ${
        fadeOut ? 'opacity-0' : 'opacity-100'
      }`}
      onClick={onDismiss}
      style={onDismiss ? { cursor: 'pointer' } : undefined}
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

      {/* The festival, behind everything and over nothing. */}
      {season && <SeasonalEffects variants={season.effects} intensity="full" />}

      {/* Loader centerpiece */}
      <div className="relative" style={{ width: 280, height: 280 }}>
        <Loader accent={colors.accent} fg={colors.fg} size={280} />
      </div>

      {/* Title */}
      <h1 className="text-2xl font-bold text-content tracking-tight mt-8 mb-1 relative">
        DataWeave Studio
      </h1>
      <p className="text-sm text-content-faint mb-10 relative">
        {season ? season.greeting : 'Desktop Edition'}
      </p>

      {/* Progress bar */}
      <div className="w-72 relative mb-4">
        <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-200 ease-out${bar ? '' : ' splash-progress-bar'}`}
            style={{ width: `${progress}%`, ...(bar?.style ?? {}) }}
          />
          {bar?.css && <style>{bar.css}</style>}
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

      {onDismiss && (
        <div className="text-[11px] text-content-ghost mt-3 relative">Click anywhere to close</div>
      )}

      {/* Slow-boot reassurance */}
      {showSlowSubtitle && !isReady && !hasError && (
        <div
          className="text-[11px] text-content-ghost mt-3 text-center max-w-[340px] leading-relaxed relative"
          style={{ animation: 'fadeIn 400ms ease-out' }}
        >
          The DataWeave runtime takes a few extra seconds on slow / heavily-monitored
          machines. Hang tight — this is a one-time per-launch cost.
          <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        </div>
      )}
    </div>
  );
}
