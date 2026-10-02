import { useEffect, useState, memo } from 'react';
import Editor, { BeforeMount, useMonaco } from '@monaco-editor/react';
import { configureEditor } from '../editorInit';
import { ContextState, HTTP_METHODS, METHOD_COLORS, KeyValuePair, VarEntry } from '../types';
import { KeyValueRows } from './KeyValueRows';
import { VarsPanel } from './VarsPanel';
import { defineDataWeaveTheme, DATAWEAVE_THEME_NAME, DATAWEAVE_LIGHT_THEME_NAME } from '../dataweaveTheme';
import { hasEncryptedValues, isEncryptedValue, inspectAesKey, decryptFlatMap, DEFAULT_ENCRYPTION_SETTINGS } from '../cryptoUtils';
import { detectFormat } from '../configCrypto';
import { parseConfigFlat } from '../propertySubstitution';
import { invoke } from '../bridge';
import { Icons } from './Icons';
import { useTheme } from '../ThemeContext';
import { useEditorFont } from '../hooks/useEditorFont';

const handleBeforeMount: BeforeMount = (monaco) => defineDataWeaveTheme(monaco);

const CONFIG_PLACEHOLDER = `# Paste config.yaml or config.properties
# salesforce:
#   path: /api/v1
# or: salesforce.path=/api/v1
`;

const SECURE_PLACEHOLDER = `# Plain or encrypted ![...] values
# salesforce:
#   secret: "![Base64EncryptedValue]"
# or: salesforce.secret=![Base64EncryptedValue]
`;

const ALGORITHMS = ['AES', 'Blowfish', 'DES', 'DESede', 'RC2'] as const;
const MODES = ['CBC', 'CFB', 'ECB', 'OFB'] as const;

/** One config file: config or secure config, YAML or .properties (detected). */
function ConfigFile({ title, secure, value, onChange, theme }: {
  title: string;
  secure: boolean;
  value: string;
  onChange: (v: string) => void;
  theme: string;
}) {
  const editorFont = useEditorFont();
  const format = value.trim() ? detectFormat(value) : null;
  const ref = secure ? '${secure::key}' : '${key}';
  return (
    <div className="rounded-md border border-line overflow-hidden bg-surface">
      <div className="h-8 flex items-center gap-2 px-2.5 border-b border-line bg-surface-2">
        <span className={`w-1.5 h-1.5 rounded-full ${secure ? 'bg-warn' : 'bg-violet'}`} />
        <span
          className="text-[11.5px] font-medium text-content"
          title="YAML or .properties, detected from what you paste"
        >
          {title}
          <span className="text-content-faint">{format === 'properties' ? '.properties' : '.yaml'}</span>
        </span>
        <span className="ml-auto text-[10px] text-content-faint font-mono">{ref}</span>
      </div>
      <div style={{ height: 140 }}>
        <Editor
          height="100%"
          language={format === 'properties' ? 'ini' : 'yaml'}
          theme={theme}
          beforeMount={handleBeforeMount}
          onMount={configureEditor}
          value={value}
          onChange={(val) => onChange(val || '')}
          options={{
            minimap: { enabled: false },
            automaticLayout: true,
            fontFamily: editorFont.fontFamily,
            fontSize: 11,
            lineNumbers: 'off',
            wordWrap: 'on',
            scrollBeyondLastLine: false,
            folding: false,
            glyphMargin: false,
            lineDecorationsWidth: 8,
            lineNumbersMinChars: 0,
            renderLineHighlight: 'none',
            scrollbar: { vertical: 'hidden', horizontal: 'hidden' },
            overviewRulerLanes: 0,
            padding: { top: 6 },
            placeholder: secure ? SECURE_PLACEHOLDER : CONFIG_PLACEHOLDER,
            autoClosingBrackets: 'beforeWhitespace',
            autoClosingQuotes: 'beforeWhitespace',
            autoSurround: 'languageDefined',
            autoIndent: 'full',
          }}
        />
      </div>
    </div>
  );
}

/**
 * Decrypting the secure config's ![...] values: a key typed in (kept for this
 * session only) or one saved in the OS keychain, picked by name. Only the name
 * goes into the workspace. Checks the key against the actual values, so a wrong
 * key shows up here rather than as garbage in the output.
 */
