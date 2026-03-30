import { useState } from 'react';
import Editor, { BeforeMount } from '@monaco-editor/react';
import { ContextState, HTTP_METHODS, METHOD_COLORS, KeyValuePair, VarEntry } from '../types';
import { KeyValueRows } from './KeyValueRows';
import { VarsPanel } from './VarsPanel';
import { defineDataWeaveTheme, DATAWEAVE_THEME_NAME, DATAWEAVE_LIGHT_THEME_NAME } from '../dataweaveTheme';
import { hasEncryptedValues, DEFAULT_ENCRYPTION_SETTINGS } from '../cryptoUtils';
import { useTheme } from '../ThemeContext';

const handleBeforeMount: BeforeMount = (monaco) => defineDataWeaveTheme(monaco);

const CONFIG_PLACEHOLDER = `# config.yaml — referenced as \${key}
# Example:
# salesforce:
#   path: /api/v1
#   timeout: 30000
# http:
#   port: 8081
`;

const SECURE_PLACEHOLDER = `# secure-config.yaml — referenced as \${secure::key}
# Plaintext or encrypted ![...] values:
# salesforce:
#   clientId: abc123
#   clientSecret: "![Base64EncryptedValue]"
`;

const ALGORITHMS = ['AES', 'Blowfish', 'DES', 'DESede', 'RC2'] as const;
const MODES = ['CBC', 'CFB', 'ECB', 'OFB'] as const;

interface ContextPanelProps {
  context: ContextState;
  onChange: (context: ContextState) => void;
  encryptionKey: string;
  onEncryptionKeyChange: (key: string) => void;
}

