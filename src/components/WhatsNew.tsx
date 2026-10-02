/**
 * "What's new" dialog — shown once after an update (App compares the running
 * version against the last one the user saw). Lists the headline features of the
 * current release so people actually discover what changed instead of having to
 * stumble onto it. Returning users only; fresh installs get the WelcomeScreen.
 */
import { useEffect } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { isTauri } from '../bridge';
import RELEASES_DATA from '../releases.json';

interface Highlight { title: string; desc: string; tag?: string; only?: 'vscode' | 'desktop'; }
interface Release { version: string; date: string; headline: string; highlights: Highlight[]; }

// The notes live in src/releases.json, newest first, so the Store workflow can
// use the same text for the listing's "What's new" (scripts/store-listing.mjs).
// Add each release on top and never remove one: the dialog opens on the running
// version and lists the rest below it. `only` limits an item to one runtime.
// Releases before 3.0.0 had separate desktop and extension version numbers; the
// dialog links to GitHub for those.
const RELEASES = RELEASES_DATA as Release[];

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
  const visible = (r: Release) => r.highlights.filter((h) => !h.only || (h.only === 'vscode' ? !isTauri : isTauri));
  const highlights = visible(release);
  const earlier = RELEASES.filter((r) => r !== release);

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

          {/* Every other release, so someone who skipped one still finds it. */}
          {earlier.length > 0 && (
            <div style={{ padding: '16px 0 10px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--content-faint)', marginBottom: 4 }}>Earlier releases</div>
              {earlier.map((r) => (
                <details key={r.version} style={{ borderBottom: '1px solid var(--line-subtle)' }}>
                  <summary className="flex items-baseline cursor-pointer hover:text-content" style={{ gap: 10, padding: '10px 0', listStyle: 'none', color: 'var(--content-secondary)' }}>
                    <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, color: 'var(--content-faint)', minWidth: 42 }}>v{r.version}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{r.headline}</span>
                    <span className="flex-1" />
                    <span style={{ fontSize: 11, color: 'var(--content-faint)' }}>{r.date}</span>
                  </summary>
                  <div style={{ padding: '0 0 10px 52px' }}>
                    {visible(r).map((h) => (
                      <div key={h.title} style={{ padding: '6px 0' }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{h.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--content-muted)', lineHeight: 1.55, marginTop: 2 }}>{h.desc}</div>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
              <button
                onClick={() => openUrl('https://github.com/Ashutosh-Vijay/DataWeave-Studio/releases')}
                className="cursor-pointer hover:text-content"
                style={{ marginTop: 10, border: 'none', background: 'transparent', padding: 0, fontSize: 12, color: 'var(--content-faint)' }}
              >
                Releases before 3.0 are on GitHub ↗
              </button>
            </div>
          )}
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
