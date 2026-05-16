import { useState, useEffect, useCallback, useRef } from 'react';

const TOUR_SEEN_KEY = 'dwstudio_tour_seen';

interface WelcomeTourProps {
  onComplete: () => void;
}

interface TourStep {
  target: string | null; // data-tour selector, null = centered welcome
  title: string;
  description: string;
  tip?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
}

const STEPS: TourStep[] = [
  {
    target: null,
    title: 'Welcome to DataWeave Studio',
    description:
      'A fast, local workbench for DataWeave 2.0 — write, run, and iterate on transforms entirely on your machine. JSON, XML, CSV, multipart, YAML, NDJSON, Java Properties — all parsed locally by the bundled DataWeave 2.11 runtime.',
  },
  {
    target: 'sidebar',
    title: 'Sidebar — your toolbox',
    description:
      'Snippets, function reference, cURL import, secure properties, message flow designer — every tool lives here. Click an icon to dock its panel; ⌘B toggles the whole rail.',
    tip: 'New: the Message Flow designer (chain icon) lets you wire transforms together as a pipeline.',
    placement: 'right',
  },
  {
    target: 'script-editor',
    title: 'Script editor',
    description:
      'Write DataWeave with syntax highlighting, autocomplete (300+ functions from the official docs), inline error markers, and hover docs. Toggle Auto-run for live preview, or hit ⌘↵ from the editor to run manually.',
    tip: 'The node-label chip beside the project name picks the script\'s role — Transform, Salesforce Query, DB Query — and swaps to a relevant starter template.',
    placement: 'right',
  },
  {
    target: 'payload',
    title: 'Payload & named inputs',
    description:
      'Set your input data and MIME type here. Add named inputs for multi-source transforms, attach binary files, or build multipart/form-data payloads with the parts editor.',
    tip: 'Paste raw data, pick the MIME, run — no files needed. Use the file-attach icon to load larger payloads off disk.',
    placement: 'right',
  },
  {
    target: 'context-panel',
    title: 'Context: Request · Vars · Config',
    description:
      'Simulate HTTP request attributes (method, headers, query params), define variables, and paste config / secure-config YAML. Each tab badges its active count so you see what\'s wired in.',
    tip: '⌘⇧E opens the Secure Properties tool — encrypt/decrypt values for ${secure::key} placeholders.',
    placement: 'left',
  },
  {
    target: 'output',
    title: 'Output',
    description:
      'See results as formatted JSON, XML, or raw text. Copy or export with one click. Errors show the exact line, a source snippet, and a collapsible Java stack trace.',
    placement: 'left',
  },
  {
    target: 'run-controls',
    title: 'Run controls',
    description:
      'Hit Run (⌘↵ in the editor) or flip on Auto (⌘⇧R) to re-execute 1.5s after you stop typing. The dot indicator turns green once the engine is warm — first launch takes ~2-3s.',
    tip: '⌘. cancels a running script. Long-running scripts have a 30s default timeout you can change in Settings.',
    placement: 'bottom',
  },
  {
    target: 'palette',
    title: 'Command palette — your launchpad',
    description:
      'Press ⌘K to search every action: run, save, open, theme, layout, snippets, settings, function reference, flow designer. Two layouts: Workbench (⌘⇧1) and Focus (⌘⇧2).',
    tip: '⌘/ shows all keyboard shortcuts · ⌘⇧T toggles dark/light theme · ⌘N for a fresh workspace.',
    placement: 'bottom',
  },
];

