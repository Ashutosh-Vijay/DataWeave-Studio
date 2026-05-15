import { useEffect, useState } from 'react';
import Editor, { BeforeMount, useMonaco } from '@monaco-editor/react';
import { ContextState, HTTP_METHODS, METHOD_COLORS, KeyValuePair, VarEntry } from '../types';
import { KeyValueRows } from './KeyValueRows';
import { VarsPanel } from './VarsPanel';
import { defineDataWeaveTheme, DATAWEAVE_THEME_NAME, DATAWEAVE_LIGHT_THEME_NAME } from '../dataweaveTheme';
import { hasEncryptedValues, inspectAesKey, DEFAULT_ENCRYPTION_SETTINGS } from '../cryptoUtils';
import { useTheme } from '../ThemeContext';
import { useEditorFont } from '../hooks/useEditorFont';

const handleBeforeMount: BeforeMount = (monaco) => defineDataWeaveTheme(monaco);

const CONFIG_PLACEHOLDER = `# config.yaml — referenced as \${key}
# Example:
# salesforce:
#   path: /api/v1
#   timeout: 30000
`;

const SECURE_PLACEHOLDER = `# secure-config.yaml — referenced as \${secure::key}
# Plaintext or encrypted ![...] values:
# salesforce:
#   clientId: abc123
#   clientSecret: "![Base64EncryptedValue]"
`;

const ALGORITHMS = ['AES', 'Blowfish', 'DES', 'DESede', 'RC2'] as const;
const MODES = ['CBC', 'CFB', 'ECB', 'OFB'] as const;

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

