/**
 * Config encryption — secure properties for a whole file.
 *
 * The Secure Properties tool beside this one handles one value at a time, which
 * is the wrong shape for the actual job: you have a config with a dozen fields,
 * some already encrypted, and you want the file back with the rest done too.
 * Paste it, pick a direction, run.
 *
 * The two things that make it safe to press repeatedly: a value already written
 * as `![...]` is never re-encrypted, and only the value ranges change — every
 * comment, blank line and quoting choice in the file survives. See
 * ../configCrypto for both.
 */
import { useEffect, useMemo, useState } from 'react';
import { open, save } from '@tauri-apps/plugin-dialog';
import { invoke } from '../bridge';
import { MiniEditor } from './MiniEditor';
import { Icons } from './Icons';
import { WindowControls } from './WindowControls';
import {
  ConfigFormat, ConfigField, detectFormat, scanConfig, convertConfig, looksLikeSecret,
} from '../configCrypto';
import {
  EncryptionSettings, DEFAULT_ENCRYPTION_SETTINGS, inspectAesKey,
} from '../cryptoUtils';

const ALGORITHMS = ['AES', 'Blowfish', 'DES', 'DESede', 'RC2'] as const;
const MODES = ['CBC', 'CFB', 'ECB', 'OFB'] as const;

const SAMPLE = `db:
  host: db.production.internal
  port: 5432
  user: app_admin
  password: MySuperSecretPassword123!

api:
  client_id: 7f8b9c0d1e2f3a4b
  client_secret: shhh_dont_push_to_github
`;

