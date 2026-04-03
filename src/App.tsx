import { useCallback, useEffect, useRef, useState } from 'react';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { ScriptEditor } from './components/ScriptEditor';
import { PayloadTabs } from './components/PayloadTabs';
import { OutputPane } from './components/OutputPane';
import { ContextPanel } from './components/ContextPanel';
import { Sidebar } from './components/Sidebar';
import { QueryEditor } from './components/QueryEditor';
import { AboutDialog } from './components/AboutDialog';
import { SecurePropertiesTool } from './components/SecurePropertiesTool';
import { WelcomeTour, shouldShowTour, markTourSeen } from './components/WelcomeTour';
import { SplashScreen } from './components/SplashScreen';
import { useWorkspace } from './hooks/useWorkspace';
import { useDWRunner } from './hooks/useDWRunner';
import { useTheme } from './ThemeContext';
import { KeyValuePair, VarEntry, METHOD_COLORS, NODE_LABEL_COLORS } from './types';
import yaml from 'js-yaml';
import { CurlImportResult } from './components/CurlImporter';
import { decryptFlatMap, hasEncryptedValues, DEFAULT_ENCRYPTION_SETTINGS } from './cryptoUtils';

const APP_VERSION = '1.0.0';

/**
 * Substitute :paramName placeholders with values from a parameter map.
 *
 * Salesforce mode: literal string replace — user controls quoting in the
 * SOQL template (e.g. ':industry' for strings, :fromDate bare for dates).
 *
 * DB mode: simulates JDBC prepared statements — auto-quotes strings,
 * escapes single quotes, bare numbers/booleans, NULL for nulls.
 * User must NEVER add quotes around :param in SQL.
 */
function substituteQueryParams(
  query: string,
  paramsJson: string,
  isDbMode: boolean
): { result: string; params: Record<string, unknown> } | null {
  try {
    const params = JSON.parse(paramsJson);
    if (typeof params !== 'object' || params === null || Array.isArray(params)) return null;
    let result = query;
    for (const [key, value] of Object.entries(params)) {
      let replacement: string;
      if (isDbMode) {
        // DB connector: JDBC-style — driver handles quoting
        if (value === null || value === undefined) {
          replacement = 'NULL';
        } else if (typeof value === 'number' || typeof value === 'boolean') {
          replacement = String(value);
        } else {
          // String: auto-wrap in quotes, escape internal single quotes
          replacement = `'${String(value).replace(/'/g, "''")}'`;
        }
      } else {
        // Salesforce connector: literal replace — user controls quoting in template
        if (value === null || value === undefined) {
          replacement = 'null';
        } else {
          replacement = String(value);
        }
      }
      result = result.replace(new RegExp(`:${key}\\b`, 'g'), replacement);
    }
    return { result, params };
  } catch {
    return null;
  }
}

function buildAttributesJson(
  method: string,
  queryParams: KeyValuePair[],
  headers: KeyValuePair[]
): string {
  const attrs: Record<string, unknown> = { method };

  if (queryParams.length > 0) {
    const qp: Record<string, string> = {};
    queryParams.forEach((p) => {
      if (p.key) qp[p.key] = p.value;
    });
    attrs.queryParams = qp;
  }

  if (headers.length > 0) {
    const h: Record<string, string> = {};
    headers.forEach((p) => {
      if (p.key) h[p.key] = p.value;
    });
    attrs.headers = h;
  }

  return JSON.stringify(attrs);
}

function buildVarsJson(vars: VarEntry[]): string {
  const obj: Record<string, unknown> = {};
  vars.forEach((v) => {
    if (!v.key) return;
    if (v.valueType === 'json') {
      try {
        obj[v.key] = JSON.parse(v.value);
      } catch {
        obj[v.key] = v.value;
      }
    } else {
      obj[v.key] = v.value;
    }
  });
  return JSON.stringify(obj);
}

/**
 * Flatten a nested YAML object into dot-notation keys.
 * e.g. { salesforce: { path: "/api" } } → { "salesforce.path": "/api" }
 */
function flattenYaml(obj: unknown, prefix = ''): Record<string, string> {
  const result: Record<string, string> = {};
  if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        Object.assign(result, flattenYaml(value, fullKey));
      } else {
        result[fullKey] = String(value ?? '');
      }
    }
  }
  return result;
}

