/**
 * The seasonal decoration itself — one canvas, six looks.
 *
 * It fills whatever it is put inside and never takes a click, so it can sit in
 * a 22px status bar or behind the whole splash without anything else changing.
 * It is only ever placed on chrome: bars, empty space, the splash, Settings.
 * Nothing draws over an editor.
 *
 * Three things keep it honest as an always-on background: it stops dead when
 * the window is hidden, it renders nothing at all under `prefers-reduced-motion`
 * (people who ask for less motion mean it), and the particle counts are small
 * enough that the loop costs less than the blinking cursor next to it.
 */
import { useEffect, useRef } from 'react';
import { EffectKind } from '../seasons';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 1 → 0. Particles die at 0; the ones that don't age sit at 1 forever. */
  life: number;
  decay: number;
  size: number;
  hue: number;
  /** Per-particle offset so sine-driven motion doesn't march in lockstep. */
  phase: number;
  /** Last frame's position. Sparks draw the line between the two, which is how
   *  you get a streak on a transparent canvas — the usual trick of painting a
   *  translucent black rect over the whole frame would tint the bar underneath. */
  px: number;
  py: number;
}

/** Holi is the one that wants many hues at once rather than one accent. */
const HOLI_HUES = [330, 20, 50, 145, 200, 285];

