/**
 * Renders the one-time feature coachmark. Mounted once at the app root; it
 * subscribes to the featureIntros pub-sub and shows a single card (bottom-centre,
 * above the status bar) the first time a feature is triggered. Non-modal — it
 * doesn't block the feature that just opened; the user reads it and hits "Got it".
 */
import { useEffect, useState } from 'react';
import { FEATURE_INTROS, subscribeFeatureIntro, dismissFeatureIntro } from '../featureIntros';

const svg = (paths: React.ReactNode) => (
  <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">{paths}</svg>
);
const ICONS: Record<string, React.ReactNode> = {
  autorun: svg(<><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></>),
  curl: svg(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></>),
  cookbook: svg(<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>),
  flow: svg(<><circle cx="5" cy="6" r="2" /><circle cx="19" cy="12" r="2" /><circle cx="5" cy="18" r="2" /><path d="M7 6h6a4 4 0 0 1 4 4M7 18h6a4 4 0 0 0 4-4" /></>),
  modules: svg(<><path d="m16 6 4 14M12 6v14M8 8l-4 12" /></>),
  secure: svg(<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>),
  reference: svg(<><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1" /><path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1" /></>),
  java: svg(<><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></>),
  mcp: svg(<><path d="M12 2v4" /><path d="M5.5 5.5 8 8" /><path d="M18.5 5.5 16 8" /><rect x="6" y="8" width="12" height="8" rx="3" /><path d="M9 16v3a3 3 0 0 0 6 0v-3" /></>),
  compare: svg(<><rect x="3" y="4" width="7" height="16" rx="1" /><rect x="14" y="4" width="7" height="16" rx="1" /></>),
};

export function FeatureIntroHost() {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => subscribeFeatureIntro(setKey), []);
  useEffect(() => {
    if (!key) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); dismissFeatureIntro(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [key]);

  if (!key) return null;
  const intro = FEATURE_INTROS[key];
  if (!intro) return null;

  return (
    <div className="fixed inset-x-0 z-[125] flex justify-center pointer-events-none" style={{ bottom: 40, fontSize: 13 }}>
      <style>{`@keyframes fiPop { from { opacity:0; transform: translateY(12px) } to { opacity:1; transform: translateY(0) } }`}</style>
      <div
        className="pointer-events-auto"
        style={{
          width: 'min(440px, calc(100vw - 32px))',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 14,
          padding: '15px 16px 14px',
          boxShadow: '0 26px 70px rgba(0,0,0,.5)',
          animation: 'fiPop .28s cubic-bezier(.2,.9,.3,1) both',
        }}
      >
        <div className="flex items-start" style={{ gap: 12 }}>
          <span className="grid place-items-center shrink-0" style={{ width: 34, height: 34, borderRadius: 10, color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid var(--accent-border)' }}>
            {ICONS[key] ?? svg(<><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v4h1" /></>)}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="flex items-center" style={{ gap: 8 }}>
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase', color: 'var(--content-faint)' }}>Tip</span>
              <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.2 }}>{intro.title}</span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--content-secondary)', lineHeight: 1.6, marginTop: 6 }}>{intro.body}</div>
            {intro.tip && (
              <div style={{ fontSize: 11, color: 'var(--accent)', marginTop: 8, fontFamily: "'JetBrains Mono', ui-monospace, monospace" }}>{intro.tip}</div>
            )}
            <div className="flex justify-end" style={{ marginTop: 12 }}>
              <button
                onClick={dismissFeatureIntro}
                className="cursor-pointer"
                style={{ height: 30, padding: '0 16px', borderRadius: 8, border: '1px solid var(--accent)', background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 12, fontWeight: 600 }}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
