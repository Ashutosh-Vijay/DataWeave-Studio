import { useCallback, useEffect, useRef, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { check } from '@tauri-apps/plugin-updater';
import { invoke } from '@tauri-apps/api/core';
import { openPath } from '@tauri-apps/plugin-opener';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { ScriptEditor, ScriptEditorHandle } from './components/ScriptEditor';
import { OpenWorkspaceDialog } from './components/OpenWorkspaceDialog';
import { PayloadTabs } from './components/PayloadTabs';
import { OutputPane } from './components/OutputPane';
import { ContextPanel } from './components/ContextPanel';
import { Sidebar, SidebarHandle } from './components/Sidebar';
import { QueryEditor } from './components/QueryEditor';
import { AboutDialog } from './components/AboutDialog';
import { SecurePropertiesTool } from './components/SecurePropertiesTool';
import { WelcomeTour, shouldShowTour, markTourSeen } from './components/WelcomeTour';
import { SplashScreen } from './components/SplashScreen';
import { CommandPalette, Command } from './components/CommandPalette';
import { ShortcutsDialog } from './components/ShortcutsDialog';
import { SettingsScreen } from './components/SettingsScreen';
import { CompactLayout } from './components/CompactLayout';
import { FocusDrawer } from './components/FocusDrawer';
import { FirstRunPicker, shouldShowFirstRun, markFirstRunSeen } from './components/FirstRunPicker';
import { EmptyState, shouldShowEmptyState, markStarted } from './components/EmptyState';
import { useWorkspace } from './hooks/useWorkspace';
import { useDWRunner } from './hooks/useDWRunner';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useTheme } from './ThemeContext';
import { KeyValuePair, VarEntry, METHOD_COLORS, NODE_LABEL_COLORS, NODE_LABELS } from './types';
import { Icons } from './components/Icons';
import yaml from 'js-yaml';
import { CurlImportResult } from './components/CurlImporter';
import { decryptFlatMap, hasEncryptedValues, DEFAULT_ENCRYPTION_SETTINGS } from './cryptoUtils';

// Version is loaded dynamically from tauri.conf.json at runtime

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

function context_count(pairs: KeyValuePair[]): number {
  return pairs.filter((p) => p.enabled !== false && p.key && p.value !== '').length;
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
      // Skip disabled or empty rows (absent param ≠ empty-string param in DW)
      if (p.enabled === false) return;
      if (p.key && p.value !== '') qp[p.key] = p.value;
    });
    if (Object.keys(qp).length > 0) attrs.queryParams = qp;
  }

  if (headers.length > 0) {
    const h: Record<string, string> = {};
    headers.forEach((p) => {
      if (p.enabled === false) return;
      if (p.key && p.value !== '') h[p.key] = p.value;
    });
    if (Object.keys(h).length > 0) attrs.headers = h;
  }

  return JSON.stringify(attrs);
}

