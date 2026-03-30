import { useEffect, useRef, useState } from 'react';
import {
  encryptValue,
  decryptValue,
  EncryptionSettings,
  DEFAULT_ENCRYPTION_SETTINGS,
} from '../cryptoUtils';

const ALGORITHMS = ['AES', 'Blowfish', 'DES', 'DESede', 'RC2'] as const;
const MODES = ['CBC', 'CFB', 'ECB', 'OFB'] as const;

interface SecurePropertiesToolProps {
  open: boolean;
  onClose: () => void;
}

export function SecurePropertiesTool({ open, onClose }: SecurePropertiesToolProps) {
  const backdropRef = useRef<HTMLDivElement>(null);
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

  // Reset state when opening
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
        // Extract base64 from ![...] wrapper if present
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
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
    >
      <div className="bg-surface-sidebar border border-[#00a0df]/30 rounded-xl shadow-2xl shadow-[#00a0df]/10 w-[520px] max-w-[90vw] overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-[var(--dialog-header-from)] to-[var(--dialog-header-to)] px-6 py-4 border-b border-[#00a0df]/20">
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="absolute top-3 right-3 text-content-faint hover:text-content-secondary transition-colors cursor-pointer p-1"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-yellow-500/15 border border-yellow-500/30 flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 16 16" fill="#eab308">
                <path d="M8 1a4 4 0 0 0-4 4v3H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-1V5a4 4 0 0 0-4-4zm2 7H6V5a2 2 0 1 1 4 0v3z"/>
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-bold text-content tracking-tight">Secure Properties Tool</h2>
              <div className="text-[10px] text-content-muted mt-0.5">Offline encrypt/decrypt — your data never leaves this device</div>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          {/* Mode toggle */}
          <div className="flex gap-1 bg-surface-input rounded-lg p-1">
            <button
              onClick={() => { setMode('encrypt'); setOutput(''); setError(''); }}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                mode === 'encrypt'
                  ? 'bg-[#00a0df]/20 text-[#00a0df] border border-[#00a0df]/30'
                  : 'text-content-muted hover:text-content border border-transparent'
              }`}
            >
              Encrypt
            </button>
            <button
              onClick={() => { setMode('decrypt'); setOutput(''); setError(''); }}
              className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer ${
                mode === 'decrypt'
                  ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                  : 'text-content-muted hover:text-content border border-transparent'
              }`}
            >
              Decrypt
            </button>
          </div>

          {/* Input */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-content-faint uppercase tracking-wide font-medium">
              {mode === 'encrypt' ? 'Plaintext Value' : 'Encrypted Value'}
            </label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={mode === 'encrypt' ? 'Enter value to encrypt...' : '![Base64EncodedValue] or raw Base64...'}
              className="w-full bg-surface-input border border-line-secondary rounded-lg px-3 py-2 text-sm text-content placeholder-content-ghost focus:border-[#00a0df]/50 focus:outline-none font-mono resize-none"
              rows={3}
            />
          </div>

          {/* Encryption Key */}
          <div className="space-y-1.5">
            <label className="text-[10px] text-content-faint uppercase tracking-wide font-medium">
              Encryption Key
            </label>
            <div className="flex gap-2">
              <input
                type={showKey ? 'text' : 'password'}
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="16, 24, or 32 characters for AES"
                className="flex-1 bg-surface-input border border-line-secondary rounded-lg px-3 py-2 text-sm text-content placeholder-content-ghost focus:border-[#00a0df]/50 focus:outline-none font-mono"
              />
              <button
                onClick={() => setShowKey(!showKey)}
                className="px-3 text-xs text-content-muted hover:text-content border border-line-secondary rounded-lg cursor-pointer hover:border-content-muted transition-colors"
              >
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
            {key && ![16, 24, 32].includes(new TextEncoder().encode(key).length) && (
              <span className="text-[10px] text-orange-400">
                Key is {new TextEncoder().encode(key).length} chars — AES requires 16, 24, or 32
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
                className="w-full bg-surface-input border border-line-secondary rounded-lg px-2 py-1.5 text-xs text-content focus:outline-none cursor-pointer"
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
                className="w-full bg-surface-input border border-line-secondary rounded-lg px-2 py-1.5 text-xs text-content focus:outline-none cursor-pointer"
              >
                {MODES.map((m) => (
                  <option key={m} value={m}>{m}{m !== 'CBC' ? ' (unsupported)' : ''}</option>
                ))}
              </select>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer pb-1">
              <input
                type="checkbox"
                checked={settings.useRandomIVs}
                onChange={(e) => setSettings({ ...settings, useRandomIVs: e.target.checked })}
                className="w-3.5 h-3.5 rounded border-line-secondary accent-[#00a0df]"
              />
              <span className="text-[10px] text-content-muted whitespace-nowrap">Random IVs</span>
            </label>
          </div>

          {/* Process button */}
          <button
            onClick={handleProcess}
            disabled={isProcessing || !input.trim() || !key.trim()}
            className={`w-full py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
              mode === 'encrypt'
                ? 'bg-[#00a0df] hover:bg-[#0090c5] disabled:bg-line disabled:text-content-faint text-white'
                : 'bg-yellow-600 hover:bg-yellow-700 disabled:bg-line disabled:text-content-faint text-white'
            }`}
          >
            {isProcessing ? 'Processing...' : mode === 'encrypt' ? 'Encrypt' : 'Decrypt'}
          </button>

          {/* Error */}
          {error && (
            <div className="bg-red-900/30 border border-red-800/40 rounded-lg px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          {/* Output */}
          {output && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-content-faint uppercase tracking-wide font-medium">
                  {mode === 'encrypt' ? 'Encrypted Result' : 'Decrypted Result'}
                </label>
                <button
                  onClick={handleCopy}
                  className="text-[10px] text-content-muted hover:text-[#00a0df] transition-colors cursor-pointer"
                >
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <div className="bg-surface-input border border-line-secondary rounded-lg px-3 py-2 text-sm text-green-400 font-mono break-all select-text">
                {output}
              </div>
            </div>
          )}

          {/* Info footer */}
          <div className="text-[9px] text-content-ghost leading-relaxed space-y-0.5">
            <div>Compatible with MuleSoft's <code className="text-content-faint">secure-properties-tool.jar</code> (AES/CBC).</div>
            <div>All processing happens locally — nothing is sent to any server.</div>
          </div>
        </div>
      </div>
    </div>
  );
}
