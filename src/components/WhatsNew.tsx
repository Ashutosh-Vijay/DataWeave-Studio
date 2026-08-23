/**
 * "What's new" dialog — shown once after an update (App compares the running
 * version against the last one the user saw). Lists the headline features of the
 * current release so people actually discover what changed instead of having to
 * stumble onto it. Returning users only; fresh installs get the WelcomeScreen.
 */
import { useEffect } from 'react';
import { isTauri } from '../bridge';

interface Highlight { title: string; desc: string; tag?: string; only?: 'vscode' | 'desktop'; }
interface Release { version: string; date: string; headline: string; highlights: Highlight[]; }

// Two independent tracks, because the desktop app (2.x) and the VS Code
// extension (1.x) ship on their own version numbers and cadence — keeping them
// separate means a release that only touches one runtime never shows stale notes
// in the other. Each list is newest-first; the dialog/toast pick by runtime.
const SHARE_LINK_HIGHLIGHTS: Highlight[] = [
  { title: 'Send your whole setup in one link', desc: 'Copy a link that carries the script, payload, variables, headers and query params — one request or the entire workspace. Whoever opens it gets an identical setup and can press Run, instead of a snippet they have to rebuild. The data rides in the part of the URL browsers never send to a server, so nothing is uploaded to create one. Import → From share link, or ⌘⇧I.' },
  { title: 'Output and input options finally autocomplete', desc: 'Typing after “output application/json ” now suggests the real reader and writer options for all 16 formats — including skipNullOn, which was previously undiscoverable — correctly split between the ones that apply to input and to output.' },
  { title: 'Lambda parameters know what they’re iterating', desc: 'In “payload.items map ((item) -> item.” the suggestions are now that element’s own fields, instead of nothing.' },
  { title: '89 official cookbook recipes, every one verified', desc: 'MuleSoft’s cookbook examples are now in the recipe browser. Each one was executed against the bundled engine and kept only if it actually runs, with the engine’s own output as the expected result — so nothing you open is a broken snippet. Opening a recipe seeds its variables too.' },
  { title: 'Compare: ignore doc:id and UUID noise', desc: 'Anypoint Studio stamps a fresh doc:id on every element it touches, so two identical flows diff as almost entirely different. The new Ignore IDs toggle blanks doc:id and UUID values on both sides so you see the real change. It masks a copy, never the text you pasted.' },
];

const DESKTOP_RELEASES: Release[] = [
  { version: '2.4.0', date: 'August 2026', headline: 'Share a whole setup in one link', highlights: SHARE_LINK_HIGHLIGHTS },
];

const VSCODE_RELEASES: Release[] = [
  { version: '1.4.0', date: 'August 2026', headline: 'Share a whole setup in one link', highlights: SHARE_LINK_HIGHLIGHTS },
];

// The running build picks its own track.
const RELEASES: Release[] = isTauri ? DESKTOP_RELEASES : VSCODE_RELEASES;

export function getRelease(version: string): Release | null {
  return RELEASES.find((r) => r.version === version) ?? null;
}
export function hasWhatsNew(version: string): boolean {
  return getRelease(version) !== null;
}
/** Newest release version for this runtime — what the release toast announces / opens. */
export const LATEST_VERSION = RELEASES[0]?.version ?? '';

const svg = (paths: React.ReactNode, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{paths}</svg>
);

export function WhatsNew({ version, onClose }: { version: string; onClose: () => void }) {
  // Exact match for the running build, else the newest release (the toast opens
  // it without a version, and VS Code can't read the Tauri app version).
  const release = getRelease(version) ?? RELEASES[0] ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!release) return null;

  // Some highlights only apply to one runtime (e.g. VS Code theme adoption).
  const highlights = release.highlights.filter(
    (h) => !h.only || (h.only === 'vscode' ? !isTauri : isTauri),
  );

  return (
    <div className="fixed inset-0 z-[126] grid place-items-center" style={{ background: 'color-mix(in oklch, var(--bg) 70%, transparent)', backdropFilter: 'blur(3px)', fontSize: 13 }} onClick={onClose}>
      <style>{`@keyframes wnPop { from { opacity:0; transform: translateY(14px) scale(.98) } to { opacity:1; transform: none } }`}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(560px, calc(100vw - 40px))', maxHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,.55)', animation: 'wnPop .3s cubic-bezier(.2,.9,.3,1) both', overflow: 'hidden' }}
      >
        {/* header */}
        <div style={{ padding: '20px 22px 16px', borderBottom: '1px solid var(--line-subtle)', background: 'linear-gradient(150deg, color-mix(in oklch, var(--accent) 12%, var(--surface)), var(--surface))' }}>
          <div className="flex items-center" style={{ gap: 9 }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--accent-ink)', background: 'var(--accent)', padding: '3px 8px', borderRadius: 6 }}>What’s new</span>
            <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, color: 'var(--content-faint)' }}>v{version || release.version} · {release.date}</span>
            <div className="flex-1" />
            <button onClick={onClose} className="grid place-items-center cursor-pointer hover:text-content" style={{ width: 26, height: 26, border: 'none', background: 'transparent', borderRadius: 7, color: 'var(--content-faint)' }} title="Close (Esc)">
              {svg(<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>, 15)}
            </button>
          </div>
          <h2 style={{ margin: '12px 0 0', fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>{release.headline}</h2>
        </div>

        {/* highlights */}
        <div style={{ padding: '8px 22px 4px', overflowY: 'auto' }}>
          {highlights.map((h) => (
            <div key={h.title} className="flex items-start" style={{ gap: 12, padding: '13px 0', borderBottom: '1px solid var(--line-subtle)' }}>
              <span className="grid place-items-center shrink-0" style={{ width: 28, height: 28, borderRadius: 8, marginTop: 1, color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid var(--accent-border)' }}>
                {svg(<><polyline points="20 6 9 17 4 12" /></>, 15)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.2 }}>{h.title}</span>
                  {h.tag && <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.6, padding: '2px 6px', borderRadius: 5, color: 'var(--accent-ink)', background: 'var(--accent)' }}>{h.tag}</span>}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--content-muted)', lineHeight: 1.55, marginTop: 3 }}>{h.desc}</div>
              </div>
            </div>
          ))}
        </div>

        {/* footer */}
        <div className="flex items-center" style={{ padding: '14px 22px', borderTop: '1px solid var(--line-subtle)', gap: 10 }}>
          <span style={{ fontSize: 11.5, color: 'var(--content-faint)' }}>Click a tool in the left rail and we’ll explain it the first time.</span>
          <div className="flex-1" />
          <button onClick={onClose} className="cursor-pointer hover:brightness-110" style={{ height: 34, padding: '0 20px', borderRadius: 9, border: '1px solid var(--accent)', background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 13, fontWeight: 600 }}>
            Start exploring
          </button>
        </div>
      </div>
    </div>
  );
}
