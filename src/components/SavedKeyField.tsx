/**
 * The encryption-key field, shared by the Secure Properties tool and the config
 * file encryptor — the two places you type a Mule encryption key.
 *
 * Saved keys live in the OS keychain (Windows Credential Manager, macOS
 * Keychain, Secret Service) via the backend, never in a file we write. This
 * component only ever holds the NAME: picking one sends that name with the run,
 * and the backend resolves it. A rename is a backend move for the same reason —
 * the value never comes back through the UI just to be sent again.
 *
 * Owns its own save / rename / forget state so callers keep two fields: the
 * typed key, and the chosen name. Exactly one of them is in play at a time.
 */
import { useEffect, useState } from 'react';
import { inspectAesKey } from '../cryptoUtils';
import { invoke } from '../bridge';

const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

interface SavedKeyFieldProps {
  /** The typed key. Empty while a saved key is chosen. */
  value: string;
  onValueChange: (v: string) => void;
  /** Name of the chosen saved key, or '' when typing one in. */
  savedName: string;
  onSavedNameChange: (n: string) => void;
  /** Drives the AES length hint and the placeholder. */
  algorithm: string;
  /** Surfaced by the caller, which already has an error area. */
  onError: (message: string) => void;
  /** Reset signal — bump it when the host dialog opens. */
  resetKey?: unknown;
}

