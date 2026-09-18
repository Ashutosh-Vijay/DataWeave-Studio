import { useEffect, useRef, useState } from 'react';
import {
  encryptValue,
  decryptValue,
  inspectAesKey,
  EncryptionSettings,
  DEFAULT_ENCRYPTION_SETTINGS,
} from '../cryptoUtils';
import { Icons } from './Icons';
import { invoke } from '../bridge';

// Tauri rejects with a plain STRING, not an Error, so `(e as Error).message` is
// undefined and the error box renders blank — including "Invalid AES key length",
// the mistake this tool exists to catch. The rest of the app uses String(e).
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

const ALGORITHMS = ['AES', 'Blowfish', 'DES', 'DESede', 'RC2'] as const;
const MODES = ['CBC', 'CFB', 'ECB', 'OFB'] as const;

interface SecurePropertiesToolProps {
  open: boolean;
  onClose: () => void;
}

export function SecurePropertiesTool({ open, onClose }: SecurePropertiesToolProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
  const mouseDownOnBackdrop = useRef(false);
  const [mode, setMode] = useState<'encrypt' | 'decrypt'>('encrypt');
  const [input, setInput] = useState('');
  const [key, setKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [settings, setSettings] = useState<EncryptionSettings>(DEFAULT_ENCRYPTION_SETTINGS);
  // Saved keys live in the OS keychain (Credential Manager / Keychain / Secret
  // Service) via the backend — never in a file we write. The UI only ever holds
  // the NAME; picking one sends that, and the backend resolves it at run time.
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [savedName, setSavedName] = useState('');
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [confirmForget, setConfirmForget] = useState(false);
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

  // The secure-properties tool takes the value as a COMMAND-LINE ARGUMENT, and on
  // Windows the JVM decodes argv with the OS ANSI codepage (cp1252) — anything
  // outside it arrives as '?' and gets encrypted as the wrong text, silently.
  // A -D flag can't fix it (sun.jnu.encoding is resolved before properties apply),
  // so warn on exactly the characters that won't survive. cp1252 = Latin-1 plus
  // the punctuation block below, which does come through intact (verified: €).
  const CP1252_EXTRAS = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  const hasUnsupportedChars =
    mode === 'encrypt' &&
    /Windows/i.test(navigator.userAgent) &&
    [...input].some((ch) => (ch.codePointAt(0) ?? 0) > 255 && !CP1252_EXTRAS.includes(ch));

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      setOutput('');
      setError('');
      setCopied(false);
      setNaming(false);
      setConfirmForget(false);
      invoke<string[]>('secure_key_names')
        .then(setSavedNames)
        .catch(() => setSavedNames([]));   // older backend — picker just stays empty
    }
  }, [open]);

  const saveKey = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      setSavedNames(await invoke<string[]>('secure_key_save', { name, value: key }));
      setSavedName(name);
      setKey('');
      setNaming(false);
      setNewName('');
      setError('');
    } catch (e) {
      setError(errText(e));
    }
  };

  const forgetKey = async () => {
    try {
      setSavedNames(await invoke<string[]>('secure_key_delete', { name: savedName }));
      setSavedName('');
      setConfirmForget(false);
    } catch (e) {
      setError(errText(e));
    }
  };

  const handleProcess = async () => {
    if (!input.trim()) {
      setError('Enter a value.');
      return;
    }
    if (!savedName && !key.trim()) {
      setError('Enter the encryption key, or pick a saved one.');
      return;
    }
    setIsProcessing(true);
    setError('');
    setOutput('');
    setCopied(false);
    try {
      if (mode === 'encrypt') {
        const result = await encryptValue(input, key, settings, savedName);
        setOutput(result);
        // The button says "Encrypt & copy" — actually copy.
        try {
          await navigator.clipboard.writeText(result);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch { /* clipboard not available */ }
      } else {
        const trimmed = input.trim();
        const match = trimmed.match(/^!\[(.+)]$/);
        const base64 = match ? match[1] : trimmed;
        const result = await decryptValue(base64, key, settings, savedName);
        setOutput(result);
      }
    } catch (e) {
      setError(errText(e));
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCopy = async () => {
    if (!output) return;
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not available */ }
  };

  if (!open) return null;

  return (
    <div
      ref={backdropRef}
      onMouseDown={(e) => { mouseDownOnBackdrop.current = e.target === backdropRef.current; }}
      onMouseUp={(e) => { if (mouseDownOnBackdrop.current && e.target === backdropRef.current) onClose(); mouseDownOnBackdrop.current = false; }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ background: 'color-mix(in oklch, var(--bg) 70%, transparent)', backdropFilter: 'blur(2px)' }}
    >
      <div className="w-full max-w-[560px] bg-surface border border-line rounded-xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-line-subtle flex items-start gap-3">
          <div
            className="w-9 h-9 shrink-0 rounded-lg flex items-center justify-center"
            style={{
              background: 'color-mix(in oklch, var(--accent) 15%, transparent)',
              border: '1px solid color-mix(in oklch, var(--accent) 30%, transparent)',
              color: 'var(--accent)',
            }}
          >
            <Icons.Secure size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-[14px] font-semibold text-content tracking-tight">Secure Properties Tool</h2>
            <div className="text-[11.5px] text-content-faint mt-0.5">Offline encrypt/decrypt — your data never leaves this device</div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="text-content-faint hover:text-content-secondary transition-colors cursor-pointer p-1 rounded hover:bg-surface-2"
          >
            <Icons.X size={14} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Mode toggle — segmented */}
          <div className="flex p-0.5 rounded-md bg-surface-2 border border-line">
            <button
              onClick={() => { setMode('encrypt'); setInput(''); setOutput(''); setError(''); }}
              className={`flex-1 h-7 rounded-sm text-[12px] font-medium cursor-pointer transition-colors ${
                mode === 'encrypt'
                  ? 'bg-accent-dim text-accent'
                  : 'text-content-faint hover:text-content-secondary'
              }`}
            >
              Encrypt
            </button>
            <button
              onClick={() => { setMode('decrypt'); setInput(''); setOutput(''); setError(''); }}
              className={`flex-1 h-7 rounded-sm text-[12px] font-medium cursor-pointer transition-colors ${
                mode === 'decrypt'
                  ? 'bg-accent-dim text-accent'
                  : 'text-content-faint hover:text-content-secondary'
              }`}
            >
              Decrypt
            </button>
          </div>

          {/* Input */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-content-faint uppercase tracking-wide font-medium">
              {mode === 'encrypt' ? 'Plaintext value' : 'Encrypted value'}
            </label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={mode === 'encrypt' ? 'Enter value to encrypt…' : '![Base64EncodedValue] or raw Base64…'}
              className="w-full bg-surface-2 border border-line rounded-md px-3 py-2 text-[13px] text-content placeholder-content-ghost focus:border-accent focus:outline-none font-mono resize-none"
              rows={3}
            />
            {hasUnsupportedChars && (
              <div
                className="flex items-start gap-2 px-2.5 py-2 rounded-md text-[11.5px] leading-relaxed"
                style={{
                  background: 'color-mix(in oklch, var(--warn) 12%, var(--surface))',
                  border: '1px solid color-mix(in oklch, var(--warn) 45%, transparent)',
                  color: 'var(--content-secondary)',
                }}
              >
                <span style={{ color: 'var(--warn)', fontWeight: 700 }}>!</span>
                <span>
                  This value has non-English characters that Windows can’t pass to the encryption
                  tool — it receives them as “?”, so the encrypted result would be the wrong value.
                  Remove them, or encrypt this value in Anypoint Studio instead.
                </span>
              </div>
            )}
          </div>

          {/* Encryption Key */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <label className="text-[10px] text-content-faint uppercase tracking-wide font-medium flex-1">
                Encryption key
              </label>
              {savedNames.length > 0 && (
                <select
                  value={savedName}
                  onChange={(e) => { setSavedName(e.target.value); setKey(''); setConfirmForget(false); setError(''); }}
                  aria-label="Saved key"
                  className="h-6 max-w-[180px] bg-transparent border border-line rounded-md px-1.5 text-[11px] text-accent focus:outline-none focus:border-accent cursor-pointer"
                >
                  <option value="">Type it in</option>
                  {savedNames.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
              )}
            </div>

            {savedName ? (
              <div className="flex gap-2 items-center">
                <div
                  className="flex-1 rounded-md px-3 py-2 text-[12.5px] font-mono flex items-center gap-2"
                  style={{
                    background: 'color-mix(in oklch, var(--accent) 8%, transparent)',
                    border: '1px solid var(--accent-border)',
                    color: 'var(--accent)',
                  }}
                >
                  <Icons.Secure size={12} />
                  Using “{savedName}” — from this computer’s keychain
                </div>
                {confirmForget ? (
                  <>
                    <button
                      onClick={forgetKey}
                      className="px-3 h-[34px] text-[12px] rounded-md cursor-pointer border"
                      style={{ borderColor: 'var(--err-border)', color: 'var(--err)' }}
                    >
                      Really forget
                    </button>
                    <button
                      onClick={() => setConfirmForget(false)}
                      className="px-3 h-[34px] text-[12px] text-content-faint hover:text-content border border-line rounded-md cursor-pointer"
                    >
                      Keep
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmForget(true)}
                    title="Remove this key from the keychain"
                    className="px-3 h-[34px] text-[12px] text-content-faint hover:text-content border border-line rounded-md cursor-pointer hover:border-line-secondary transition-colors"
                  >
                    Forget
                  </button>
                )}
              </div>
            ) : (
              <div className="flex gap-2">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={key}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={settings.algorithm === 'AES' ? 'Exactly 16, 24, or 32 chars (AES-128 / 192 / 256)' : 'Encryption key'}
                  className="flex-1 bg-surface-2 border border-line rounded-md px-3 py-2 text-[13px] text-content placeholder-content-ghost focus:border-accent focus:outline-none font-mono"
                />
                <button
                  onClick={() => setShowKey(!showKey)}
                  className="px-3 text-[12px] text-content-faint hover:text-content border border-line rounded-md cursor-pointer hover:border-line-secondary transition-colors"
                >
                  {showKey ? 'Hide' : 'Show'}
                </button>
                <button
                  onClick={() => { setNaming(true); setNewName(''); }}
                  disabled={!key.trim()}
                  title="Save this key in the OS keychain so you can pick it by name next time"
                  className="px-3 text-[12px] text-content-faint hover:text-content border border-line rounded-md cursor-pointer hover:border-line-secondary transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Save
                </button>
              </div>
            )}

            {naming && (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') saveKey(); if (e.key === 'Escape') setNaming(false); }}
                  placeholder="Name it for the environment — uat, prod, …"
                  className="flex-1 bg-surface-2 border border-line rounded-md px-3 py-1.5 text-[12.5px] text-content placeholder-content-ghost focus:border-accent focus:outline-none"
                />
                <button
                  onClick={saveKey}
                  disabled={!newName.trim()}
                  className="px-3 text-[12px] rounded-md cursor-pointer font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
                >
                  {savedNames.includes(newName.trim()) ? 'Replace' : 'Save'}
                </button>
                <button
                  onClick={() => setNaming(false)}
                  className="px-3 text-[12px] text-content-faint hover:text-content border border-line rounded-md cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
            {key && settings.algorithm === 'AES' && (() => {
              const info = inspectAesKey(key);
              return (
                <span
                  className="text-[10px]"
                  style={{ color: info.aesValid ? 'var(--accent)' : 'var(--warn)' }}
                >
                  Key is {info.bytes} bytes —{' '}
                  {info.aesValid
                    ? `${info.aesVariant} ✓`
                    : 'invalid for AES (need 16, 24, or 32 bytes)'}
                </span>
              );
            })()}
          </div>

          {/* Algorithm + Mode + useRandomIVs */}
          <div className="flex gap-3 items-end">
            <div className="flex-1 space-y-1">
              <label className="text-[10px] text-content-faint uppercase tracking-wide font-medium">Algorithm</label>
              <select
                value={settings.algorithm}
                onChange={(e) => setSettings({ ...settings, algorithm: e.target.value })}
                className="w-full bg-surface-2 border border-line rounded-md px-2 py-1.5 text-[12px] text-content focus:outline-none focus:border-accent cursor-pointer"
              >
                {ALGORITHMS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-[10px] text-content-faint uppercase tracking-wide font-medium">Mode</label>
              <select
                value={settings.mode}
                onChange={(e) => setSettings({ ...settings, mode: e.target.value })}
                className="w-full bg-surface-2 border border-line rounded-md px-2 py-1.5 text-[12px] text-content focus:outline-none focus:border-accent cursor-pointer"
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
            <label
              className="flex items-center gap-1.5 cursor-pointer pb-2"
              title="Mule default is OFF (zero IV). Turn on only if your Mule app uses --use-random-iv."
            >
              <input
                type="checkbox"
                checked={settings.useRandomIVs}
                onChange={(e) => setSettings({ ...settings, useRandomIVs: e.target.checked })}
                className="w-3.5 h-3.5 rounded border-line accent-[var(--accent)]"
              />
              <span className="text-[11px] text-content-muted whitespace-nowrap">Random IV</span>
            </label>
          </div>

          {/* Error */}
          {error && (
            <div className="bg-err-tint border border-err-border rounded-md px-3 py-2 text-[12px] text-err">
              {error}
            </div>
          )}

          {/* Output */}
          {output && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-content-faint uppercase tracking-wide font-medium">
                  {mode === 'encrypt' ? 'Encrypted result' : 'Decrypted result'}
                </label>
                <button
                  onClick={handleCopy}
                  className="text-[11px] text-content-faint hover:text-accent transition-colors cursor-pointer inline-flex items-center gap-1"
                >
                  {copied ? <><Icons.Dot size={9} /> Copied</> : <><Icons.Copy size={11} /> Copy</>}
                </button>
              </div>
              <div
                className="rounded-md px-3 py-2 text-[12.5px] font-mono text-accent break-all select-text border"
                style={{
                  background: 'color-mix(in oklch, var(--accent) 8%, transparent)',
                  borderColor: 'var(--accent-border)',
                }}
              >
                {output}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-line flex items-center gap-2.5">
          <span className="text-[10.5px] text-content-ghost flex-1">
            Compatible with MuleSoft's <code className="text-content-faint">secure-properties-tool.jar</code>
          </span>
          <button
            onClick={onClose}
            className="h-8 px-3 rounded-md border border-line text-[12px] text-content-secondary hover:bg-surface-2 cursor-pointer"
          >
            Close
          </button>
          <button
            onClick={handleProcess}
            disabled={isProcessing || !input.trim() || (!savedName && !key.trim())}
            className="h-8 px-4 rounded-md text-[12.5px] font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: 'var(--accent)',
              color: 'var(--accent-ink)',
            }}
          >
            {isProcessing ? 'Processing…' : mode === 'encrypt' ? 'Encrypt & copy' : 'Decrypt'}
          </button>
        </div>
      </div>
    </div>
  );
}
