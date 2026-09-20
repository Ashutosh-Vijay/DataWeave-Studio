/**
 * The seasonal decoration itself — one canvas, several looks, layered.
 *
 * A season is rarely one thing: Halloween is pumpkins AND bats, Diwali is lamps
 * AND fireworks, vampire is blood AND bats. So this takes a list and runs them
 * together on one loop rather than stacking canvases.
 *
 * It fills whatever it is put inside and never takes a click, so it can sit in
 * a 26px status bar or in the empty gutters either side of a centred panel
 * without anything else moving. It is only ever placed on chrome: bars, empty
 * space, the splash, Settings. Nothing draws over an editor — and nothing draws
 * over a line of text, which is why the busy header has none and the gutters,
 * hundreds of pixels of nothing, get the good stuff.
 *
 * Three things keep it honest as an always-on background: it renders nothing at
 * all under `prefers-reduced-motion` (people who ask for less motion mean it),
 * the loop stops dead when the window is hidden, and the particle counts are
 * small enough that it costs less than the cursor blinking next to it.
 */
import { useEffect, useRef } from 'react';
import { EffectKind } from '../seasons';

interface Particle {
  kind: EffectKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 1 → 0. Particles die at 0; anchored ones sit at 1 forever. */
  life: number;
  decay: number;
  size: number;
  hue: number;
  /** Per-particle offset so sine-driven motion doesn't march in lockstep. */
  phase: number;
  /** Last frame's position — sparks draw the line between the two, which is how
   *  you get a streak on a transparent canvas (painting a translucent black
   *  rect over the frame, the usual trick, would tint whatever is underneath). */
  px: number;
  py: number;
}

/** Holi wants many hues at once rather than one accent. */
const HOLI_HUES = [330, 20, 50, 145, 200, 285];

/** Kinds that stand at fixed points on an edge instead of drifting through. */
const ANCHORED: EffectKind[] = ['diyas', 'blood', 'pumpkins', 'tree', 'snowman', 'scarecrow'];

/** The set pieces — one figure, standing, not a row of them. */
const FIGURES: EffectKind[] = ['tree', 'snowman', 'scarecrow'];

/** Kinds that need room. A jack-o'-lantern in a 26px status bar sits on top of
 *  the version string; in a gutter it has all the space in the world. Halloween
 *  still has its bats down there. */
const NEEDS_ROOM: EffectKind[] = ['pumpkins', 'tree', 'snowman', 'scarecrow'];