export function ConfigCryptoPanel({ open: isOpen, onClose }: { open: boolean; onClose: () => void }) {
  const [source, setSource] = useState('');
  const [result, setResult] = useState('');
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [settings, setSettings] = useState<EncryptionSettings>(DEFAULT_ENCRYPTION_SETTINGS);
  const [direction, setDirection] = useState<'encrypt' | 'decrypt'>('encrypt');
  const [formatOverride, setFormatOverride] = useState<ConfigFormat | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [error, setError] = useState('');
  const [failures, setFailures] = useState<{ path: string; message: string }[]>([]);
  /** How many values the last run actually rewrote. Reported by the run rather
   *  than recomputed from the field list, which still describes the source. */
  const [changed, setChanged] = useState(0);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);
  const [fieldsOpen, setFieldsOpen] = useState(true);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const detected = useMemo(() => detectFormat(source), [source]);
  const format = formatOverride ?? detected;
  const fields = useMemo(() => scanConfig(source, format), [source, format]);

  const eligible = useMemo(
    () => fields
      .map((f, i) => ({ f, i }))
      .filter(({ f }) => !f.skip && (direction === 'encrypt' ? !f.encrypted : f.encrypted)),
    [fields, direction],
  );

  // Editing the source renumbers every field, so a carried-over selection would
  // point at the wrong lines. Start from "everything eligible" each time.
  const eligibleKey = eligible.map(({ i }) => i).join(',');
  useEffect(() => {
    setSelected(new Set(eligible.map(({ i }) => i)));
  }, [eligibleKey]); // eslint-disable-line react-hooks/exhaustive-deps

  // Same argv codepage trap as the single-value tool: on Windows the JVM decodes
  // command-line arguments with the OS ANSI codepage, so anything outside it is
  // encrypted as '?' — silently, and unrecoverably.
  const CP1252_EXTRAS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  const unsupported = direction === 'encrypt' && /Windows/i.test(navigator.userAgent)
    ? eligible
      .filter(({ i }) => selected.has(i))
      .filter(({ f }) => [...f.value].some((c) => (c.codePointAt(0) ?? 0) > 255 && !CP1252_EXTRAS.includes(c)))
      .map(({ f }) => f.path)
    : [];

  const aes = inspectAesKey(key);
  const selectedCount = eligible.filter(({ i }) => selected.has(i)).length;

  const run = async () => {
    if (!key.trim()) { setError('An encryption key is required.'); return; }
    if (!selectedCount) { setError(`Nothing selected to ${direction}.`); return; }
    setBusy(true);
    setError('');
    setFailures([]);
    setResult('');
    setProgress({ done: 0, total: selectedCount });
    try {
      const chosen = eligible.filter(({ i }) => selected.has(i)).map(({ f }) => f);
      const outcome = await convertConfig(
        source, format, chosen, direction, key, settings,
        (done, total) => setProgress({ done, total }),
      );
      setResult(outcome.text);
      setChanged(outcome.changed);
      setFailures(outcome.failures);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const loadFile = async () => {
    const picked = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Config', extensions: ['yaml', 'yml', 'properties', 'txt'] }],
    });
    const path = typeof picked === 'string' ? picked : null;
    if (!path) return;
    try {
      setSource(await invoke<string>('read_text_file', { path }));
      setResult('');
      setFormatOverride(null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const saveResult = async () => {
    if (!result) return;
    const path = await save({
      defaultPath: format === 'properties' ? 'config.properties' : 'config.yaml',
      filters: [{ name: 'Config', extensions: format === 'properties' ? ['properties'] : ['yaml', 'yml'] }],
    });
    if (!path) return;
    await invoke('save_output_file', { path, content: result });
    setSaved(true);
    setTimeout(() => setSaved(false), 1800);
  };

  const copyResult = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const setAll = (which: 'all' | 'none' | 'secrets') => {
    if (which === 'none') return setSelected(new Set());
    if (which === 'all') return setSelected(new Set(eligible.map(({ i }) => i)));
    setSelected(new Set(eligible.filter(({ f }) => looksLikeSecret(f.path)).map(({ i }) => i)));
  };

  if (!isOpen) return null;

  const alreadyDone = fields.filter((f) => !f.skip && (direction === 'encrypt' ? f.encrypted : !f.encrypted)).length;

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-bg">
      <header data-tauri-drag-region className="h-11 shrink-0 flex items-center gap-2 pl-4 pr-3 border-b border-line bg-surface">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors"
          title="Back to workspace (Esc)"
        >
          <Icons.ChevronRight size={12} className="rotate-180" />
          Back
        </button>
        <div className="w-px h-4 bg-line" />
        <Icons.Key size={15} />
        <span className="text-[13px] font-semibold text-content">Config encryption</span>
        <span className="text-[11px] text-content-ghost">— encrypt or decrypt every value in a config at once</span>
        <span className="flex-1" />
        <WindowControls />
      </header>

      {/* Key + cipher. Everything here has to match what the Mule runtime is
          configured with, or the output decrypts to nothing useful. */}
      <div className="shrink-0 flex items-center gap-2 px-3.5 h-11 border-b border-line-subtle bg-surface">
        <div className="relative">
          <input
            type={showKey ? 'text' : 'password'}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Encryption key"
            spellCheck={false}
            autoComplete="off"
            className="w-[240px] h-7 pl-2.5 pr-8 rounded-md bg-surface-2 border border-line text-[12px] font-mono text-content placeholder:text-content-ghost outline-none focus:border-accent"
          />
          <button
            onClick={() => setShowKey((v) => !v)}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 text-content-faint hover:text-content cursor-pointer"
            title={showKey ? 'Hide key' : 'Show key'}
          >
            <Icons.Secure size={12} />
          </button>
        </div>
        {settings.algorithm === 'AES' && key.length > 0 && (
          <span className="text-[10.5px] font-mono" style={{ color: aes.aesValid ? 'var(--accent)' : 'var(--warn)' }}>
            {aes.aesValid ? aes.aesVariant : `${aes.bytes} bytes — AES wants 16, 24 or 32`}
          </span>
        )}

        <select
          value={settings.algorithm}
          onChange={(e) => setSettings({ ...settings, algorithm: e.target.value })}
          className="h-7 px-2 rounded-md bg-surface-2 border border-line text-[11.5px] text-content-secondary outline-none focus:border-accent cursor-pointer"
          title="Algorithm"
        >
          {ALGORITHMS.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
        <select
          value={settings.mode}
          onChange={(e) => setSettings({ ...settings, mode: e.target.value })}
          className="h-7 px-2 rounded-md bg-surface-2 border border-line text-[11.5px] text-content-secondary outline-none focus:border-accent cursor-pointer"
          title="Cipher mode"
        >
          {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <label className="inline-flex items-center gap-1.5 text-[11.5px] text-content-faint cursor-pointer select-none">
          <input
            type="checkbox"
            checked={settings.useRandomIVs}
            onChange={(e) => setSettings({ ...settings, useRandomIVs: e.target.checked })}
            className="cursor-pointer"
          />
          Random IVs
        </label>

        <span className="flex-1" />

        {/* Direction decides what the field list offers and what the button
            does, so there is one action rather than two that disagree. */}
        <div className="inline-flex gap-0.5 p-0.5 rounded-md border" style={{ background: 'var(--surface-2)', borderColor: 'var(--line)' }}>
          {(['encrypt', 'decrypt'] as const).map((d) => (
            <button
              key={d}
              onClick={() => { setDirection(d); setResult(''); }}
              className="inline-flex items-center h-5 px-2.5 rounded text-[11px] cursor-pointer transition-colors capitalize"
              style={{
                background: direction === d ? 'var(--surface)' : 'transparent',
                color: direction === d ? 'var(--content)' : 'var(--content-faint)',
                fontWeight: direction === d ? 600 : 500,
              }}
            >
              {d}
            </button>
          ))}
        </div>
        <button
          onClick={run}
          disabled={busy || !selectedCount || !key.trim()}
          className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-3 rounded-md text-[12.5px] font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          title={selectedCount ? `${direction} ${selectedCount} value${selectedCount > 1 ? 's' : ''}` : `Nothing to ${direction}`}
        >
          <Icons.Key size={11} />
          {busy
            ? `${progress.done}/${progress.total}…`
            : `${direction === 'encrypt' ? 'Encrypt' : 'Decrypt'} ${selectedCount || ''}`.trim()}
        </button>
      </div>

      {(error || failures.length > 0 || unsupported.length > 0) && (
        <div className="shrink-0 px-3.5 py-2 border-b text-[11.5px]" style={{ background: 'color-mix(in oklch, var(--err) 8%, transparent)', borderColor: 'color-mix(in oklch, var(--err) 26%, transparent)', color: 'var(--err)' }}>
          {error && <div>{error}</div>}
          {unsupported.length > 0 && (
            <div>
              This Java runtime can’t carry non-English characters through to the encryptor on Windows — {unsupported.join(', ')} would come back as “?”. Encrypt those elsewhere.
            </div>
          )}
          {failures.map((f) => <div key={f.path}><span className="font-mono">{f.path}</span> — {f.message}</div>)}
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        <Pane
          title="Source"
          badge={`${format === 'properties' ? 'properties' : 'YAML'}${formatOverride ? '' : ' · detected'}`}
          onBadgeClick={() => setFormatOverride(format === 'yaml' ? 'properties' : 'yaml')}
          actions={
            <>
              <SmallBtn onClick={loadFile}>Load file</SmallBtn>
              {!source && <SmallBtn onClick={() => setSource(SAMPLE)}>Paste a sample</SmallBtn>}
            </>
          }
        >
          {/* verbatim: indentation is structure in YAML, and this editor exists
              to pass a file through unchanged. Reformatting a pasted config
              would corrupt it before it is ever scanned. */}
          <MiniEditor value={source} onChange={(v) => { setSource(v); setResult(''); }} language="plaintext" height="100%" verbatim />
        </Pane>

        <div className="w-px bg-line shrink-0" />

        <Pane
          title="Result"
          badge={result ? `${changed} value${changed === 1 ? '' : 's'} changed` : undefined}
          actions={
            <>
              <SmallBtn onClick={copyResult} disabled={!result}>{copied ? 'Copied' : 'Copy'}</SmallBtn>
              <SmallBtn onClick={saveResult} disabled={!result}>{saved ? 'Saved' : 'Save as…'}</SmallBtn>
            </>
          }
        >
          {result
            ? <MiniEditor value={result} onChange={() => {}} language="plaintext" height="100%" readOnly verbatim />
            : (
              <div className="h-full grid place-items-center px-6 text-center">
                <div className="text-[11.5px] text-content-faint max-w-[300px] leading-relaxed">
                  {source.trim()
                    ? `Press ${direction === 'encrypt' ? 'Encrypt' : 'Decrypt'} — the file comes back here with the selected values changed and nothing else touched.`
                    : 'Paste a YAML or .properties config on the left, or load one from disk.'}
                </div>
              </div>
            )}
        </Pane>
      </div>

      {/* Every value the scanner found, and what will happen to each. This is
          the part that makes the run predictable: nothing is encrypted that you
          can't see listed here first. */}
      <div className="shrink-0 border-t border-line bg-surface" style={{ maxHeight: '42%', display: 'flex', flexDirection: 'column' }}>
        <div className="shrink-0 flex items-center gap-2 px-3.5 h-7">
          <button
            onClick={() => setFieldsOpen((o) => !o)}
            className="inline-flex items-center gap-2 text-[10.5px] uppercase tracking-[0.6px] font-semibold text-content-faint hover:text-content-secondary cursor-pointer"
          >
            <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor" className={`transition-transform ${fieldsOpen ? 'rotate-90' : ''}`}>
              <path d="M3 1l5 4-5 4V1z" />
            </svg>
            Values
            <span className="inline-flex items-center justify-center min-w-[16px] h-[15px] px-1 rounded-full font-mono text-[9.5px] text-accent" style={{ background: 'var(--accent-dim)' }}>
              {fields.length}
            </span>
          </button>
          <span className="text-[10.5px] text-content-ghost">
            {selectedCount} selected
            {alreadyDone > 0 && ` · ${alreadyDone} already ${direction === 'encrypt' ? 'encrypted' : 'plain'}, skipped`}
          </span>
          <span className="flex-1" />
          {eligible.length > 0 && (
            <>
              <SmallBtn onClick={() => setAll('all')}>All</SmallBtn>
              <SmallBtn onClick={() => setAll('secrets')}>Secrets only</SmallBtn>
              <SmallBtn onClick={() => setAll('none')}>None</SmallBtn>
            </>
          )}
        </div>
        {fieldsOpen && (
          <div className="overflow-auto pb-2">
            {fields.length === 0 ? (
              <div className="px-3.5 py-3 text-[11px] text-content-faint italic">
                No key/value pairs found yet.
              </div>
            ) : (
              <table className="w-full text-[11.5px] font-mono border-collapse">
                <tbody>
                  {fields.map((f, i) => (
                    <FieldRow
                      key={`${f.line}:${f.path}`}
                      field={f}
                      direction={direction}
                      selectable={eligible.some((e) => e.i === i)}
                      checked={selected.has(i)}
                      onToggle={() => setSelected((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i); else next.add(i);
                        return next;
                      })}
                    />
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FieldRow({
  field, direction, selectable, checked, onToggle,
}: {
  field: ConfigField;
  direction: 'encrypt' | 'decrypt';
  selectable: boolean;
  checked: boolean;
  onToggle: () => void;
}) {
  const status = field.skip
    ? field.skip
    : selectable
      ? ''
      : direction === 'encrypt' ? 'already encrypted' : 'not encrypted';
  const preview = field.value.length > 44 ? `${field.value.slice(0, 44)}…` : field.value;
  return (
    <tr
      onClick={() => selectable && onToggle()}
      className={selectable ? 'cursor-pointer hover:bg-surface-2' : ''}
      style={{ borderTop: '1px solid var(--line-subtle)', opacity: selectable ? 1 : 0.55 }}
    >
      <td className="w-[1%] pl-3.5 pr-2 py-1 align-top">
        {selectable ? (
          <span
            className="inline-grid place-items-center w-3 h-3 rounded-[3px] border align-middle"
            style={{ borderColor: checked ? 'var(--accent)' : 'var(--line-secondary)', background: checked ? 'var(--accent)' : 'transparent' }}
          >
            {checked && <Icons.Dot size={7} />}
          </span>
        ) : (
          <span className="text-content-ghost">—</span>
        )}
      </td>
      <td className="pr-3 py-1 align-top whitespace-nowrap" style={{ color: 'var(--content-secondary)' }}>{field.path}</td>
      <td className="pr-3 py-1 align-top break-all" style={{ color: field.encrypted ? 'var(--accent)' : 'var(--content-faint)' }}>{preview}</td>
      <td className="w-[1%] pr-3.5 py-1 align-top whitespace-nowrap text-right" style={{ color: 'var(--content-ghost)' }}>{status}</td>
    </tr>
  );
}

function Pane({
  title, badge, onBadgeClick, actions, children,
}: {
  title: string;
  badge?: string;
  onBadgeClick?: () => void;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div className="shrink-0 flex items-center gap-2 px-3.5 h-[30px] border-b" style={{ borderColor: 'var(--line-secondary)' }}>
        <span className="text-[11.5px] font-medium" style={{ color: 'var(--content-secondary)' }}>{title}</span>
        {badge && (
          <button
            onClick={onBadgeClick}
            disabled={!onBadgeClick}
            className={`font-mono text-[10px] px-1.5 rounded ${onBadgeClick ? 'cursor-pointer hover:text-content-secondary' : 'cursor-default'}`}
            style={{ background: 'var(--surface-2)', color: 'var(--content-ghost)' }}
            title={onBadgeClick ? 'Detected from the content — click to switch' : undefined}
          >
            {badge}
          </button>
        )}
        <span className="flex-1" />
        {actions}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

function SmallBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center h-[21px] px-2 rounded text-[10.5px] font-medium border border-line bg-surface text-content-secondary hover:border-line-secondary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
    >
      {children}
    </button>
  );
}
