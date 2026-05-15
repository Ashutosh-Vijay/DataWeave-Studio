import { useEffect, useRef, useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
  appVersion?: string;
  updateAvailable?: boolean;
  onUpdateInstalled?: () => void;
}

type UpdateStatus = 'idle' | 'update-available' | 'checking' | 'up-to-date' | 'downloading' | 'error';

export function AboutDialog({ open, onClose, appVersion, updateAvailable, onUpdateInstalled }: AboutDialogProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>('idle');

  // If the background check already found an update, show it immediately
  useEffect(() => {
    if (open && updateAvailable) setUpdateStatus('update-available');
  }, [open, updateAvailable]);

  // Reset status when dialog closes
  useEffect(() => {
    if (!open) setUpdateStatus(updateAvailable ? 'update-available' : 'idle');
  }, [open, updateAvailable]);

  async function handleCheckForUpdates() {
    setUpdateStatus('checking');
    try {
      const update = await check();
      if (update?.available) {
        setUpdateStatus('downloading');
        await update.downloadAndInstall();
        onUpdateInstalled?.();
        await relaunch();
      } else {
        setUpdateStatus('up-to-date');
      }
    } catch {
      setUpdateStatus('error');
    }
  }

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const statusText = {
    idle: 'Check if a newer version is available',
    'update-available': 'A new version is ready to download!',
    checking: 'Checking for updates…',
    'up-to-date': "You're on the latest version",
    downloading: 'Downloading and installing…',
    error: 'Could not reach update server — check your connection',
  }[updateStatus];

  const isUpdating = updateStatus === 'checking' || updateStatus === 'downloading';

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div className="bg-surface-sidebar border border-accent-border rounded-xl shadow-2xl shadow-[var(--accent)]/10 w-[460px] max-w-[90vw] overflow-hidden">
        {/* Header with logo */}
        <div className="relative bg-gradient-to-br from-[var(--dialog-header-from)] to-[var(--dialog-header-to)] px-6 py-6 border-b border-accent-border">
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="absolute top-3 right-3 text-content-faint hover:text-content-secondary transition-colors cursor-pointer p-1"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
          <div className="flex items-center gap-4">
            <div className="shrink-0 relative">
              <div className="absolute inset-0 rounded-xl bg-accent-dim blur-lg" />
              <img src="/logo.svg" alt="DataWeave Studio" width="56" height="56" className="relative rounded-xl" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-content tracking-tight">DataWeave Studio</h2>
              <div className="text-[11px] text-accent font-medium mt-0.5">
                {appVersion ? `v${appVersion}` : '…'} — Desktop Edition
              </div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Description */}
          <p className="text-sm text-content-secondary leading-relaxed">
            A local desktop app for MuleSoft developers to test DataWeave scripts without Anypoint Studio, browser limitations, or complex project setups. Supports context-aware autocomplete, named inputs, SOQL/SQL query modes, cURL import, and real-time execution.
          </p>

          <div className="border-t border-line/50" />

          {/* Built by */}
          <div className="space-y-2">
            <div className="text-[10px] text-content-faint uppercase tracking-widest font-medium">Built by</div>
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--violet)] flex items-center justify-center text-[var(--accent-ink)] font-bold text-sm shadow-lg">
                AV
              </div>
              <div>
                <div className="text-sm font-semibold text-content">Ashutosh Vijay</div>
                <div className="text-xs text-content-faint">MuleSoft Developer</div>
              </div>
            </div>
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => openUrl('https://ashutosh-vijay.dev/')}
                className="flex items-center gap-1.5 text-xs text-content-muted hover:text-accent transition-colors cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M0 8a8 8 0 1116 0A8 8 0 010 8zm7.5-6.923c-.67.204-1.335.82-1.887 1.855A7.97 7.97 0 005.145 4H7.5V1.077zM4.09 4a9.267 9.267 0 01.64-1.539 6.7 6.7 0 01.597-.933A7.025 7.025 0 002.255 4H4.09zm-.582 3.5c.03-.877.138-1.718.312-2.5H1.674a6.958 6.958 0 00-.656 2.5h2.49zM4.847 5a12.5 12.5 0 00-.338 2.5H7.5V5H4.847zM8.5 5v2.5h2.99a12.495 12.495 0 00-.337-2.5H8.5zM4.51 8.5a12.5 12.5 0 00.337 2.5H7.5V8.5H4.51zm3.99 0V11h2.653c.187-.765.306-1.608.338-2.5H8.5zM5.145 12c.138.386.295.744.468 1.068.552 1.035 1.218 1.65 1.887 1.855V12H5.145zm.182 2.472a6.696 6.696 0 01-.597-.933A9.268 9.268 0 014.09 12H2.255a7.024 7.024 0 003.072 2.472zM3.82 11a13.652 13.652 0 01-.312-2.5h-2.49c.062.89.291 1.733.656 2.5H3.82zm6.853 3.472A7.024 7.024 0 0013.745 12H11.91a9.27 9.27 0 01-.64 1.539 6.688 6.688 0 01-.597.933zM8.5 12v2.923c.67-.204 1.335-.82 1.887-1.855.173-.324.33-.682.468-1.068H8.5zm3.68-1h2.146c.365-.767.594-1.61.656-2.5h-2.49a13.65 13.65 0 01-.312 2.5zm2.802-3.5a6.959 6.959 0 00-.656-2.5H12.18c.174.782.282 1.623.312 2.5h2.49zM11.27 2.461c.247.464.462.98.64 1.539h1.835a7.024 7.024 0 00-3.072-2.472c.218.284.418.598.597.933zM10.855 4a7.966 7.966 0 00-.468-1.068C9.835 1.897 9.17 1.282 8.5 1.077V4h2.355z"/>
                </svg>
                Portfolio
              </button>
              <button
                onClick={() => openUrl('https://github.com/Ashutosh-Vijay')}
                className="flex items-center gap-1.5 text-xs text-content-muted hover:text-accent transition-colors cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                </svg>
                GitHub
              </button>
              <button
                onClick={() => openUrl('https://www.linkedin.com/in/ashutosh-vijay/')}
                className="flex items-center gap-1.5 text-xs text-content-muted hover:text-cyan transition-colors cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M0 1.146C0 .513.526 0 1.175 0h13.65C15.474 0 16 .513 16 1.146v13.708c0 .633-.526 1.146-1.175 1.146H1.175C.526 16 0 15.487 0 14.854V1.146zm4.943 12.248V6.169H2.542v7.225h2.401zm-1.2-8.212c.837 0 1.358-.554 1.358-1.248-.015-.709-.52-1.248-1.342-1.248-.822 0-1.359.54-1.359 1.248 0 .694.521 1.248 1.327 1.248h.016zm4.908 8.212V9.359c0-.216.016-.432.08-.586.173-.431.568-.878 1.232-.878.869 0 1.216.662 1.216 1.634v3.865h2.401V9.25c0-2.22-1.184-3.252-2.764-3.252-1.274 0-1.845.7-2.165 1.193v.025h-.016a5.54 5.54 0 0 1 .016-.025V6.169h-2.4c.03.678 0 7.225 0 7.225h2.4z"/>
                </svg>
                LinkedIn
              </button>
            </div>
          </div>

          <div className="border-t border-line/50" />

          {/* Update checker */}
          <div className={`flex items-center justify-between gap-3 rounded-lg p-2.5 -mx-1 transition-colors ${
            updateStatus === 'update-available' ? 'bg-accent-dim border border-accent-border' : ''
          }`}>
            <div className={`text-xs flex items-center gap-1.5 ${
              updateStatus === 'update-available' ? 'text-accent font-medium' : 'text-content-faint'
            }`}>
              {updateStatus === 'update-available' && (
                <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />
              )}
              {statusText}
            </div>
            <button
              onClick={handleCheckForUpdates}
              disabled={isUpdating}
              className="shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer bg-accent-dim hover:bg-accent-dim text-accent border-accent-border"
            >
              {isUpdating ? '…' : updateStatus === 'update-available' ? 'Update now' : 'Check for updates'}
            </button>
          </div>

          <div className="border-t border-line/50" />

          {/* Credits */}
          <div className="text-[10px] text-content-ghost space-y-1">
            <div>Built with Tauri v2, React, TypeScript & Monaco Editor</div>
            <div>DataWeave runtime by MuleSoft/Salesforce (BSD-3-Clause License)</div>
            <div className="opacity-70">Not affiliated with, endorsed by, or sponsored by MuleSoft or Salesforce.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