const PADDING = 8;
const TOOLTIP_GAP = 12;
const TOOLTIP_WIDTH = 360;

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function getTargetRect(target: string): Rect | null {
  const el = document.querySelector(`[data-tour="${target}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return {
    top: r.top - PADDING,
    left: r.left - PADDING,
    width: r.width + PADDING * 2,
    height: r.height + PADDING * 2,
  };
}

type ResolvedPlacement = 'top' | 'bottom' | 'left' | 'right';

function resolveTooltipPlacement(
  rect: Rect,
  preferred: TourStep['placement']
): ResolvedPlacement {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (preferred && preferred !== 'auto') {
    // Check if preferred placement has enough space
    if (preferred === 'right' && rect.left + rect.width + TOOLTIP_GAP + TOOLTIP_WIDTH < vw) return 'right';
    if (preferred === 'left' && rect.left - TOOLTIP_GAP - TOOLTIP_WIDTH > 0) return 'left';
    if (preferred === 'bottom' && rect.top + rect.height + TOOLTIP_GAP + 200 < vh) return 'bottom';
    if (preferred === 'top' && rect.top - TOOLTIP_GAP - 200 > 0) return 'top';
  }

  // Auto: pick the side with most space
  const spaceRight = vw - (rect.left + rect.width);
  const spaceLeft = rect.left;
  const spaceBottom = vh - (rect.top + rect.height);
  const spaceTop = rect.top;

  const max = Math.max(spaceRight, spaceLeft, spaceBottom, spaceTop);
  if (max === spaceRight && spaceRight > TOOLTIP_WIDTH + TOOLTIP_GAP) return 'right';
  if (max === spaceLeft && spaceLeft > TOOLTIP_WIDTH + TOOLTIP_GAP) return 'left';
  if (max === spaceBottom) return 'bottom';
  return 'top';
}

function getTooltipStyle(rect: Rect, placement: ResolvedPlacement): React.CSSProperties {
  const style: React.CSSProperties = {
    position: 'fixed',
    width: TOOLTIP_WIDTH,
    zIndex: 52,
  };

  switch (placement) {
    case 'right':
      style.left = rect.left + rect.width + TOOLTIP_GAP;
      style.top = rect.top + rect.height / 2;
      style.transform = 'translateY(-50%)';
      break;
    case 'left':
      style.left = rect.left - TOOLTIP_GAP - TOOLTIP_WIDTH;
      style.top = rect.top + rect.height / 2;
      style.transform = 'translateY(-50%)';
      break;
    case 'bottom':
      style.left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
      style.top = rect.top + rect.height + TOOLTIP_GAP;
      break;
    case 'top':
      style.left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
      style.top = rect.top - TOOLTIP_GAP;
      style.transform = 'translateY(-100%)';
      break;
  }

  // Clamp horizontal position
  const left = typeof style.left === 'number' ? style.left : 0;
  if (left < 12) style.left = 12;
  if (left + TOOLTIP_WIDTH > window.innerWidth - 12) {
    style.left = window.innerWidth - TOOLTIP_WIDTH - 12;
  }

  return style;
}

function getArrowStyle(placement: ResolvedPlacement): React.CSSProperties & { borderSide: string } {
  const size = 8;
  const style: React.CSSProperties & { borderSide: string } = {
    position: 'absolute',
    width: 0,
    height: 0,
    borderSide: '',
  };

  switch (placement) {
    case 'right':
      style.left = -size;
      style.top = '50%';
      style.transform = 'translateY(-50%)';
      style.borderTop = `${size}px solid transparent`;
      style.borderBottom = `${size}px solid transparent`;
      style.borderRight = `${size}px solid color-mix(in oklch, var(--accent) 35%, transparent)`;
      style.borderSide = 'right';
      break;
    case 'left':
      style.right = -size;
      style.top = '50%';
      style.transform = 'translateY(-50%)';
      style.borderTop = `${size}px solid transparent`;
      style.borderBottom = `${size}px solid transparent`;
      style.borderLeft = `${size}px solid color-mix(in oklch, var(--accent) 35%, transparent)`;
      style.borderSide = 'left';
      break;
    case 'bottom':
      style.top = -size;
      style.left = '50%';
      style.transform = 'translateX(-50%)';
      style.borderLeft = `${size}px solid transparent`;
      style.borderRight = `${size}px solid transparent`;
      style.borderBottom = `${size}px solid color-mix(in oklch, var(--accent) 35%, transparent)`;
      style.borderSide = 'bottom';
      break;
    case 'top':
      style.bottom = -size;
      style.left = '50%';
      style.transform = 'translateX(-50%)';
      style.borderLeft = `${size}px solid transparent`;
      style.borderRight = `${size}px solid transparent`;
      style.borderTop = `${size}px solid color-mix(in oklch, var(--accent) 35%, transparent)`;
      style.borderSide = 'top';
      break;
  }

  return style;
}

export function WelcomeTour({ onComplete }: WelcomeTourProps) {
  const [step, setStep] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const rafRef = useRef(0);
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isFirst = step === 0;

  // Measure target element position — tracks layout changes
  const measureTarget = useCallback(() => {
    if (!current.target) {
      setTargetRect(null);
      return;
    }
    const rect = getTargetRect(current.target);
    setTargetRect(rect);
  }, [current.target]);

  useEffect(() => {
    measureTarget();

    const onResize = () => measureTarget();
    window.addEventListener('resize', onResize);

    // Re-measure on animation frame for smooth tracking
    let running = true;
    const tick = () => {
      if (!running) return;
      measureTarget();
      rafRef.current = requestAnimationFrame(tick);
    };
    // Only poll for a short time after step change to catch layout shifts
    rafRef.current = requestAnimationFrame(tick);
    const timeout = setTimeout(() => { running = false; }, 500);

    return () => {
      window.removeEventListener('resize', onResize);
      cancelAnimationFrame(rafRef.current);
      clearTimeout(timeout);
      running = false;
    };
  }, [measureTarget, step]);

  // Keyboard nav
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onComplete();
      if (e.key === 'ArrowRight' || e.key === 'Enter') {
        if (isLast) onComplete();
        else setStep((s) => s + 1);
      }
      if (e.key === 'ArrowLeft' && !isFirst) setStep((s) => s - 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isLast, isFirst, onComplete]);

  const isCentered = !current.target || !targetRect;
  const placement = targetRect ? resolveTooltipPlacement(targetRect, current.placement) : 'bottom';

  // SVG overlay with cutout
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  return (
    <div className="fixed inset-0 z-50" onClick={onComplete}>
      {/* Dark overlay with cutout hole */}
      <svg
        className="fixed inset-0 w-full h-full"
        style={{ zIndex: 51 }}
        onClick={(e) => e.stopPropagation()}
        pointerEvents="none"
      >
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {targetRect && (
              <rect
                x={targetRect.left}
                y={targetRect.top}
                width={targetRect.width}
                height={targetRect.height}
                rx={8}
                fill="black"
                className="transition-all duration-300 ease-in-out"
              />
            )}
          </mask>
        </defs>
        <rect
          width={vw}
          height={vh}
          fill="rgba(0, 0, 0, 0.75)"
          mask="url(#tour-mask)"
        />
        {/* Spotlight glow border */}
        {targetRect && (
          <rect
            x={targetRect.left}
            y={targetRect.top}
            width={targetRect.width}
            height={targetRect.height}
            rx={8}
            fill="none"
            stroke="color-mix(in oklch, var(--accent) 45%, transparent)"
            strokeWidth={2}
            className="transition-all duration-300 ease-in-out"
          />
        )}
      </svg>

      {/* Tooltip — either centered or positioned near target */}
      {isCentered ? (
        /* Centered welcome card */
        <div
          className="fixed inset-0 flex items-center justify-center"
          style={{ zIndex: 52 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="bg-surface border border-line rounded-2xl shadow-2xl w-[520px] max-w-[90vw] overflow-hidden">
            {/* Window chrome */}
            <div className="h-9 shrink-0 flex items-center px-3.5 bg-rail border-b border-line">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full" style={{ background: '#ff5f57' }} />
                <span className="w-3 h-3 rounded-full" style={{ background: '#febc2e' }} />
                <span className="w-3 h-3 rounded-full" style={{ background: '#28c840' }} />
              </div>
              <span className="flex-1" />
              <span className="font-mono text-[10.5px] text-content-faint">DataWeave Studio · Tour</span>
              <span className="flex-1" />
            </div>
            <div className="px-8 py-7">
              {/* Brand lockup */}
              <div className="flex items-center gap-4 mb-5">
                <img
                  src="/logo.svg"
                  alt="DataWeave Studio"
                  width="48"
                  height="48"
                  className="shrink-0"
                  style={{ filter: 'drop-shadow(0 8px 24px color-mix(in oklch, var(--accent) 25%, transparent))' }}
                />
                <div>
                  <h2 className="text-[20px] font-semibold text-content tracking-tight leading-tight">{current.title}</h2>
                  <div className="text-[10.5px] text-content-faint mt-1 uppercase tracking-[0.6px] font-semibold">
                    Step {step + 1} of {STEPS.length}
                  </div>
                </div>
              </div>
              <p className="text-[13px] text-content-secondary leading-relaxed mb-5">{current.description}</p>
              <TourNav
                step={step}
                total={STEPS.length}
                isFirst={isFirst}
                isLast={isLast}
                onPrev={() => setStep(step - 1)}
                onNext={() => (isLast ? onComplete() : setStep(step + 1))}
                onSkip={onComplete}
                onDotClick={setStep}
              />
            </div>
          </div>
        </div>
      ) : (
        /* Positioned tooltip near spotlight */
        <div
          style={getTooltipStyle(targetRect!, placement)}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Arrow */}
          <div style={getArrowStyle(placement)} />

          <div className="bg-surface border border-line rounded-xl shadow-2xl overflow-hidden">
            {/* Progress bar */}
            <div className="h-1 bg-surface-2">
              <div
                className="h-full bg-gradient-to-r from-[var(--accent)] to-[var(--cyan)] transition-all duration-300"
                style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
              />
            </div>

            <div className="px-5 py-4">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-bold text-content">{current.title}</h3>
                <span className="text-[9px] text-content-ghost shrink-0 ml-2">
                  {step + 1}/{STEPS.length}
                </span>
              </div>
              <p className="text-xs text-content-secondary leading-relaxed mb-3">
                {current.description}
              </p>
              {current.tip && (
                <div className="bg-accent-dim border border-accent-border rounded-lg px-3 py-2 mb-3 flex items-start gap-2">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="var(--accent)" className="mt-0.5 shrink-0">
                    <path d="M8 1a7 7 0 110 14A7 7 0 018 1zm0 3a.75.75 0 00-.75.75v4.5a.75.75 0 001.5 0v-4.5A.75.75 0 008 4zm0 8a1 1 0 100-2 1 1 0 000 2z"/>
                  </svg>
                  <span className="text-[11px] text-accent leading-relaxed">{current.tip}</span>
                </div>
              )}
              <TourNav
                step={step}
                total={STEPS.length}
                isFirst={isFirst}
                isLast={isLast}
                onPrev={() => setStep(step - 1)}
                onNext={() => (isLast ? onComplete() : setStep(step + 1))}
                onSkip={onComplete}
                onDotClick={setStep}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Shared navigation controls for both centered and positioned tooltips */
function TourNav({
  step,
  total,
  isFirst,
  isLast,
  onPrev,
  onNext,
  onSkip,
  onDotClick,
}: {
  step: number;
  total: number;
  isFirst: boolean;
  isLast: boolean;
  onPrev: () => void;
  onNext: () => void;
  onSkip: () => void;
  onDotClick: (i: number) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      {/* Dots */}
      <div className="flex gap-1.5">
        {Array.from({ length: total }).map((_, i) => (
          <button
            key={i}
            onClick={() => onDotClick(i)}
            className={`h-2 rounded-full transition-all duration-200 cursor-pointer ${
              i === step
                ? 'bg-accent w-5'
                : i < step
                  ? 'bg-accent/40 w-2'
                  : 'bg-line w-2'
            }`}
          />
        ))}
      </div>

      {/* Buttons */}
      <div className="flex gap-2 items-center">
        <button
          onClick={onSkip}
          className="text-[10px] text-content-ghost hover:text-content-muted transition-colors cursor-pointer mr-1"
        >
          Skip
        </button>
        {!isFirst && (
          <button
            onClick={onPrev}
            className="px-2.5 py-1 rounded text-[11px] text-content-muted hover:text-content border border-line hover:border-line-secondary transition-colors cursor-pointer"
          >
            Back
          </button>
        )}
        <button
          onClick={onNext}
          className="px-3 py-1 rounded text-[11px] font-medium bg-accent hover:bg-accent-hover text-accent-ink transition-colors cursor-pointer shadow-sm"
        >
          {isLast ? 'Get Started' : 'Next'}
        </button>
      </div>
    </div>
  );
}

/** Check if the tour has been seen before */
export function shouldShowTour(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) !== 'true';
  } catch {
    return false;
  }
}

/** Mark the tour as seen */
export function markTourSeen(): void {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, 'true');
  } catch {
    // localStorage not available
  }
}
