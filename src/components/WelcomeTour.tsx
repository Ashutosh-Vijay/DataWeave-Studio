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
      'A local desktop app to write, test, and debug DataWeave 2.0 scripts — without Anypoint Studio, browser limits, or complex project setups. Everything runs on your machine.',
  },
  {
    target: 'script-editor',
    title: 'Script Editor',
    description:
      'Write DataWeave 2.0 scripts with syntax highlighting and context-aware autocomplete. Type "payload." to see field names from your input data.',
    tip: 'Press Ctrl+Enter to run, or toggle Auto to live-preview as you type.',
    placement: 'right',
  },
  {
    target: 'payload',
    title: 'Input Payload & Named Inputs',
    description:
      'Set your input payload in the first tab. Click "+ Add" to create extra named inputs — they become accessible by name in your DW script, just like in MuleSoft flows.',
    tip: 'Supports JSON, XML, CSV, Plain Text, and more.',
    placement: 'right',
  },
  {
    target: 'context-panel',
    title: 'Context Panel',
    description:
      'Set the HTTP method, query parameters, headers, variables, and config properties. These map to attributes, vars, and ${key} placeholders in your script.',
    tip: 'Config properties use YAML format with dot-notation flattening, just like MuleSoft.',
    placement: 'left',
  },
  {
    target: 'output',
    title: 'Output',
    description:
      'See your script results here after clicking Run. Supports JSON, XML, and raw output formatting. Errors show the exact line number in the script editor.',
    placement: 'left',
  },
  {
    target: 'sidebar',
    title: 'Sidebar',
    description:
      'Manage workspaces, switch between Transform / Salesforce Query / DB Query modes, change MIME types, and import cURL commands. Save with Ctrl+S.',
    tip: 'Workspaces store everything: script, payload, context, query templates.',
    placement: 'right',
  },
  {
    target: 'run-controls',
    title: 'Run Controls',
    description:
      'Run your script manually or toggle Auto for live preview with 1.5s debounce. The toolbar also has the Secure Properties Tool for offline encrypt/decrypt.',
    tip: 'The lock icon opens the offline encryption tool — no data sent to any server.',
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
      style.borderRight = `${size}px solid rgba(0, 160, 223, 0.3)`;
      style.borderSide = 'right';
      break;
    case 'left':
      style.right = -size;
      style.top = '50%';
      style.transform = 'translateY(-50%)';
      style.borderTop = `${size}px solid transparent`;
      style.borderBottom = `${size}px solid transparent`;
      style.borderLeft = `${size}px solid rgba(0, 160, 223, 0.3)`;
      style.borderSide = 'left';
      break;
    case 'bottom':
      style.top = -size;
      style.left = '50%';
      style.transform = 'translateX(-50%)';
      style.borderLeft = `${size}px solid transparent`;
      style.borderRight = `${size}px solid transparent`;
      style.borderBottom = `${size}px solid rgba(0, 160, 223, 0.3)`;
      style.borderSide = 'bottom';
      break;
    case 'top':
      style.bottom = -size;
      style.left = '50%';
      style.transform = 'translateX(-50%)';
      style.borderLeft = `${size}px solid transparent`;
      style.borderRight = `${size}px solid transparent`;
      style.borderTop = `${size}px solid rgba(0, 160, 223, 0.3)`;
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
            stroke="rgba(0, 160, 223, 0.4)"
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
          <div className="bg-[#1a1a2e] border border-[#00a0df]/25 rounded-xl shadow-2xl shadow-[#00a0df]/10 w-[480px] max-w-[90vw] overflow-hidden">
            <div className="px-8 py-7">
              {/* Logo */}
              <div className="flex items-center gap-4 mb-5">
                <svg width="48" height="48" viewBox="0 0 512 512" fill="none">
                  <rect width="512" height="512" rx="100" fill="#0a1628"/>
                  <path d="M130 155 C190 155, 210 240, 256 240 S322 155, 382 155" stroke="#00c8ff" strokeWidth="34" strokeLinecap="round" fill="none"/>
                  <path d="M130 357 C190 357, 210 272, 256 272 S322 357, 382 357" stroke="#0070c0" strokeWidth="34" strokeLinecap="round" fill="none"/>
                  <circle cx="256" cy="256" r="10" fill="#fff" opacity="0.9"/>
                </svg>
                <div>
                  <h2 className="text-lg font-bold text-white">{current.title}</h2>
                  <div className="text-[10px] text-gray-500 mt-0.5">
                    Step {step + 1} of {STEPS.length}
                  </div>
                </div>
              </div>
              <p className="text-sm text-gray-300 leading-relaxed mb-5">{current.description}</p>
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

          <div className="bg-[#1a1a2e] border border-[#00a0df]/25 rounded-xl shadow-2xl shadow-[#00a0df]/10 overflow-hidden">
            {/* Progress bar */}
            <div className="h-1 bg-gray-800">
              <div
                className="h-full bg-gradient-to-r from-[#00a0df] to-[#00d4ff] transition-all duration-300"
                style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
              />
            </div>

            <div className="px-5 py-4">
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-sm font-bold text-white">{current.title}</h3>
                <span className="text-[9px] text-gray-600 shrink-0 ml-2">
                  {step + 1}/{STEPS.length}
                </span>
              </div>
              <p className="text-xs text-gray-300 leading-relaxed mb-3">
                {current.description}
              </p>
              {current.tip && (
                <div className="bg-[#00a0df]/8 border border-[#00a0df]/20 rounded-lg px-3 py-2 mb-3 flex items-start gap-2">
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="#00a0df" className="mt-0.5 shrink-0">
                    <path d="M8 1a7 7 0 110 14A7 7 0 018 1zm0 3a.75.75 0 00-.75.75v4.5a.75.75 0 001.5 0v-4.5A.75.75 0 008 4zm0 8a1 1 0 100-2 1 1 0 000 2z"/>
                  </svg>
                  <span className="text-[11px] text-[#80d0f0] leading-relaxed">{current.tip}</span>
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
                ? 'bg-[#00a0df] w-5'
                : i < step
                  ? 'bg-[#00a0df]/40 w-2'
                  : 'bg-gray-700 w-2'
            }`}
          />
        ))}
      </div>

      {/* Buttons */}
      <div className="flex gap-2 items-center">
        <button
          onClick={onSkip}
          className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors cursor-pointer mr-1"
        >
          Skip
        </button>
        {!isFirst && (
          <button
            onClick={onPrev}
            className="px-2.5 py-1 rounded text-[11px] text-gray-400 hover:text-gray-200 border border-gray-700 hover:border-gray-500 transition-colors cursor-pointer"
          >
            Back
          </button>
        )}
        <button
          onClick={onNext}
          className="px-3 py-1 rounded text-[11px] font-medium bg-[#00a0df] hover:bg-[#0090c5] text-white transition-colors cursor-pointer shadow-sm shadow-[#00a0df]/20"
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