export function SeasonalEffects({
  variant,
  intensity = 'chrome',
  className,
}: {
  variant: EffectKind;
  /** `full` is the splash. `chrome` is a bar or an empty panel — far fewer. */
  intensity?: 'full' | 'chrome';
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0;
    let h = 0;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, Math.floor(r.width));
      h = Math.max(1, Math.floor(r.height));
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const full = intensity === 'full';
    const particles: Particle[] = [];
    let raf = 0;
    let last = 0;
    let clock = 0;

    // Diyas and blood sit at fixed points along an edge rather than drifting,
    // so they are placed once per resize instead of spawned over time.
    const anchored = variant === 'diyas' || variant === 'blood';
    const place = () => {
      particles.length = 0;
      if (variant === 'diyas') {
        const gap = full ? 78 : 118;
        const count = Math.max(2, Math.min(14, Math.floor(w / gap)));
        for (let i = 0; i < count; i++) {
          particles.push({
            x: (w / (count + 1)) * (i + 1),
            // Lamps stand on the floor of whatever they are in; drips hang from
            // its ceiling. Neither is a choice a caller should have to make.
            y: h - 5,
            px: 0, py: 0,
            vx: 0, vy: 0, life: 1, decay: 0,
            size: full ? 9 : 4.5,
            hue: 35 + Math.random() * 18,
            phase: Math.random() * Math.PI * 2,
          });
        }
      }
      if (variant === 'blood') {
        const count = Math.max(2, Math.min(9, Math.floor(w / (full ? 150 : 260))));
        for (let i = 0; i < count; i++) {
          particles.push({
            x: 14 + Math.random() * Math.max(1, w - 28),
            y: 0,
            px: 0, py: 0,
            vx: 0, vy: 0, life: 1,
            decay: 0,
            size: full ? 4.6 : 3.1,
            hue: 18,
            // Staggered so they don't all drip together.
            phase: Math.random() * 9,
          });
        }
      }
    };
    if (anchored) place();
    const roAnchored = anchored ? new ResizeObserver(place) : null;
    roAnchored?.observe(canvas);

    const spawn = () => {
      if (variant === 'snow') {
        particles.push({
          x: Math.random() * w,
          y: -4,
          px: 0, py: -4,
          vx: (Math.random() - 0.5) * 6,
          vy: full ? 80 + Math.random() * 90 : 12 + Math.random() * 14,
          life: 1,
          decay: 0,
          size: (full ? 1.8 : 0.9) + Math.random() * (full ? 2.4 : 1.1),
          hue: 210,
          phase: Math.random() * Math.PI * 2,
        });
      }
      if (variant === 'colors') {
        particles.push({
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
      if (variant === 'bats') {
        const leftToRight = Math.random() < 0.5;
        particles.push({
          x: leftToRight ? -20 : w + 20,
          y: h * (0.15 + Math.random() * 0.6),
          px: 0, py: 0,
          vx: (leftToRight ? 1 : -1) * (full ? 60 + Math.random() * 40 : 34 + Math.random() * 26),
          vy: 0,
          life: 1,
          decay: 0,
          size: full ? 11 + Math.random() * 6 : 5 + Math.random() * 2.5,
          hue: 285,
          phase: Math.random() * Math.PI * 2,
        });
      }
      if (variant === 'sparks') {
        // One burst — a ring of embers from a single point, with gravity.
        const cx = w * (0.15 + Math.random() * 0.7);
        const cy = h * (0.2 + Math.random() * 0.5);
        const hue = [45, 330, 200, 285, 20][Math.floor(Math.random() * 5)];
        const count = full ? 26 : 12;
        const speed = full ? 135 : 34;
        for (let i = 0; i < count; i++) {
          const a = (Math.PI * 2 * i) / count + Math.random() * 0.2;
          const v = speed * (0.55 + Math.random() * 0.6);
          particles.push({
            x: cx, y: cy,
            px: cx, py: cy,
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
    if (!anchored) {
      const seed =
        variant === 'snow' ? (full ? 70 : 12)
        : variant === 'colors' ? (full ? 8 : 3)
        : variant === 'bats' ? (full ? 6 : 1)
        : 1;
      for (let i = 0; i < seed; i++) {
        spawn();
        const p = particles[particles.length - 1];
        if (!p) continue;
        if (variant === 'snow') p.y = Math.random() * h;
        if (variant === 'colors') p.life = Math.random();
        if (variant === 'bats') p.x = Math.random() * w;
      }
    }

    // How often a new particle (or burst) appears, in seconds.
    const interval =
      variant === 'snow' ? (full ? 0.045 : 0.34)
      : variant === 'colors' ? (full ? 0.22 : 0.85)
      : variant === 'bats' ? (full ? 0.65 : 3.4)
      : variant === 'sparks' ? (full ? 0.55 : 2.6)
      : Infinity;
    let nextSpawn = interval;

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame);
      if (!last) last = t;
      const dt = Math.min((t - last) / 1000, 0.05);
      // ~30fps is plenty for drifting snow and saves half the work in an app
      // whose real job is running somebody's transform.
      if (t - last < 32) return;
      last = t;
      clock += dt;

      if (!anchored) {
        nextSpawn -= dt;
        if (nextSpawn <= 0 && particles.length < (full ? 220 : 70)) {
          spawn();
          nextSpawn = interval * (0.6 + Math.random() * 0.8);
        }
      }

      ctx.clearRect(0, 0, w, h);

      // Additive blending is how embers and flames glow — and on a near-white
      // surface it does nothing at all, because white plus anything is still
      // white. Paper gets plain compositing and deeper colours instead. Read
      // per frame so switching theme doesn't need the canvas rebuilt.
      const light = document.documentElement.classList.contains('light');
      const glowOp: GlobalCompositeOperation = light ? 'source-over' : 'lighter';
      const flameL = light ? 62 : 78;

      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i];

        if (variant === 'snow') {
          p.x += (p.vx + Math.sin(clock * 1.3 + p.phase) * 8) * dt;
          p.y += p.vy * dt;
          if (p.y > h + 4) { particles.splice(i, 1); continue; }
          // Depth: a flake's size, speed and brightness move together, so the
          // small faint ones read as further away instead of as a lighter snow.
          const depth = Math.min(1, p.size / (full ? 3.2 : 2));
          // Fading out near the floor reads as settling rather than piling up
          // against an invisible wall, which matters in a 22px bar.
          const fade = Math.min(1, (h - p.y) / (h * 0.45));
          ctx.globalAlpha = (full ? 0.85 : 0.5) * fade * (0.45 + depth * 0.55);
          ctx.fillStyle = light ? `oklch(72% 0.05 ${p.hue})` : `oklch(96% 0.02 ${p.hue})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
          continue;
        }

        if (variant === 'colors') {
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

        if (variant === 'bats') {
          p.x += p.vx * dt;
          p.y += Math.sin(clock * 2 + p.phase) * 9 * dt;
          if (p.x < -30 || p.x > w + 30) { particles.splice(i, 1); continue; }
          // A filled silhouette, not an outline: two strokes read as a squiggle
          // at this size, where a solid shape with a notch between the wings
          // and a scalloped trailing edge reads as a bat. The wingtips ride a
          // sine, which is the flap.
          const flap = Math.sin(clock * 9 + p.phase);
          const s = p.size;
          const tip = p.y + flap * s * 0.32;
          ctx.globalAlpha = full ? 0.5 : 0.3;
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

        if (variant === 'sparks') {
          p.px = p.x;
          p.py = p.y;
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vy += 42 * dt;
          p.vx *= 0.985;
          p.life -= p.decay * dt;
          if (p.life <= 0) { particles.splice(i, 1); continue; }
          // Additive, so overlapping embers burn brighter where a burst is
          // densest — the thing that makes fireworks look hot rather than
          // like confetti.
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

        if (variant === 'diyas') {
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
          ctx.fillStyle = `oklch(${flameL}% 0.18 ${p.hue})`;
          ctx.fill();

          ctx.beginPath();
          ctx.ellipse(p.x, p.y - s * 0.55, s * 0.22, s * 0.62, 0, 0, Math.PI * 2);
          ctx.fillStyle = light ? 'oklch(82% 0.12 95)' : 'oklch(96% 0.08 95)';
          ctx.fill();
          ctx.globalCompositeOperation = 'source-over';
          continue;
        }

        if (variant === 'blood') {
          // A drip is mostly the streak, not the drop. It swells at the top
          // edge, runs down leaving a thread behind it, and the whole thing
          // fades once it reaches the floor — then that point rests until its
          // turn comes round again. `phase` is where in the cycle it is, so the
          // drips along a bar never move together.
          const cycle = 9;
          const at = (clock + p.phase) % cycle;
          const swellFor = 2.2;
          // In a bar a drip runs off the bottom edge; on the splash it stops in
          // the upper third, so it never draws a line through the wordmark.
          const reach = full ? h * 0.42 : h + p.size * 2;
          const swell = Math.min(1, at / swellFor);
          const fallT = Math.max(0, at - swellFor);
          const dropY = Math.min(reach, p.size * swell + fallT * fallT * (full ? 90 : 46));
          // Once it has run out, hold empty rather than snapping back.
          const spent = dropY >= reach;
          const fade = spent ? Math.max(0, 1 - (at - swellFor - Math.sqrt(reach / (full ? 90 : 46))) * 1.6) : 1;
          if (fade <= 0) continue;

          const red = `oklch(${light ? 45 : 40}% 0.2 ${p.hue})`;
          // The thread, thinning as it stretches — this is what reads as blood
          // rather than as a red dot moving down the screen.
          const grad = ctx.createLinearGradient(p.x, 0, p.x, dropY);
          grad.addColorStop(0, `oklch(${light ? 45 : 40}% 0.2 ${p.hue} / ${0.75 * fade})`);
          grad.addColorStop(1, `oklch(${light ? 45 : 40}% 0.2 ${p.hue} / ${0.3 * fade})`);
          ctx.globalAlpha = 1;
          ctx.fillStyle = grad;
          ctx.fillRect(p.x - p.size * 0.28, 0, p.size * 0.56, dropY);

          ctx.globalAlpha = fade;
          ctx.fillStyle = red;
          ctx.beginPath();
          ctx.ellipse(
            p.x, dropY,
            p.size * (fallT > 0 ? 0.85 : swell),
            p.size * (fallT > 0 ? 1.3 : swell * 1.15),
            0, 0, Math.PI * 2,
          );
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
      roAnchored?.disconnect();
    };
  }, [variant, intensity]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className={className}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
    />
  );
}
