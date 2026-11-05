/**
 * Encrypt / Decrypt: AES, DES, Triple DES and Blowfish in the usual modes,
 * plus hashes and HMAC, without writing Java. Pick a preset or the settings,
 * type the key, paste the payload.
 *
 * Runs in the app's JVM through a class compiled once per session (see
 * cryptoTool.ts), so a result here is what the same Java gives in a Mule app.
 * "Get the code" hands out that Java with the settings baked in.
 */
import { useEffect, useMemo, useState } from 'react';
import { invoke } from '../bridge';
import { Icons } from './Icons';
import { WindowControls } from './WindowControls';
import { MiniEditor } from './MiniEditor';
import { open as tauriOpen } from '@tauri-apps/plugin-dialog';
import {
  ALGORITHMS, DEFAULT_SETTINGS, HASH_ALGS, HMAC_ALGS, IV_MODES, KEY_MODES, PRESETS, TOOL_PACKAGE, TOOL_SCRIPT, TOOL_SOURCE,
  encryptedFrom, generateDataWeave, generateJava, modesFor, presetOf, sameHash, toolArgs,
  type CryptoOp, type CryptoSettings,
} from '../cryptoTool';

interface RunResult { output: string; error: string | null }
interface CompileResult { ok: boolean; classesDir: string; diagnostics: string }

// Compiled once and reused across sessions: the folder is remembered per
// source version (TOOL_PACKAGE changes with the source), so every app start
// doesn't leave another copy behind. If the folder is gone, run() recompiles.
const CLASSES_KEY = 'dw.cryptoTool.classes';
let compiled: Promise<string> | null = null;
function toolClasses(fresh = false): Promise<string> {
  if (!fresh && !compiled) {
    try {
      const saved = JSON.parse(localStorage.getItem(CLASSES_KEY) || 'null');
      if (saved?.pkg === TOOL_PACKAGE && saved.dir) compiled = Promise.resolve(saved.dir as string);
    } catch { /* compile below */ }
  }
  if (fresh || !compiled) {
    compiled = invoke<CompileResult>('compile_java', { sources: [{ name: 'CryptoTool', content: TOOL_SOURCE }], classpath: [] })
      .then((r) => {
        if (!r.ok) throw new Error(`Couldn't prepare the crypto engine:\n${r.diagnostics}`);
        try { localStorage.setItem(CLASSES_KEY, JSON.stringify({ pkg: TOOL_PACKAGE, dir: r.classesDir })); } catch { /* recompiles next time */ }
        return r.classesDir;
      });
    compiled.catch(() => { compiled = null; }); // let the next run try again
  }
  return compiled;
}

async function runTool(args: object): Promise<RunResult> {
  const call = (dir: string) => invoke<RunResult>('run_dataweave', {
    script: TOOL_SCRIPT, payload: JSON.stringify(args), payloadMimeType: 'application/json',
    attributesJson: '{}', varsJson: '{}', namedInputsJson: '[]', payloadFilePath: null,
    classpath: [dir], timeoutMs: 0, multipartPartsJson: null,
  });
  const r = await call(await toolClasses());
  // The remembered folder was cleaned up: compile again and retry once.
  if (r.error && /Unable to resolve/.test(r.error)) return call(await toolClasses(true));
  return r;
}

const SETTINGS_KEY = 'dw.cryptoTool';
const PRESETS_KEY = 'dw.cryptoTool.presets';
function loadSettings(): { op: CryptoOp; s: CryptoSettings; wrap: boolean } {
  try {
    const v = JSON.parse(localStorage.getItem(SETTINGS_KEY) || 'null');
    if (v?.s) return { op: v.op ?? 'encrypt', s: { ...DEFAULT_SETTINGS, ...v.s }, wrap: v.wrap ?? true };
  } catch { /* defaults */ }
  return { op: 'encrypt', s: DEFAULT_SETTINGS, wrap: true };
}

const label = 'block text-[10px] text-content-faint uppercase tracking-wide font-medium mb-1';
const field = 'w-full bg-surface-2 border border-line rounded-md px-2 py-1.5 text-[12px] text-content focus:outline-none focus:border-accent';