/**
 * Substitute ${key} / ${secure::key} using pre-flattened maps.
 * The secure map may already have decrypted ![...] values.
 */
function substituteFromMaps(
  text: string,
  configFlat: Record<string, string>,
  secureFlat: Record<string, string>
): string {
  let result = text;

  for (const [key, value] of Object.entries(configFlat)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`\\$\\{${escaped}\\}`, 'g'), value);
  }

  for (const [key, value] of Object.entries(secureFlat)) {
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(`\\$\\{secure::${escaped}\\}`, 'g'), value);
    // Also allow ${key} to reference secure props (MuleSoft behavior)
    result = result.replace(new RegExp(`\\$\\{${escaped}\\}`, 'g'), value);
  }

  return result;
}

/**
 * Parse YAML config strings and substitute ${key} / ${secure::key} placeholders.
 * Synchronous version — does NOT decrypt ![...] values.
 * Used for non-critical paths like query template preview.
 */
function substituteProperties(text: string, configYaml?: string, secureConfigYaml?: string): string {
  if (!configYaml && !secureConfigYaml) return text;

  let configFlat: Record<string, string> = {};
  let secureFlat: Record<string, string> = {};

  if (configYaml) {
    try { configFlat = flattenYaml(yaml.load(configYaml)); } catch { /* skip */ }
  }
  if (secureConfigYaml) {
    try { secureFlat = flattenYaml(yaml.load(secureConfigYaml)); } catch { /* skip */ }
  }

  return substituteFromMaps(text, configFlat, secureFlat);
}

/**
 * Async version that decrypts ![...] values in secure config before substitution.
 */
async function substitutePropertiesAsync(
  text: string,
  configYaml: string | undefined,
  secureConfigYaml: string | undefined,
  encryptionKey: string,
  encryptionSettings?: import('./types').EncryptionSettings,
): Promise<string> {
  if (!configYaml && !secureConfigYaml) return text;

  let configFlat: Record<string, string> = {};
  let secureFlat: Record<string, string> = {};

  if (configYaml) {
    try { configFlat = flattenYaml(yaml.load(configYaml)); } catch { /* skip */ }
  }

  if (secureConfigYaml) {
    try {
      secureFlat = flattenYaml(yaml.load(secureConfigYaml));
      // Decrypt ![...] values if key is provided
      if (encryptionKey && hasEncryptedValues(secureConfigYaml)) {
        const settings = encryptionSettings || DEFAULT_ENCRYPTION_SETTINGS;
        secureFlat = await decryptFlatMap(secureFlat, encryptionKey, settings);
      }
    } catch { /* skip */ }
  }

  return substituteFromMaps(text, configFlat, secureFlat);
}

