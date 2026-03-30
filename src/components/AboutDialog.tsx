import { useEffect, useRef } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';

interface AboutDialogProps {
  open: boolean;
  onClose: () => void;
}

export function AboutDialog({ open, onClose }: AboutDialogProps) {
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div className="bg-surface-sidebar border border-[#00a0df]/30 rounded-xl shadow-2xl shadow-[#00a0df]/10 w-[460px] max-w-[90vw] overflow-hidden">
        {/* Header with logo */}
        <div className="relative bg-gradient-to-br from-[var(--dialog-header-from)] to-[var(--dialog-header-to)] px-6 py-6 border-b border-[#00a0df]/20">
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
            {/* Logo — weave icon */}
            <div className="shrink-0 relative">
              <div className="absolute inset-0 rounded-xl bg-[#00a0df]/20 blur-lg" />
              <img src="/logo.svg" alt="DataWeave Studio" width="56" height="56" className="relative rounded-xl" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-content tracking-tight">DataWeave Studio</h2>
              <div className="text-[11px] text-[#00a0df] font-medium mt-0.5">v1.0.0 — Desktop Edition</div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Description */}
          <p className="text-sm text-content-secondary leading-relaxed">
            A local desktop app for MuleSoft developers to test DataWeave scripts without Anypoint Studio, browser limitations, or complex project setups. Supports context-aware autocomplete, named inputs, SOQL/SQL query modes, cURL import, and real-time execution.
          </p>

          {/* Divider */}
          <div className="border-t border-line/50" />

          {/* Built by */}
          <div className="space-y-2">
            <div className="text-[10px] text-content-faint uppercase tracking-widest font-medium">Built by</div>
            <div className="flex items-center gap-3">
              {/* Avatar placeholder with initials */}
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#00a0df] to-[#0060a0] flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-[#00a0df]/20">
                AV
              </div>
              <div>
                <div className="text-sm font-semibold text-content">Ashutosh Vijay</div>
                <div className="text-xs text-content-faint">MuleSoft Developer</div>
              </div>
            </div>
            {/* Links — use Tauri opener to open in default browser */}
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => openUrl('https://github.com/Ashutosh-Vijay')}
                className="flex items-center gap-1.5 text-xs text-content-muted hover:text-[#00a0df] transition-colors cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/>
                </svg>
                GitHub
              </button>
              <button
                onClick={() => openUrl('https://www.linkedin.com/in/ashutosh-vijay/')}
                className="flex items-center gap-1.5 text-xs text-content-muted hover:text-[#0077b5] transition-colors cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M0 1.146C0 .513.526 0 1.175 0h13.65C15.474 0 16 .513 16 1.146v13.708c0 .633-.526 1.146-1.175 1.146H1.175C.526 16 0 15.487 0 14.854V1.146zm4.943 12.248V6.169H2.542v7.225h2.401zm-1.2-8.212c.837 0 1.358-.554 1.358-1.248-.015-.709-.52-1.248-1.342-1.248-.822 0-1.359.54-1.359 1.248 0 .694.521 1.248 1.327 1.248h.016zm4.908 8.212V9.359c0-.216.016-.432.08-.586.173-.431.568-.878 1.232-.878.869 0 1.216.662 1.216 1.634v3.865h2.401V9.25c0-2.22-1.184-3.252-2.764-3.252-1.274 0-1.845.7-2.165 1.193v.025h-.016a5.54 5.54 0 0 1 .016-.025V6.169h-2.4c.03.678 0 7.225 0 7.225h2.4z"/>
                </svg>
                LinkedIn
              </button>
            </div>
          </div>

          {/* Divider */}
          <div className="border-t border-line/50" />

          {/* Credits */}
          <div className="text-[10px] text-content-ghost space-y-1">
            <div>Built with Tauri v2, React, TypeScript & Monaco Editor</div>
            <div>DataWeave CLI by MuleSoft/Salesforce (BSD-3-Clause License)</div>
            <div className="text-content-ghost opacity-70">Not affiliated with, endorsed by, or sponsored by MuleSoft or Salesforce.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
