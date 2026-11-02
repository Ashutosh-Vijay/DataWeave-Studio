/**
 * One-time card pointing at the rail's All tools button. The rail used to hold
 * every tool; now it holds only what the user pins, so people updating
 * would otherwise wonder where their tools went. Upgraders get a one-click way
 * back to the old rail; new installs get the same pointer once, so nobody has
 * to discover All tools by accident.
 */
import { useEffect, useState } from 'react';

export function RailNotice({ upgrade, onKeepOld, onOpenAllTools, onDone }: {
  upgrade: boolean;
  onKeepOld: () => void;
  onOpenAllTools: () => void;
  onDone: () => void;
}) {
  // Follow the All tools button so the card stays beside it when the window resizes.
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  useEffect(() => {
    const measure = () => setAnchor(document.querySelector('[data-tour="rail-all-tools"]')?.getBoundingClientRect() ?? null);
    measure();
    window.addEventListener('resize', measure);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onDone(); } };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('resize', measure); window.removeEventListener('keydown', onKey); };
  }, [onDone]);

  const top = anchor ? Math.max(12, Math.min(anchor.top - 24, window.innerHeight - 270)) : undefined;
  const btn = 'cursor-pointer h-[30px] px-3 rounded-lg text-[12px] font-semibold whitespace-nowrap';

  return (
    <>
      <style>{`@keyframes rnPop { from { opacity:0; transform: translateX(-8px) } to { opacity:1; transform: none } }
@keyframes rnRing { 0%,100% { box-shadow: 0 0 0 2px var(--accent) } 50% { box-shadow: 0 0 0 5px var(--accent-dim) } }`}</style>
      {anchor && (
        <div
          className="fixed z-[126] pointer-events-none rounded-md"
          style={{ left: anchor.left, top: anchor.top, width: anchor.width, height: anchor.height, animation: 'rnRing 1.6s ease-in-out infinite' }}
        />
      )}
      <div
        role="dialog"
        aria-label={upgrade ? 'The rail changed' : 'Where the tools live'}
        className="fixed z-[126]"
        style={{
          left: anchor ? anchor.right + 14 : 72,
          top: top,
          bottom: anchor ? undefined : 48,
          width: 'min(410px, calc(100vw - 96px))',
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          borderRadius: 14,
          padding: '15px 16px 14px',
          boxShadow: '0 26px 70px rgba(0,0,0,.5)',
          animation: 'rnPop .28s cubic-bezier(.2,.9,.3,1) both',
        }}
      >
        {anchor && (
          <span
            className="absolute"
            style={{ left: -6, top: anchor.top + anchor.height / 2 - (top ?? 0) - 6, width: 12, height: 12, background: 'var(--surface)', borderLeft: '1px solid var(--line)', borderBottom: '1px solid var(--line)', transform: 'rotate(45deg)' }}
          />
        )}
        <div className="flex items-center gap-2">
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.7, textTransform: 'uppercase', color: 'var(--accent)' }}>{upgrade ? 'New' : 'Tip'}</span>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: -0.2 }}>{upgrade ? 'Your rail, your tools' : 'Where the tools live'}</span>
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--content-secondary)', lineHeight: 1.6, marginTop: 6 }}>
          {upgrade
            ? 'The rail now shows only the tools you pin. Every tool is still here, in All tools (this button). Want the rail you had? One click puts all its tools back, and you can unpin any of them later.'
            : 'The rail keeps the tools you pin. Every other tool, from the function reference to the Java tester, is in All tools (this button). Pin the ones you use and they join the rail.'}
        </p>
        <p style={{ fontSize: 11.5, color: 'var(--content-faint)', lineHeight: 1.5, marginTop: 6 }}>
          Drag rail icons to reorder them, or right-click one to move or unpin it.
        </p>
        <div className="flex items-center justify-end gap-2" style={{ marginTop: 12 }}>
          <button
            onClick={() => { onOpenAllTools(); onDone(); }}
            className={`${btn} mr-auto text-content-secondary hover:text-content`}
          >
            Open All tools
          </button>
          {upgrade && (
            <button
              onClick={() => { onKeepOld(); onDone(); }}
              className={`${btn} border border-line text-content hover:bg-surface-2`}
            >
              Keep my old rail
            </button>
          )}
          <button
            onClick={onDone}
            className={btn}
            style={{ border: '1px solid var(--accent)', background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            {upgrade ? 'Use the new rail' : 'Got it'}
          </button>
        </div>
      </div>
    </>
  );
}