export function CryptoTool({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [initial] = useState(loadSettings);
  const [op, setOp] = useState<CryptoOp>(initial.op);
  const [s, setS] = useState<CryptoSettings>(initial.s);
  const [wrap, setWrap] = useState(initial.wrap);
  // The key is never saved; it lives only while the tool is open.
  const [secret, setSecret] = useState('');
  const [showSecret, setShowSecret] = useState(false);
  const [input, setInput] = useState('');
  // Hash and HMAC can work on a file instead of the text box.
  const [source, setSource] = useState<'text' | 'file'>('text');
  const [filePath, setFilePath] = useState('');
  const [expected, setExpected] = useState('');
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [firstRun, setFirstRun] = useState(!compiled);
  const [copied, setCopied] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);

  useEffect(() => {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ op, s, wrap })); } catch { /* preference only */ }
  }, [op, s, wrap]);

  // The user's own presets: settings only, never the key.
  const [ownPresets, setOwnPresets] = useState<{ name: string; s: Partial<CryptoSettings> }[]>(() => {
    try { const v = JSON.parse(localStorage.getItem(PRESETS_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
  });
  const [naming, setNaming] = useState(false);
  const [presetName, setPresetName] = useState('');
  const saveOwnPresets = (next: typeof ownPresets) => {
    setOwnPresets(next);
    try { localStorage.setItem(PRESETS_KEY, JSON.stringify(next)); } catch { /* stays for this session */ }
  };
  const savePreset = () => {
    const name = presetName.trim();
    if (!name) return;
    const { algorithm, mode, padding, keyMode, ivMode, iv, encoding, iterations } = s;
    const p = { name, s: { algorithm, mode, padding, keyMode, ivMode, iv, encoding, iterations } };
    // Same name replaces; built-in names stay the built-ins.
    saveOwnPresets([...ownPresets.filter((x) => x.name !== name), p]);
    setNaming(false); setPresetName('');
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      if (codeOpen) setCodeOpen(false); else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, codeOpen]);

  const set = (patch: Partial<CryptoSettings>) => setS((prev) => {
    const next = { ...prev, ...patch };
    // Keep the combination valid: GCM is AES-only, OpenSSL passphrases are CBC.
    if (!modesFor(next.algorithm).includes(next.mode)) next.mode = 'CBC';
    if (next.keyMode === 'openssl' && next.mode !== 'CBC') next.mode = 'CBC';
    return next;
  });

  const needsKey = op === 'encrypt' || op === 'decrypt' || op === 'hmac';
  const text = op === 'decrypt' ? encryptedFrom(input) : input;
  const onFile = (op === 'hash' || op === 'hmac') && source === 'file';
  const hasInput = onFile ? !!filePath : !!input.trim();
  const pickFile = async () => {
    const picked = await tauriOpen({ multiple: false, directory: false });
    if (typeof picked === 'string') setFilePath(picked);
  };

  // Run as you type (debounced). Encrypting gives a different result each
  // time with a random IV; that's expected, and every one decrypts.
  useEffect(() => {
    if (!open) return;
    if (!hasInput || (needsKey && !secret)) { setResult(null); return; }
    let stale = false;
    const t = setTimeout(async () => {
      setBusy(true);
      try {
        const r = await runTool(toolArgs(op, s, secret, text, onFile ? filePath : undefined));
        if (stale) return;
        if (r.error) { setResult({ ok: false, text: r.error }); return; }
        const out = r.output;
        if (out.startsWith('error:')) { setResult({ ok: false, text: out.slice(6) }); return; }
        let value = out.replace(/^ok:/, '');
        if (op === 'encrypt' && wrap) value = JSON.stringify({ encryptedBody: value }, null, 2);
        if (op === 'decrypt') { try { value = JSON.stringify(JSON.parse(value), null, 2); } catch { /* not JSON: show as is */ } }
        setResult({ ok: true, text: value });
      } catch (e) {
        if (!stale) setResult({ ok: false, text: String(e instanceof Error ? e.message : e) });
      } finally {
        if (!stale) { setBusy(false); setFirstRun(false); }
      }
    }, 350);
    return () => { stale = true; clearTimeout(t); };
  }, [open, op, s, secret, input, wrap, source, filePath]); // eslint-disable-line react-hooks/exhaustive-deps

  const preset = presetOf(s, ownPresets);
  const presetHint = PRESETS.find((p) => p.name === preset)?.hint;
  const isOwn = ownPresets.some((p) => p.name === preset) && !PRESETS.some((p) => p.name === preset);
  const usesIv = s.mode !== 'ECB' && s.keyMode !== 'openssl';
  const javaCode = useMemo(() => (codeOpen ? generateJava(op, s, secret) : ''), [codeOpen, op, s, secret]);

  if (!open) return null;

  const tab = (id: CryptoOp, name: string) => (
    <button
      key={id}
      onClick={() => { if (id !== op) { setOp(id); setResult(null); } }}
      className={`h-7 px-3 rounded-md text-[12px] font-medium cursor-pointer transition-colors ${op === id ? 'bg-accent-dim text-accent' : 'text-content-faint hover:text-content-secondary'}`}
    >
      {name}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[90] flex flex-col bg-bg">
      <header data-tauri-drag-region className="h-11 shrink-0 flex items-center gap-2 pl-4 pr-3 border-b border-line bg-surface">
        <button onClick={onClose} className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors" title="Back to workspace (Esc)">
          <Icons.ChevronRight size={12} className="rotate-180" /> Back
        </button>
        <div className="w-px h-4 bg-line" />
        <Icons.Secure size={15} />
        <span className="text-[13px] font-semibold text-content">Encrypt / Decrypt</span>
        <div className="ml-3 flex items-center gap-1 p-0.5 rounded-lg bg-surface-2">
          {tab('encrypt', 'Encrypt')}{tab('decrypt', 'Decrypt')}{tab('hash', 'Hash')}{tab('hmac', 'HMAC')}
        </div>
        <span className="flex-1" />
        <button
          onClick={() => setCodeOpen(true)}
          className="inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11.5px] font-semibold cursor-pointer"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
          title="The Java and DataWeave that do exactly this, with these settings"
        >
          Get the code
        </button>
        <WindowControls />
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Settings */}
        <aside className="w-72 shrink-0 border-r border-line bg-surface overflow-y-auto p-3.5 space-y-3.5">
          {(op === 'encrypt' || op === 'decrypt') && (
            <>
              <div>
                <span className={label}>Preset</span>
                <select value={preset} onChange={(e) => { const p = [...PRESETS, ...ownPresets].find((x) => x.name === e.target.value); if (p) set(p.s); }} className={`${field} cursor-pointer`}>
                  {!preset && <option value="">Custom</option>}
                  <optgroup label="Built in">
                    {PRESETS.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                  </optgroup>
                  {ownPresets.length > 0 && (
                    <optgroup label="Your presets">
                      {ownPresets.map((p) => <option key={p.name} value={p.name}>{p.name}</option>)}
                    </optgroup>
                  )}
                </select>
                {presetHint && <p className="text-[11px] text-content-muted leading-snug mt-1.5">{presetHint}</p>}
                {naming ? (
                  <div className="flex gap-1.5 mt-1.5">
                    <input
                      autoFocus
                      value={presetName}
                      onChange={(e) => setPresetName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') savePreset();
                        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setNaming(false); }
                      }}
                      placeholder="e.g. Partner API"
                      className={`${field} flex-1 min-w-0`}
                    />
                    <button onClick={savePreset} disabled={!presetName.trim()} className="shrink-0 px-2.5 rounded-md text-[11.5px] font-semibold cursor-pointer disabled:opacity-50" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>Save</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 mt-1.5 text-[11px]">
                    {!preset && <button onClick={() => setNaming(true)} className="text-accent hover:underline cursor-pointer" title="Keep these settings under a name. The key isn't saved.">Save as preset</button>}
                    {isOwn && <button onClick={() => saveOwnPresets(ownPresets.filter((p) => p.name !== preset))} className="text-content-faint hover:text-err cursor-pointer">Delete this preset</button>}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <span className={label}>Algorithm</span>
                  <select value={s.algorithm} onChange={(e) => set({ algorithm: e.target.value })} className={`${field} cursor-pointer`}>
                    {ALGORITHMS.map((a) => <option key={a} value={a}>{a === 'DESede' ? 'Triple DES' : a}</option>)}
                  </select>
                </div>
                <div className="w-24">
                  <span className={label}>Mode</span>
                  <select value={s.mode} onChange={(e) => set({ mode: e.target.value })} className={`${field} cursor-pointer`} disabled={s.keyMode === 'openssl'}>
                    {modesFor(s.algorithm).map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              {(s.mode === 'CBC' || s.mode === 'ECB') && (
                <div>
                  <span className={label}>Padding</span>
                  <select value={s.padding} onChange={(e) => set({ padding: e.target.value })} className={`${field} cursor-pointer`}>
                    <option value="PKCS5Padding">PKCS5 / PKCS7</option>
                    <option value="NoPadding">None (text must fill whole blocks)</option>
                  </select>
                </div>
              )}
              <div>
                <span className={label}>Key from</span>
                <select value={s.keyMode} onChange={(e) => set({ keyMode: e.target.value })} className={`${field} cursor-pointer`}>
                  {KEY_MODES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                </select>
              </div>
              {s.keyMode === 'pbkdf2' && (
                <div>
                  <span className={label}>PBKDF2 rounds</span>
                  <input type="number" min={1} value={s.iterations} onChange={(e) => set({ iterations: Math.max(1, Number(e.target.value) || 1) })} className={field} />
                </div>
              )}
              {usesIv && (
                <div>
                  <span className={label}>IV</span>
                  <select value={s.ivMode} onChange={(e) => set({ ivMode: e.target.value })} className={`${field} cursor-pointer`}>
                    {IV_MODES.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
                  </select>
                  {s.ivMode === 'fixed' && (
                    <input value={s.iv} onChange={(e) => set({ iv: e.target.value })} placeholder={`${s.mode === 'GCM' ? 12 : s.algorithm.startsWith('AES') ? 16 : 8} characters of text, or hex, or Base64`} spellCheck={false} className={`${field} mt-1.5 font-mono`} />
                  )}
                  {s.ivMode !== 'prefix' && <p className="text-[11px] text-warn leading-snug mt-1.5">The same IV every time lets someone spot repeated messages. Use it only to match a system that does this.</p>}
                </div>
              )}
            </>
          )}
          {op === 'hash' && (
            <div>
              <span className={label}>Algorithm</span>
              <select value={s.hashAlg} onChange={(e) => set({ hashAlg: e.target.value })} className={`${field} cursor-pointer`}>
                {HASH_ALGS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              {(s.hashAlg === 'MD5' || s.hashAlg === 'SHA-1') && <p className="text-[11px] text-content-muted leading-snug mt-1.5">Fine for checksums and matching old systems, not for anything security-related.</p>}
            </div>
          )}
          {op === 'hmac' && (
            <>
              <div>
                <span className={label}>Algorithm</span>
                <select value={s.hmacAlg} onChange={(e) => set({ hmacAlg: e.target.value })} className={`${field} cursor-pointer`}>
                  {HMAC_ALGS.map((a) => <option key={a} value={a}>{a.replace('Hmac', 'HMAC-')}</option>)}
                </select>
              </div>
              <div>
                <span className={label}>Key is</span>
                <select value={s.hmacKeyMode} onChange={(e) => set({ hmacKeyMode: e.target.value })} className={`${field} cursor-pointer`}>
                  <option value="text">Text</option>
                  <option value="base64">Base64</option>
                  <option value="hex">Hex</option>
                </select>
              </div>
            </>
          )}
          <div>
            <span className={label}>{op === 'decrypt' ? 'Encrypted text is' : 'Output as'}</span>
            <select value={s.encoding} onChange={(e) => set({ encoding: e.target.value })} className={`${field} cursor-pointer`}>
              <option value="base64">Base64</option>
              <option value="hex">Hex</option>
            </select>
          </div>
          {needsKey && (
            <div>
              <span className={label}>Secret key</span>
              <div className="relative">
                <input
                  type={showSecret ? 'text' : 'password'}
                  value={secret}
                  onChange={(e) => setSecret(e.target.value)}
                  placeholder="superSecretKey1234"
                  spellCheck={false}
                  autoComplete="off"
                  className={`${field} font-mono pr-12`}
                />
                <button onClick={() => setShowSecret((v) => !v)} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10.5px] text-content-faint hover:text-content cursor-pointer">
                  {showSecret ? 'Hide' : 'Show'}
                </button>
              </div>
              <p className="text-[10.5px] text-content-ghost mt-1">Not saved anywhere. Everything runs on this computer.</p>
            </div>
          )}
          {(op === 'encrypt' || op === 'decrypt') && (
            <p className="text-[11px] text-content-faint leading-snug pt-1 border-t border-line-subtle">
              For Mule's <span className="font-mono">![...]</span> property values, use the Secure Properties tool instead.
            </p>
          )}
        </aside>

        {/* Input and result */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="px-3.5 h-9 shrink-0 flex items-center gap-2 border-b border-line-subtle">
            {(op === 'hash' || op === 'hmac') && (
              <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-surface-2 mr-1">
                {(['text', 'file'] as const).map((v) => (
                  <button
                    key={v}
                    onClick={() => setSource(v)}
                    className={`h-6 px-2.5 rounded text-[11.5px] font-medium cursor-pointer ${source === v ? 'bg-surface text-content shadow-sm' : 'text-content-faint hover:text-content-secondary'}`}
                  >
                    {v === 'text' ? 'Text' : 'File'}
                  </button>
                ))}
              </div>
            )}
            {(op === 'encrypt' || op === 'decrypt') && (
              <span className="text-[11.5px] font-semibold text-content">{op === 'decrypt' ? 'Encrypted payload' : 'Payload to encrypt'}</span>
            )}
            <span className="text-[11px] text-content-ghost">
              {op === 'decrypt' ? 'The bare string, or JSON like { "encryptedBody": "…" }'
                : onFile ? 'Any file: zip, jar, PDF, image… Read from disk, any size.'
                : 'Any text: JSON, XML, a single value…'}
            </span>
          </div>
          {onFile ? (
            <div className="flex-1 min-h-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              {filePath ? (
                <>
                  <div className="text-[13px] font-medium text-content break-all">{filePath.split(/[\\/]/).pop()}</div>
                  <div className="text-[11px] font-mono text-content-faint break-all max-w-[640px]">{filePath}</div>
                  <button onClick={pickFile} className="h-8 px-3 rounded-md text-[12px] text-content-secondary border border-line hover:bg-surface-2 cursor-pointer">Choose another file</button>
                </>
              ) : (
                <button onClick={pickFile} className="h-9 px-4 rounded-md text-[12.5px] font-semibold cursor-pointer" style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}>
                  Choose file…
                </button>
              )}
            </div>
          ) : (
            <div className="flex-1 min-h-0">
              <MiniEditor value={input} onChange={setInput} language="plaintext" height="100%" />
            </div>
          )}

          <div className="px-3.5 h-9 shrink-0 flex items-center gap-2 border-y border-line-subtle bg-surface">
            <span className="text-[11.5px] font-semibold text-content">Result</span>
            {busy && <span className="text-[11px] text-content-faint">{firstRun ? 'Starting the crypto engine…' : 'Working…'}</span>}
            {op === 'encrypt' && (
              <label className="ml-2 flex items-center gap-1.5 text-[11.5px] text-content-secondary cursor-pointer select-none">
                <input type="checkbox" checked={wrap} onChange={(e) => setWrap(e.target.checked)} className="accent-[var(--accent)]" />
                As {'{ "encryptedBody": … }'}
              </label>
            )}
            <span className="flex-1" />
            {op === 'encrypt' && result?.ok && (
              <button
                onClick={() => { setInput(result.text); setOp('decrypt'); setResult(null); }}
                className="h-6 px-2 rounded text-[11px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer"
                title="Check it: decrypt this result with the same settings"
              >
                Decrypt this
              </button>
            )}
            {result && (
              <button
                onClick={() => { void navigator.clipboard.writeText(result.text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
                className="inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer"
              >
                {copied ? <><Icons.Dot size={9} /> Copied</> : <><Icons.Copy size={11} /> Copy</>}
              </button>
            )}
          </div>
          <div className="h-[38%] shrink-0 overflow-auto p-3.5 bg-surface">
            {result ? (
              <pre className="text-[12px] font-mono whitespace-pre-wrap break-all leading-relaxed" style={{ color: result.ok ? 'var(--content)' : 'var(--err)' }}>{result.text}</pre>
            ) : (
              <div className="text-[12px] text-content-faint italic">
                {!hasInput ? (onFile ? 'Choose a file above.' : 'Paste something above.') : needsKey && !secret ? 'Type the secret key on the left.' : ''}
              </div>
            )}
            {(op === 'hash' || op === 'hmac') && (
              <div className="mt-4 max-w-[640px]">
                <span className={label}>Expected (optional)</span>
                <input
                  value={expected}
                  onChange={(e) => setExpected(e.target.value)}
                  placeholder="Paste the checksum you were given to compare"
                  spellCheck={false}
                  className={`${field} font-mono`}
                />
                {expected.trim() && result?.ok && (
                  sameHash(result.text, expected)
                    ? <div className="mt-1.5 text-[12px] font-medium" style={{ color: 'var(--ok, #10b981)' }}>Matches.</div>
                    : <div className="mt-1.5 text-[12px] font-medium text-err">Doesn't match. Check the algorithm and the Hex / Base64 setting; if those are right, the file or text is different.</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {codeOpen && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 p-6" onMouseDown={(e) => { if (e.target === e.currentTarget) setCodeOpen(false); }}>
          <div role="dialog" aria-label="Get the code" className="w-[min(920px,100%)] h-[min(760px,100%)] flex flex-col rounded-xl border border-line bg-surface shadow-2xl">
            <div className="flex items-start gap-3 px-4 pt-3.5 pb-3 border-b border-line-subtle">
              <div className="flex-1">
                <div className="text-[14px] font-semibold text-content">Get the code</div>
                <div className="text-[11.5px] text-content-muted mt-0.5">
                  The same Java this tool just ran, with your settings. Paste it into the Java tester or your Mule project's src/main/java, then call it from DataWeave.
                  {needsKey && ` Your key is written into it as SECRET. For real use, call ${op === 'hmac' ? 'signWith' : 'encryptWith / decryptWith'} instead and pass the key from a secure property.`}
                </div>
              </div>
              <button onClick={() => setCodeOpen(false)} className="p-1 rounded text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer" aria-label="Close"><Icons.X size={14} /></button>
            </div>
            <div className="flex-1 min-h-0 flex flex-col">
              <CodeBlock title="PayloadCrypto.java" code={javaCode} language="java" grow />
              {generateDataWeave(op).map((d) => <CodeBlock key={d.title} title={d.title} code={d.code} language="dataweave" />)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function CodeBlock({ title, code, language, grow }: { title: string; code: string; language: 'java' | 'dataweave'; grow?: boolean }) {
  const [copied, setCopied] = useState(false);
  const lines = code.split('\n').length;
  return (
    <div className={`flex flex-col border-b border-line-subtle ${grow ? 'flex-1 min-h-0' : 'shrink-0'}`}>
      <div className="h-8 shrink-0 flex items-center px-4 gap-2">
        <span className="text-[11.5px] font-semibold text-content">{title}</span>
        <span className="flex-1" />
        <button
          onClick={() => { void navigator.clipboard.writeText(code).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}
          className="inline-flex items-center gap-1 h-6 px-2 rounded text-[11px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer"
        >
          {copied ? <><Icons.Dot size={9} /> Copied</> : <><Icons.Copy size={11} /> Copy</>}
        </button>
      </div>
      <div className={grow ? 'flex-1 min-h-0' : ''}>
        <MiniEditor value={code} onChange={() => {}} language={language} height={grow ? '100%' : lines * 19 + 12} readOnly />
      </div>
    </div>
  );
}
