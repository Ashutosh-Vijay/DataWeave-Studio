import { useEffect, useRef, useState } from 'react';
import { Icons } from './Icons';

interface FirstWorkspacePromptProps {
  open: boolean;
  /** Create the workspace with this name and dismiss. Passes empty string if
   *  user picks "Use default" → caller fills in "My Workspace". */
  onCreate: (name: string) => void;
}

/**
 * One-time prompt that lands the user inside a real workspace before they
 * see the editor. The previous flow (RequestTabs without orientation) made
 * "what's a workspace? what's a request?" hard to grasp.
 *
 * Surfaced exactly once — the App tracks `dw.firstWorkspace.seen` in
 * localStorage so returning users skip this entirely.
 */
export function FirstWorkspacePrompt({ open, onCreate }: FirstWorkspacePromptProps) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setName('');
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  if (!open) return null;

  const submit = (n: string) => {
    onCreate(n.trim() || 'My Workspace');
  };

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
        {/* Header */}
        <div className="px-6 pt-6 pb-2">
          <div className="flex items-start gap-3">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: 'var(--surface-2)',
                color: 'var(--accent)',
              }}
            >
              <Icons.Folder size={16} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[15px] font-semibold" style={{ color: 'var(--content)' }}>
                Create your first workspace
              </div>
              <div className="text-[12.5px] mt-1.5 leading-relaxed" style={{ color: 'var(--content-muted)' }}>
                A workspace holds your DataWeave scripts &mdash; each script
                is called a <span style={{ color: 'var(--accent)', fontWeight: 500 }}>request</span>.
                Save many under one workspace, like a Postman collection.
              </div>
            </div>
          </div>
        </div>

        {/* Form */}
        <form
          onSubmit={(e) => { e.preventDefault(); submit(name); }}
          className="px-6 pt-3 pb-5"
        >
          <label
            className="text-[10.5px] font-semibold uppercase tracking-[0.5px] block mb-1.5"
            style={{ color: 'var(--content-faint)' }}
          >
            Workspace name
          </label>
          <input
            ref={inputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Workspace"
            spellCheck={false}
            className="w-full h-9 px-3 rounded-md outline-none text-[13px]"
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--line)',
              color: 'var(--content)',
            }}
          />
          <div className="text-[11px] mt-1.5" style={{ color: 'var(--content-faint)' }}>
            You can rename it anytime. Leave blank to use the default.
          </div>
        </form>

        {/* Footer */}
        <div
          className="px-6 py-3 flex items-center gap-2"
          style={{ borderTop: '1px solid var(--line-subtle)', background: 'var(--surface-2)' }}
        >
          <button
            type="button"
            onClick={() => submit('')}
            className="h-8 px-3.5 rounded-md text-[12.5px] cursor-pointer"
            style={{
              background: 'transparent',
              border: '1px solid var(--line)',
              color: 'var(--content-secondary)',
            }}
            title="Skip and use 'My Workspace' as the name"
          >
            Use default
          </button>
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => submit(name)}
            className="h-8 px-3.5 rounded-md text-[12.5px] font-semibold cursor-pointer inline-flex items-center gap-1.5"
            style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          >
            <Icons.Plus size={11} />
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
