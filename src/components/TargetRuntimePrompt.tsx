import { useState } from 'react';
import { Icons } from './Icons';
import { TARGETS } from '../targetRuntime';

/**
 * One-time question for installs that predate the target-runtime setting.
 *
 * New users are asked inside FirstWorkspacePrompt instead — App decides which
 * of the two fires, so nobody sees both. Dismissing this keeps the default
 * ("latest", no version checking), which is exactly how the app behaved
 * before, so ignoring it costs nothing.
 */
export function TargetRuntimePrompt({
  initial, onDone,
}: {
  initial: string;
  onDone: (level: string) => void;
}) {
  const [target, setTarget] = useState(initial);

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      style={{
        background: 'color-mix(in oklch, var(--bg) 65%, transparent)',
        backdropFilter: 'blur(3px)',
      }}
    >
      <div
        className="w-full max-w-[460px] rounded-xl overflow-hidden"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--line)',
          boxShadow: '0 32px 80px color-mix(in oklch, oklch(0% 0 0) 55%, transparent)',
        }}
      >
        <div className="px-6 pt-6 pb-2">
          <div className="flex items-start gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{ background: 'var(--surface-2)', color: 'var(--accent)' }}
            >
              <Icons.Terminal size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-semibold" style={{ color: 'var(--content)' }}>
                Which Mule do you deploy to?
              </div>
              <div className="text-[12.5px] mt-1.5 leading-relaxed" style={{ color: 'var(--content-muted)' }}>
                The engine here is the newest DataWeave. Tell it which runtime you
                actually ship to and it will flag anything too new &mdash; a function
                or syntax your Mule doesn&rsquo;t have fails here, instead of on the server.
              </div>
            </div>
          </div>
        </div>

        <div className="px-6 pt-3 pb-5">
          <select
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="w-full h-9 px-2.5 rounded-md outline-none text-[13px] cursor-pointer"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              color: 'var(--content)',
            }}
          >
            <option value="">Latest — don&rsquo;t check</option>
            {TARGETS.map((t) => (
              <option key={t.level} value={t.level}>{t.label}</option>
            ))}
          </select>
          <div className="text-[11px] mt-1.5" style={{ color: 'var(--content-faint)' }}>
            Asked once. Change it anytime in Settings &rarr; Runtime, or from the
            toolbar next to Run.
          </div>
        </div>

        <div
          className="px-6 py-3 flex items-center gap-2"
          style={{ borderTop: '1px solid var(--line-subtle)', background: 'var(--surface-2)' }}
        >
          <button
            type="button"
            onClick={() => onDone('')}
            className="h-8 px-3.5 rounded-md text-[12.5px] cursor-pointer"
            style={{
              background: 'transparent',
              border: '1px solid var(--line)',
              color: 'var(--content-secondary)',
            }}
            title="Keep running against the newest DataWeave, with no version checking"
          >
            Not now
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => onDone(target)}
            className="h-8 px-3.5 rounded-md text-[12.5px] font-semibold cursor-pointer"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            {target ? 'Use this target' : 'Continue'}
          </button>
        </div>
      </div>
    </div>
  );
}