export function ContextPanel({ context, onChange, encryptionKey, onEncryptionKeyChange, defaultTab }: ContextPanelProps) {
  const [tab, setTab] = useState<Tab>(defaultTab ?? 'Request');
  const [showKey, setShowKey] = useState(false);
  const { isDark } = useTheme();
  const editorFont = useEditorFont();
  const monaco = useMonaco();
  useEffect(() => { if (monaco) defineDataWeaveTheme(monaco); }, [isDark, monaco]);
  const editorTheme = isDark ? DATAWEAVE_THEME_NAME : DATAWEAVE_LIGHT_THEME_NAME;

  const updateMethod = (method: string) => onChange({ ...context, method });
  const updateQueryParams = (queryParams: KeyValuePair[]) => onChange({ ...context, queryParams });
  const updateHeaders = (headers: KeyValuePair[]) => onChange({ ...context, headers });
  const updateVars = (vars: VarEntry[]) => onChange({ ...context, vars });

  const reqCount = activeCount(context.queryParams) + activeCount(context.headers);
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
            {/* config.yaml */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[10.5px] font-semibold text-violet uppercase tracking-[0.6px]">
                  config.yaml
                </span>
                <span className="text-[9.5px] text-content-ghost font-mono">{'${key}'}</span>
              </div>
              <div className="border border-line rounded overflow-hidden" style={{ height: 140 }}>
                <Editor
                  height="100%"
                  language="yaml"
                  theme={editorTheme}
                  beforeMount={handleBeforeMount}
                  value={context.configYaml || ''}
                  onChange={(val) => onChange({ ...context, configYaml: val || '' })}
                  options={{
                    minimap: { enabled: false },
                    fontFamily: editorFont.fontFamily,
                    fontSize: 11,
                    lineNumbers: 'off',
                    wordWrap: 'on',
                    scrollBeyondLastLine: false,
                    folding: false,
                    glyphMargin: false,
                    lineDecorationsWidth: 4,
                    lineNumbersMinChars: 0,
                    renderLineHighlight: 'none',
                    scrollbar: { vertical: 'hidden', horizontal: 'hidden' },
                    overviewRulerLanes: 0,
                    placeholder: CONFIG_PLACEHOLDER,
                    autoClosingBrackets: 'always',
                    autoClosingQuotes: 'always',
                    autoSurround: 'brackets',
                    autoIndent: 'full',
                  }}
                />
              </div>
            </div>

            {/* secure-config.yaml */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <span className="text-[10.5px] font-semibold text-warn uppercase tracking-[0.6px]">
                  secure-config.yaml
                </span>
                <span className="text-[9.5px] text-content-ghost font-mono">{'${secure::key}'}</span>
              </div>
              <div className="border border-line rounded overflow-hidden" style={{ height: 140 }}>
                <Editor
                  height="100%"
                  language="yaml"
                  theme={editorTheme}
                  beforeMount={handleBeforeMount}
                  value={context.secureConfigYaml || ''}
                  onChange={(val) => onChange({ ...context, secureConfigYaml: val || '' })}
                  options={{
                    minimap: { enabled: false },
                    fontFamily: editorFont.fontFamily,
                    fontSize: 11,
                    lineNumbers: 'off',
                    wordWrap: 'on',
                    scrollBeyondLastLine: false,
                    folding: false,
                    glyphMargin: false,
                    lineDecorationsWidth: 4,
                    lineNumbersMinChars: 0,
                    renderLineHighlight: 'none',
                    scrollbar: { vertical: 'hidden', horizontal: 'hidden' },
                    overviewRulerLanes: 0,
                    placeholder: SECURE_PLACEHOLDER,
                    autoClosingBrackets: 'always',
                    autoClosingQuotes: 'always',
                    autoSurround: 'brackets',
                    autoIndent: 'full',
                  }}
                />
              </div>
            </div>

            {/* Encryption status row */}
            {hasEncryptedValues(context.secureConfigYaml || '') && (
              <div className="space-y-2 p-2.5 border border-warn-border rounded-md bg-warn-tint">
                <div className="flex items-center gap-1.5">
                  <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="shrink-0 text-warn">
                    <path d="M8 1a4 4 0 0 0-4 4v3H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-1V5a4 4 0 0 0-4-4zm2 7H6V5a2 2 0 1 1 4 0v3z" />
                  </svg>
                  <span className="text-[11px] font-medium text-warn">Encrypted values detected</span>
                  <span className="ml-auto font-mono text-[10px] text-content-faint">
                    {(context.encryptionSettings || DEFAULT_ENCRYPTION_SETTINGS).algorithm} ·{' '}
                    {(context.encryptionSettings || DEFAULT_ENCRYPTION_SETTINGS).mode}
                  </span>
                </div>

                <div className="space-y-1">
                  <span className="text-[10px] text-content-faint">Encryption key</span>
                  <div className="flex gap-1">
                    <input
                      type={showKey ? 'text' : 'password'}
                      value={encryptionKey}
                      onChange={(e) => onEncryptionKeyChange(e.target.value)}
                      placeholder="16, 24, or 32 chars"
                      className="flex-1 bg-surface-input border border-line-secondary rounded px-2 py-1 text-[11px] text-content placeholder-content-ghost focus:border-warn-border focus:outline-none font-mono"
                    />
                    <button
                      onClick={() => setShowKey(!showKey)}
                      className="px-2 text-[10px] text-content-faint hover:text-content-secondary border border-line-secondary rounded cursor-pointer"
                      title={showKey ? 'Hide key' : 'Show key'}
                    >
                      {showKey ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  {encryptionKey ? (() => {
                    const info = inspectAesKey(encryptionKey);
                    return (
                      <span
                        className="text-[9px] block"
                        style={{ color: info.aesValid ? 'var(--accent)' : 'var(--warn)' }}
                      >
                        {info.bytes} bytes — {info.aesValid ? `${info.aesVariant} ✓` : 'invalid AES length'}
                      </span>
                    );
                  })() : null}
                  <span className="text-[9px] text-content-ghost block">Not saved to workspace file</span>
                </div>

                <div className="flex gap-2">
                  <div className="flex-1 space-y-0.5">
                    <span className="text-[10px] text-content-faint">Algorithm</span>
                    <select
                      value={(context.encryptionSettings || DEFAULT_ENCRYPTION_SETTINGS).algorithm}
                      onChange={(e) =>
                        onChange({
                          ...context,
                          encryptionSettings: {
                            ...(context.encryptionSettings || DEFAULT_ENCRYPTION_SETTINGS),
                            algorithm: e.target.value,
                          },
                        })
                      }
                      className="w-full bg-surface-input border border-line-secondary rounded px-1.5 py-1 text-[10.5px] text-content focus:outline-none cursor-pointer"
                    >
                      {ALGORITHMS.map((a) => (
                        <option key={a} value={a}>
                          {a}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="flex-1 space-y-0.5">
                    <span className="text-[10px] text-content-faint">Mode</span>
                    <select
                      value={(context.encryptionSettings || DEFAULT_ENCRYPTION_SETTINGS).mode}
                      onChange={(e) =>
                        onChange({
                          ...context,
                          encryptionSettings: {
                            ...(context.encryptionSettings || DEFAULT_ENCRYPTION_SETTINGS),
                            mode: e.target.value,
                          },
                        })
                      }
                      className="w-full bg-surface-input border border-line-secondary rounded px-1.5 py-1 text-[10.5px] text-content focus:outline-none cursor-pointer"
                    >
                      {MODES.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={(context.encryptionSettings || DEFAULT_ENCRYPTION_SETTINGS).useRandomIVs}
                    onChange={(e) =>
                      onChange({
                        ...context,
                        encryptionSettings: {
                          ...(context.encryptionSettings || DEFAULT_ENCRYPTION_SETTINGS),
                          useRandomIVs: e.target.checked,
                        },
                      })
                    }
                    className="w-3 h-3 rounded border-line-secondary accent-warn"
                  />
                  <span className="text-[11px] text-content-muted">Random IV</span>
                  <span className="text-[9.5px] text-content-ghost">(off matches Mule default)</span>
                </label>

              </div>
            )}

            <div className="text-[9.5px] text-content-ghost leading-relaxed">
              YAML keys flatten with dots:{' '}
              <code className="text-violet font-mono">salesforce.path</code> →{' '}
              <code className="text-violet font-mono">{'${salesforce.path}'}</code>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