function DecryptionCard({ context, onChange, encryptionKey, onEncryptionKeyChange }: {
  context: ContextState;
  onChange: (context: ContextState) => void;
  encryptionKey: string;
  onEncryptionKeyChange: (key: string) => void;
}) {
  const settings = context.encryptionSettings || DEFAULT_ENCRYPTION_SETTINGS;
  const keyName = context.encryptionKeyName || '';
  const secureText = context.secureConfigYaml || '';
  const [savedNames, setSavedNames] = useState<string[]>([]);
  const [showKey, setShowKey] = useState(false);
  const [naming, setNaming] = useState(false);
  const [newName, setNewName] = useState('');
  const [cipherOpen, setCipherOpen] = useState(false);
  const [check, setCheck] = useState<{ total: number; failed: number; error: string } | null>(null);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    invoke<string[]>('secure_key_names').then(setSavedNames).catch(() => setSavedNames([]));
  }, []);

  const encrypted = Object.entries(parseConfigFlat(secureText)).filter(([, v]) => isEncryptedValue(v));

  // Try the key on every encrypted value, shortly after the last change.
  useEffect(() => {
    setCheck(null);
    if (!keyName && !encryptionKey) return;
    const flat = Object.fromEntries(Object.entries(parseConfigFlat(secureText)).filter(([, v]) => isEncryptedValue(v)));
    const total = Object.keys(flat).length;
    if (!total) return;
    let stale = false;
    const t = setTimeout(async () => {
      const out = await decryptFlatMap(flat, encryptionKey, settings, keyName);
      if (stale) return;
      const errors = Object.values(out).filter((v) => v.startsWith('[DECRYPT_ERROR'));
      setCheck({
        total,
        failed: errors.length,
        error: errors[0]?.replace(/^\[DECRYPT_ERROR: ?/, '').replace(/\]$/, '') ?? '',
      });
    }, 500);
    return () => { stale = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secureText, encryptionKey, keyName, settings.algorithm, settings.mode, settings.useRandomIVs]);

  const setSettings = (patch: Partial<typeof settings>) =>
    onChange({ ...context, encryptionSettings: { ...settings, ...patch } });

  const pickKey = (name: string) => {
    onChange({ ...context, encryptionKeyName: name || undefined });
    onEncryptionKeyChange('');
    setNaming(false);
    setSaveError('');
  };

  const saveKey = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      setSavedNames(await invoke<string[]>('secure_key_save', { name, value: encryptionKey }));
      setNewName('');
      pickKey(name);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  };

  const missing = keyName && !savedNames.includes(keyName);
  const aes = !keyName && encryptionKey && settings.algorithm === 'AES' ? inspectAesKey(encryptionKey) : null;
  const field =
    'h-7 bg-surface-input border border-line-secondary rounded-md px-2 text-[11px] text-content placeholder-content-ghost focus:border-accent focus:outline-none';
  const ghost =
    'h-7 px-2 text-[10.5px] text-content-faint hover:text-content hover:bg-surface-2 rounded-md cursor-pointer transition-colors';

  let status: { tone: 'ok' | 'warn' | 'err' | 'idle'; text: string };
  if (!keyName && !encryptionKey) status = { tone: 'idle', text: 'Add the key to decrypt them on run' };
  else if (missing) status = { tone: 'err', text: `"${keyName}" isn't saved on this computer` };
  else if (!check) status = { tone: 'idle', text: 'Checking the key…' };
  else if (!check.failed) status = { tone: 'ok', text: check.total === 1 ? 'Key works on the value' : `Key works on all ${check.total}` };
  else status = { tone: 'err', text: `${check.failed} of ${check.total} didn't decrypt: ${check.error}` };
  const toneColor = { ok: 'var(--accent)', warn: 'var(--warn)', err: 'var(--err)', idle: 'var(--content-faint)' }[status.tone];

  return (
    <div className="rounded-md border border-line bg-surface">
      <div className="h-8 flex items-center gap-2 px-2.5 border-b border-line bg-surface-2 rounded-t-md">
        <Icons.Key size={12} className="text-warn shrink-0" />
        <span className="text-[11.5px] font-medium text-content">Decryption</span>
        <span className="text-[10px] text-content-faint">
          {encrypted.length} encrypted {encrypted.length === 1 ? 'value' : 'values'}
        </span>
      </div>

      <div className="p-2.5 space-y-2">
        <div className="flex gap-1.5">
          <select
            value={keyName}
            onChange={(e) => pickKey(e.target.value)}
            title="Keys saved in this computer's keychain. Only the name goes into the workspace."
            className={`${field} cursor-pointer ${keyName ? 'flex-1' : 'w-[118px] shrink-0'}`}
          >
            <option value="">Type a key</option>
            {savedNames.map((n) => <option key={n} value={n}>Saved: {n}</option>)}
            {missing && <option value={keyName}>{keyName} (not on this computer)</option>}
          </select>
          {!keyName && (
            <>
              <input
                type={showKey ? 'text' : 'password'}
                value={encryptionKey}
                onChange={(e) => onEncryptionKeyChange(e.target.value)}
                placeholder={settings.algorithm === 'AES' ? '16, 24 or 32 chars' : 'Encryption key'}
                className={`${field} flex-1 min-w-0 font-mono`}
              />
              <button onClick={() => setShowKey(!showKey)} className={ghost}>{showKey ? 'Hide' : 'Show'}</button>
              <button
                onClick={() => { setNaming(true); setNewName(''); setSaveError(''); }}
                disabled={!encryptionKey.trim()}
                title="Save it in this computer's keychain so you can pick it by name"
                className={`${ghost} disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                Save
              </button>
            </>
          )}
        </div>

        {naming && (
          <div className="flex gap-1.5">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveKey(); if (e.key === 'Escape') setNaming(false); }}
              placeholder="Name it, e.g. dev, uat, prod"
              className={`${field} flex-1 min-w-0`}
            />
            <button
              onClick={saveKey}
              disabled={!newName.trim()}
              className="h-7 px-2.5 text-[10.5px] font-semibold rounded-md cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
            >
              Save
            </button>
            <button onClick={() => setNaming(false)} className={ghost}>Cancel</button>
          </div>
        )}

        <div className="flex items-start gap-1.5 text-[10.5px] leading-snug" style={{ color: toneColor }}>
          <span className="mt-[5px] w-1.5 h-1.5 rounded-full shrink-0" style={{ background: toneColor }} />
          <span className="min-w-0 break-words">
            {saveError || status.text}
            {aes && !aes.aesValid && status.tone !== 'ok' && (
              <span className="text-warn">. Key is {aes.bytes} bytes; AES needs 16, 24 or 32</span>
            )}
          </span>
        </div>

        <div className="border-t border-line-subtle pt-1.5">
          <button
            onClick={() => setCipherOpen(!cipherOpen)}
            className="w-full flex items-center gap-1.5 text-[10.5px] text-content-faint hover:text-content-secondary cursor-pointer"
          >
            {cipherOpen ? <Icons.ChevronDown size={11} /> : <Icons.ChevronRight size={11} />}
            Cipher
            <span className="ml-auto font-mono text-content-muted">
              {settings.algorithm} · {settings.mode} · {settings.useRandomIVs ? 'random IV' : 'fixed IV'}
            </span>
          </button>
          {cipherOpen && (
            <div className="pt-2 space-y-2">
              <div className="flex gap-1.5">
                <select
                  value={settings.algorithm}
                  onChange={(e) => setSettings({ algorithm: e.target.value })}
                  className={`${field} flex-1 cursor-pointer`}
                >
                  {ALGORITHMS.map((a) => <option key={a} value={a}>{a}</option>)}
                </select>
                <select
                  value={settings.mode}
                  onChange={(e) => setSettings({ mode: e.target.value })}
                  className={`${field} flex-1 cursor-pointer`}
                >
                  {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.useRandomIVs}
                  onChange={(e) => setSettings({ useRandomIVs: e.target.checked })}
                  className="w-3 h-3 accent-[var(--accent)]"
                />
                <span className="text-[10.5px] text-content-muted">Random IV</span>
                <span className="text-[10px] text-content-ghost">off is Mule's default</span>
              </label>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

type Tab = 'Request' | 'Vars' | 'Config';

interface ContextPanelProps {
  context: ContextState;
  onChange: (context: ContextState) => void;
  encryptionKey: string;
  onEncryptionKeyChange: (key: string) => void;
  defaultTab?: Tab;
}

function activeCount(pairs: KeyValuePair[]): number {
  return pairs.filter((p) => p.enabled !== false && p.key && p.value !== '').length;
}

export const ContextPanel = memo(function ContextPanel({ context, onChange, encryptionKey, onEncryptionKeyChange, defaultTab }: ContextPanelProps) {
  const [tab, setTab] = useState<Tab>(defaultTab ?? 'Request');
  const { isDark } = useTheme();
  const monaco = useMonaco();
  useEffect(() => {
    const apply = () => { if (monaco) defineDataWeaveTheme(monaco); };
    apply();
    window.addEventListener('dw:accent-changed', apply);
    return () => window.removeEventListener('dw:accent-changed', apply);
  }, [isDark, monaco]);
  const editorTheme = isDark ? DATAWEAVE_THEME_NAME : DATAWEAVE_LIGHT_THEME_NAME;

  const updateMethod = (method: string) => onChange({ ...context, method });
  const updateUriParams = (uriParams: KeyValuePair[]) => onChange({ ...context, uriParams });
  const updateQueryParams = (queryParams: KeyValuePair[]) => onChange({ ...context, queryParams });
  const updateHeaders = (headers: KeyValuePair[]) => onChange({ ...context, headers });
  const updateVars = (vars: VarEntry[]) => onChange({ ...context, vars });

  const reqCount = activeCount(context.uriParams ?? []) + activeCount(context.queryParams) + activeCount(context.headers);
  const varsCount = context.vars.filter((v) => v.key).length;
  const configCount =
    (context.configYaml && context.configYaml.trim() ? 1 : 0) +
    (context.secureConfigYaml && context.secureConfigYaml.trim() ? 1 : 0);

  return (
    <div className="flex flex-col h-full overflow-hidden bg-surface">
      {/* Header */}
      <div className="h-10 shrink-0 flex items-center px-3.5 border-b border-line">
        <span className="text-[12.5px] font-semibold text-content">Context</span>
        <span className="ml-2 text-[10.5px] text-content-faint">request · vars · config</span>
      </div>

      {/* Tabs */}
      <div className="h-9 shrink-0 flex items-end px-2 border-b border-line gap-1">
        {(['Request', 'Vars', 'Config'] as const).map((t) => {
          const active = tab === t;
          const count = t === 'Request' ? reqCount : t === 'Vars' ? varsCount : configCount;
          return (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative h-full px-2.5 inline-flex items-center gap-1.5 text-[12px] font-medium cursor-pointer transition-colors ${
                active ? 'text-content' : 'text-content-faint hover:text-content-secondary'
              }`}
            >
              {t}
              {count > 0 && (
                <span
                  className={`inline-flex items-center justify-center min-w-[16px] h-[15px] px-1 rounded-full font-mono text-[9.5px] ${
                    active ? 'bg-accent-dim text-accent' : 'bg-surface-2 text-content-faint'
                  }`}
                >
                  {count}
                </span>
              )}
              {active && <span className="absolute left-1.5 right-1.5 -bottom-px h-0.5 rounded-sm bg-accent" />}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-4">
        {tab === 'Request' && (
          <>
            <div className="space-y-1.5">
              <span className="text-[10.5px] font-semibold text-content-faint uppercase tracking-[0.6px]">
                Method
              </span>
              <div className="flex gap-1.5 flex-wrap">
                {HTTP_METHODS.map((m) => {
                  const colors = METHOD_COLORS[m] || METHOD_COLORS.GET;
                  const isActive = context.method === m;
                  return (
                    <button
                      key={m}
                      onClick={() => updateMethod(m)}
                      className={`h-6 px-2 inline-flex items-center justify-center rounded-md text-[10.5px] font-bold tracking-wide transition-all cursor-pointer border font-mono ${
                        isActive
                          ? `${colors.bg} ${colors.text} ${colors.border}`
                          : 'bg-transparent border-line-subtle text-content-faint hover:text-content-secondary hover:border-line'
                      }`}
                    >
                      {m}
                    </button>
                  );
                })}
              </div>
            </div>

            <KeyValueRows
              label="URI Params"
              pairs={context.uriParams ?? []}
              onChange={updateUriParams}
              keyPlaceholder="param"
              valuePlaceholder="value"
            />

            <KeyValueRows
              label="Query Params"
              pairs={context.queryParams}
              onChange={updateQueryParams}
              keyPlaceholder="param"
              valuePlaceholder="value"
            />

            <KeyValueRows
              label="Headers"
              pairs={context.headers}
              onChange={updateHeaders}
              keyPlaceholder="Header-Name"
              valuePlaceholder="Header-Value"
            />
          </>
        )}

        {tab === 'Vars' && (
          <VarsPanel vars={context.vars} onChange={updateVars} />
        )}

        {tab === 'Config' && (
          <>
            <ConfigFile
              title="config"
              secure={false}
              value={context.configYaml || ''}
              onChange={(v) => onChange({ ...context, configYaml: v })}
              theme={editorTheme}
            />
            <ConfigFile
              title="secure-config"
              secure
              value={context.secureConfigYaml || ''}
              onChange={(v) => onChange({ ...context, secureConfigYaml: v })}
              theme={editorTheme}
            />
            {hasEncryptedValues(context.secureConfigYaml || '') && (
              <DecryptionCard
                context={context}
                onChange={onChange}
                encryptionKey={encryptionKey}
                onEncryptionKeyChange={onEncryptionKeyChange}
              />
            )}
            <div className="text-[10px] text-content-ghost leading-relaxed">
              Reach a nested YAML key with dots, as in Mule:{' '}
              <code className="text-violet font-mono">{'${salesforce.path}'}</code>
            </div>
          </>
        )}
      </div>
    </div>
  );
});