function buildVarsJson(vars: VarEntry[]): string {
  const obj: Record<string, unknown> = {};
  vars.forEach((v) => {
    if (!v.key) return;
    if (v.enabled === false) return;
    if (v.value.trim() === '') {
      // Empty value → DataWeave null (avoids "cannot operate on empty string" errors)
      obj[v.key] = null;
    } else if (v.valueType === 'json') {
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

function NodeLabelChip({ nodeLabel, onChange }: { nodeLabel: string; onChange: (l: string) => void }) {
  const [open, setOpen] = useState(false);
  const colors = NODE_LABEL_COLORS[nodeLabel] || NODE_LABEL_COLORS.Transform;
  return (
    <div className="relative hidden sm:block">
      <button
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        title="Change node role"
        className={`inline-flex items-center gap-1 h-[22px] px-1.5 rounded text-[10.5px] font-medium border cursor-pointer ${colors.bg} ${colors.text} ${colors.border}`}
      >
        {nodeLabel}
        <Icons.ChevronDown size={10} className="opacity-70" />
      </button>
      {open && (
        <div className="absolute left-0 top-[26px] z-30 min-w-[170px] py-1 rounded-md bg-surface border border-line shadow-lg">
          {NODE_LABELS.map((l) => {
            const c = NODE_LABEL_COLORS[l] || NODE_LABEL_COLORS.Transform;
            const active = l === nodeLabel;
            return (
              <button
                key={l}
                onMouseDown={(e) => { e.preventDefault(); onChange(l); setOpen(false); }}
                className={`w-full flex items-center gap-2 px-2.5 h-7 text-[12px] cursor-pointer ${active ? 'bg-surface-2 text-content' : 'text-content-secondary hover:bg-surface-2'}`}
              >
                <span className={`inline-block w-2 h-2 rounded-sm ${c.bg} ${c.border} border`} />
                {l}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  active,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`inline-flex items-center justify-center w-7 h-7 rounded-md transition-colors cursor-pointer ${
        active
          ? 'bg-surface-3 text-content'
          : 'text-content-muted hover:text-content hover:bg-surface-2'
      }`}
    >
      {children}
    </button>
  );
}

function StatusBar({
  isReady,
  appVersion,
  dwVersion,
  workspaceFile,
  cursor,
  focusToggles,
}: {
  isReady: boolean;
  appVersion: string;
  dwVersion?: string;
  workspaceFile?: string;
  cursor?: { line: number; col: number };
  focusToggles?: {
    drawerOpen: boolean;
    activeTab: 'Request' | 'Vars' | 'Config';
    counts: { Request: number; Vars: number; Config: number };
    onSelect: (tab: 'Request' | 'Vars' | 'Config') => void;
  };
}) {
  return (
    <div
      className="h-[26px] shrink-0 flex items-center gap-3.5 px-3.5 bg-rail border-t border-line text-[11px] text-content-faint font-mono"
    >
      <span
        className="inline-flex items-center gap-1.5"
        style={{ color: isReady ? 'var(--accent)' : 'var(--warn)' }}
      >
        <Icons.Dot size={8} /> {isReady ? 'CLI ready' : 'Warming up'}
      </span>
      <span>DW {dwVersion || '2.5.0'}</span>
      {workspaceFile && <span className="truncate max-w-[280px]">{workspaceFile}</span>}
      {focusToggles && (
        <span className="flex items-center gap-1 ml-1">
          {(['Request', 'Vars', 'Config'] as const).map((t) => {
            const active = focusToggles.drawerOpen && focusToggles.activeTab === t;
            const count = focusToggles.counts[t];
            return (
              <button
                key={t}
                onClick={() => focusToggles.onSelect(t)}
                className={`inline-flex items-center gap-1 h-[18px] px-1.5 rounded text-[10.5px] font-sans border cursor-pointer transition-colors ${
                  active
                    ? 'bg-accent-dim border-accent-border text-accent'
                    : 'border-transparent text-content-faint hover:text-content-secondary hover:border-line-secondary'
                }`}
                title={`Toggle ${t}`}
              >
                {t}
                {count > 0 && (
                  <span className="font-mono text-[9.5px] opacity-80">{count}</span>
                )}
              </button>
            );
          })}
        </span>
      )}
      <span className="flex-1" />
      {cursor && <span>Ln {cursor.line}, Col {cursor.col}</span>}
      <span>UTF-8</span>
      <span>LF</span>
      {appVersion && <span className="text-content-ghost">v{appVersion}</span>}
    </div>
  );
}

function App() {
  const workspace = useWorkspace();
  const runner = useDWRunner();
  const { toggle, isDark, setTheme } = useTheme();
  const [outputFormat, setOutputFormat] = useState<'json' | 'xml' | 'raw'>('json');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [autoRun, setAutoRun] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [secureToolOpen, setSecureToolOpen] = useState(false);
  const [showTour, setShowTour] = useState(() => shouldShowTour());
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusDrawerOpen, setFocusDrawerOpen] = useState(false);
  const [showFirstRun, setShowFirstRun] = useState(() => shouldShowFirstRun());
  const [hasStarted, setHasStarted] = useState(() => !shouldShowEmptyState());
  const beginTransforming = useCallback(() => {
    if (!hasStarted) { markStarted(); setHasStarted(true); }
  }, [hasStarted]);
  const [cursor, setCursor] = useState<{ line: number; col: number }>({ line: 1, col: 1 });
  const [openWsOpen, setOpenWsOpen] = useState(false);
  const [focusDrawerTab, setFocusDrawerTab] = useState<'Request' | 'Vars' | 'Config'>('Request');
  const scriptEditorRef = useRef<ScriptEditorHandle>(null);
  const sidebarRef = useRef<SidebarHandle>(null);
  const [layout, setLayout] = useState<'workbench' | 'focus'>(() => {
    try { return (localStorage.getItem('dw.layout') as 'workbench' | 'focus') || 'workbench'; } catch { return 'workbench'; }
  });
  useEffect(() => { try { localStorage.setItem('dw.layout', layout); } catch { /* ignore */ } }, [layout]);
  const isCompact = useMediaQuery('(max-width: 720px)');
  const effectiveLayout: 'workbench' | 'focus' = isCompact ? 'focus' : layout;
  useEffect(() => { if (isCompact) setSidebarCollapsed(true); }, [isCompact]);

  const handleNewScript = useCallback(() => {
    beginTransforming();
    workspace.newWorkspace();
    setTimeout(() => scriptEditorRef.current?.focus(), 50);
  }, [workspace, beginTransforming]);
  const handleOpenImport = useCallback(() => {
    beginTransforming();
    setLayout('workbench');
    setSidebarCollapsed(false);
    setTimeout(() => sidebarRef.current?.openTab('import'), 0);
  }, [beginTransforming]);
  const handleOpenSnippets = useCallback(() => {
    beginTransforming();
    setLayout('workbench');
    setSidebarCollapsed(false);
    setTimeout(() => sidebarRef.current?.openTab('snippets'), 0);
  }, [beginTransforming]);
  const [appVersion, setAppVersion] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [encryptionKey, setEncryptionKey] = useState('');
  const autoRunTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleRunRef = useRef<() => void>(() => {});
  const canRunRef = useRef(false);

  // Auto-dismiss empty state once a workspace gets opened from disk
  useEffect(() => {
    if (workspace.currentFile && !hasStarted) {
      markStarted();
      setHasStarted(true);
    }
  }, [workspace.currentFile, hasStarted]);

  // Push the CLI path override from localStorage into Rust state on startup,
  // then restart the warmup if the user has actually configured a custom path.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      let stored: string | null = null;
      try { stored = localStorage.getItem('dw.cliPath'); } catch { /* ignore */ }
      if (cancelled) return;
      try {
        await invoke('set_cli_path_override', { path: stored && stored.trim() ? stored : null });
      } catch { /* ignore */ }
      if (stored && stored.trim() && !cancelled) {
        try { await invoke('restart_cli'); } catch { /* ignore */ }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Load app version and silently check for updates on startup
  useEffect(() => {
    getVersion().then(setAppVersion).catch(() => {});
    const timer = setTimeout(async () => {
      try {
        const update = await check();
        if (update?.available) setUpdateAvailable(true);
      } catch {
        // Network unreachable or endpoint blocked — fail silently
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

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

  // Global Ctrl+S to save, Ctrl+K to open palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        workspace.saveWorkspace();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen((o) => !o);
      } else if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        setShortcutsOpen((o) => !o);
      } else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setSettingsOpen((o) => !o);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === 'Digit1' || e.key === '!')) {
        // ⌘⇧1 — Workbench layout (e.code is keyboard-layout-independent)
        e.preventDefault();
        setLayout('workbench');
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.code === 'Digit2' || e.key === '@')) {
        // ⌘⇧2 — Focus layout
        e.preventDefault();
        setLayout('focus');
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'R' || e.key === 'r')) {
        e.preventDefault();
        setAutoRun((a) => !a);
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'T' || e.key === 't')) {
        e.preventDefault();
        toggle();
      } else if ((e.ctrlKey || e.metaKey) && e.key === '.') {
        e.preventDefault();
        // Context-sensitive: cancel a running script first; otherwise toggle the focus drawer.
        if (runner.isRunning) {
          runner.cancel();
        } else {
          setFocusDrawerOpen((o) => !o);
        }
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        setOpenWsOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        workspace.duplicateWorkspace();
      } else if (e.altKey && e.shiftKey && (e.key === 'F' || e.key === 'f' || e.code === 'KeyF')) {
        e.preventDefault();
        scriptEditorRef.current?.format();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [workspace.saveWorkspace, workspace.duplicateWorkspace, toggle, runner.isRunning, runner.cancel]);

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

  const paletteCommands: Command[] = [
    { id: 'run', label: 'Run script', shortcut: '⌘↵', group: 'Run', run: () => { if (canRun) handleRun(); } },
    { id: 'auto', label: autoRun ? 'Disable auto-run' : 'Enable auto-run', shortcut: '⌘⇧R', group: 'Run', run: () => setAutoRun(!autoRun) },
    { id: 'save', label: 'Save workspace', shortcut: '⌘S', group: 'Workspace', run: () => { beginTransforming(); workspace.saveWorkspace(); } },
    { id: 'new', label: 'New workspace', shortcut: '⌘N', group: 'Workspace', run: () => { beginTransforming(); workspace.newWorkspace(); } },
    { id: 'open', label: 'Open workspace…', shortcut: '⌘O', group: 'Workspace', run: () => setOpenWsOpen(true) },
    { id: 'duplicate', label: 'Duplicate workspace', shortcut: '⌘D', group: 'Workspace', run: () => { beginTransforming(); workspace.duplicateWorkspace(); } },
    { id: 'format', label: 'Format script', shortcut: '⌥⇧F', group: 'Editor', run: () => scriptEditorRef.current?.format() },
    { id: 'sidebar', label: sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar', group: 'View', run: () => setSidebarCollapsed(!sidebarCollapsed) },
    { id: 'layout-workbench', label: 'Switch UI → Workbench', hint: layout === 'workbench' ? 'current' : 'Icon rail · sidebar · tabs', shortcut: '⌘⇧1', group: 'View', run: () => setLayout('workbench') },
    { id: 'layout-focus', label: 'Switch UI → Focus', hint: layout === 'focus' ? 'current' : 'Editor · payload · drawer', shortcut: '⌘⇧2', group: 'View', run: () => setLayout('focus') },
    ...(effectiveLayout === 'focus' && !isCompact
      ? [{ id: 'focus-drawer', label: focusDrawerOpen ? 'Close context drawer' : 'Open context drawer', shortcut: '⌘.', group: 'View', run: () => setFocusDrawerOpen((o) => !o) }]
      : []),
    { id: 'theme', label: isDark ? 'Switch to Paper (light)' : 'Switch to Dusk (dark)', shortcut: '⌘⇧T', group: 'View', run: () => toggle() },
    { id: 'out-json', label: 'Output: JSON', hint: outputFormat === 'json' ? 'current' : '', group: 'Output', run: () => setOutputFormat('json') },
    { id: 'out-xml', label: 'Output: XML', hint: outputFormat === 'xml' ? 'current' : '', group: 'Output', run: () => setOutputFormat('xml') },
    { id: 'out-raw', label: 'Output: Raw', hint: outputFormat === 'raw' ? 'current' : '', group: 'Output', run: () => setOutputFormat('raw') },
    ...NODE_LABELS.map((l) => ({
      id: `node-${l}`,
      label: `Node: ${l}`,
      hint: workspace.nodeLabel === l ? 'current' : '',
      group: 'Node label',
      run: () => workspace.setNodeLabel(l),
    })),
    { id: 'secure', label: 'Open Secure Properties tool', group: 'Tools', run: () => setSecureToolOpen(true) },
    { id: 'shortcuts', label: 'Keyboard shortcuts', shortcut: '⌘/', group: 'Tools', run: () => setShortcutsOpen(true) },
    { id: 'settings', label: 'Open Settings', shortcut: '⌘,', group: 'Tools', run: () => setSettingsOpen(true) },
    { id: 'about', label: 'About DataWeave Studio', group: 'Tools', run: () => setAboutOpen(true) },
    { id: 'tour', label: 'Show guided tour', group: 'Tools', run: () => setShowTour(true) },
  ];

  return (
    <div className="h-screen w-screen bg-bg text-content flex flex-col font-sans select-none">
      {/* Top bar — brand, breadcrumb, ⌘K search, run cluster */}
      <header data-tour="header" className="h-11 flex items-center gap-3 px-3 bg-surface border-b border-line shrink-0">
        {/* Brand mark — also the About entry; subtle dot when an update is available */}
        <div className="flex items-center justify-center w-11 shrink-0">
          <button
            onClick={() => setAboutOpen(true)}
            title={updateAvailable ? 'Update available — open About' : 'About DataWeave Studio'}
            className="relative w-[22px] h-[22px] rounded-md flex items-center justify-center font-mono font-extrabold text-[11px] cursor-pointer"
            style={{
              background: 'linear-gradient(135deg, var(--accent), color-mix(in oklch, var(--accent) 60%, var(--violet)))',
              color: 'var(--accent-ink)',
            }}
          >
            dw
            {updateAvailable && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-accent ring-2 ring-surface" />
            )}
          </button>
        </div>

        {/* Breadcrumb: project / file • — clickable in focus mode (workspace dropdown) */}
        {effectiveLayout === 'focus' ? (
          <button
            onClick={() => setOpenWsOpen(true)}
            title="Open workspace (⌘O)"
            className="flex items-center gap-2 min-w-0 h-7 px-2 rounded-md hover:bg-surface-2 cursor-pointer transition-colors"
          >
            <Icons.Braces size={13} className="text-content-faint shrink-0" />
            <span className="text-[13px] text-content-faint truncate">{workspace.projectName}</span>
            {workspace.currentFile && (
              <>
                <span className="text-content-ghost">/</span>
                <span className="text-[13px] text-content font-medium truncate">{workspace.currentFile.replace(/\.json$/, '').replace(/\.dwstudio$/, '')}</span>
              </>
            )}
            {workspace.isDirty && (
              <span className="text-warn text-base leading-none ml-0.5" title="Unsaved changes">•</span>
            )}
            <Icons.ChevronDown size={12} className="text-content-ghost shrink-0" />
          </button>
        ) : (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[13px] text-content-faint truncate">{workspace.projectName}</span>
            {workspace.currentFile && (
              <>
                <span className="text-content-ghost">/</span>
                <span className="text-[13px] text-content font-medium truncate">{workspace.currentFile.replace(/\.json$/, '').replace(/\.dwstudio$/, '')}</span>
              </>
            )}
            {workspace.isDirty && (
              <span className="text-warn text-base leading-none ml-0.5" title="Unsaved changes">•</span>
            )}
          </div>
        )}

        {/* Node label chip — picks the workspace's role (Transform / Salesforce Query / DB Query / …) */}
        <NodeLabelChip nodeLabel={workspace.nodeLabel} onChange={workspace.setNodeLabel} />

        <div className="flex-1" />

        {/* ⌘K command palette trigger */}
        <button
          data-tour="palette"
          onClick={() => setPaletteOpen(true)}
          className="hidden md:flex items-center gap-2 h-7 px-2.5 bg-surface-2 border border-line rounded-md w-[280px] text-content-faint text-[12.5px] cursor-pointer hover:border-line-secondary hover:text-content-secondary transition-colors"
          title="Command palette (Ctrl+K)"
        >
          <Icons.Search size={13} />
          <span className="flex-1 truncate text-left">Search commands, files…</span>
          <span className="font-mono text-[10.5px] px-1.5 py-0.5 rounded bg-surface-3 text-content-muted">⌘K</span>
        </button>

        <div className="flex-1" />

        {/* Right cluster — design spec: theme + Run only beside palette */}
        <div className="flex items-center gap-1">
          <IconBtn title={isDark ? 'Switch to light mode' : 'Switch to dark mode'} onClick={toggle}>
            {isDark ? <Icons.Sun size={15} /> : <Icons.Moon size={15} />}
          </IconBtn>

          <div className="w-px h-4 bg-line mx-1" />

          {!runner.isWarmedUp && (
            <div className="flex items-center gap-1.5 text-[11px] text-accent mr-1">
              <div className="w-3 h-3 rounded-full border-2 border-t-transparent border-accent animate-spin" />
              <span>Warming up…</span>
            </div>
          )}

          <button
            onClick={() => setAutoRun(!autoRun)}
            data-tour="run-controls"
            className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11.5px] font-medium border transition-colors cursor-pointer ${
              autoRun
                ? 'bg-accent-dim border-accent-border text-accent'
                : 'bg-transparent border-line text-content-faint hover:border-line-secondary hover:text-content-secondary'
            }`}
            title="Auto-run: re-execute after 1.5s of inactivity"
          >
            <Icons.Zap size={12} /> Auto
          </button>
          <button
            onClick={handleRun}
            disabled={!canRun}
            className="inline-flex items-center gap-1.5 h-7 pl-2.5 pr-3 rounded-md text-[12.5px] font-semibold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 transition-colors"
            style={{
              background: 'var(--accent)',
              color: 'var(--accent-ink)',
            }}
            onMouseEnter={(e) => { if (!e.currentTarget.disabled) e.currentTarget.style.background = 'var(--accent-hover)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--accent)'; }}
            title="Run (Ctrl+Enter)"
          >
            <Icons.Play size={11} />
            {runner.isRunning ? 'Running…' : 'Run'}
            <span
              className="font-mono text-[10px] px-1 py-0.5 rounded ml-0.5"
              style={{
                background: 'color-mix(in oklch, var(--accent-ink) 20%, transparent)',
                color: 'color-mix(in oklch, var(--accent-ink) 80%, transparent)',
              }}
            >
              ⌘↵
            </span>
          </button>
        </div>
      </header>

      {/* CLI error banner */}
      {runner.cliError && (
        <div
          className="px-4 py-2 flex items-center gap-3 shrink-0 border-b"
          style={{
            background: 'color-mix(in oklch, var(--err) 12%, transparent)',
            borderColor: 'color-mix(in oklch, var(--err) 30%, transparent)',
          }}
        >
          <span style={{ color: 'var(--err)' }} className="shrink-0 inline-flex">
            <Icons.Dot size={10} />
          </span>
          <div className="flex-1 min-w-0">
            <span className="text-[12px] font-medium" style={{ color: 'var(--err)' }}>DataWeave CLI unavailable</span>
            <span className="text-[12px] text-content-muted ml-2">{runner.cliError}</span>
          </div>
          <button
            onClick={() => { runner.restartCli(); }}
            className="shrink-0 h-6 px-2 rounded text-[11px] font-medium text-content-secondary hover:text-content border border-line hover:bg-surface-2 cursor-pointer"
            title="Re-run the warm-up probe"
          >
            Restart CLI
          </button>
          <button
            onClick={async () => {
              try {
                const dir = await invoke<string>('get_log_dir');
                await openPath(dir);
              } catch { /* ignore */ }
            }}
            className="shrink-0 h-6 px-2 rounded text-[11px] font-medium text-content-secondary hover:text-content border border-line hover:bg-surface-2 cursor-pointer"
            title="Open the app log directory"
          >
            View logs
          </button>
        </div>
      )}

      {/* Body: Sidebar + Main */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar — hidden in Focus layout / compact viewport / empty state */}
        {effectiveLayout === 'workbench' && hasStarted && <Sidebar
          ref={sidebarRef}
          projectName={workspace.projectName}
          onProjectNameChange={workspace.setProjectName}
          currentFile={workspace.currentFile}
          isDirty={workspace.isDirty}
          currentMethod={workspace.context.method}
          onNew={() => { beginTransforming(); workspace.newWorkspace(); }}
          onSave={workspace.saveWorkspace}
          onLoad={workspace.loadWorkspace}
          onDelete={workspace.deleteWorkspace}
          listWorkspaces={workspace.listWorkspaces}
          onCurlImport={handleCurlImport}
          onInsertSnippet={(body) => scriptEditorRef.current?.insertSnippet(body)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />}

        {/* Main — empty state, then compact pane tabs, then three resizable columns */}
        {!hasStarted ? (
          <EmptyState
            onBlankTransform={handleNewScript}
            onImportCurl={handleOpenImport}
            onOpenSnippets={handleOpenSnippets}
            onStartTour={() => setShowTour(true)}
          />
        ) : isCompact ? (
          <main className="flex-1 overflow-hidden bg-bg">
            <CompactLayout
              badges={{
                context:
                  context_count(workspace.context.queryParams) +
                  context_count(workspace.context.headers) +
                  workspace.context.vars.filter((v) => v.key).length,
                output: runner.error ? '!' : (runner.executionTimeMs ? `${runner.executionTimeMs}ms` : undefined),
              }}
              scriptPane={
                <ScriptEditor
                  ref={scriptEditorRef}
                  code={workspace.script}
                  onChange={(val) => workspace.setScript(val || '')}
                  onRun={handleRun}
                  errorLine={runner.errorLine}
                  payload={workspace.payload}
                  payloadMimeType={workspace.payloadMimeType}
                  contextData={{
                    vars: workspace.context.vars,
                    headers: workspace.context.headers,
                    queryParams: workspace.context.queryParams,
                    namedInputs: workspace.namedInputs,
                    configYaml: workspace.context.configYaml,
                    secureConfigYaml: workspace.context.secureConfigYaml,
                  }}
                  onCursorChange={(line, col) => setCursor({ line, col })}
                />
              }
              payloadPane={
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
              }
              contextPane={
                <ContextPanel
                  context={workspace.context}
                  onChange={workspace.setContext}
                  encryptionKey={encryptionKey}
                  onEncryptionKeyChange={setEncryptionKey}
                />
              }
              outputPane={
                <OutputPane
                  output={runner.output}
                  error={runner.error}
                  isRunning={runner.isRunning}
                  executionTimeMs={runner.executionTimeMs}
                  errorLine={runner.errorLine}
                  outputFormat={outputFormat}
                  onFormatChange={setOutputFormat}
                  queryResult={queryResult}
                  isQueryMode={isQueryMode}
                  queryLanguage={queryLanguage}
                  scriptSource={workspace.script}
                  onCancel={runner.cancel}
                />
              }
            />
          </main>
        ) : (
        <main className="flex-1 overflow-hidden bg-bg">
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
                    <PanelResizeHandle className="h-px bg-line hover:bg-accent/50 transition-colors cursor-row-resize relative group">
                      <div className="absolute left-1/2 -translate-x-1/2 -top-[1px] w-8 h-[3px] rounded bg-line group-hover:bg-accent transition-colors" />
                    </PanelResizeHandle>
                  </>
                )}
                <Panel defaultSize={isQueryMode ? 40 : 60} minSize={15}>
                  <div className="h-full pb-1 flex flex-col" data-tour="script-editor">
                    {!isQueryMode && (
                      <div className="h-10 shrink-0 flex items-center gap-2 px-3.5 bg-surface border-b border-line">
                        <span className={`font-mono text-[10.5px] font-bold tracking-wide px-1.5 h-5 inline-flex items-center rounded ${methodColors.bg} ${methodColors.text} ${methodColors.border} border`}>
                          {workspace.context.method}
                        </span>
                        <span className="font-mono text-[12px] text-content-secondary truncate">
                          {(() => {
                            const url = `/transform/${workspace.currentFile?.replace(/\.json$/, '') || workspace.nodeLabel.toLowerCase().replace(/\s+/g, '-')}`;
                            const parts = url.split(/(:[A-Za-z_][A-Za-z0-9_]*)/g);
                            return parts.map((p, i) =>
                              p.startsWith(':') ? (
                                <span key={i} className="text-violet">{p}</span>
                              ) : (
                                <span key={i}>{p}</span>
                              )
                            );
                          })()}
                        </span>
                        <span className="flex-1" />
                        <span className={`text-[10px] px-1.5 h-5 inline-flex items-center rounded font-medium border ${nodeLabelColors.bg} ${nodeLabelColors.text} ${nodeLabelColors.border}`}>
                          {workspace.nodeLabel}
                        </span>
                        <span className="font-mono text-[10.5px] text-content-faint">
                          {workspace.payloadMimeType || 'application/json'}
                        </span>
                      </div>
                    )}
                    <div className="flex-1 min-h-0">
                    <ScriptEditor
                      ref={scriptEditorRef}
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
                      onCursorChange={(line, col) => setCursor({ line, col })}
                    />
                    </div>
                  </div>
                </Panel>
                <PanelResizeHandle className="h-1.5 flex items-center justify-center cursor-row-resize group">
                  <div className="w-8 h-0.5 rounded-full bg-line-secondary group-hover:bg-accent/50 transition-colors" />
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

            <PanelResizeHandle className="w-px bg-line hover:bg-accent/50 transition-colors cursor-col-resize relative group mx-1">
              <div className="absolute top-1/2 -translate-y-1/2 -left-[1px] h-8 w-[3px] rounded bg-line group-hover:bg-accent transition-colors" />
            </PanelResizeHandle>

            {/* Center: Context Panel — hidden in Focus layout / compact viewport */}
            {effectiveLayout === 'workbench' && (
              <>
                <Panel defaultSize={20} minSize={10} data-tour="context-panel">
                  <ContextPanel
                    context={workspace.context}
                    onChange={workspace.setContext}
                    encryptionKey={encryptionKey}
                    onEncryptionKeyChange={setEncryptionKey}
                  />
                </Panel>

                <PanelResizeHandle className="w-px bg-line hover:bg-accent/50 transition-colors cursor-col-resize relative group mx-1">
                  <div className="absolute top-1/2 -translate-y-1/2 -left-[1px] h-8 w-[3px] rounded bg-line group-hover:bg-accent transition-colors" />
                </PanelResizeHandle>
              </>
            )}

            {/* Right: Output */}
            <Panel defaultSize={38} minSize={15} data-tour="output">
              <OutputPane
                output={runner.output}
                error={runner.error}
                isRunning={runner.isRunning}
                executionTimeMs={runner.executionTimeMs}
                errorLine={runner.errorLine}
                outputFormat={outputFormat}
                onFormatChange={setOutputFormat}
                queryResult={queryResult}
                isQueryMode={isQueryMode}
                queryLanguage={queryLanguage}
                scriptSource={workspace.script}
                onCancel={runner.cancel}
              />
            </Panel>

          </PanelGroup>
        </main>
        )}
      </div>

      {/* Status bar */}
      <StatusBar
        isReady={runner.isWarmedUp}
        appVersion={appVersion}
        workspaceFile={workspace.currentFile || undefined}
        cursor={cursor}
        focusToggles={effectiveLayout === 'focus' && !isCompact ? {
          drawerOpen: focusDrawerOpen,
          activeTab: focusDrawerTab,
          counts: {
            Request: workspace.context.queryParams.filter(p => p.enabled !== false && p.key && p.value).length + workspace.context.headers.filter(h => h.enabled !== false && h.key && h.value).length,
            Vars: workspace.context.vars.filter(v => v.enabled !== false && v.key).length,
            Config: ((workspace.context.configYaml ?? '').trim() ? 1 : 0) + ((workspace.context.secureConfigYaml ?? '').trim() ? 1 : 0),
          },
          onSelect: (tab) => {
            if (focusDrawerOpen && focusDrawerTab === tab) {
              setFocusDrawerOpen(false);
            } else {
              setFocusDrawerTab(tab);
              setFocusDrawerOpen(true);
            }
          },
        } : undefined}
      />

      {/* About dialog */}
      <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} appVersion={appVersion} updateAvailable={updateAvailable} onUpdateInstalled={() => setUpdateAvailable(false)} />

      {/* Secure Properties Tool dialog */}
      <SecurePropertiesTool open={secureToolOpen} onClose={() => setSecureToolOpen(false)} />

      {/* First-launch guided tour */}
      {showTour && (
        <WelcomeTour onComplete={() => { setShowTour(false); markTourSeen(); }} />
      )}

      {/* Focus mode: context drawer */}
      {effectiveLayout === 'focus' && !isCompact && (
        <FocusDrawer open={focusDrawerOpen} onClose={() => setFocusDrawerOpen(false)}>
          <ContextPanel
            key={focusDrawerTab}
            context={workspace.context}
            onChange={workspace.setContext}
            encryptionKey={encryptionKey}
            onEncryptionKeyChange={setEncryptionKey}
            defaultTab={focusDrawerTab}
          />
        </FocusDrawer>
      )}

      {/* Command palette */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={paletteCommands} />

      {/* Shortcuts reference */}
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Open workspace quick picker */}
      <OpenWorkspaceDialog
        open={openWsOpen}
        onClose={() => setOpenWsOpen(false)}
        listWorkspaces={workspace.listWorkspaces}
        onOpen={(f) => workspace.loadWorkspace(f)}
        currentFile={workspace.currentFile}
      />

      {/* Settings */}
      <SettingsScreen
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        appVersion={appVersion}
        layout={layout}
        onLayoutChange={setLayout}
        payloadMimeType={workspace.payloadMimeType}
        onPayloadMimeTypeChange={workspace.setPayloadMimeType}
        classpath={workspace.classpath}
        onClasspathChange={workspace.setClasspath}
        timeoutMs={workspace.timeoutMs}
        onTimeoutMsChange={workspace.setTimeoutMs}
        onShowTour={() => { setSettingsOpen(false); setShowTour(true); }}
        onShowAbout={() => { setSettingsOpen(false); setAboutOpen(true); }}
        onRestartCli={runner.restartCli}
      />

      {/* First-run picker */}
      {showFirstRun && (
        <FirstRunPicker
          initialTheme={isDark ? 'dark' : 'light'}
          initialLayout={layout}
          onComplete={({ theme, layout: chosen }) => {
            setTheme(theme);
            setLayout(chosen);
            markFirstRunSeen();
            setShowFirstRun(false);
          }}
        />
      )}

      {/* Splash screen — covers everything until CLI is ready */}
      <SplashScreen isReady={runner.isWarmedUp} hasError={!!runner.cliError} />
    </div>
  );
}

export default App;
