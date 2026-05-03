/**
 * Three atmospheric SVG loaders, ported from a Claude Design handoff.
 * Each takes { accent, fg, size } and renders a square animated SVG.
 *
 * Colors should be passed as resolved CSS values (the app's emerald accent
 * by default, not the design's gold), so the loader matches the app theme.
 */

interface LoaderProps {
  accent: string;
  fg: string;
  size?: number;
}

// ─── ORBITAL — three nested rings, each tracing a bead at harmonic speeds ──
export function OrbitalLoader({ accent, fg, size = 280 }: LoaderProps) {
  const cx = size / 2, cy = size / 2;
  const radii = [size * 0.42, size * 0.30, size * 0.18];
  const speeds = [12, 7.5, 4.2];
  const phases = [0, 120, 240];

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <filter id="orb-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.5" result="b" />
          <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <radialGradient id="orb-bead">
          <stop offset="0%" stopColor={accent} stopOpacity="1" />
          <stop offset="60%" stopColor={accent} stopOpacity="0.9" />
          <stop offset="100%" stopColor={accent} stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx={cx} cy={cy} r="1.5" fill={fg} opacity="0.35" />
      <line x1={cx - 6} y1={cy} x2={cx + 6} y2={cy} stroke={fg} strokeOpacity="0.15" />
      <line x1={cx} y1={cy - 6} x2={cx} y2={cy + 6} stroke={fg} strokeOpacity="0.15" />

      {radii.map((r, i) => (
        <g key={i}>
          <circle cx={cx} cy={cy} r={r}
            fill="none" stroke={fg} strokeOpacity="0.08"
            strokeDasharray={i === 1 ? '1 4' : 'none'} />
          {i === 0 && Array.from({ length: 12 }).map((_, t) => {
            const a = (t / 12) * Math.PI * 2 - Math.PI / 2;
            const r1 = r - 6, r2 = r + 6;
            return (
              <line key={t}
                x1={cx + Math.cos(a) * r1} y1={cy + Math.sin(a) * r1}
                x2={cx + Math.cos(a) * r2} y2={cy + Math.sin(a) * r2}
                stroke={fg} strokeOpacity={t % 3 === 0 ? 0.35 : 0.12} />
            );
          })}
          <g style={{ transformOrigin: `${cx}px ${cy}px` }}>
            <circle cx={cx} cy={cy} r={r}
              fill="none" stroke={accent} strokeOpacity="0.18"
              strokeWidth="1.2"
              strokeDasharray={`${r * 0.8} ${r * 6}`}
              strokeLinecap="round">
              <animateTransform attributeName="transform" type="rotate"
                from={`${phases[i]} ${cx} ${cy}`}
                to={`${phases[i] + 360} ${cx} ${cy}`}
                dur={`${speeds[i]}s`} repeatCount="indefinite" />
            </circle>
          </g>
          <g style={{ transformOrigin: `${cx}px ${cy}px` }} filter="url(#orb-glow)">
            <circle cx={cx + r} cy={cy} r={i === 2 ? 5 : 3.5} fill="url(#orb-bead)">
              <animateTransform attributeName="transform" type="rotate"
                from={`${phases[i]} ${cx} ${cy}`}
                to={`${phases[i] + 360} ${cx} ${cy}`}
                dur={`${speeds[i]}s`} repeatCount="indefinite" />
            </circle>
          </g>
        </g>
      ))}
    </svg>
  );
}

