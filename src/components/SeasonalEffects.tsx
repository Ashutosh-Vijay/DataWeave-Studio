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
const ANCHORED: EffectKind[] = ['diyas', 'blood', 'pumpkins'];

/** Kinds that need room. A jack-o'-lantern in a 26px status bar sits on top of
 *  the version string; in a gutter it has all the space in the world. Halloween
 *  still has its bats down there. */
const NEEDS_ROOM: EffectKind[] = ['pumpkins'];

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
          ctx.fillStyle = light ? `oklch(72% 0.05 ${p.hue})` : `oklch(96% 0.02 ${p.hue})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
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
          // A flame is a teardrop that leans and breathes. Two sines at
          // different rates keep it from looking like a metronome.
          const lean = Math.sin(clock * 3.1 + p.phase) * 0.16;
          const breathe = 0.82 + Math.sin(clock * 5.7 + p.phase * 2) * 0.18;
          const s = p.size * breathe;
          const tipY = p.y - s * 2.1;

          ctx.globalCompositeOperation = glowOp;
          const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, s * 3.2);
          glow.addColorStop(0, `oklch(80% 0.16 ${p.hue} / ${(full ? 0.34 : 0.22) * (light ? 0.7 : 1)})`);
          glow.addColorStop(1, `oklch(80% 0.16 ${p.hue} / 0)`);
          ctx.globalAlpha = 1;
          ctx.fillStyle = glow;
          ctx.beginPath();
          ctx.arc(p.x, p.y, s * 3.2, 0, Math.PI * 2);
          ctx.fill();

          ctx.beginPath();
          ctx.moveTo(p.x - s * 0.5, p.y);
          ctx.quadraticCurveTo(p.x - s * 0.5, tipY, p.x + lean * s, tipY);
          ctx.quadraticCurveTo(p.x + s * 0.5, tipY, p.x + s * 0.5, p.y);
          ctx.closePath();
          ctx.fillStyle = `oklch(${light ? 62 : 78}% 0.18 ${p.hue})`;
          ctx.fill();

          ctx.beginPath();
          ctx.ellipse(p.x, p.y - s * 0.55, s * 0.22, s * 0.62, 0, 0, Math.PI * 2);
          ctx.fillStyle = light ? 'oklch(82% 0.12 95)' : 'oklch(96% 0.08 95)';
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';

          // The lamp itself. Without it the flames float, which is exactly what
          // they were doing before.
          ctx.globalAlpha = 1;
          ctx.fillStyle = light ? 'oklch(48% 0.1 40)' : 'oklch(40% 0.09 40)';
          ctx.beginPath();
          ctx.moveTo(p.x - s * 1.2, p.y);
          ctx.quadraticCurveTo(p.x, p.y + s * 1.3, p.x + s * 1.2, p.y);
          ctx.closePath();
          ctx.fill();
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
