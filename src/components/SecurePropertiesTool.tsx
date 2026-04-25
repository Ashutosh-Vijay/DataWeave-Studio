import { useEffect, useRef, useState } from 'react';
import {
  encryptValue,
  decryptValue,
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
                placeholder="Any length — MD5-derived (MuleSoft-compatible)"
                className="flex-1 bg-surface-2 border border-line rounded-md px-3 py-2 text-[13px] text-content placeholder-content-ghost focus:border-accent focus:outline-none font-mono"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="px-3 text-[12px] text-content-faint hover:text-content border border-line rounded-md cursor-pointer hover:border-line-secondary transition-colors"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
            {key && (
              <span className="text-[10px] text-content-ghost">
                Key is {new TextEncoder().encode(key).length} bytes — MD5-hashed to AES-128
              </span>
            )}
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
            <label className="flex items-center gap-1.5 cursor-pointer pb-2">
              <input
                type="checkbox"
                checked={settings.useRandomIVs}
                onChange={(e) => setSettings({ ...settings, useRandomIVs: e.target.checked })}
                className="w-3.5 h-3.5 rounded border-line accent-[var(--accent)]"
              />
              <span className="text-[11px] text-content-muted whitespace-nowrap">Random IVs</span>
            </label>
          </div>

          {/* Process button */}
          <button
            onClick={handleProcess}
            disabled={isProcessing || !input.trim() || !key.trim()}
            className="w-full h-9 rounded-md text-[13px] font-semibold transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              background: mode === 'encrypt' ? 'var(--accent)' : 'var(--warn)',
              color: 'var(--accent-ink)',
            }}
          >
            {isProcessing ? 'Processing…' : mode === 'encrypt' ? 'Encrypt' : 'Decrypt'}
          </button>

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
              <div className="bg-surface-2 border border-line rounded-md px-3 py-2 text-[12.5px] font-mono text-accent break-all select-text">
                {output}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-2.5 border-t border-line-subtle text-[10px] text-content-ghost leading-relaxed">
          Compatible with MuleSoft's <code className="text-content-faint">secure-properties-tool.jar</code> (AES/CBC, MD5 key derivation). All processing happens locally.
        </div>
      </div>
    </div>
  );
}