export function ContextPanel({ context, onChange, encryptionKey, onEncryptionKeyChange }: ContextPanelProps) {
  const [configExpanded, setConfigExpanded] = useState(true);
  const [secureExpanded, setSecureExpanded] = useState(true);
  const [showKey, setShowKey] = useState(false);
  const { isDark } = useTheme();
  const editorTheme = isDark ? DATAWEAVE_THEME_NAME : DATAWEAVE_LIGHT_THEME_NAME;

  const updateMethod = (method: string) => {
    onChange({ ...context, method });
  };

  const updateQueryParams = (queryParams: KeyValuePair[]) => {
    onChange({ ...context, queryParams });
  };

  const updateHeaders = (headers: KeyValuePair[]) => {
    onChange({ ...context, headers });
  };

  const updateVars = (vars: VarEntry[]) => {
    onChange({ ...context, vars });
  };

  return (
    <div className="flex flex-col h-full border border-line rounded-md overflow-hidden bg-surface-panel">
      <div className="bg-surface-elevated px-3 py-1.5 text-xs font-medium border-b border-line flex items-center gap-2">
        <span className="text-content-secondary">Context</span>
        <span className="text-[9px] text-content-faint">(attributes & vars)</span>
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* HTTP Method — Postman-style colored pills */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-content-muted uppercase tracking-wide">
            Method
          </span>
          <div className="flex gap-1 flex-wrap">
            {HTTP_METHODS.map((m) => {
              const colors = METHOD_COLORS[m] || METHOD_COLORS.GET;
              const isActive = context.method === m;
              return (
                <button
                  key={m}
                  onClick={() => updateMethod(m)}
                  className={`px-2 py-1 rounded text-[11px] font-bold tracking-wide transition-all cursor-pointer border ${
                    isActive
                      ? `${colors.bg} ${colors.text} ${colors.border}`
                      : 'bg-transparent border-line text-content-faint hover:text-content-secondary hover:border-content-faint'
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </div>

        {/* Query Params */}
        <KeyValueRows
          label="Query Params"
          pairs={context.queryParams}
          onChange={updateQueryParams}
          keyPlaceholder="param"
          valuePlaceholder="value"
        />

        {/* Headers */}
        <KeyValueRows
          label="Headers"
          pairs={context.headers}
          onChange={updateHeaders}
          keyPlaceholder="Header-Name"
          valuePlaceholder="Header-Value"
        />

        {/* Separator */}
        <div className="border-t border-line" />

        {/* Vars */}
        <VarsPanel vars={context.vars} onChange={updateVars} />

        {/* Separator */}
        <div className="border-t border-line" />

        {/* Config Properties (YAML) */}
        <div className="space-y-1.5">
          <button
            onClick={() => setConfigExpanded(!configExpanded)}
            aria-label="Toggle config properties"
            className="flex items-center gap-1.5 w-full cursor-pointer group"
          >
            <svg
              width="10" height="10" viewBox="0 0 10 10"
              className={`text-content-faint transition-transform ${configExpanded ? 'rotate-90' : ''}`}
              fill="currentColor"
            >
              <path d="M3 1l5 4-5 4V1z" />
            </svg>
            <span className="text-xs font-medium text-purple-400 uppercase tracking-wide">
              Config
            </span>
            <span className="text-[9px] text-content-ghost">
              {'${key}'}
            </span>
          </button>
          {configExpanded && (
            <div className="border border-line rounded overflow-hidden" style={{ height: 120 }}>
              <Editor
                height="100%"
                language="yaml"
                theme={editorTheme}
                beforeMount={handleBeforeMount}
                value={context.configYaml || ''}
                onChange={(val) => onChange({ ...context, configYaml: val || '' })}
                options={{
                  minimap: { enabled: false },
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
                }}
              />
            </div>
          )}
        </div>

        {/* Secure Config (YAML) */}
        <div className="space-y-1.5">
          <button
            onClick={() => setSecureExpanded(!secureExpanded)}
            aria-label="Toggle secure config properties"
            className="flex items-center gap-1.5 w-full cursor-pointer group"
          >
            <svg
              width="10" height="10" viewBox="0 0 10 10"
              className={`text-content-faint transition-transform ${secureExpanded ? 'rotate-90' : ''}`}
              fill="currentColor"
            >
              <path d="M3 1l5 4-5 4V1z" />
            </svg>
            <span className="text-xs font-medium text-yellow-400 uppercase tracking-wide">
              Secure Config
            </span>
            <span className="text-[9px] text-content-ghost">
              {'${secure::key}'}
            </span>
          </button>
          {secureExpanded && (
            <>
              <div className="border border-line rounded overflow-hidden" style={{ height: 120 }}>
                <Editor
                  height="100%"
                  language="yaml"
                  theme={editorTheme}
                  beforeMount={handleBeforeMount}
                  value={context.secureConfigYaml || ''}
                  onChange={(val) => onChange({ ...context, secureConfigYaml: val || '' })}
                  options={{
                    minimap: { enabled: false },
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
                  }}
                />
              </div>

              {/* Encryption settings — shown when YAML contains ![...] values */}
              {hasEncryptedValues(context.secureConfigYaml || '') && (
                <div className="space-y-2 p-2 border border-yellow-500/20 rounded bg-yellow-500/5">
                  <div className="flex items-center gap-1.5">
                    <svg width="10" height="10" viewBox="0 0 16 16" fill="#eab308" className="shrink-0">
                      <path d="M8 1a4 4 0 0 0-4 4v3H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-1V5a4 4 0 0 0-4-4zm2 7H6V5a2 2 0 1 1 4 0v3z"/>
                    </svg>
                    <span className="text-[10px] font-medium text-yellow-400">Encrypted values detected</span>
                  </div>

                  {/* Encryption Key */}
                  <div className="space-y-1">
                    <span className="text-[9px] text-content-faint">Encryption Key</span>
                    <div className="flex gap-1">
                      <input
                        type={showKey ? 'text' : 'password'}
                        value={encryptionKey}
                        onChange={(e) => onEncryptionKeyChange(e.target.value)}
                        placeholder="Enter key to decrypt"
                        className="flex-1 bg-surface-input border border-line-secondary rounded px-1.5 py-1 text-[10px] text-content placeholder-content-ghost focus:border-yellow-500/50 focus:outline-none font-mono"
                      />
                      <button
                        onClick={() => setShowKey(!showKey)}
                        className="px-1.5 text-[9px] text-content-faint hover:text-content-secondary border border-line-secondary rounded cursor-pointer"
                        title={showKey ? 'Hide key' : 'Show key'}
                      >
                        {showKey ? 'Hide' : 'Show'}
                      </button>
                    </div>
                    <span className="text-[8px] text-content-ghost block">Not saved to workspace file</span>
                  </div>

                  {/* Algorithm + Mode */}
                  <div className="flex gap-2">
                    <div className="flex-1 space-y-0.5">
                      <span className="text-[9px] text-content-faint">Algorithm</span>
                      <select
                        value={(context.encryptionSettings || DEFAULT_ENCRYPTION_SETTINGS).algorithm}
                        onChange={(e) => onChange({
                          ...context,
                          encryptionSettings: {
                            ...(context.encryptionSettings || DEFAULT_ENCRYPTION_SETTINGS),
                            algorithm: e.target.value,
                          },
                        })}
                        className="w-full bg-surface-input border border-line-secondary rounded px-1 py-0.5 text-[10px] text-content focus:outline-none cursor-pointer"
                      >
                        {ALGORITHMS.map((a) => (
                          <option key={a} value={a}>{a}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 space-y-0.5">
                      <span className="text-[9px] text-content-faint">Mode</span>
                      <select
                        value={(context.encryptionSettings || DEFAULT_ENCRYPTION_SETTINGS).mode}
                        onChange={(e) => onChange({
                          ...context,
                          encryptionSettings: {
                            ...(context.encryptionSettings || DEFAULT_ENCRYPTION_SETTINGS),
                            mode: e.target.value,
                          },
                        })}
                        className="w-full bg-surface-input border border-line-secondary rounded px-1 py-0.5 text-[10px] text-content focus:outline-none cursor-pointer"
                      >
                        {MODES.map((m) => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* useRandomIVs toggle */}
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={(context.encryptionSettings || DEFAULT_ENCRYPTION_SETTINGS).useRandomIVs}
                      onChange={(e) => onChange({
                        ...context,
                        encryptionSettings: {
                          ...(context.encryptionSettings || DEFAULT_ENCRYPTION_SETTINGS),
                          useRandomIVs: e.target.checked,
                        },
                      })}
                      className="w-3 h-3 rounded border-line-secondary accent-yellow-500"
                    />
                    <span className="text-[10px] text-content-muted">useRandomIVs</span>
                    <span className="text-[8px] text-content-ghost">(recommended)</span>
                  </label>

                  {(context.encryptionSettings || DEFAULT_ENCRYPTION_SETTINGS).algorithm !== 'AES' && (
                    <div className="text-[9px] text-orange-400/80 leading-relaxed">
                      Only AES is supported via Web Crypto. For {(context.encryptionSettings || DEFAULT_ENCRYPTION_SETTINGS).algorithm}, enter plaintext values instead.
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>

        <div className="text-[9px] text-content-ghost leading-relaxed">
          YAML keys are flattened with dots: <code className="text-[#C586C0]">salesforce.path</code> → <code className="text-[#C586C0]">{'${salesforce.path}'}</code>
        </div>
      </div>
    </div>
  );
}