function App() {
  const workspace = useWorkspace();
  const runner = useDWRunner();
  const { toggle, isDark } = useTheme();
  const [outputFormat, setOutputFormat] = useState<'json' | 'xml' | 'raw'>('json');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [autoRun, setAutoRun] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [secureToolOpen, setSecureToolOpen] = useState(false);
  const [showTour, setShowTour] = useState(() => shouldShowTour());
  const [encryptionKey, setEncryptionKey] = useState('');
  const autoRunTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleRunRef = useRef<() => void>(() => {});
  const canRunRef = useRef(false);

  const handleRun = useCallback(async () => {
    const { configYaml, secureConfigYaml } = workspace.context;

    const attributesJson = buildAttributesJson(
      workspace.context.method,
      workspace.context.queryParams,
      workspace.context.headers
    );
    const varsJson = buildVarsJson(workspace.context.vars);

    const namedInputsJson = JSON.stringify(
      workspace.namedInputs.filter((ni) => ni.name)
    );

    // Substitute ${key} and ${secure::key} in script and payload (with decryption)
    const resolvedScript = await substitutePropertiesAsync(workspace.script, configYaml, secureConfigYaml, encryptionKey, workspace.context.encryptionSettings);
    const resolvedPayload = await substitutePropertiesAsync(workspace.payload, configYaml, secureConfigYaml, encryptionKey, workspace.context.encryptionSettings);

    const multipartPartsJson =
      workspace.payloadMimeType === 'multipart/form-data' && workspace.multipartParts.length > 0
        ? JSON.stringify(workspace.multipartParts)
        : undefined;

    await runner.run(
      resolvedScript,
      resolvedPayload,
      workspace.payloadMimeType,
      attributesJson,
      varsJson,
      namedInputsJson,
      workspace.payloadFilePath,
      workspace.classpath,
      workspace.timeoutMs,
      multipartPartsJson,
    );
  }, [workspace.script, workspace.payload, workspace.payloadMimeType, workspace.context, workspace.namedInputs, workspace.payloadFilePath, workspace.classpath, workspace.timeoutMs, workspace.multipartParts, runner, encryptionKey]);

  // Keep refs in sync for auto-run (avoids stale closures and infinite loops)
  handleRunRef.current = handleRun;
  canRunRef.current = runner.isWarmedUp && !runner.isRunning;

  const handleCurlImport = useCallback((result: CurlImportResult) => {
    workspace.setPayload(result.payload);
    workspace.setPayloadMimeType(result.payloadMimeType);
    workspace.setScript(result.generatedScript);
    if (result.multipartParts) {
      workspace.setMultipartParts(result.multipartParts);
    }
    workspace.setContext({
      ...workspace.context,
      method: result.method,
      headers: result.headers,
      queryParams: result.queryParams,
    });
  }, [workspace]);

  // Global Ctrl+S to save
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        workspace.saveWorkspace();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [workspace.saveWorkspace]);

  // Auto-run with 1.5s debounce — only fires when inputs change
  useEffect(() => {
    if (!autoRun) return;
    if (autoRunTimerRef.current) clearTimeout(autoRunTimerRef.current);
    autoRunTimerRef.current = setTimeout(() => {
      if (canRunRef.current) {
        handleRunRef.current();
      }
    }, 1500);
    return () => {
      if (autoRunTimerRef.current) clearTimeout(autoRunTimerRef.current);
    };
  }, [autoRun, workspace.script, workspace.payload, workspace.payloadMimeType, workspace.context, workspace.namedInputs, workspace.queryTemplate]);

  const canRun = runner.isWarmedUp && !runner.isRunning;
  const isQueryMode = workspace.nodeLabel === 'Salesforce Query' || workspace.nodeLabel === 'DB Query';
  const queryLanguage = workspace.nodeLabel === 'Salesforce Query' ? 'SOQL' : 'SQL';

  // Compute substituted query when in query mode and output is available
  const isDbMode = workspace.nodeLabel === 'DB Query';
  const resolvedQueryTemplate = substituteProperties(
    workspace.queryTemplate,
    workspace.context.configYaml,
    workspace.context.secureConfigYaml
  );
  const queryResult = isQueryMode && runner.output && resolvedQueryTemplate
    ? substituteQueryParams(resolvedQueryTemplate, runner.output, isDbMode)
    : null;

  const methodColors = METHOD_COLORS[workspace.context.method] || METHOD_COLORS.GET;
  const nodeLabelColors = NODE_LABEL_COLORS[workspace.nodeLabel] || NODE_LABEL_COLORS.Transform;

  return (
    <div className="h-screen w-screen bg-surface text-content flex flex-col font-sans select-none">
      {/* Header */}
      <header data-tour="header" className="h-11 border-b border-[#00a0df]/20 flex items-center px-4 bg-gradient-to-r from-[var(--header-from)] to-[var(--header-to)] shrink-0">
        {/* Logo + title */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Logo mark */}
          <img src="/logo.svg" alt="" width="24" height="24" className="rounded" />
          <h1 className="font-semibold text-content text-sm tracking-tight">DataWeave Studio</h1>
          <span className="text-[9px] px-1.5 py-0.5 bg-[#00a0df]/15 text-[#00a0df] border border-[#00a0df]/30 rounded font-medium">v{APP_VERSION}</span>
        </div>

        {/* Center: project info with method + node label badges */}
        <div className="flex-1 flex justify-center">
          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold tracking-wide border ${methodColors.bg} ${methodColors.text} ${methodColors.border}`}>
              {workspace.context.method}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium border ${nodeLabelColors.bg} ${nodeLabelColors.text} ${nodeLabelColors.border}`}>
              {workspace.nodeLabel}
            </span>
            <span className="text-sm text-content-secondary font-medium">{workspace.projectName}</span>
            {workspace.isDirty && (
              <span className="text-yellow-500 text-xs" title="Unsaved changes">*</span>
            )}
          </div>
        </div>

        {/* Right side: help + about + theme + warmup + run */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            {/* Tour / Help */}
            <button
              onClick={() => setShowTour(true)}
              className="text-content-faint hover:text-[#00a0df] transition-colors cursor-pointer p-1"
              title="Show guided tour"
              aria-label="Show guided tour"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                <path d="M5.255 5.786a.237.237 0 0 0 .241.247h.825c.138 0 .248-.113.266-.25.09-.656.54-1.134 1.342-1.134.686 0 1.314.343 1.314 1.168 0 .635-.374.927-.965 1.371-.673.489-1.206 1.06-1.168 1.987l.003.217a.25.25 0 0 0 .25.246h.811a.25.25 0 0 0 .25-.25v-.105c0-.718.273-.927 1.01-1.486.609-.463 1.244-.977 1.244-2.056 0-1.511-1.276-2.241-2.673-2.241-1.267 0-2.655.59-2.75 2.286zm1.557 5.763c0 .533.425.927 1.01.927.609 0 1.028-.394 1.028-.927 0-.552-.42-.94-1.029-.94-.584 0-1.009.388-1.009.94z"/>
              </svg>
            </button>
            {/* Secure Properties Tool */}
            <button
              onClick={() => setSecureToolOpen(true)}
              className="text-content-faint hover:text-yellow-400 transition-colors cursor-pointer p-1"
              title="Secure Properties Tool (Encrypt/Decrypt)"
              aria-label="Secure Properties Tool"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 1a4 4 0 0 0-4 4v3H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1h-1V5a4 4 0 0 0-4-4zm2 7H6V5a2 2 0 1 1 4 0v3z"/>
              </svg>
            </button>
            {/* About */}
            <button
              onClick={() => setAboutOpen(true)}
              className="text-content-faint hover:text-[#00a0df] transition-colors cursor-pointer p-1"
              title="About DataWeave Studio"
              aria-label="About DataWeave Studio"
            >
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0 1A8 8 0 1 0 8 0a8 8 0 0 0 0 16z"/>
                <path d="m8.93 6.588-2.29.287-.082.38.45.083c.294.07.352.176.288.469l-.738 3.468c-.194.897.105 1.319.808 1.319.545 0 1.178-.252 1.465-.598l.088-.416c-.2.176-.492.246-.686.246-.275 0-.375-.193-.304-.533L8.93 6.588zM9 4.5a1 1 0 1 1-2 0 1 1 0 0 1 2 0z"/>
              </svg>
            </button>
            {/* Theme toggle */}
            <button
              onClick={toggle}
              className="text-content-faint hover:text-[#00a0df] transition-colors cursor-pointer p-1"
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              aria-label="Toggle theme"
            >
              {isDark ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM8 0a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 0zm0 13a.5.5 0 0 1 .5.5v2a.5.5 0 0 1-1 0v-2A.5.5 0 0 1 8 13zm8-5a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2a.5.5 0 0 1 .5.5zM3 8a.5.5 0 0 1-.5.5h-2a.5.5 0 0 1 0-1h2A.5.5 0 0 1 3 8zm10.657-5.657a.5.5 0 0 1 0 .707l-1.414 1.415a.5.5 0 1 1-.707-.708l1.414-1.414a.5.5 0 0 1 .707 0zm-9.193 9.193a.5.5 0 0 1 0 .707L3.05 13.657a.5.5 0 0 1-.707-.707l1.414-1.414a.5.5 0 0 1 .707 0zm9.193 2.121a.5.5 0 0 1-.707 0l-1.414-1.414a.5.5 0 0 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .707zM4.464 4.465a.5.5 0 0 1-.707 0L2.343 3.05a.5.5 0 1 1 .707-.707l1.414 1.414a.5.5 0 0 1 0 .708z"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M6 .278a.768.768 0 0 1 .08.858 7.208 7.208 0 0 0-.878 3.46c0 4.021 3.278 7.277 7.318 7.277.527 0 1.04-.055 1.533-.16a.787.787 0 0 1 .81.316.733.733 0 0 1-.031.893A8.349 8.349 0 0 1 8.344 16C3.734 16 0 12.286 0 7.71 0 4.266 2.114 1.312 5.124.06A.752.752 0 0 1 6 .278z"/>
                </svg>
              )}
            </button>
          </div>
          {!runner.isWarmedUp && (
            <div className="flex items-center gap-1.5 text-xs text-[#00a0df]">
              <div className="w-3 h-3 rounded-full border-2 border-t-transparent border-[#00a0df] animate-spin" />
              <span>Warming up...</span>
            </div>
          )}
          <span data-tour="run-controls" className="text-[10px] text-content-ghost">Ctrl+Enter</span>
          <button
            onClick={() => setAutoRun(!autoRun)}
            className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer border ${
              autoRun
                ? 'bg-[#00a0df]/20 border-[#00a0df]/50 text-[#00a0df]'
                : 'bg-transparent border-line-secondary text-content-faint hover:border-content-muted hover:text-content-secondary'
            }`}
            title="Auto-run: re-execute after 1.5s of inactivity"
          >
            Auto
          </button>
          <button
            onClick={handleRun}
            disabled={!canRun}
            className="bg-[#00a0df] hover:bg-[#0090c5] disabled:bg-line disabled:text-content-faint text-white px-4 py-1.5 rounded text-sm font-medium transition-colors cursor-pointer shadow-sm shadow-[#00a0df]/20"
          >
            {runner.isRunning ? 'Running...' : 'Run'}
          </button>
        </div>
      </header>

      {/* CLI error banner */}
      {runner.cliError && (
        <div className="bg-red-900/40 border-b border-red-800/50 px-4 py-2 flex items-center gap-3 shrink-0">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="#f87171" className="shrink-0">
            <path d="M8 15A7 7 0 1 1 8 1a7 7 0 0 1 0 14zm0-9.5a.75.75 0 0 0-.75.75v3.5a.75.75 0 0 0 1.5 0v-3.5A.75.75 0 0 0 8 5.5zM8 12a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/>
          </svg>
          <div className="flex-1 min-w-0">
            <span className="text-xs text-red-300 font-medium">DataWeave CLI unavailable</span>
            <span className="text-xs text-red-400/70 ml-2">{runner.cliError}</span>
          </div>
          <span className="text-[10px] text-red-400/50 shrink-0">Scripts cannot be executed until this is resolved</span>
        </div>
      )}

      {/* Body: Sidebar + Main */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar — fixed, not resizable (has its own collapse) */}
        <Sidebar
          projectName={workspace.projectName}
          onProjectNameChange={workspace.setProjectName}
          currentFile={workspace.currentFile}
          isDirty={workspace.isDirty}
          onNew={workspace.newWorkspace}
          onSave={workspace.saveWorkspace}
          onLoad={workspace.loadWorkspace}
          onDelete={workspace.deleteWorkspace}
          listWorkspaces={workspace.listWorkspaces}
          nodeLabel={workspace.nodeLabel}
          onNodeLabelChange={workspace.setNodeLabel}
          payloadMimeType={workspace.payloadMimeType}
          onPayloadMimeTypeChange={workspace.setPayloadMimeType}
          classpath={workspace.classpath}
          onClasspathChange={workspace.setClasspath}
          timeoutMs={workspace.timeoutMs}
          onTimeoutMsChange={workspace.setTimeoutMs}
          onCurlImport={handleCurlImport}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Main — three horizontal resizable columns */}
        <main className="flex-1 overflow-hidden p-2">
          <PanelGroup orientation="horizontal" className="h-full gap-0">

            {/* Left column: Query + Script + Payload (vertical splits) */}
            <Panel defaultSize={42} minSize={20} data-tour="script-editor">
              <PanelGroup orientation="vertical" className="h-full">
                {isQueryMode && (
                  <>
                    <Panel defaultSize={30} minSize={10}>
                      <div className="h-full pb-1">
                        <QueryEditor
                          query={workspace.queryTemplate}
                          onChange={(val) => workspace.setQueryTemplate(val || '')}
                          language={queryLanguage}
                        />
                      </div>
                    </Panel>
                    <PanelResizeHandle className="h-1.5 flex items-center justify-center cursor-row-resize group">
                      <div className="w-8 h-0.5 rounded-full bg-line-secondary group-hover:bg-[#00a0df]/50 transition-colors" />
                    </PanelResizeHandle>
                  </>
                )}
                <Panel defaultSize={isQueryMode ? 40 : 60} minSize={15}>
                  <div className="h-full pb-1" data-tour="script-editor">
                    <ScriptEditor
                      code={workspace.script}
                      onChange={(val) => workspace.setScript(val || '')}
                      onRun={handleRun}
                      errorLine={runner.errorLine}
                      payload={workspace.payload}
                      payloadMimeType={workspace.payloadMimeType}
                      headerLabel={isQueryMode ? 'Parameters (DataWeave 2.0)' : undefined}
                      contextData={{
                        vars: workspace.context.vars,
                        headers: workspace.context.headers,
                        queryParams: workspace.context.queryParams,
                        namedInputs: workspace.namedInputs,
                        configYaml: workspace.context.configYaml,
                        secureConfigYaml: workspace.context.secureConfigYaml,
                      }}
                    />
                  </div>
                </Panel>
                <PanelResizeHandle className="h-1.5 flex items-center justify-center cursor-row-resize group">
                  <div className="w-8 h-0.5 rounded-full bg-line-secondary group-hover:bg-[#00a0df]/50 transition-colors" />
                </PanelResizeHandle>
                <Panel defaultSize={isQueryMode ? 30 : 40} minSize={10}>
                  <div className="h-full pt-1" data-tour="payload">
                    <PayloadTabs
                      payload={workspace.payload}
                      onPayloadChange={(val) => workspace.setPayload(val || '')}
                      payloadMimeType={workspace.payloadMimeType}
                      onPayloadMimeTypeChange={workspace.setPayloadMimeType}
                      payloadFilePath={workspace.payloadFilePath}
                      onPayloadFilePathChange={workspace.setPayloadFilePath}
                      multipartParts={workspace.multipartParts}
                      onMultipartPartsChange={workspace.setMultipartParts}
                      namedInputs={workspace.namedInputs}
                      onNamedInputsChange={workspace.setNamedInputs}
                    />
                  </div>
                </Panel>
              </PanelGroup>
            </Panel>

            <PanelResizeHandle className="w-1.5 flex items-center justify-center cursor-col-resize group mx-1">
              <div className="h-8 w-0.5 rounded-full bg-line-secondary group-hover:bg-[#00a0df]/50 transition-colors" />
            </PanelResizeHandle>

            {/* Center: Context Panel */}
            <Panel defaultSize={20} minSize={10} data-tour="context-panel">
              <ContextPanel
                context={workspace.context}
                onChange={workspace.setContext}
                encryptionKey={encryptionKey}
                onEncryptionKeyChange={setEncryptionKey}
              />
            </Panel>

            <PanelResizeHandle className="w-1.5 flex items-center justify-center cursor-col-resize group mx-1">
              <div className="h-8 w-0.5 rounded-full bg-line-secondary group-hover:bg-[#00a0df]/50 transition-colors" />
            </PanelResizeHandle>

            {/* Right: Output */}
            <Panel defaultSize={38} minSize={15} data-tour="output">
              <OutputPane
                output={runner.output}
                error={runner.error}
                isRunning={runner.isRunning}
                executionTimeMs={runner.executionTimeMs}
                outputFormat={outputFormat}
                onFormatChange={setOutputFormat}
                queryResult={queryResult}
                isQueryMode={isQueryMode}
                queryLanguage={queryLanguage}
              />
            </Panel>

          </PanelGroup>
        </main>
      </div>

      {/* About dialog */}
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} />

      {/* Secure Properties Tool dialog */}
      <SecurePropertiesTool open={secureToolOpen} onClose={() => setSecureToolOpen(false)} />

      {/* First-launch guided tour */}
      {showTour && (
        <WelcomeTour onComplete={() => { setShowTour(false); markTourSeen(); }} />
      )}

      {/* Splash screen — covers everything until CLI is ready */}
      <SplashScreen isReady={runner.isWarmedUp} hasError={!!runner.cliError} />
    </div>
  );
}

export default App;