export function SeasonalEffects({
  variants,
  intensity = 'chrome',
  className,
}: {
  variants: EffectKind[];
  /** `full` is the splash and the gutters. `chrome` is a bar — far fewer. */
  intensity?: 'full' | 'chrome';
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // A fresh array identity every render would restart the loop constantly; the
  // contents are what matter.
  const key = variants.join(',');

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const full = intensity === 'full';
    const kinds = (key.split(',').filter(Boolean) as EffectKind[])
      .filter((k) => full || !NEEDS_ROOM.includes(k));

    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const particles: Particle[] = [];
    let raf = 0;
    let last = 0;
    let clock = 0;

    /** Anchored kinds are laid out to fit the box, so this re-runs on resize. */
    const place = () => {
      for (let i = particles.length - 1; i >= 0; i--) {
        if (ANCHORED.includes(particles[i].kind)) particles.splice(i, 1);
      }
      for (const kind of kinds) {
        if (kind === 'diyas' || kind === 'pumpkins') {
          const gap = kind === 'pumpkins' ? (full ? 130 : 150) : (full ? 78 : 118);
          const count = Math.max(2, Math.min(14, Math.floor(w / gap)));
          for (let i = 0; i < count; i++) {
            particles.push({
              kind,
              x: (w / (count + 1)) * (i + 1),
              // Lamps and pumpkins stand on the floor of whatever they are in;
              // drips hang from its ceiling. Neither is the caller's problem.
              y: h - (kind === 'pumpkins' ? (full ? 8 : 3) : 5),
              px: 0, py: 0, vx: 0, vy: 0, life: 1, decay: 0,
              size: kind === 'pumpkins' ? (full ? 15 : 7) : (full ? 9 : 4.5),
              hue: kind === 'pumpkins' ? 55 : 35 + Math.random() * 18,
              phase: Math.random() * Math.PI * 2,
            });
          }
        }
        if (FIGURES.includes(kind)) {
          // A narrow box (a gutter) gets one figure in the middle of it. A wide
          // one is a full screen whose middle holds the wordmark and the
          // progress bar, so there the figures stand at the edges — centring
          // one there put a Christmas tree through the title.
          const wide = w > 700;
          const count = wide ? 2 : 1;
          const size = Math.max(42, Math.min(h * 0.34, 165));
          for (let i = 0; i < count; i++) {
            particles.push({
              kind,
              x: wide ? w * (i === 0 ? 0.12 : 0.88) : w * 0.5,
              y: h - 4,
              // `life` is the reveal clock for a figure, not a lifetime: the
              // tree draws itself on from 0 to 1 and then stays.
              px: 0, py: 0, vx: 0, vy: 0, life: 0, decay: 0,
              size: size * (count === 1 ? 1 : 0.82),
              hue: 145,
              phase: Math.random() * Math.PI * 2,
            });
          }
        }
        if (kind === 'blood') {
          const count = Math.max(2, Math.min(10, Math.floor(w / (full ? 95 : 260))));
          for (let i = 0; i < count; i++) {
            particles.push({
              kind,
              x: 12 + Math.random() * Math.max(1, w - 24),
              y: 0,
              px: 0, py: 0, vx: 0, vy: 0, life: 1, decay: 0,
              size: full ? 6.4 : 3.2,
              hue: 18,
              // Where in its own cycle this drip starts, so they never run together.
              phase: Math.random() * 6.5,
            });
          }
        }
      }
    };

    const resize = () => {
      const r = canvas.getBoundingClientRect();
      const nw = Math.max(1, Math.floor(r.width));
      const nh = Math.max(1, Math.floor(r.height));
      if (nw === w && nh === h) return;
      w = nw;
      h = nh;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      place();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const spawn = (kind: EffectKind) => {
      if (kind === 'snow') {
        particles.push({
          kind,
          x: Math.random() * w,
          y: -4,
          px: 0, py: -4,
          vx: (Math.random() - 0.5) * 6,
          vy: full ? 80 + Math.random() * 90 : 12 + Math.random() * 14,
          life: 1, decay: 0,
          size: (full ? 1.8 : 0.9) + Math.random() * (full ? 2.4 : 1.1),
          hue: 210,
          phase: Math.random() * Math.PI * 2,
        });
      }
      if (kind === 'colors') {
        particles.push({
          kind,
          x: Math.random() * w,
          y: h * (0.15 + Math.random() * 0.7),
          px: 0, py: 0,
          vx: (Math.random() - 0.5) * 10,
          vy: -3 - Math.random() * 6,
          life: 1,
          decay: full ? 0.5 : 0.6,
          size: full ? 16 + Math.random() * 26 : 7 + Math.random() * 11,
          hue: HOLI_HUES[Math.floor(Math.random() * HOLI_HUES.length)],
          phase: 0,
        });
      }
      if (kind === 'bats') {
        const leftToRight = Math.random() < 0.5;
        particles.push({
          kind,
          x: leftToRight ? -20 : w + 20,
          y: h * (0.12 + Math.random() * 0.62),
          px: 0, py: 0,
          vx: (leftToRight ? 1 : -1) * (full ? 55 + Math.random() * 45 : 34 + Math.random() * 26),
          vy: 0,
          life: 1, decay: 0,
          size: full ? 11 + Math.random() * 6 : 5 + Math.random() * 2.5,
          hue: 285,
          phase: Math.random() * Math.PI * 2,
        });
      }
      if (kind === 'sparks') {
        // One burst — a ring of embers from a point, with gravity.
        const cx = w * (0.12 + Math.random() * 0.76);
        const cy = h * (0.15 + Math.random() * 0.45);
        const hue = [45, 330, 200, 285, 20][Math.floor(Math.random() * 5)];
        const count = full ? 26 : 12;
        const speed = full ? 135 : 34;
        for (let i = 0; i < count; i++) {
          const a = (Math.PI * 2 * i) / count + Math.random() * 0.2;
          const v = speed * (0.55 + Math.random() * 0.6);
          particles.push({
            kind,
            x: cx, y: cy, px: cx, py: cy,
            vx: Math.cos(a) * v,
            vy: Math.sin(a) * v,
            life: 1,
            decay: 0.7 + Math.random() * 0.4,
            size: full ? 2.4 : 1.3,
            hue,
            phase: 0,
          });
        }
      }
    };

    // Start mid-scene. Spawning from empty means the first seconds are a thin
    // dribble — and on the splash, the first seconds are all there is.
    for (const kind of kinds) {
      const seed =
        kind === 'snow' ? (full ? 70 : 12)
        : kind === 'colors' ? (full ? 8 : 3)
        : kind === 'bats' ? (full ? 5 : 1)
        : kind === 'sparks' ? 1
        : 0;
      for (let i = 0; i < seed; i++) {
        spawn(kind);
        const p = particles[particles.length - 1];
        if (!p) continue;
        if (kind === 'snow') p.y = Math.random() * h;
        if (kind === 'colors') p.life = Math.random();
        if (kind === 'bats') p.x = Math.random() * w;
      }
    }

    /** Seconds between spawns, per kind. Anchored kinds never spawn. */
    const intervalFor = (kind: EffectKind) =>
      kind === 'snow' ? (full ? 0.045 : 0.34)
      : kind === 'colors' ? (full ? 0.22 : 0.85)
      : kind === 'bats' ? (full ? 0.8 : 3.4)
      : kind === 'sparks' ? (full ? 0.75 : 2.6)
      : Infinity;
    const nextSpawn = new Map<EffectKind, number>(kinds.map((k) => [k, intervalFor(k) * Math.random()]));

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (!last) last = t;
      const dt = Math.min((t - last) / 1000, 0.05);
      // ~30fps is plenty for drifting snow, and saves half the work in an app
      // whose real job is running somebody's transform.
      if (t - last < 32) return;
      last = t;
      clock += dt;

      for (const kind of kinds) {
        const every = intervalFor(kind);
        if (every === Infinity) continue;
        const due = (nextSpawn.get(kind) ?? every) - dt;
        if (due <= 0 && particles.length < (full ? 260 : 80)) {
          spawn(kind);
          nextSpawn.set(kind, every * (0.6 + Math.random() * 0.8));
        } else {
          nextSpawn.set(kind, due);
        }
      }

      ctx.clearRect(0, 0, w, h);

      // Additive blending is how embers and flames glow — and on a near-white
      // surface it does nothing at all, because white plus anything is still
      // white. Paper gets plain compositing and deeper colours instead. Read
      // per frame so switching theme doesn't need the canvas rebuilt.
      const light = document.documentElement.classList.contains('light');
      const glowOp: GlobalCompositeOperation = light ? 'source-over' : 'lighter';

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        if (p.kind === 'snow') {
          p.x += (p.vx + Math.sin(clock * 1.3 + p.phase) * 8) * dt;
          p.y += p.vy * dt;
          if (p.y > h + 4) { particles.splice(i, 1); continue; }
          // Depth: size, speed and brightness move together, so the small faint
          // ones read as further away rather than as a lighter snow.
          const depth = Math.min(1, p.size / (full ? 3.2 : 2));
          const fade = Math.min(1, (h - p.y) / (h * 0.45));
          ctx.globalAlpha = (full ? 0.85 : 0.5) * fade * (0.45 + depth * 0.55);
          const snowColor = light ? `oklch(68% 0.06 ${p.hue})` : `oklch(96% 0.02 ${p.hue})`;
          // Six arms with side branches — a crystal, not a ball of polystyrene.
          // Only where there is room for it to read; in a 26px bar a flake is
          // three pixels across and a dot is honest.
          if (full && p.size > 2.2) {
            const s = p.size * 1.9;
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(clock * 0.25 + p.phase);
            ctx.strokeStyle = snowColor;
            ctx.lineWidth = Math.max(0.7, p.size * 0.3);
            ctx.lineCap = 'round';
            for (let arm = 0; arm < 3; arm++) {
              ctx.rotate(Math.PI / 3);
              ctx.beginPath();
              ctx.moveTo(-s, 0);
              ctx.lineTo(s, 0);
              // One pair of branches per arm end, angled back toward the centre.
              ctx.moveTo(s * 0.52, 0);
              ctx.lineTo(s * 0.8, -s * 0.28);
              ctx.moveTo(s * 0.52, 0);
              ctx.lineTo(s * 0.8, s * 0.28);
              ctx.moveTo(-s * 0.52, 0);
              ctx.lineTo(-s * 0.8, -s * 0.28);
              ctx.moveTo(-s * 0.52, 0);
              ctx.lineTo(-s * 0.8, s * 0.28);
              ctx.stroke();
            }
            ctx.restore();
          } else {
            ctx.fillStyle = snowColor;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * 0.8, 0, Math.PI * 2);
            ctx.fill();
          }
          continue;
        }

        if (p.kind === 'colors') {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 4 * dt;
          p.life -= p.decay * dt;
          if (p.life <= 0) { particles.splice(i, 1); continue; }
          const r = p.size * (1.6 - p.life * 0.6);
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          g.addColorStop(0, `oklch(72% 0.2 ${p.hue} / ${(full ? 0.62 : 0.32) * p.life})`);
          g.addColorStop(1, `oklch(72% 0.2 ${p.hue} / 0)`);
          ctx.globalAlpha = 1;
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }

        if (p.kind === 'bats') {
          p.x += p.vx * dt;
          p.y += Math.sin(clock * 2 + p.phase) * 9 * dt;
          if (p.x < -30 || p.x > w + 30) { particles.splice(i, 1); continue; }
          // A filled silhouette, not an outline: two strokes read as a squiggle
          // at this size, where a solid shape with a notch between the wings and
          // a scalloped trailing edge reads as a bat. The wingtips ride a sine.
          const flap = Math.sin(clock * 9 + p.phase);
          const s = p.size;
          const tip = p.y + flap * s * 0.32;
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = full ? 0.52 : 0.3;
          ctx.fillStyle = `oklch(${light ? 38 : 52}% 0.05 ${p.hue})`;
          ctx.beginPath();
          ctx.moveTo(p.x - s, tip);
          ctx.quadraticCurveTo(p.x - s * 0.55, p.y - s * 0.5, p.x - s * 0.2, p.y + s * 0.04);
          ctx.quadraticCurveTo(p.x, p.y - s * 0.34, p.x + s * 0.2, p.y + s * 0.04);
          ctx.quadraticCurveTo(p.x + s * 0.55, p.y - s * 0.5, p.x + s, tip);
          ctx.quadraticCurveTo(p.x + s * 0.45, p.y + s * 0.44, p.x, p.y + s * 0.3);
          ctx.quadraticCurveTo(p.x - s * 0.45, p.y + s * 0.44, p.x - s, tip);
          ctx.closePath();
          ctx.fill();
          continue;
        }

        if (p.kind === 'sparks') {
          p.px = p.x;
          p.py = p.y;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 42 * dt;
          p.vx *= 0.985;
          p.life -= p.decay * dt;
          if (p.life <= 0) { particles.splice(i, 1); continue; }
          ctx.globalCompositeOperation = glowOp;
          ctx.globalAlpha = p.life * (full ? 0.95 : 0.6);
          ctx.strokeStyle = `oklch(${light ? 62 : 82}% 0.19 ${p.hue})`;
          ctx.lineWidth = p.size * (0.5 + p.life * 0.5) * 2;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(p.px, p.py);
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
          continue;
        }

        if (p.kind === 'diyas') {
          // A real flame is three nested shapes, not one that scales up and
          // down: a wide dim envelope, a body, and a small white-hot core near
          // the wick. Scaling a single teardrop is the "breathing blob" that
          // reads as a loading spinner rather than as fire.
          //
          // The motion is the other half. Flames do not pulse on a sine — they
          // hold, then flick. Summing three sines whose periods share no common
          // factor gives a wander that never repeats visibly, and taking a high
          // power of one of them produces the occasional sharp flick.
          const s = p.size;
          const wander =
            Math.sin(clock * 2.3 + p.phase) * 0.5 +
            Math.sin(clock * 3.7 + p.phase * 1.7) * 0.32 +
            Math.sin(clock * 6.1 + p.phase * 0.6) * 0.18;
          const flick = Math.pow(Math.max(0, Math.sin(clock * 1.9 + p.phase * 2.3)), 6);
          const lean = wander * 0.42;
          const tall = 1 + flick * 0.5 + wander * 0.08;
          const wickY = p.y - s * 0.28;

          // The pool of light it throws. This is what a lamp actually looks
          // like from across a room, and it does the heavy lifting.
          ctx.globalCompositeOperation = glowOp;
          const glow = ctx.createRadialGradient(wickY ? p.x : p.x, wickY, 0, p.x, wickY, s * 4);
          const lit = (full ? 0.36 : 0.24) * (light ? 0.6 : 1) * (0.85 + flick * 0.3);
          glow.addColorStop(0, `oklch(82% 0.17 70 / ${lit})`);
          glow.addColorStop(0.45, `oklch(78% 0.17 55 / ${lit * 0.35})`);
          glow.addColorStop(1, 'oklch(78% 0.17 55 / 0)');
          ctx.globalAlpha = 1;
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(p.x, wickY, s * 4, 0, Math.PI * 2);
          ctx.fill();

          // Three layers, each a teardrop: envelope, body, core. Same curve,
          // different widths and heights, so they nest the way a flame does.
          const flame = (wf: number, hf: number, colour: string, alpha: number) => {
            const tipX = p.x + lean * s * hf * 1.05;
            const tipY = wickY - s * 2.5 * hf * tall;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = colour;
            ctx.beginPath();
            ctx.moveTo(p.x - s * 0.46 * wf, wickY);
            ctx.bezierCurveTo(
              p.x - s * 0.62 * wf, wickY - s * 1.1 * hf,
              tipX - s * 0.2 * wf, tipY + s * 0.5 * hf,
              tipX, tipY,
            );
            ctx.bezierCurveTo(
              tipX + s * 0.2 * wf, tipY + s * 0.5 * hf,
              p.x + s * 0.62 * wf, wickY - s * 1.1 * hf,
              p.x + s * 0.46 * wf, wickY,
            );
            ctx.quadraticCurveTo(p.x, wickY + s * 0.3, p.x - s * 0.46 * wf, wickY);
            ctx.closePath();
            ctx.fill();
          };
          flame(1.25, 1.12, `oklch(${light ? 66 : 72}% 0.19 35)`, light ? 0.5 : 0.42);
          flame(1, 1, `oklch(${light ? 70 : 82}% 0.19 60)`, 0.92);
          flame(0.52, 0.52, light ? 'oklch(88% 0.11 90)' : 'oklch(98% 0.05 95)', 0.95);
          ctx.globalCompositeOperation = 'source-over';

          // The diya: a shallow clay bowl with a pinched lip, not a bowl shape
          // in the abstract. The wick sits in the pinch.
          ctx.globalAlpha = 1;
          const clay = light ? 'oklch(52% 0.11 45)' : 'oklch(43% 0.1 45)';
          ctx.fillStyle = clay;
          ctx.beginPath();
          ctx.moveTo(p.x - s * 1.45, p.y - s * 0.1);
          ctx.quadraticCurveTo(p.x - s * 1.5, p.y + s * 0.15, p.x - s * 1.05, p.y + s * 0.2);
          ctx.quadraticCurveTo(p.x, p.y + s * 1.15, p.x + s * 1.05, p.y + s * 0.2);
          ctx.quadraticCurveTo(p.x + s * 1.5, p.y + s * 0.15, p.x + s * 1.45, p.y - s * 0.1);
          ctx.quadraticCurveTo(p.x, p.y + s * 0.35, p.x - s * 1.45, p.y - s * 0.1);
          ctx.closePath();
          ctx.fill();
          // The oil catching the light inside the bowl.
          ctx.globalAlpha = 0.55;
          ctx.fillStyle = `oklch(${light ? 72 : 60}% 0.14 70)`;
          ctx.beginPath();
          ctx.ellipse(p.x, p.y - s * 0.04, s * 0.85, s * 0.16, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          continue;
        }

        if (p.kind === 'pumpkins') {
          // Carved, and lit from the inside: the face is cut OUT of the body
          // with destination-out and a glow painted behind it, so the light
          // comes through the holes instead of being drawn on top in yellow.
          const s = p.size;
          const flicker = 0.74 + Math.sin(clock * 7.3 + p.phase) * 0.13 + Math.sin(clock * 11.9 + p.phase * 2) * 0.1;
          const cy = p.y - s * 0.78;

          ctx.globalCompositeOperation = glowOp;
          const glow = ctx.createRadialGradient(p.x, cy, 0, p.x, cy, s * 2.6);
          glow.addColorStop(0, `oklch(80% 0.17 75 / ${(full ? 0.3 : 0.2) * flicker})`);
          glow.addColorStop(1, 'oklch(80% 0.17 75 / 0)');
          ctx.globalAlpha = 1;
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(p.x, cy, s * 2.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';

          // Stalk first, so the body overlaps its base.
          ctx.fillStyle = 'oklch(45% 0.09 135)';
          ctx.fillRect(p.x - s * 0.1, cy - s * 1.02, s * 0.2, s * 0.3);

          ctx.fillStyle = `oklch(${light ? 63 : 58}% 0.17 ${p.hue})`;
          ctx.beginPath();
          ctx.ellipse(p.x, cy, s * 0.92, s * 0.78, 0, 0, Math.PI * 2);
          ctx.fill();
          // Ribs — two arcs, enough that it doesn't read as an orange egg.
          ctx.strokeStyle = `oklch(${light ? 53 : 48}% 0.16 ${p.hue})`;
          ctx.lineWidth = Math.max(0.6, s * 0.06);
          for (const off of [-0.42, 0.42]) {
            ctx.beginPath();
            ctx.ellipse(p.x + s * off, cy, s * 0.3, s * 0.74, 0, 0, Math.PI * 2);
            ctx.stroke();
          }

          // Cut the face out of everything drawn so far…
          ctx.globalCompositeOperation = 'destination-out';
          ctx.beginPath();
          ctx.moveTo(p.x - s * 0.54, cy - s * 0.34);
          ctx.lineTo(p.x - s * 0.16, cy - s * 0.06);
          ctx.lineTo(p.x - s * 0.54, cy + s * 0.04);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(p.x + s * 0.54, cy - s * 0.34);
          ctx.lineTo(p.x + s * 0.16, cy - s * 0.06);
          ctx.lineTo(p.x + s * 0.54, cy + s * 0.04);
          ctx.closePath();
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(p.x - s * 0.52, cy + s * 0.24);
          ctx.lineTo(p.x - s * 0.26, cy + s * 0.46);
          ctx.lineTo(p.x, cy + s * 0.26);
          ctx.lineTo(p.x + s * 0.26, cy + s * 0.46);
          ctx.lineTo(p.x + s * 0.52, cy + s * 0.24);
          ctx.lineTo(p.x + s * 0.32, cy + s * 0.58);
          ctx.lineTo(p.x - s * 0.32, cy + s * 0.58);
          ctx.closePath();
          ctx.fill();

          // …then put the candle behind it, so it shows only through the cuts.
          ctx.globalCompositeOperation = 'destination-over';
          ctx.globalAlpha = flicker;
          ctx.fillStyle = 'oklch(88% 0.19 85)';
          ctx.beginPath();
          ctx.ellipse(p.x, cy, s * 0.95, s * 0.82, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
          continue;
        }

        if (p.kind === 'tree') {
          // A conifer is tiers of jagged skirt, each wider than the last, and a
          // trunk. Plain triangles are what make a cheap Christmas tree; the
          // notched hem is the whole difference.
          //
          // It draws itself on: a light climbs the silhouette and the tree
          // appears behind it, then the star lands with an elastic overshoot.
          // (The idea is the one in Chris Gannon's Christmas pen, which does it
          // with GSAP's DrawSVG masking a stroked outline. Here the reveal is a
          // clip rectangle following the same light — no 70KB of animation
          // library on a splash, and our tree still re-tints per theme.)
          const s = p.size;
          const base = p.y;
          const TIERS = [
            { top: 0.92, bot: 0.52, half: 0.13 },
            { top: 0.66, bot: 0.26, half: 0.23 },
            { top: 0.40, bot: 0.0, half: 0.33 },
          ];
          const APEX = 0.98;

          if (p.life < 1) p.life = Math.min(1, p.life + dt / 1.8);
          const grow = 1 - Math.pow(1 - p.life, 3);
          const line = APEX * grow;
          const drawing = p.life < 1;

          // Half-width of the silhouette at a height, so the light can hug the
          // edge instead of running up an invisible centre line.
          const halfAt = (fy: number) => {
            let hw = 0;
            for (const t of TIERS) {
              if (fy >= t.bot && fy <= t.top) {
                hw = Math.max(hw, t.half * (1 - (fy - t.bot) / (t.top - t.bot)));
              }
            }
            return hw;
          };

          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;

          ctx.save();
          ctx.beginPath();
          ctx.rect(p.x - s * 0.5, base - s * line, s, s * line + s * 0.2);
          ctx.clip();

          ctx.fillStyle = light ? 'oklch(42% 0.07 50)' : 'oklch(36% 0.06 50)';
          ctx.fillRect(p.x - s * 0.055, base - s * 0.1, s * 0.11, s * 0.12);

          const needle = light ? 'oklch(46% 0.12 148)' : 'oklch(52% 0.13 150)';
          const needleDark = light ? 'oklch(38% 0.11 150)' : 'oklch(42% 0.12 152)';
          TIERS.forEach((tier, i) => {
            const topY = base - s * tier.top;
            const botY = base - s * tier.bot;
            const halfW = s * tier.half;
            ctx.fillStyle = i % 2 ? needleDark : needle;
            ctx.beginPath();
            ctx.moveTo(p.x, topY);
            ctx.lineTo(p.x + halfW, botY);
            const notches = 4 + i;
            for (let n = notches; n >= 0; n--) {
              const t = n / notches;
              ctx.lineTo(p.x - halfW + 2 * halfW * t, botY + (n % 2 ? s * 0.035 : 0));
            }
            ctx.closePath();
            ctx.fill();
          });
          ctx.restore();

          // Baubles, hung on the tiers, each lighting as the reveal passes it
          // and then twinkling in its own time.
          const hangs: [number, number, number][] = [
            [-0.09, 0.62, 0], [0.11, 0.58, 1.9], [-0.17, 0.4, 3.3],
            [0.19, 0.36, 0.8], [-0.05, 0.22, 2.6], [0.08, 0.18, 4.4],
            [-0.24, 0.12, 1.2], [0.25, 0.1, 3.9],
          ];
          for (const [dx, dy, off] of hangs) {
            if (dy > line) continue;
            const arrived = Math.min(1, (line - dy) * 9);
            const bx = p.x + s * dx;
            const by = base - s * dy;
            const hue = [20, 45, 200, 330][Math.floor((off * 7) % 4)];
            const on = (0.45 + 0.55 * Math.pow(Math.max(0, Math.sin(clock * 1.6 + off)), 2)) * arrived;
            ctx.globalCompositeOperation = glowOp;
            const g = ctx.createRadialGradient(bx, by, 0, bx, by, s * 0.13);
            g.addColorStop(0, `oklch(82% 0.19 ${hue} / ${0.5 * on * (light ? 0.6 : 1)})`);
            g.addColorStop(1, `oklch(82% 0.19 ${hue} / 0)`);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(bx, by, s * 0.13, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = (0.65 + on * 0.35) * arrived;
            ctx.fillStyle = `oklch(${light ? 62 : 72}% 0.19 ${hue})`;
            ctx.beginPath();
            ctx.arc(bx, by, s * 0.028, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
          }

          // The light doing the drawing, and the sparks coming off it.
          if (drawing) {
            const lx = p.x - halfAt(line) * s;
            const ly = base - s * line;
            const fade = Math.min(1, (1 - p.life) * 8);
            ctx.globalCompositeOperation = glowOp;
            const lg = ctx.createRadialGradient(lx, ly, 0, lx, ly, s * 0.22);
            lg.addColorStop(0, `oklch(95% 0.1 95 / ${0.9 * fade * (light ? 0.7 : 1)})`);
            lg.addColorStop(1, 'oklch(95% 0.1 95 / 0)');
            ctx.fillStyle = lg;
            ctx.beginPath();
            ctx.arc(lx, ly, s * 0.22, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = fade;
            ctx.fillStyle = light ? 'oklch(72% 0.16 88)' : 'oklch(96% 0.08 95)';
            ctx.beginPath();
            ctx.arc(lx, ly, s * 0.022, 0, Math.PI * 2);
            ctx.fill();
            // Four sparks thrown off, on their own little clocks.
            for (let i = 0; i < 4; i++) {
              const st = ((clock * 1.7 + i * 0.25) % 1);
              const ang = i * 1.9 + clock * 3;
              const d = st * s * 0.16;
              ctx.globalAlpha = (1 - st) * 0.8 * fade;
              ctx.beginPath();
              ctx.arc(lx + Math.cos(ang) * d, ly + Math.sin(ang) * d, s * 0.01, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.globalAlpha = 1;
          }

          // The star arrives last, overshooting and settling — easeOutElastic,
          // which is what makes it land rather than simply appear.
          const st = Math.max(0, Math.min(1, (p.life - 0.82) / 0.18));
          if (st > 0) {
            const pop = st >= 1
              ? 1
              : Math.pow(2, -10 * st) * Math.sin((st * 10 - 0.75) * (Math.PI * 2 / 3)) + 1;
            const starY = base - s * APEX;
            const spin = clock * 0.5 + p.phase;
            ctx.save();
            ctx.translate(p.x, starY);
            ctx.scale(pop, pop);
            ctx.globalCompositeOperation = glowOp;
            const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 0.2);
            sg.addColorStop(0, `oklch(90% 0.16 90 / ${light ? 0.45 : 0.7})`);
            sg.addColorStop(1, 'oklch(90% 0.16 90 / 0)');
            ctx.fillStyle = sg;
            ctx.beginPath();
            ctx.arc(0, 0, s * 0.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalCompositeOperation = 'source-over';
            ctx.fillStyle = light ? 'oklch(72% 0.16 88)' : 'oklch(88% 0.15 90)';
            ctx.beginPath();
            for (let i = 0; i < 10; i++) {
              const r = i % 2 ? s * 0.035 : s * 0.085;
              const a = spin + (Math.PI * i) / 5 - Math.PI / 2;
              const fx = Math.cos(a) * r;
              const fy = Math.sin(a) * r;
              if (i) ctx.lineTo(fx, fy); else ctx.moveTo(fx, fy);
            }
            ctx.closePath();
            ctx.fill();
            ctx.restore();
          }
          continue;
        }

        if (p.kind === 'snowman') {
          // Three stacked balls, and the details are what stop it BEING three
          // stacked balls: a scarf that trails, twig arms, a carrot that points,
          // and coal that follows the curve instead of floating on it.
          const s = p.size;
          const base = p.y;
          const sway = Math.sin(clock * 1.4 + p.phase) * s * 0.02;
          const rB = s * 0.24;
          const rM = s * 0.18;
          const rH = s * 0.135;
          const yB = base - rB;
          const yM = yB - rB * 0.82 - rM * 0.5;
          const yH = yM - rM * 0.78 - rH * 0.55;
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;

          // Snow is not pure white, or it vanishes on Paper and glares on Dusk.
          const snowBody = light ? 'oklch(93% 0.012 230)' : 'oklch(92% 0.015 230)';
          const snowEdge = light ? 'oklch(84% 0.03 235)' : 'oklch(78% 0.03 240)';
          const balls: [number, number][] = [[yB, rB], [yM, rM], [yH, rH]];
          for (const [cy, r] of balls) {
            const cx = p.x + (cy === yH ? sway : 0);
            const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
            g.addColorStop(0, snowBody);
            g.addColorStop(1, snowEdge);
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
          }
          const hx = p.x + sway;

          // Twig arms, angled up the way a snowman's always are.
          ctx.strokeStyle = light ? 'oklch(42% 0.07 55)' : 'oklch(48% 0.07 55)';
          ctx.lineWidth = Math.max(1, s * 0.016);
          ctx.lineCap = 'round';
          for (const dir of [-1, 1]) {
            ctx.beginPath();
            ctx.moveTo(p.x + dir * rM * 0.85, yM);
            ctx.lineTo(p.x + dir * rM * 2.1, yM - rM * 0.75);
            ctx.moveTo(p.x + dir * rM * 1.7, yM - rM * 0.52);
            ctx.lineTo(p.x + dir * rM * 1.95, yM - rM * 0.95);
            ctx.stroke();
          }

          // Scarf: a band at the neck and a tail that lifts with the sway.
          const neckY = yH + rH * 0.82;
          ctx.fillStyle = light ? 'oklch(55% 0.19 25)' : 'oklch(58% 0.2 25)';
          ctx.beginPath();
          ctx.ellipse(hx, neckY, rH * 1.05, rH * 0.3, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(hx + rH * 0.5, neckY);
          ctx.quadraticCurveTo(hx + rH * 1.5 + sway * 6, neckY + rH * 0.7, hx + rH * 1.1 + sway * 9, neckY + rH * 1.7);
          ctx.lineTo(hx + rH * 0.55 + sway * 7, neckY + rH * 1.5);
          ctx.quadraticCurveTo(hx + rH * 0.9, neckY + rH * 0.7, hx + rH * 0.12, neckY + rH * 0.2);
          ctx.closePath();
          ctx.fill();

          // Coal, and a carrot with a tip.
          ctx.fillStyle = light ? 'oklch(28% 0.02 260)' : 'oklch(25% 0.02 260)';
          for (const dx of [-0.36, 0.36]) {
            ctx.beginPath();
            ctx.arc(hx + rH * dx, yH - rH * 0.22, rH * 0.11, 0, Math.PI * 2);
            ctx.fill();
          }
          for (let i = -2; i <= 2; i++) {
            ctx.beginPath();
            ctx.arc(hx + rH * i * 0.26, yH + rH * 0.42 + Math.abs(i) * rH * 0.07, rH * 0.055, 0, Math.PI * 2);
            ctx.fill();
          }
          for (const dy of [0.22, 0.52, 0.82]) {
            ctx.beginPath();
            ctx.arc(p.x, yM - rM * 0.5 + rM * dy, rM * 0.09, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = 'oklch(66% 0.18 55)';
          ctx.beginPath();
          ctx.moveTo(hx, yH + rH * 0.02);
          ctx.lineTo(hx + rH * 0.95, yH + rH * 0.16);
          ctx.lineTo(hx, yH + rH * 0.2);
          ctx.closePath();
          ctx.fill();

          // Hat: brim, crown, band.
          ctx.fillStyle = light ? 'oklch(30% 0.02 260)' : 'oklch(27% 0.02 260)';
          ctx.beginPath();
          ctx.ellipse(hx, yH - rH * 0.86, rH * 1.35, rH * 0.16, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillRect(hx - rH * 0.62, yH - rH * 1.75, rH * 1.24, rH * 0.92);
          ctx.fillStyle = light ? 'oklch(55% 0.19 25)' : 'oklch(58% 0.2 25)';
          ctx.fillRect(hx - rH * 0.62, yH - rH * 1.02, rH * 1.24, rH * 0.16);
          continue;
        }

        if (p.kind === 'scarecrow') {
          // Burning, as asked. A cross-post in a tattered coat, with the fire at
          // its feet — so the light falls on it from BELOW, which is the whole
          // reason it reads as menacing instead of as a doll.
          const s = p.size;
          const base = p.y;
          const fire = 0.72 + Math.sin(clock * 6.2 + p.phase) * 0.15 + Math.sin(clock * 9.7) * 0.1;
          const sway = Math.sin(clock * 0.9 + p.phase) * s * 0.012;
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;

          const postY = base - s * 0.92;
          const armY = base - s * 0.62;
          ctx.strokeStyle = light ? 'oklch(38% 0.06 55)' : 'oklch(34% 0.06 55)';
          ctx.lineWidth = Math.max(1.5, s * 0.035);
          ctx.beginPath();
          ctx.moveTo(p.x, base);
          ctx.lineTo(p.x + sway, postY);
          ctx.moveTo(p.x - s * 0.34 + sway, armY + s * 0.03);
          ctx.lineTo(p.x + s * 0.34 + sway, armY - s * 0.03);
          ctx.stroke();

          // Coat — a trapezoid with a torn hem.
          ctx.fillStyle = light ? 'oklch(40% 0.07 85)' : 'oklch(36% 0.07 85)';
          ctx.beginPath();
          ctx.moveTo(p.x - s * 0.2 + sway, armY - s * 0.02);
          ctx.lineTo(p.x + s * 0.2 + sway, armY - s * 0.02);
          ctx.lineTo(p.x + s * 0.24 + sway, base - s * 0.22);
          for (let i = 4; i >= 0; i--) {
            const t = i / 4;
            ctx.lineTo(p.x - s * 0.24 + s * 0.48 * t + sway, base - s * 0.22 + (i % 2 ? s * 0.06 : 0));
          }
          ctx.closePath();
          ctx.fill();

          // Straw at the cuffs — the give-away detail.
          ctx.strokeStyle = light ? 'oklch(68% 0.13 90)' : 'oklch(72% 0.13 90)';
          ctx.lineWidth = Math.max(0.8, s * 0.012);
          for (const ax of [-0.34, 0.34]) {
            for (let i = -1; i <= 1; i++) {
              ctx.beginPath();
              ctx.moveTo(p.x + s * ax + sway, armY);
              ctx.lineTo(p.x + s * (ax + i * 0.04) + sway, armY + s * 0.09);
              ctx.stroke();
            }
          }

          // Head: burlap, stitched mouth, eyes lit from inside.
          const headY = postY + s * 0.1;
          const hr = s * 0.115;
          ctx.fillStyle = light ? 'oklch(62% 0.1 80)' : 'oklch(56% 0.1 80)';
          ctx.beginPath();
          ctx.ellipse(p.x + sway, headY, hr, hr * 1.12, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = light ? 'oklch(38% 0.06 70)' : 'oklch(32% 0.05 70)';
          ctx.lineWidth = Math.max(0.7, s * 0.008);
          ctx.beginPath();
          ctx.moveTo(p.x - hr * 0.55 + sway, headY + hr * 0.45);
          ctx.lineTo(p.x + hr * 0.55 + sway, headY + hr * 0.45);
          for (let i = -2; i <= 2; i++) {
            ctx.moveTo(p.x + hr * i * 0.26 + sway, headY + hr * 0.3);
            ctx.lineTo(p.x + hr * i * 0.26 + sway, headY + hr * 0.6);
          }
          ctx.stroke();
          ctx.globalCompositeOperation = glowOp;
          ctx.fillStyle = `oklch(78% 0.2 45 / ${0.75 * fire})`;
          for (const dx of [-0.42, 0.42]) {
            ctx.beginPath();
            ctx.arc(p.x + hr * dx + sway, headY - hr * 0.25, hr * 0.2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalCompositeOperation = 'source-over';

          // Hat.
          ctx.fillStyle = light ? 'oklch(34% 0.05 70)' : 'oklch(30% 0.05 70)';
          ctx.beginPath();
          ctx.ellipse(p.x + sway, headY - hr * 0.95, hr * 1.5, hr * 0.2, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(p.x - hr * 0.7 + sway, headY - hr * 0.95);
          ctx.quadraticCurveTo(p.x + sway, headY - hr * 2.3, p.x + hr * 0.7 + sway, headY - hr * 0.95);
          ctx.closePath();
          ctx.fill();

          // The fire at its feet: a pool of light, embers lifting, flames licking.
          ctx.globalCompositeOperation = glowOp;
          const fg = ctx.createRadialGradient(p.x, base, 0, p.x, base, s * 0.5);
          fg.addColorStop(0, `oklch(80% 0.2 50 / ${(light ? 0.4 : 0.6) * fire})`);
          fg.addColorStop(1, 'oklch(80% 0.2 50 / 0)');
          ctx.fillStyle = fg;
          ctx.beginPath();
          ctx.arc(p.x, base, s * 0.5, 0, Math.PI * 2);
          ctx.fill();
          for (let i = 0; i < 5; i++) {
            const t = (clock * 0.55 + i * 0.37 + p.phase) % 1;
            const ex = p.x + Math.sin((clock + i) * 2.2) * s * 0.07 + (i - 2) * s * 0.035;
            const ey = base - t * s * 0.5;
            ctx.globalAlpha = (1 - t) * 0.85 * fire;
            ctx.fillStyle = `oklch(82% 0.2 ${45 + i * 6})`;
            ctx.beginPath();
            ctx.arc(ex, ey, s * 0.012 * (1 - t * 0.5), 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
          ctx.globalCompositeOperation = 'source-over';
          for (let i = -1; i <= 1; i++) {
            const fx = p.x + i * s * 0.05;
            const fh = s * (0.1 + 0.05 * Math.abs(Math.sin(clock * 5 + i + p.phase)));
            ctx.fillStyle = `oklch(${light ? 66 : 76}% 0.2 ${50 + i * 8})`;
            ctx.beginPath();
            ctx.moveTo(fx - s * 0.025, base);
            ctx.quadraticCurveTo(fx - s * 0.03, base - fh * 0.7, fx, base - fh);
            ctx.quadraticCurveTo(fx + s * 0.03, base - fh * 0.7, fx + s * 0.025, base);
            ctx.closePath();
            ctx.fill();
          }
          continue;
        }

        if (p.kind === 'blood') {
          // A drip is four beats, and the third is the one that sells it: it
          // gathers at the ceiling, stretches into a neck, the neck THINS AND
          // SNAPS, and only then does a teardrop fall — stretched by its own
          // speed, the way a falling drop actually deforms. What this looked
          // like before was a red circle with a line under it, and it showed.
          const cycle = 6.5;
          const at = (clock + p.phase) % cycle;
          const gather = 2;     // swelling at the ceiling
          const stretch = 1.2;  // neck thinning to the snap
          const s = p.size;
          const red = `oklch(${light ? 42 : 38}% 0.21 ${p.hue})`;
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = 1;
          ctx.fillStyle = red;

          if (at < gather + stretch) {
            // Hanging: a bead on a neck that narrows as the bead gets heavy.
            const swell = Math.min(1, at / gather);
            const pull = Math.max(0, (at - gather) / stretch);
            const r = s * (0.45 + swell * 0.55);
            const cy = r + pull * s * 2.4;
            const neck = s * 0.42 * (1 - pull * 0.92);
            ctx.beginPath();
            ctx.moveTo(p.x - neck, 0);
            ctx.quadraticCurveTo(p.x - neck * 0.7, cy - r * 0.6, p.x - r * 0.72, cy - r * 0.5);
            ctx.lineTo(p.x + r * 0.72, cy - r * 0.5);
            ctx.quadraticCurveTo(p.x + neck * 0.7, cy - r * 0.6, p.x + neck, 0);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            ctx.arc(p.x, cy, r, 0, Math.PI * 2);
            ctx.fill();
            continue;
          }

          // Fallen: the drop accelerates away and the neck snaps back up.
          // Gravity is deliberately well under 9.81 m/s² — blood is viscous and
          // a drop that falls at real speed is a red flicker nobody sees.
          const g = full ? 150 : 120;
          const fell = at - gather - stretch;
          const vy = fell * g;
          const cy = s * 2.4 + 0.5 * g * fell * fell;
          const reach = h + s * 3;
          if (cy > reach + 10) continue;

          const snapBack = Math.max(0, 1 - fell * 3.4);
          if (snapBack > 0) {
            ctx.globalAlpha = snapBack;
            ctx.beginPath();
            ctx.moveTo(p.x - s * 0.3 * snapBack, 0);
            ctx.quadraticCurveTo(p.x, s * 1.4 * snapBack, p.x + s * 0.3 * snapBack, 0);
            ctx.closePath();
            ctx.fill();
          }

          // The teardrop: tip trailing, belly leading, length from speed.
          // The smear it leaves on the way down — tapering, and only the last
          // stretch of it, so a drip reads as running down a surface instead of
          // drawing a line from ceiling to floor.
          const from = Math.max(0, cy - s * 14);
          ctx.globalAlpha = 0.22;
          ctx.beginPath();
          ctx.moveTo(p.x - s * 0.12, from);
          ctx.lineTo(p.x + s * 0.12, from);
          ctx.lineTo(p.x + s * 0.5, cy);
          ctx.lineTo(p.x - s * 0.5, cy);
          ctx.closePath();
          ctx.fill();

          const tail = Math.min(s * 2.6, vy * 0.012);
          ctx.globalAlpha = Math.max(0, Math.min(1, (reach - cy) / (s * 6)));
          ctx.beginPath();
          ctx.moveTo(p.x, cy - s - tail);
          ctx.quadraticCurveTo(p.x + s * 0.92, cy - s * 0.55, p.x + s, cy);
          ctx.arc(p.x, cy, s, 0, Math.PI);
          ctx.quadraticCurveTo(p.x - s * 0.92, cy - s * 0.55, p.x, cy - s - tail);
          ctx.closePath();
          ctx.fill();
          // A highlight, because blood is wet and a flat shape is not.
          ctx.globalAlpha *= light ? 0.35 : 0.5;
          ctx.fillStyle = `oklch(68% 0.22 ${p.hue})`;
          ctx.beginPath();
          ctx.ellipse(p.x - s * 0.3, cy - s * 0.12, s * 0.2, s * 0.3, -0.4, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }
      }
      ctx.globalAlpha = 1;
    };

    const start = () => { if (!raf) { last = 0; raf = requestAnimationFrame(frame); } };
    const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener('visibilitychange', onVisibility);
    start();

    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
      ro.disconnect();
    };
  }, [key, intensity]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
}
