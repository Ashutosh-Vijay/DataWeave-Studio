import { useEffect, useRef, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { Icons } from './Icons';
import { isTauri } from '../bridge';

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
  appVersion?: string;
  updateAvailable?: boolean;
  onUpdateInstalled?: () => void;
}

type UpdateStatus = 'idle' | 'update-available' | 'checking' | 'up-to-date' | 'downloading' | 'error';

/**
 * Editorial-style About dialog — magazine spread vibe instead of a generic
 * SaaS modal. 760px wide, big display title, stat grid, "From the maker"
 * pull-quote section. The aim is: this is a free OSS thing made by one
 * person who cares, not corporate software.
 */
export function AboutDialog({ open, onClose, appVersion, updateAvailable, onUpdateInstalled }: AboutDialogProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');
  const [pct, setPct] = useState<number | null>(null);
  const [lastChecked, setLastChecked] = useState<string>('on launch');

  useEffect(() => {
    if (open && updateAvailable) setUpdateStatus('update-available');
  }, [open, updateAvailable]);

  useEffect(() => {
    if (!open) setUpdateStatus(updateAvailable ? 'update-available' : 'idle');
  }, [open, updateAvailable]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  async function handleCheckForUpdates() {
    setUpdateStatus('checking');
    try {
      const update = await check();
      if (update?.available) {
        setUpdateStatus('downloading');
        setPct(0);
        let total = 0;
        let got = 0;
        await update.downloadAndInstall((e) => {
          if (e.event === 'Started') total = e.data.contentLength ?? 0;
          else if (e.event === 'Progress') {
            got += e.data.chunkLength;
            if (total > 0) setPct(Math.min(99, Math.round((got / total) * 100)));
          } else if (e.event === 'Finished') setPct(100);
        });
        onUpdateInstalled?.();
        await relaunch();
      } else {
        setUpdateStatus('up-to-date');
        setLastChecked('just now');
      }
    } catch {
      setUpdateStatus('error');
    }
  }

  if (!open) return null;

  // Issue number = floor(months since launch / 3) + 1, but keep it editorial — Issue 4 for v1.4.x
  const issue = appVersion ? Math.max(1, parseInt(appVersion.split('.')[1] || '0', 10) + 1) : 1;
  const issueLabel = `Vol. 1 · Issue ${issue}`;
  const releaseMonth = new Date().toLocaleString('en-US', { month: 'long', year: 'numeric' });

  const updateDotColor =
    updateStatus === 'update-available' ? 'var(--warn)' :
    updateStatus === 'error' ? 'var(--err)' :
    'var(--accent)';
  const updateText =
    updateStatus === 'checking' ? 'Checking for updates…' :
    updateStatus === 'downloading' ? `Downloading update… ${pct ?? 0}%` :
    updateStatus === 'update-available' ? 'Update available' :
    updateStatus === 'error' ? 'Update check failed' :
    `Up to date · checked ${lastChecked}`;

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-start justify-center pt-[5vh] px-4 overflow-y-auto"
      style={{
        background: 'color-mix(in oklch, var(--bg) 70%, transparent)',
        backdropFilter: 'blur(3px)',
      }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[760px] my-auto rounded-xl overflow-hidden"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          boxShadow: '0 32px 90px color-mix(in oklch, oklch(0% 0 0) 55%, transparent)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button — floating top-right */}
        <button
          onClick={onClose}
          className="absolute top-[14px] right-[14px] w-7 h-7 rounded-md flex items-center justify-center text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer z-10"
          aria-label="Close"
        >
          <Icons.X size={13} />
        </button>

        {/* Header strip — issue / volume style */}
        <div
          className="px-7 py-3 flex items-center gap-3 text-[10.5px] uppercase tracking-[0.4px]"
          style={{
            borderBottom: '1px solid var(--line-subtle)',
            fontFamily: 'var(--font-mono)',
            color: 'var(--content-faint)',
          }}
        >
          <span>{issueLabel}</span>
          <span>·</span>
          <span>MIT</span>
          <span>·</span>
          <span>{releaseMonth}</span>
          <span className="flex-1" />
          <span style={{ color: 'var(--accent)' }}>read time 90s</span>
        </div>

        <div className="px-8 pt-7 pb-6">
          {/* Eyebrow */}
          <div
            className="text-[11px] font-semibold uppercase tracking-[1px] mb-3"
            style={{ color: 'var(--accent)' }}
          >
            {isTauri
              ? 'A free desktop tool for MuleSoft developers'
              : 'A free DataWeave playground for VS Code'}
          </div>

          {/* Title — display-size, tight */}
          <h1
            className="m-0 text-[48px] font-bold tracking-[-1.5px] leading-[1.02]"
            style={{ color: 'var(--content)' }}
          >
            DataWeave Studio.
            <br />
            <span style={{ color: 'var(--accent)' }}>Local. Offline. Yours.</span>
          </h1>

          {/* Dek */}
          <p
            className="mt-[18px] mb-0 text-[15px] leading-[1.55] max-w-[560px]"
            style={{ color: 'var(--content-muted)' }}
          >
            The real DataWeave 2.11 engine, {isTauri ? 'in a desktop app' : 'right inside VS Code'}.
            No Anypoint Studio, no browser tab, no signup. Write a script, drop a payload, hit Run.
          </p>

          <Divider />

          {/* Three-column meta — 2 rows of 3 stats */}
          <div className="grid grid-cols-3 gap-x-7 gap-y-6">
            <Stat kicker="version" value={appVersion || '—'} sub="latest stable" valueAccent />
            <Stat kicker="license" value="MIT" sub="free forever" />
            <Stat kicker="dw engine" value="2.11.0" sub="BSD-3 · MuleSoft" />
            {isTauri ? (
              <Stat kicker="size" value="~87 MB" sub="installer · all bundled" />
            ) : (
              <Stat kicker="java" value="17" sub="bundled · zero setup" />
            )}
            <Stat kicker="platforms" value="3" sub="Windows · macOS · Linux" />
            {isTauri ? (
              <Stat kicker="dependencies" value="0" sub="no cloud · no signup" />
            ) : (
              <Stat kicker="telemetry" value="0" sub="no cloud · no signup" />
            )}
          </div>

          <Divider />

          {/* Editor's note */}
          <div className="grid gap-6 items-start" style={{ gridTemplateColumns: '180px 1fr' }}>
            <div>
              <div
                className="text-[10.5px] font-semibold uppercase tracking-[0.8px] mb-[10px]"
                style={{ color: 'var(--content-faint)' }}
              >
                From the maker
              </div>
              <div className="flex items-center gap-[10px] mb-[10px]">
                <div
                  className="w-11 h-11 rounded-full flex items-center justify-center font-bold text-[14px] shrink-0"
                  style={{
                    background: `linear-gradient(135deg, var(--accent), var(--violet))`,
                    color: 'var(--accent-ink)',
                  }}
                >
                  AV
                </div>
                <div>
                  <div className="text-[13px] font-semibold" style={{ color: 'var(--content)' }}>Ashutosh Vijay</div>
                  <div className="text-[10.5px]" style={{ color: 'var(--content-faint)' }}>MuleSoft dev</div>
                  <div className="text-[10.5px] inline-flex items-center gap-1" style={{ color: 'var(--content-faint)' }}>
                    <Icons.Dot size={5} style={{ color: 'var(--accent)' }} /> Jaipur, IN
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                <SocialBtn icon="globe" label="Portfolio" url="https://ashutosh-vijay.dev/" />
                <SocialBtn icon="github" label="GitHub" url="https://github.com/Ashutosh-Vijay" />
                <SocialBtn icon="linkedin" label="LinkedIn" url="https://www.linkedin.com/in/ashutosh-vijay/" />
              </div>
            </div>
            <div
              className="relative pl-[18px]"
              style={{ borderLeft: '3px solid var(--accent)' }}
            >
              <div
                className="text-[16px] leading-[1.55] font-normal"
                style={{ color: 'var(--content)', letterSpacing: '-0.1px' }}
              >
                &ldquo;I built this because opening Anypoint Studio just to test a four-line
                transform was making me lose my mind. It&rsquo;s free. It&rsquo;s offline.
                It will always be free and offline.&rdquo;
              </div>
              <div
                className="mt-3 text-[11px]"
                style={{
                  color: 'var(--content-faint)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                — 02:14 IST, on a Tuesday, after one Anypoint restart too many
              </div>
            </div>
          </div>

          <Divider tight />

          {/* Footer row — status + tech stack + actions */}
          <div className="flex items-center gap-[14px] text-[11.5px] flex-wrap" style={{ color: 'var(--content-muted)' }}>
            {isTauri && import.meta.env.VITE_STORE_BUILD !== '1' ? (
              <button
                onClick={handleCheckForUpdates}
                disabled={updateStatus === 'checking' || updateStatus === 'downloading'}
                className="inline-flex items-center gap-[6px] cursor-pointer disabled:cursor-wait bg-transparent border-none p-0 font-inherit text-[11.5px]"
                style={{ color: updateDotColor, fontFamily: 'inherit' }}
                title="Click to check for updates"
              >
                <Icons.Dot size={8} />
                <span>{updateText}</span>
                {updateStatus === 'update-available' && <span style={{ color: 'var(--warn)' }}>· install now</span>}
              </button>
            ) : (
              <span className="inline-flex items-center gap-[6px]" style={{ color: 'var(--accent)' }}>
                <Icons.Dot size={8} />
                <span>{isTauri ? 'Installed via Microsoft Store · Store handles updates' : 'Installed via VS Code · Marketplace handles updates'}</span>
              </span>
            )}
            <span style={{ color: 'var(--content-faint)' }}>·</span>
            <span>{isTauri ? 'Tauri 2 · React · Monaco · Rust' : 'VS Code · React · Monaco · Node'}</span>
            <span className="flex-1" />
            <button
              onClick={() => openUrl('https://github.com/Ashutosh-Vijay/dataweave-studio/releases')}
              className="bg-transparent border-none cursor-pointer font-inherit text-[11.5px]"
              style={{ color: 'var(--content-muted)' }}
            >
              Release notes ↗
            </button>
            <button
              onClick={() => openUrl('https://github.com/Ashutosh-Vijay/dataweave-studio')}
              className="bg-transparent border-none cursor-pointer font-inherit text-[11.5px] font-semibold inline-flex items-center gap-1"
              style={{ color: 'var(--accent)' }}
            >
              ★ Star on GitHub
            </button>
          </div>

          {/* Fine print */}
          <div
            className="mt-[18px] text-[10px] leading-[1.6]"
            style={{ color: 'var(--content-faint)' }}
          >
            DataWeave runtime by MuleSoft / Salesforce, BSD-3-Clause License. Not
            affiliated with, endorsed by, or sponsored by MuleSoft or Salesforce.
          </div>
        </div>
      </div>
    </div>
  );
}

function Divider({ tight }: { tight?: boolean }) {
  return (
    <div
      className={tight ? 'my-[18px]' : 'my-6'}
      style={{ height: 1, background: 'var(--line-subtle)' }}
    />
  );
}

function Stat({ kicker, value, sub, valueAccent }: { kicker: string; value: string; sub: string; valueAccent?: boolean }) {
  return (
    <div>
      <div
        className="text-[10px] font-semibold uppercase tracking-[0.8px] mb-1"
        style={{ color: 'var(--content-faint)' }}
      >
        {kicker}
      </div>
      <div
        className="text-[26px] font-bold leading-[1.1]"
        style={{
          color: valueAccent ? 'var(--accent)' : 'var(--content)',
          letterSpacing: '-0.8px',
        }}
      >
        {value}
      </div>
      <div className="text-[11px] mt-0.5" style={{ color: 'var(--content-faint)' }}>{sub}</div>
    </div>
  );
}

function SocialBtn({ icon, label, url }: { icon: 'globe' | 'github' | 'linkedin'; label: string; url: string }) {
  const icons = {
    globe: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
    github: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
      </svg>
    ),
    linkedin: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.063 2.063 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
      </svg>
    ),
  };
  return (
    <button
      title={label}
      onClick={() => openUrl(url)}
      className="w-7 h-7 rounded-md flex items-center justify-center cursor-pointer transition-colors hover:bg-surface-2"
      style={{
        background: 'transparent',
        border: '1px solid var(--line-subtle)',
        color: 'var(--content-muted)',
      }}
    >
      {icons[icon]}
    </button>
  );
}
