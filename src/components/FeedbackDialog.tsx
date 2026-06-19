import { useEffect, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { isTauri } from '../bridge';
import { Icons } from './Icons';

/**
 * Feedback / bug report / feature request.
 *
 * Respects the offline / no-telemetry promise: the app NEVER sends anything.
 * It composes a GitHub "new issue" URL (title + body, pre-filled) and hands it
 * to the browser when the user clicks — exactly like the existing "Star on
 * GitHub" links. The user reviews and submits it on GitHub themselves. A Copy
 * button is offered as an offline fallback.
 */
const REPO = 'Ashutosh-Vijay/DataWeave-Studio';

type Kind = 'bug' | 'feature' | 'other';

const KINDS: { id: Kind; label: string }[] = [
  { id: 'bug', label: 'Bug' },
  { id: 'feature', label: 'Feature' },
  { id: 'other', label: 'Other' },
];

export function FeedbackDialog({ open, onClose, appVersion }: { open: boolean; onClose: () => void; appVersion?: string }) {
  const [kind, setKind] = useState<Kind>('bug');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Reset when reopened so a stale draft doesn't linger.
  useEffect(() => { if (open) { setKind('bug'); setTitle(''); setDetails(''); } }, [open]);

  if (!open) return null;

  const label = kind === 'bug' ? 'bug' : kind === 'feature' ? 'enhancement' : '';
  const prefix = kind === 'bug' ? '[Bug] ' : kind === 'feature' ? '[Feature] ' : '';
  const env = [
    `- App: DataWeave Studio${appVersion ? ` v${appVersion}` : ''}`,
    `- Runtime: ${isTauri ? 'Desktop app' : 'VS Code extension'}`,
    `- OS: ${(typeof navigator !== 'undefined' && (navigator.platform || navigator.userAgent)) || 'unknown'}`,
  ].join('\n');
  const body =
    (kind === 'bug'
      ? `**What happened?**\n${details}\n\n**Steps to reproduce**\n1. \n2. \n\n**What did you expect?**\n`
      : kind === 'feature'
        ? `**What would you like?**\n${details}\n\n**Why — what are you trying to do?**\n`
        : `${details}\n`) + `\n\n---\n*Environment (auto-filled — edit or remove as you like)*\n${env}`;

  const issueUrl =
    `https://github.com/${REPO}/issues/new?title=${encodeURIComponent(prefix + title)}` +
    `&body=${encodeURIComponent(body)}` +
    (label ? `&labels=${encodeURIComponent(label)}` : '');

  const submit = () => { void openUrl(issueUrl); onClose(); };
  const copyText = `${prefix}${title}\n\n${body}`;
  const copy = () => { void navigator.clipboard?.writeText(copyText).catch(() => {}); };

  const ph = kind === 'bug'
    ? 'e.g. Secure property with a $ throws a compilation error'
    : kind === 'feature'
      ? 'e.g. Add a JSON-to-XML quick converter'
      : 'What’s on your mind?';

  return (
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center pt-[10vh] px-4"
      style={{ background: 'color-mix(in oklch, var(--bg) 68%, transparent)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[520px] rounded-xl overflow-hidden flex flex-col"
        style={{ background: 'var(--surface)', border: '1px solid var(--line)', boxShadow: '0 28px 80px color-mix(in oklch, oklch(0% 0 0) 55%, transparent)', maxHeight: '82vh' }}
      >
        {/* Header */}
        <div className="px-5 py-4 flex items-start gap-3" style={{ borderBottom: '1px solid var(--line-subtle)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--surface-2)', color: 'var(--accent)' }}>
            <Icons.Help size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[14.5px] font-semibold" style={{ color: 'var(--content)' }}>Send feedback</div>
            <div className="text-[12px] mt-[3px]" style={{ color: 'var(--content-muted)' }}>
              Found a bug or want a feature? Tell me here.
            </div>
          </div>
          <button onClick={onClose} className="w-7 h-7 rounded-md flex items-center justify-center cursor-pointer hover:bg-surface-2 shrink-0" style={{ color: 'var(--content-faint)' }} aria-label="Close">
            <Icons.X size={13} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3.5 overflow-y-auto">
          {/* Kind */}
          <div className="inline-flex p-[3px] rounded-[8px] bg-surface-2 border border-line gap-0.5">
            {KINDS.map((k) => {
              const active = kind === k.id;
              return (
                <button
                  key={k.id}
                  onClick={() => setKind(k.id)}
                  className="inline-flex items-center gap-1.5 px-3.5 h-[26px] rounded-md text-[12.5px] font-medium cursor-pointer transition-colors"
                  style={{ background: active ? 'var(--surface-3)' : 'transparent', color: active ? 'var(--content)' : 'var(--content-muted)' }}
                >
                  {k.label}
                </button>
              );
            })}
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.5px] mb-1.5" style={{ color: 'var(--content-faint)' }}>Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={ph}
              autoFocus
              className="w-full h-9 px-3 rounded-md text-[13px] bg-surface-2 border border-line text-content focus:outline-none focus:border-accent"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.5px] mb-1.5" style={{ color: 'var(--content-faint)' }}>Details <span className="font-normal normal-case" style={{ color: 'var(--content-ghost)' }}>(optional)</span></label>
            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              rows={4}
              placeholder={kind === 'bug' ? 'What happened, and what did you expect?' : 'A bit more context helps.'}
              className="w-full px-3 py-2 rounded-md text-[13px] leading-relaxed bg-surface-2 border border-line text-content focus:outline-none focus:border-accent resize-none"
            />
          </div>

          <div className="flex items-start gap-2 text-[11.5px] leading-relaxed" style={{ color: 'var(--content-muted)' }}>
            <Icons.Secure size={12} style={{ marginTop: 2, color: 'var(--content-faint)', flexShrink: 0 }} />
            <span>
              Opens a pre-filled issue on GitHub <b>in your browser</b> — the app itself sends nothing. You review and submit it there (a GitHub account is needed). No account? Use <b>Copy</b> and email it.
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 flex items-center gap-2" style={{ borderTop: '1px solid var(--line-subtle)', background: 'var(--surface-2)' }}>
          <button
            onClick={copy}
            className="h-8 px-3 rounded-md text-[12px] font-medium cursor-pointer inline-flex items-center gap-1.5"
            style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--content-secondary)' }}
          >
            <Icons.Copy size={12} /> Copy
          </button>
          <span className="flex-1" />
          <button onClick={onClose} className="h-8 px-3 rounded-md text-[12px] font-medium cursor-pointer" style={{ background: 'transparent', border: '1px solid var(--line)', color: 'var(--content-secondary)' }}>
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!title.trim()}
            className="h-8 px-3.5 rounded-md text-[12px] font-semibold cursor-pointer inline-flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            Open on GitHub ↗
          </button>
        </div>
      </div>
    </div>
  );
}
