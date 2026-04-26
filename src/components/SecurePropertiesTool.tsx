import { useEffect, useRef, useState } from 'react';
import {
  encryptValue,
  decryptValue,
  inspectAesKey,
  EncryptionSettings,
  DEFAULT_ENCRYPTION_SETTINGS,
} from '../cryptoUtils';
import { Icons } from './Icons';

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
  const [output, setOutput] = useState('');
  const [error, setError] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied, setCopied] = useState(false);

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
    }
  }, [open]);

  const handleProcess = async () => {
    if (!input.trim() || !key.trim()) {
      setError('Both input and key are required.');
      return;
    }
    setIsProcessing(true);
    setError('');
    setOutput('');
    setCopied(false);
    try {
      if (mode === 'encrypt') {
        const result = await encryptValue(input, key, settings);
        setOutput(result);
      } else {
        const trimmed = input.trim();
        const match = trimmed.match(/^!\[(.+)]$/);
        const base64 = match ? match[1] : trimmed;
        const result = await decryptValue(base64, key, settings);
        setOutput(result);
      }
    } catch (e) {
      setError((e as Error).message);
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
              background: 'color-mix(in oklch, var(--warn) 15%, transparent)',
              border: '1px solid color-mix(in oklch, var(--warn) 30%, transparent)',
              color: 'var(--warn)',
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
                  ? 'bg-warn-tint text-warn'
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
          </div>

          {/* Encryption Key */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-content-faint uppercase tracking-wide font-medium">
              Encryption key
            </label>
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="Exactly 16, 24, or 32 chars (AES-128 / 192 / 256)"
                className="flex-1 bg-surface-2 border border-line rounded-md px-3 py-2 text-[13px] text-content placeholder-content-ghost focus:border-accent focus:outline-none font-mono"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="px-3 text-[12px] text-content-faint hover:text-content border border-line rounded-md cursor-pointer hover:border-line-secondary transition-colors"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
            {key && (() => {
              const info = inspectAesKey(key);
              return (
                <span
                  className="text-[10px]"
                  style={{ color: info.aesValid ? 'var(--accent)' : 'var(--warn)' }}
                >
                  Key is {info.bytes} bytes —{' '}
                  {info.aesValid
                    ? `${info.aesVariant} ✓ matches MuleSoft secure-properties-tool`
                    : 'invalid for AES (need 16, 24, or 32)'}
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
                  <option key={a} value={a}>{a}{a !== 'AES' ? ' (unsupported)' : ''}</option>
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
                  <option key={m} value={m}>{m}{m !== 'CBC' ? ' (unsupported)' : ''}</option>
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
            disabled={isProcessing || !input.trim() || !key.trim()}
            className="h-8 px-4 rounded-md text-[12.5px] font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: mode === 'encrypt' ? 'var(--accent)' : 'var(--warn)',
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