// ─── PENDULUM — Newton's-cradle-style swing with cubic-bezier easing ──────
export function PendulumLoader({ accent, fg, size = 280 }: LoaderProps) {
  const cx = size / 2;
  const pivotY = size * 0.18;
  const armLen = size * 0.55;
  const ballR = size * 0.04;

  return (
    <>
      <style>{`
        @keyframes pend-swing {
          0%   { transform: rotate(-32deg); animation-timing-function: cubic-bezier(.4,0,.6,1); }
          50%  { transform: rotate(32deg);  animation-timing-function: cubic-bezier(.4,0,.6,1); }
          100% { transform: rotate(-32deg); }
        }
      `}</style>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id="pend-ball" cx="35%" cy="35%">
            <stop offset="0%" stopColor={accent} stopOpacity="1" />
            <stop offset="60%" stopColor={accent} stopOpacity="0.95" />
            <stop offset="100%" stopColor={accent} stopOpacity="0.7" />
          </radialGradient>
          <linearGradient id="pend-arm" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fg} stopOpacity="0.5" />
            <stop offset="100%" stopColor={fg} stopOpacity="0.85" />
          </linearGradient>
        </defs>

        <line x1={cx - size * 0.32} y1={pivotY} x2={cx + size * 0.32} y2={pivotY}
          stroke={fg} strokeOpacity="0.25" strokeWidth="1" />
        <circle cx={cx} cy={pivotY} r="3" fill={fg} fillOpacity="0.35" />
        <circle cx={cx} cy={pivotY} r="6" fill="none" stroke={fg} strokeOpacity="0.15" />
        <path d={`M ${cx - armLen * 0.55} ${pivotY + armLen * 0.85}
                  A ${armLen} ${armLen} 0 0 1 ${cx + armLen * 0.55} ${pivotY + armLen * 0.85}`}
          fill="none" stroke={fg} strokeOpacity="0.06" strokeDasharray="2 4" />

        <g style={{
          transformOrigin: `${cx}px ${pivotY}px`,
          animation: 'pend-swing 2.4s infinite',
        }}>
          <line x1={cx} y1={pivotY} x2={cx} y2={pivotY + armLen}
            stroke="url(#pend-arm)" strokeWidth="1.5" />
          <circle cx={cx} cy={pivotY} r="2.5" fill={accent} />
          <circle cx={cx} cy={pivotY + armLen} r={ballR} fill="url(#pend-ball)" />
          <circle cx={cx} cy={pivotY + armLen} r={ballR + 8}
            fill="none" stroke={accent} strokeOpacity="0.2" />
          <circle cx={cx} cy={pivotY + armLen} r={ballR + 16}
            fill="none" stroke={accent} strokeOpacity="0.08" />
          <line x1={cx} y1={pivotY + armLen - ballR + 2}
                x2={cx} y2={pivotY + armLen + ballR - 2}
            stroke={fg} strokeOpacity="0.25" />
        </g>

        {[-30, -15, 0, 15, 30].map((deg, i) => {
          const a = (deg * Math.PI) / 180 + Math.PI / 2;
          const r = armLen + 14;
          return (
            <line key={i}
              x1={cx + Math.cos(a) * armLen} y1={pivotY + Math.sin(a) * armLen}
              x2={cx + Math.cos(a) * (r + 6)} y2={pivotY + Math.sin(a) * (r + 6)}
              stroke={fg} strokeOpacity={deg === 0 ? 0.35 : 0.12} strokeWidth="1" />
          );
        })}
      </svg>
    </>
  );
}

// ─── RINGS — concentric arcs at phase-offset speeds, central pulse ────────
export function RingsLoader({ accent, fg, size = 280 }: LoaderProps) {
  const cx = size / 2, cy = size / 2;
  const rings = Array.from({ length: 7 }).map((_, i) => ({
    r: size * 0.10 + i * size * 0.045,
    sweep: 30 + i * 18,
    speed: 6 + i * 0.6,
    dir: i % 2 === 0 ? 1 : -1,
    phase: i * 22,
    width: 1 + i * 0.12,
    opacity: 0.95 - i * 0.07,
  }));

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <filter id="rings-glow">
          <feGaussianBlur stdDeviation="1.5" />
        </filter>
      </defs>
      {rings.map((r, i) => (
        <circle key={'g' + i} cx={cx} cy={cy} r={r.r}
          fill="none" stroke={fg} strokeOpacity="0.05" />
      ))}
      <circle cx={cx} cy={cy} r="3" fill={accent} />
      <circle cx={cx} cy={cy} r="8" fill="none" stroke={accent} strokeOpacity="0.4">
        <animate attributeName="r" values="6;14;6" dur="2.4s" repeatCount="indefinite" />
        <animate attributeName="stroke-opacity" values="0.4;0;0.4" dur="2.4s" repeatCount="indefinite" />
      </circle>

      {rings.map((r, i) => {
        const C = 2 * Math.PI * r.r;
        const dash = (r.sweep / 360) * C;
        const gap = C - dash;
        return (
          <g key={i} style={{ transformOrigin: `${cx}px ${cy}px` }}>
            <circle cx={cx} cy={cy} r={r.r}
              fill="none"
              stroke={accent}
              strokeOpacity={r.opacity}
              strokeWidth={r.width}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${gap}`}
              filter={i < 3 ? 'url(#rings-glow)' : undefined}>
              <animateTransform attributeName="transform" type="rotate"
                from={`${r.phase} ${cx} ${cy}`}
                to={`${r.phase + 360 * r.dir} ${cx} ${cy}`}
                dur={`${r.speed}s`} repeatCount="indefinite" />
            </circle>
          </g>
        );
      })}
    </svg>
  );
}

const ALL = [OrbitalLoader, PendulumLoader, RingsLoader] as const;

/** Pick one of the three loaders at random. Stable for the lifetime of the
 *  component instance — call once per mount. */
export function pickRandomLoader(): (typeof ALL)[number] {
  return ALL[Math.floor(Math.random() * ALL.length)];
}