export function SavedKeyField({
  value, onValueChange, savedName, onSavedNameChange, algorithm, onError, resetKey,
}: SavedKeyFieldProps) {
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [showKey, setShowKey] = useState(false);
  const [naming, setNaming] = useState(false);     // saving a brand-new key
  const [editing, setEditing] = useState(false);   // renaming / rotating the chosen one
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [confirmForget, setConfirmForget] = useState(false);

  useEffect(() => {
    setNaming(false);
    setEditing(false);
    setConfirmForget(false);
    invoke<string[]>('secure_key_names')
      .then(setSavedNames)
      .catch(() => setSavedNames([]));   // older backend — the picker just stays empty
  }, [resetKey]);

  const saveKey = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      setSavedNames(await invoke<string[]>('secure_key_save', { name, value }));
      onSavedNameChange(name);
      onValueChange('');
      setNaming(false);
      setNewName('');
      onError('');
    } catch (e) {
      onError(errText(e));
    }
  };

  /** Rename, rotate the value, or both — whichever the two fields say. */
  const applyEdit = async () => {
    const target = newName.trim();
    if (!target) return;
    try {
      let names = savedNames;
      if (newKey.trim()) {
        names = await invoke<string[]>('secure_key_save', { name: target, value: newKey });
        if (target !== savedName) {
          names = await invoke<string[]>('secure_key_delete', { name: savedName });
        }
      } else if (target !== savedName) {
        names = await invoke<string[]>('secure_key_rename', { from: savedName, to: target });
      }
      setSavedNames(names);
      onSavedNameChange(target);
      setEditing(false);
      setNewKey('');
      onError('');
    } catch (e) {
      onError(errText(e));
    }
  };

  const forgetKey = async () => {
    try {
      setSavedNames(await invoke<string[]>('secure_key_delete', { name: savedName }));
      onSavedNameChange('');
      setConfirmForget(false);
    } catch (e) {
      onError(errText(e));
    }
  };

  const ghost =
    'px-2.5 h-[34px] text-[12px] text-content-faint hover:text-content hover:bg-surface-2 rounded-md cursor-pointer transition-colors';

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] text-content-faint uppercase tracking-wide font-medium">
        Encryption key
      </label>

      {/* Chips, not a dropdown: you keep two or three environments and switch
          between them constantly, so they should all be one click away. */}
      {savedNames.length > 0 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Saved keys">
          {['', ...savedNames].map((n) => (
            <button
              key={n || '__type'}
              onClick={() => {
                onSavedNameChange(n);
                onValueChange('');
                setConfirmForget(false);
                setEditing(false);
                onError('');
              }}
              aria-pressed={savedName === n}
              className={`h-6 px-2.5 rounded-full text-[11.5px] border transition-colors cursor-pointer ${
                savedName === n
                  ? 'bg-accent-dim text-accent'
                  : 'text-content-faint border-line hover:text-content-secondary hover:border-line-secondary'
              }`}
              style={savedName === n ? { borderColor: 'var(--accent-border)' } : undefined}
            >
              {n || 'Type it in'}
            </button>
          ))}
        </div>
      )}

      {savedName ? (
        <div className="flex gap-2 items-center">
          <div
            className="flex-1 max-w-[560px] rounded-md px-3 py-2 text-[12.5px] font-mono flex items-center gap-2"
            style={{
              background: 'color-mix(in oklch, var(--accent) 8%, transparent)',
              border: '1px solid var(--accent-border)',
              color: 'var(--accent)',
            }}
          >
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
              <button onClick={() => setConfirmForget(false)} className={ghost}>Keep</button>
            </>
          ) : (
            <>
              <button
                onClick={() => { setEditing(true); setNewName(savedName); setNewKey(''); }}
                title="Rename this key, or replace the value behind it"
                className={ghost}
              >
                Edit
              </button>
              <button
                onClick={() => setConfirmForget(true)}
                title="Remove this key from the keychain"
                className={ghost}
              >
                Forget
              </button>
            </>
          )}
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            type={showKey ? 'text' : 'password'}
            value={value}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder={algorithm === 'AES' ? 'Exactly 16, 24, or 32 chars (AES-128 / 192 / 256)' : 'Encryption key'}
            className="flex-1 max-w-[560px] bg-surface-2 border border-line rounded-md px-3 py-2 text-[13px] text-content placeholder-content-ghost focus:border-accent focus:outline-none font-mono"
          />
          <button onClick={() => setShowKey(!showKey)} className={ghost}>
            {showKey ? 'Hide' : 'Show'}
          </button>
          <button
            onClick={() => { setNaming(true); setNewName(''); }}
            disabled={!value.trim()}
            title="Save this key in the OS keychain so you can pick it by name next time"
            className={`${ghost} disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            Save
          </button>
        </div>
      )}

      {editing && (
        <div className="space-y-1.5 rounded-md bg-surface-2 p-2.5 max-w-[720px]">
          <div className="flex gap-2">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyEdit(); if (e.key === 'Escape') setEditing(false); }}
              placeholder="Name"
              className="flex-1 bg-surface border border-line rounded-md px-3 py-1.5 text-[12.5px] text-content placeholder-content-ghost focus:border-accent focus:outline-none"
            />
            <input
              type="password"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') applyEdit(); if (e.key === 'Escape') setEditing(false); }}
              placeholder="New key — optional"
              className="flex-1 bg-surface border border-line rounded-md px-3 py-1.5 text-[12.5px] text-content placeholder-content-ghost focus:border-accent focus:outline-none font-mono"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] text-content-ghost flex-1">
              {newKey.trim()
                ? (newName.trim() !== savedName ? 'Renames it and replaces the key behind it.' : 'Replaces the key behind this name.')
                : (newName.trim() !== savedName ? 'Renames it — the key itself is unchanged.' : 'Nothing to change yet.')}
            </span>
            <button
              onClick={applyEdit}
              disabled={!newName.trim() || (newName.trim() === savedName && !newKey.trim())}
              className="px-3 h-7 text-[12px] rounded-md cursor-pointer font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              Apply
            </button>
            <button
              onClick={() => { setEditing(false); setNewKey(''); }}
              className="px-3 h-7 text-[12px] text-content-faint hover:text-content hover:bg-surface-2 rounded-md cursor-pointer transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {naming && (
        <div className="flex gap-2 max-w-[720px]">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') saveKey(); if (e.key === 'Escape') setNaming(false); }}
            placeholder="Name it for the environment — uat, prod, …  (Enter to save)"
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
            className="px-3 h-7 text-[12px] text-content-faint hover:text-content hover:bg-surface-2 rounded-md cursor-pointer transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {!savedName && value && algorithm === 'AES' && (() => {
        const info = inspectAesKey(value);
        return (
          <span className="text-[10px]" style={{ color: info.aesValid ? 'var(--accent)' : 'var(--warn)' }}>
            Key is {info.bytes} bytes —{' '}
            {info.aesValid ? `${info.aesVariant} ✓` : 'invalid for AES (need 16, 24, or 32 bytes)'}
          </span>
        );
      })()}
    </div>
  );
}
