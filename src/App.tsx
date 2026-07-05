import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { invoke, isTauri } from './bridge';
import { logoUrl } from './assets';
import { openPath } from '@tauri-apps/plugin-opener';
import { Group as PanelGroup, Panel, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { ScriptEditor, ScriptEditorHandle } from './components/ScriptEditor';
import { WindowControls } from './components/WindowControls';
import { WorkspaceMenu } from './components/WorkspaceMenu';
import { ToastHost, toast } from './components/Toast';
import { buildAttributesJson, buildVarsJson } from './runInput';
import { resolveVarsJson } from './resolveVars';
import { substituteQueryParams } from './queryRender';
// Lazy-loaded — pulls in dataweaveDocs (371KB) plus its own 60KB UI.
const FunctionBrowser = lazy(() =>
  import('./components/FunctionBrowser').then((m) => ({ default: m.FunctionBrowser }))
);
// Lazy-loaded — pulls in the 147KB cookbookRecipes data + its UI. Only when opened.
const RecipeBrowser = lazy(() =>
  import('./components/RecipeBrowser').then((m) => ({ default: m.RecipeBrowser }))
);
// Lazy-loaded — FlowDesigner is ~1800 lines and only rendered when the user
// opens the message flow designer. Don't pay for it on initial load.
const JavaTester = lazy(() =>
  import('./components/JavaTester').then((m) => ({ default: m.JavaTester }))
);
const MCPServerPanel = lazy(() =>
  import('./components/MCPServerPanel').then((m) => ({ default: m.MCPServerPanel }))
);
const ModulesPanel = lazy(() =>
  import('./components/ModulesPanel').then((m) => ({ default: m.ModulesPanel }))
);
import type { DwModule } from './components/ModulesPanel';
const FlowDesigner = lazy(() =>
  import('./components/FlowDesigner').then((m) => ({ default: m.FlowDesigner }))
);
import { OpenWorkspaceDialog } from './components/OpenWorkspaceDialog';
import { TestsView } from './components/TestsView';
import { FirstWorkspacePrompt } from './components/FirstWorkspacePrompt';
import { PayloadTabs } from './components/PayloadTabs';
import { OutputPane } from './components/OutputPane';
import { ContextPanel } from './components/ContextPanel';
import { Sidebar, SidebarHandle } from './components/Sidebar';
import { QueryEditor } from './components/QueryEditor';
// Lazy-loaded modals — each is only mounted when the user opens it. Cuts
// ~150-200KB off the initial bundle.
const AboutDialog = lazy(() => import('./components/AboutDialog').then((m) => ({ default: m.AboutDialog })));
const FeedbackDialog = lazy(() => import('./components/FeedbackDialog').then((m) => ({ default: m.FeedbackDialog })));
const SecurePropertiesTool = lazy(() => import('./components/SecurePropertiesTool').then((m) => ({ default: m.SecurePropertiesTool })));
const CompareTool = lazy(() => import('./components/CompareTool').then((m) => ({ default: m.CompareTool })));
const WelcomeTour = lazy(() => import('./components/WelcomeTour').then((m) => ({ default: m.WelcomeTour })));
const ShortcutsDialog = lazy(() => import('./components/ShortcutsDialog').then((m) => ({ default: m.ShortcutsDialog })));
const SettingsScreen = lazy(() => import('./components/SettingsScreen').then((m) => ({ default: m.SettingsScreen })));
const WelcomeScreen = lazy(() => import('./components/WelcomeScreen').then((m) => ({ default: m.WelcomeScreen })));
import { WhatsNew, LATEST_VERSION, getRelease } from './components/WhatsNew';
import { FeatureIntroHost } from './components/FeatureIntroHost';
import { introFeature } from './featureIntros';
import { SplashScreen } from './components/SplashScreen';
import { CommandPalette, Command } from './components/CommandPalette';
import { CompactLayout } from './components/CompactLayout';

// Inlined helpers — used to be `import { shouldShowFirstRun, markFirstRunSeen }`
// from FirstRunPicker etc. but that made the whole component bundle eager.
const FIRST_RUN_KEY = 'dw.firstRun.seen';
const FIRST_WORKSPACE_KEY = 'dw.firstWorkspace.seen';
const TOUR_SEEN_KEY = 'dwstudio_tour_seen'; // matches WelcomeTour's own key — existing users keep state
const LAST_VERSION_KEY = 'dw.lastSeenVersion'; // recorded after an update (legacy modal gate)
const RELEASE_SEEN_KEY = 'dw.releaseSeen'; // last release the user was shown the announcement toast for
function shouldShowFirstRun(): boolean { try { return localStorage.getItem(FIRST_RUN_KEY) !== 'true'; } catch { return false; } }
function markFirstRunSeen(): void { try { localStorage.setItem(FIRST_RUN_KEY, 'true'); } catch {} }
function markTourSeen(): void { try { localStorage.setItem(TOUR_SEEN_KEY, 'true'); } catch {} }
function shouldShowFirstWorkspace(): boolean { try { return localStorage.getItem(FIRST_WORKSPACE_KEY) !== 'true'; } catch { return false; } }
function markFirstWorkspaceSeen(): void { try { localStorage.setItem(FIRST_WORKSPACE_KEY, 'true'); } catch {} }
import { EmptyState, readLastWorkspace, writeLastWorkspace } from './components/EmptyState';
import { readDraft, writeDraft, hasDraft, clearDraft } from './draftSession';
import { useWorkspace } from './hooks/useWorkspace';
import { useDWRunner } from './hooks/useDWRunner';
import { useMediaQuery } from './hooks/useMediaQuery';
import { useTheme } from './ThemeContext';
import { KeyValuePair, METHOD_COLORS, NODE_LABEL_COLORS, NODE_LABELS, isValidMimeType } from './types';
import { Icons } from './components/Icons';
import { CurlImporter, CurlImportResult } from './components/CurlImporter';
import { OpenApiReader, OpenApiImportResult } from './components/OpenApiReader';
import { publishCursor, useCursor } from './cursorStore';
import { substituteProperties, substitutePropertiesAsync } from './propertySubstitution';
import { convertAllPropertyCalls } from './dataweavePropertyConverter';

// Version is loaded dynamically from tauri.conf.json at runtime

// substituteQueryParams + the SOQL/SQL quoting helpers now live in
// ./queryRender.ts (shared with the Flow Designer's Salesforce/Database nodes).

function contextCount(pairs: KeyValuePair[]): number {
  return pairs.filter((p) => p.enabled !== false && p.key && p.value !== '').length;
}

// buildAttributesJson + buildVarsJson live in ./runInput.ts (unit-tested there).


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

// Tiny self-subscribing component — only this re-renders on cursor change,
// not the entire StatusBar / App tree.
function CursorIndicator() {
  const cursor = useCursor();
  return <span>Ln {cursor.line}, Col {cursor.col}</span>;
}

function StatusBar({
  isReady,
  appVersion,
  dwVersion,
  workspaceFile,
}: {
  isReady: boolean;
  appVersion: string;
  dwVersion?: string;
  workspaceFile?: string;
}) {
  return (
    <div
      className="h-[26px] shrink-0 flex items-center gap-3.5 px-3.5 bg-rail border-t border-line text-[11px] text-content-faint font-mono"
    >
      <span
        className="inline-flex items-center gap-1.5"
        style={{ color: isReady ? 'var(--accent)' : 'var(--warn)' }}
      >
        <Icons.Dot size={8} /> {isReady ? 'Ready' : 'Warming up'}
      </span>
      <span>DW {dwVersion || '2.11.0'}</span>
      {workspaceFile && <span className="truncate max-w-[280px]">{workspaceFile}</span>}
      <span className="flex-1" />
      <CursorIndicator />
      <span>UTF-8</span>
      <span>LF</span>
      {appVersion && <span className="text-content-ghost">v{appVersion}</span>}
    </div>
  );
}

function App() {
  const workspace = useWorkspace();
  const runner = useDWRunner();
  const { toggle, isDark } = useTheme();
  const [outputFormat, setOutputFormat] = useState<'json' | 'xml' | 'raw'>('json');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Auto-run persists across sessions (the header Auto button / ⌘⇧R toggle it).
  const [autoRun, setAutoRun] = useState(() => {
    try { return localStorage.getItem('dw.autoRun') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('dw.autoRun', autoRun ? '1' : '0'); } catch { /* ignore */ }
  }, [autoRun]);
  /** Pane switch — 'script' shows the editor splits, 'tests' shows the
   *  per-request Tests panel. Per-workspace state, not per-request, so the
   *  user's view sticks when they switch between requests. */
  const [viewMode, setViewMode] = useState<'script' | 'tests'>('script');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [secureToolOpen, setSecureToolOpen] = useState(false);
  const [compareToolOpen, setCompareToolOpen] = useState(false);
  const [showTour, setShowTour] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [referenceOpen, setReferenceOpen] = useState(false);
  const [recipesOpen, setRecipesOpen] = useState(false);
  const [flowDesignerOpen, setFlowDesignerOpen] = useState(false);
  const [curlImportOpen, setCurlImportOpen] = useState(false);
  const [openApiOpen, setOpenApiOpen] = useState(false);
  const [javaTesterOpen, setJavaTesterOpen] = useState(false);
  const [mcpOpen, setMcpOpen] = useState(false);
  const [mcpRunning, setMcpRunning] = useState(false);
  const [modulesOpen, setModulesOpen] = useState(false);
  // Global custom `.dwl` module library — saved once (app-data), sent on every
  // run so `import x from MyModule` resolves. Loaded on mount, persisted on edit.
  const [modules, setModules] = useState<DwModule[]>([]);
  const [showFirstRun, setShowFirstRun] = useState(() => shouldShowFirstRun());
  // "What's new" after an update — gated on the version having changed since the
  // last launch (see the version-loading effect below).
  const [showWhatsNew, setShowWhatsNew] = useState(false);
  /** One-time prompt for the very first workspace. Surfaced only after the
   *  theme/layout FirstRunPicker is dismissed (or skipped — for returning
   *  users on a fresh install). */
  const [showFirstWorkspace, setShowFirstWorkspace] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [lastWorkspace, setLastWorkspace] = useState<string | null>(() => readLastWorkspace());
  // Whether a recoverable in-progress draft exists in localStorage. Used by
  // the welcome screen's Resume button when no saved workspace file is present.
  const [hasDraftSession, setHasDraftSession] = useState<boolean>(() => hasDraft());
  const beginTransforming = useCallback(() => {
    setHasStarted(true);
  }, []);
  // Cursor position is published to a module-level pub-sub (cursorStore) so
  // only the tiny <CursorIndicator/> re-renders on cursor moves — not the
  // entire 1500-line App tree.
  const [openWsOpen, setOpenWsOpen] = useState(false);
  const scriptEditorRef = useRef<ScriptEditorHandle>(null);
  const sidebarRef = useRef<SidebarHandle>(null);
  const savePendingRef = useRef(false);
  const contextRef = useRef(workspace.context);
  contextRef.current = workspace.context;
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
    introFeature('curl');
    beginTransforming();
    setCurlImportOpen(true);
  }, [beginTransforming]);
  const handleOpenSnippets = useCallback(() => {
    beginTransforming();
    setLayout('workbench');
    setSidebarCollapsed(false);
    setTimeout(() => sidebarRef.current?.openTab('snippets'), 0);
  }, [beginTransforming]);
  const handleImportPlayground = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const { importPlaygroundZip } = await import('./playgroundImport');
        const result = await importPlaygroundZip(file);
        beginTransforming();
        workspace.newWorkspace();
        workspace.setProjectName(result.projectName);
        workspace.setScript(result.script);
        workspace.setPayload(result.payload);
        workspace.setPayloadMimeType(result.payloadMimeType);
        workspace.setContext(result.context);
        workspace.setNamedInputs(result.namedInputs);
        toast(
          result.warnings.length
            ? `Imported "${result.projectName}" with ${result.warnings.length} warning(s) — see console`
            : `Imported "${result.projectName}" from Playground zip`,
          'success'
        );
        if (result.warnings.length > 0) console.warn('Playground import warnings:', result.warnings);
        setTimeout(() => scriptEditorRef.current?.focus(), 50);
      } catch (e) {
        toast(`Import failed: ${(e as Error).message}`, 'error');
      }
    };
    input.click();
  }, [workspace, beginTransforming]);
  const handleExportPlayground = useCallback(async () => {
    try {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { exportPlaygroundZip } = await import('./playgroundImport');
      const safeName = (workspace.projectName || 'main').replace(/[^a-zA-Z0-9_-]+/g, '_') || 'main';
      const path = await save({
        defaultPath: `${safeName}.zip`,
        filters: [{ name: 'Playground zip', extensions: ['zip'] }],
      });
      if (!path) return; // user cancelled
      const blob = exportPlaygroundZip({
        projectName: workspace.projectName || 'main',
        script: workspace.script,
        payload: workspace.payload,
        payloadMimeType: workspace.payloadMimeType,
        context: workspace.context,
        namedInputs: workspace.namedInputs,
      });
      const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));
      await invoke('save_binary_file', { path, contents: bytes });
      toast(`Exported to ${path.split(/[\\/]/).pop()}`, 'success');
    } catch (e) {
      toast(`Export failed: ${(e as Error).message}`, 'error');
    }
  }, [workspace]);
  const [appVersion, setAppVersion] = useState('');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateBannerDismissed, setUpdateBannerDismissed] = useState(false);
  const [downloadPct, setDownloadPct] = useState<number | null>(null);
  const updateRef = useRef<Update | null>(null);
  const [encryptionKey, setEncryptionKey] = useState('');

  // === Stable props for memoized children ===
  // Without these, every App re-render passes fresh refs to ScriptEditor /
  // OutputPane / PayloadTabs / ContextPanel, defeating their React.memo.
  // Wrapping setters here lets the editors skip re-render when their actual
  // data didn't change (e.g. when only a modal opened/closed).
  const handleScriptChange = useCallback((val: string | undefined) => workspace.setScript(val || ''), [workspace.setScript]);
  const handlePayloadChange = useCallback((val: string | undefined) => workspace.setPayload(val || ''), [workspace.setPayload]);

  // ── File drag & drop ────────────────────────────────────────────
  // Window-level handler: drop a .dwl, .json, .xml, or .csv file anywhere
  // on the app to load it into the appropriate editor. Without this, the
  // default browser behavior would replace the whole app with the file's
  // contents (the WebView treats it as a navigation).
  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      // Block the default to keep the WebView from navigating away.
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault();
    };
    const onDrop = async (e: DragEvent) => {
      const file = e.dataTransfer?.files?.[0];
      if (!file) return;
      e.preventDefault();
      // A drop aimed at an open dialog / full-screen tool must not silently
      // replace the payload behind it (e.g. dropping XML onto the Flow
      // Designer's import dialog). Every overlay root uses `fixed inset-0`.
      if ((e.target as HTMLElement)?.closest?.('.fixed.inset-0, [role="dialog"], [role="alertdialog"]')) return;
      try {
        const text = await file.text();
        const ext = (file.name.split('.').pop() || '').toLowerCase();
        // .dwl scripts go to the script editor; everything else is treated
        // as a payload and the MIME is set to match the file extension.
        if (ext === 'dwl') {
          workspace.setScript(text);
        } else if (ext === 'json') {
          workspace.setPayload(text);
          workspace.setPayloadMimeType('application/json');
        } else if (ext === 'xml') {
          workspace.setPayload(text);
          workspace.setPayloadMimeType('application/xml');
        } else if (ext === 'csv') {
          workspace.setPayload(text);
          workspace.setPayloadMimeType('application/csv');
        } else if (ext === 'yaml' || ext === 'yml') {
          workspace.setPayload(text);
          workspace.setPayloadMimeType('application/yaml');
        } else {
          // Unknown extension — load as plain text so the user can decide.
          workspace.setPayload(text);
          workspace.setPayloadMimeType('text/plain');
        }
      } catch (err) {
        console.warn('Failed to read dropped file:', err);
      }
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [workspace.setScript, workspace.setPayload, workspace.setPayloadMimeType]);
  const contextDataMemo = useMemo(() => ({
    vars: workspace.context.vars,
    headers: workspace.context.headers,
    queryParams: workspace.context.queryParams,
    namedInputs: workspace.namedInputs,
    configYaml: workspace.context.configYaml,
    secureConfigYaml: workspace.context.secureConfigYaml,
  }), [
    workspace.context.vars, workspace.context.headers, workspace.context.queryParams,
    workspace.namedInputs, workspace.context.configYaml, workspace.context.secureConfigYaml,
  ]);
  const autoRunTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleRunRef = useRef<() => void>(() => {});
  const canRunRef = useRef(false);

  // Auto-dismiss empty state once a workspace gets opened from disk;
  // also remember which workspace was last loaded so the next launch can offer to resume it.
  useEffect(() => {
    if (workspace.currentFile) {
      if (!hasStarted) setHasStarted(true);
      writeLastWorkspace(workspace.currentFile);
      setLastWorkspace(workspace.currentFile);
    }
  }, [workspace.currentFile, hasStarted]);

  // Auto-save the in-progress draft to localStorage so the user can resume
  // even if they never explicitly saved a workspace file. Debounced so we
  // don't hammer storage on every keystroke.
  //
  // Only persist when the workspace is actually dirty — otherwise we'd
  // silently snapshot the default starter script the moment the user
  // enters the workspace (before typing anything), which triggers the
  // Resume button on next launch and "restores" defaults. Useless UX.
  useEffect(() => {
    if (!hasStarted || !workspace.isDirty) return;
    const handle = setTimeout(() => {
      // v2 draft — snapshot the entire collection (all requests + flow)
      // so resume restores the whole shape, not just the active request.
      writeDraft({
        projectName: workspace.projectName,
        requests: workspace.requests,
        activeRequestId: workspace.activeRequestId,
        flow: workspace.flow,
        savedAt: Date.now(),
      });
      setHasDraftSession(true);
    }, 500);
    return () => clearTimeout(handle);
  }, [
    hasStarted, workspace.isDirty,
    workspace.projectName, workspace.requests, workspace.activeRequestId, workspace.flow,
  ]);

  // (Previously had an onCloseRequested handler to flush the draft on window
  // close. Removed because Tauri 2's onCloseRequested can prevent the window
  // from actually closing in some configurations — registering the listener
  // alone was enough to make X-button clicks no-op. The 300 ms debounce on
  // auto-draft + the on-Run flush below cover the same use-case without the
  // close-blocking risk.)

  // When the workspace transitions to non-dirty (after Save, Load, or New),
  // the draft is no longer the "freshest" state — the persistent storage is.
  // Clear it so Resume on next launch doesn't shadow the just-saved file
  // with stale draft state.
  //
  // NOTE: this also fires on the FIRST entry to the workspace (Blank
  // transform → newWorkspace sets isDirty=false). That's intentional —
  // explicitly clicking "new" should drop any previous draft.
  useEffect(() => {
    if (hasStarted && !workspace.isDirty) {
      clearDraft();
      setHasDraftSession(false);
    }
  }, [hasStarted, workspace.isDirty]);

  // Debounced compile-cache pre-warm: when the user pauses typing for ~200ms,
  // ask the server to compile (and cache) the *merged* current script
  // silently. The cache key is the merged-script text, so we have to pass
  // enough context for the Rust side to produce the same merged form Run
  // would — otherwise Run cache-misses despite the warm having compiled.
  useEffect(() => {
    if (!hasStarted || !runner.isWarmedUp) return;
    const handle = setTimeout(() => {
      const attrJson = buildAttributesJson(
        workspace.context.method,
        workspace.context.queryParams,
        workspace.context.headers,
      );
      const varsJson = buildVarsJson(workspace.context.vars);
      const hasAttributes = attrJson.trim() !== '{}' && attrJson.trim() !== '';
      const hasVars = varsJson.trim() !== '{}' && varsJson.trim() !== '';
      invoke('warm_dataweave_script', {
        script: workspace.script,
        payloadMimeType: workspace.payloadMimeType,
        hasAttributes,
        hasVars,
        namedInputsJson: JSON.stringify(workspace.namedInputs),
      }).catch(() => {
        // Pre-warm is best-effort.
      });
    }, 200);
    return () => clearTimeout(handle);
  }, [
    hasStarted, runner.isWarmedUp,
    workspace.script, workspace.payloadMimeType,
    workspace.context, workspace.namedInputs,
  ]);

  // Surface the first-workspace prompt as soon as the FirstRunPicker is
  // out of the way. Skip silently for users who already have saved
  // workspaces from a previous app version (they don't need an onboarding
  // prompt for something they already understand).
  useEffect(() => {
    // showTour: the prompt would mount UNDER the tour scrim, auto-focus an
    // invisible input, and swallow keystrokes — wait until the tour finishes.
    if (showFirstRun || showTour || !shouldShowFirstWorkspace()) return;
    (async () => {
      try {
        const metas = await workspace.listWorkspaces();
        if (metas.length > 0) {
          markFirstWorkspaceSeen();
          return;
        }
      } catch { /* if listing fails, fall through to the prompt */ }
      setShowFirstWorkspace(true);
    })();
  }, [showFirstRun, showTour, workspace.listWorkspaces]);

  const handleFirstWorkspaceCreate = useCallback(async (name: string) => {
    workspace.setProjectName(name);
    try {
      await workspace.saveWorkspace();
      toast({ title: 'Workspace created', message: name, variant: 'success' });
    } catch (e) {
      toast({ title: 'Could not save workspace', message: (e as Error).message || String(e), variant: 'error' });
    }
    markFirstWorkspaceSeen();
    setShowFirstWorkspace(false);
    beginTransforming();
  }, [workspace, beginTransforming]);

  // Download + install the pending update, reporting progress to the banner.
  const installUpdate = useCallback(async () => {
    const update = updateRef.current;
    if (!update) return;
    try {
      let total = 0;
      let got = 0;
      setDownloadPct(0);
      await update.downloadAndInstall((e) => {
        if (e.event === 'Started') total = e.data.contentLength ?? 0;
        else if (e.event === 'Progress') {
          got += e.data.chunkLength;
          if (total > 0) setDownloadPct(Math.min(99, Math.round((got / total) * 100)));
        } else if (e.event === 'Finished') setDownloadPct(100);
      });
      await relaunch();
    } catch (e) {
      setDownloadPct(null);
      toast({ title: 'Update failed', message: (e as Error).message || String(e), variant: 'error' });
    }
  }, []);

  // Load app version and check for updates on startup — unless the user opted
  // out (Settings → Advanced → Privacy). Disabling it makes the app fully
  // no-network, which matters for locked-down / compliance environments.
  useEffect(() => {
    getVersion().then((v) => {
      setAppVersion(v);
      // Record the running version (the release announcement itself is handled by
      // the flag-based toast below, which also works in VS Code).
      try { localStorage.setItem(LAST_VERSION_KEY, v); } catch { /* ignore */ }
    }).catch(() => {});
    // Microsoft Store builds are updated by the Store — never self-update.
    if (import.meta.env.VITE_STORE_BUILD === '1') return;
    let updateCheckEnabled = true;
    try { updateCheckEnabled = localStorage.getItem('dw.updateCheck') !== '0'; } catch { /* default on */ }
    if (!updateCheckEnabled) return;
    const timer = setTimeout(async () => {
      try {
        const update = await check();
        if (update?.available) {
          updateRef.current = update;
          setUpdateAvailable(true);
          // Surface the update as an actionable toast — the banner+brand-dot
          // are persistent fallbacks but the toast is what gets noticed.
          toast({
            title: 'Update available',
            message: `DataWeave Studio ${update.version || ''} is ready to install.`.trim() + ' Download progress shows in the banner; it restarts automatically when done.',
            variant: 'warn',
            action: {
              label: 'Install',
              onClick: () => { void installUpdate(); },
            },
          });
        }
      } catch {
        // Network unreachable or endpoint blocked — fail silently. No toast
        // here: a failed background update check is not user-facing news.
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, []);

  // VS Code can't read the Tauri app version (getVersion rejects there) — pull it
  // from the extension host so the footer shows it.
  useEffect(() => {
    if (isTauri) return;
    invoke<string>('get_app_version').then(setAppVersion).catch(() => {});
  }, []);

  // One-time release announcement toast. Flag-based (not version-based) so it
  // behaves identically in VS Code; persistent so it isn't missed. Returning
  // users only — a fresh install gets the Welcome screen, so we just mark the
  // current release as seen for them.
  useEffect(() => {
    if (!LATEST_VERSION) return;
    if (shouldShowFirstRun()) {
      try { localStorage.setItem(RELEASE_SEEN_KEY, LATEST_VERSION); } catch { /* ignore */ }
      return;
    }
    let seen = '';
    try { seen = localStorage.getItem(RELEASE_SEEN_KEY) ?? ''; } catch { /* ignore */ }
    if (seen === LATEST_VERSION) return;
    const t = setTimeout(() => {
      // Mark seen only once it actually shows (so StrictMode's mount→cleanup→
      // remount in dev, which clears this timer, doesn't silently consume it).
      try { localStorage.setItem(RELEASE_SEEN_KEY, LATEST_VERSION); } catch { /* ignore */ }
      toast({
        variant: 'info',
        persist: true,
        // No version number here — desktop and the VS Code extension version
        // independently (2.x vs 1.x), so a single number would be wrong in one.
        // Message derives from the WhatsNew data (already runtime-specific),
        // so the toast can never describe a different release than the dialog.
        title: 'DataWeave Studio updated',
        message: `${getRelease(LATEST_VERSION)?.headline ?? 'See what changed'} — details in What’s new.`,
        action: { label: 'What’s new', onClick: () => setShowWhatsNew(true) },
      });
    }, 900);
    return () => clearTimeout(t);
  }, []);

  // Load the saved module library once on mount.
  useEffect(() => {
    invoke<string>('load_modules')
      .then((s) => { try { setModules(JSON.parse(s)); } catch { /* keep empty */ } })
      .catch(() => { /* no library yet */ });
  }, []);

  // Persist the library whenever it changes (and keep it in live state for runs).
  const handleModulesChange = useCallback((next: DwModule[]) => {
    setModules(next);
    void invoke('save_modules', { json: JSON.stringify(next) }).catch(() => { /* best-effort */ });
  }, []);

  const handleRun = useCallback(async () => {
    const { configYaml, secureConfigYaml } = workspace.context;

    const attributesJson = buildAttributesJson(
      workspace.context.method,
      workspace.context.queryParams,
      workspace.context.headers,
      workspace.context.uriParams ?? []
    );
    const namedInputsJson = JSON.stringify(
      workspace.namedInputs.filter((ni) => ni.name)
    );

    // p() / Mule::p() can't compile in the pure-DataWeave engine, so transparently
    // rewrite them to "${key}" (and drop a now-dead `import p from Mule`) before
    // resolving placeholders — a pasted Mule script runs without a manual convert.
    // Substitute ${key} and ${secure::key} in script and payload (with decryption).
    const resolvedScript = await substitutePropertiesAsync(convertAllPropertyCalls(workspace.script).text, configYaml, secureConfigYaml, encryptionKey, workspace.context.encryptionSettings);
    const resolvedPayload = await substitutePropertiesAsync(workspace.payload, configYaml, secureConfigYaml, encryptionKey, workspace.context.encryptionSettings);

    // Expression-typed vars (fx) are evaluated through the engine against the
    // resolved message before the run, so `vars.x = payload.name` computes
    // instead of being passed as the literal string "payload.name".
    const varsJson = await resolveVarsJson(
      workspace.context.vars,
      resolvedPayload,
      workspace.payloadMimeType,
      attributesJson,
      namedInputsJson,
      workspace.payloadFilePath,
    );

    // Sync the output view to the script's `output` directive — the json/xml/
    // raw toggle only affects syntax highlighting, so without this an XML run
    // shows XML text highlighted as (invalid) JSON until manually switched.
    const outDirective = resolvedScript.match(/^\s*output\s+([\w/+.-]+)/m)?.[1] ?? '';
    if (outDirective) {
      setOutputFormat(outDirective.includes('xml') ? 'xml' : outDirective.includes('json') ? 'json' : 'raw');
    }

    const multipartPartsJson =
      workspace.payloadMimeType === 'multipart/form-data' && workspace.multipartParts.length > 0
        ? JSON.stringify(workspace.multipartParts)
        : undefined;

    const modulesJson = modules.length > 0 ? JSON.stringify(modules) : undefined;

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
      modulesJson,
    );
  }, [workspace.script, workspace.payload, workspace.payloadMimeType, workspace.context, workspace.namedInputs, workspace.payloadFilePath, workspace.classpath, workspace.timeoutMs, workspace.multipartParts, modules, runner, encryptionKey]);

  // Keep refs in sync for auto-run (avoids stale closures and infinite loops)
  handleRunRef.current = handleRun;
  canRunRef.current = runner.isWarmedUp && !runner.isRunning;

  // User-triggered engine restart with success/error toast. The engine-error
  // banner has its own retry button that uses this; Settings → Restart engine
  // does too.
  const handleRestartEngine = useCallback(async () => {
    toast({ title: 'Restarting engine', message: 'Reloading the DataWeave runtime…', variant: 'info' });
    try {
      await runner.restartEngine();
      toast({ title: 'Engine restarted', message: 'Ready to run scripts.', variant: 'success' });
    } catch (e) {
      toast({ title: 'Engine restart failed', message: (e as Error).message || String(e), variant: 'error' });
    }
  }, [runner.restartEngine]);

  // Wraps workspace.saveWorkspace with success/error toasts. Used by ⌘S,
  // the workspace menu, and the command palette. The Sidebar save button
  // keeps its own button-flash UI on top of this — it's noisy but matches
  // FlowDesigner's save toast pattern.
  const handleSave = useCallback(async () => {
    try {
      const path = await workspace.saveWorkspace();
      const filename = path.split(/[\\/]/).pop() || 'workspace';
      toast({
        title: 'Workspace saved',
        message: filename,
        variant: 'success',
      });
    } catch (e) {
      toast({
        title: 'Could not save workspace',
        message: (e as Error).message || String(e),
        variant: 'error',
      });
    }
  }, [workspace.saveWorkspace]);

  const handleCurlImport = useCallback((result: CurlImportResult) => {
    workspace.setPayload(result.payload);
    workspace.setPayloadMimeType(result.payloadMimeType);
    workspace.setScript(result.generatedScript);
    if (result.multipartParts) {
      workspace.setMultipartParts(result.multipartParts);
    }
    // Read from ref to avoid stale closure — workspace.context captured at
    // callback creation can be behind if the user edited context mid-session.
    workspace.setContext({
      ...contextRef.current,
      method: result.method,
      headers: result.headers,
      queryParams: result.queryParams,
    });
  }, [workspace]);

  const handleOpenApiImport = useCallback((result: OpenApiImportResult) => {
    workspace.setPayload(result.payload);
    workspace.setPayloadMimeType(result.payloadMimeType);
    workspace.setScript(result.generatedScript);
  }, [workspace]);

  // Global Ctrl+S to save, Ctrl+K to open palette
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!savePendingRef.current) {
          savePendingRef.current = true;
          handleSave().finally(() => { savePendingRef.current = false; });
        }
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
        // Cancel a running script (context now lives inline, not in a drawer).
        if (runner.isRunning) runner.cancel();
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        setOpenWsOpen(true);
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        workspace.duplicateWorkspace();
      } else if (e.altKey && e.shiftKey && (e.key === 'F' || e.key === 'f' || e.code === 'KeyF')) {
        e.preventDefault();
        scriptEditorRef.current?.format();
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'n' || e.key === 'N')) {
        // ⌘N — New workspace
        e.preventDefault();
        handleNewScript();
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'b' || e.key === 'B')) {
        // ⌘B — Toggle sidebar
        e.preventDefault();
        setSidebarCollapsed((c) => !c);
      } else if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'l' || e.key === 'L')) {
        // ⌘L — Snippets (opens sidebar's Snippets tab)
        e.preventDefault();
        handleOpenSnippets();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'I' || e.key === 'i')) {
        // ⌘⇧I — Import cURL (focuses sidebar's Import tab)
        e.preventDefault();
        handleOpenImport();
      } else if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'E' || e.key === 'e')) {
        // ⌘⇧E — Secure properties tool
        e.preventDefault();
        setSecureToolOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleSave, workspace.duplicateWorkspace, toggle, runner.isRunning, runner.cancel, handleNewScript, handleOpenImport, handleOpenSnippets]);

  // Poll MCP server status so the rail button shows a live running dot even
  // when the panel is closed. Cheap; the command no-ops on the extension host.
  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try { const s = await invoke<{ running: boolean }>('mcp_status'); if (alive) setMcpRunning(s.running); }
      catch { /* command unavailable */ }
    };
    poll();
    const iv = setInterval(poll, 4000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

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
  }, [autoRun, workspace.script, workspace.payload, workspace.payloadMimeType, workspace.context, workspace.namedInputs]);

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
    { id: 'save', label: 'Save workspace', shortcut: '⌘S', group: 'Workspace', run: () => { beginTransforming(); handleSave(); } },
    { id: 'new', label: 'New workspace', shortcut: '⌘N', group: 'Workspace', run: () => { beginTransforming(); workspace.newWorkspace(); } },
    { id: 'open', label: 'Open workspace…', shortcut: '⌘O', group: 'Workspace', run: () => setOpenWsOpen(true) },
    { id: 'duplicate', label: 'Duplicate workspace', shortcut: '⌘D', group: 'Workspace', run: () => { beginTransforming(); workspace.duplicateWorkspace(); } },
    { id: 'import-playground', label: 'Import from Playground zip…', group: 'Workspace', run: handleImportPlayground },
    { id: 'export-playground', label: 'Export as Playground zip…', group: 'Workspace', run: handleExportPlayground },
    { id: 'format', label: 'Format script', shortcut: '⌥⇧F', group: 'Editor', run: () => scriptEditorRef.current?.format() },
    { id: 'sidebar', label: sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar', shortcut: '⌘B', group: 'View', run: () => setSidebarCollapsed(!sidebarCollapsed) },
    { id: 'layout-workbench', label: 'Switch UI → Workbench', hint: layout === 'workbench' ? 'current' : 'Sidebar · tabs · tests', shortcut: '⌘⇧1', group: 'View', run: () => setLayout('workbench') },
    { id: 'layout-focus', label: 'Switch UI → Playground', hint: layout === 'focus' ? 'current' : 'Input · script · output', shortcut: '⌘⇧2', group: 'View', run: () => setLayout('focus') },
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
    { id: 'reference', label: 'Open DataWeave function reference', group: 'Tools', run: () => setReferenceOpen(true) },
    { id: 'recipes', label: 'Open DataWeave cookbook', group: 'Tools', run: () => setRecipesOpen(true) },
    { id: 'flow', label: 'Open Message Flow designer', group: 'Tools', run: () => setFlowDesignerOpen(true) },
    { id: 'java', label: 'Open Java tester', group: 'Tools', run: () => setJavaTesterOpen(true) },
    { id: 'modules', label: 'Open Module library', group: 'Tools', run: () => setModulesOpen(true) },
    { id: 'mcp', label: 'Open MCP Server', group: 'Tools', run: () => setMcpOpen(true) },
    { id: 'secure', label: 'Open Secure Properties tool', shortcut: '⌘⇧E', group: 'Tools', run: () => setSecureToolOpen(true) },
    { id: 'compare', label: 'Open Compare tool', group: 'Tools', run: () => setCompareToolOpen(true) },
    { id: 'import-curl', label: 'Import cURL', shortcut: '⌘⇧I', group: 'Tools', run: handleOpenImport },
    { id: 'openapi', label: 'Open OpenAPI / Swagger reader', group: 'Tools', run: () => { introFeature('openapi'); setOpenApiOpen(true); } },
    { id: 'snippets', label: 'Open snippets library', shortcut: '⌘L', group: 'Tools', run: handleOpenSnippets },
    { id: 'shortcuts', label: 'Keyboard shortcuts', shortcut: '⌘/', group: 'Tools', run: () => setShortcutsOpen(true) },
    { id: 'settings', label: 'Open Settings', shortcut: '⌘,', group: 'Tools', run: () => setSettingsOpen(true) },
    { id: 'about', label: 'About DataWeave Studio', group: 'Tools', run: () => setAboutOpen(true) },
    { id: 'feedback', label: 'Send feedback / report a bug', group: 'Tools', run: () => setFeedbackOpen(true) },
    { id: 'tour', label: 'Show guided tour', group: 'Tools', run: () => {
      beginTransforming();
      setLayout('workbench');
      setSidebarCollapsed(false);
      setTimeout(() => setShowTour(true), 50);
    } },
  ];

  return (
    <div className="h-screen w-screen bg-bg text-content flex flex-col font-sans select-none">
      {/* Top bar — brand, breadcrumb, ⌘K search, run cluster */}
      <header data-tour="header" data-tauri-drag-region className="h-11 flex items-center gap-3 px-3 bg-surface border-b border-line shrink-0">
        {/* Brand mark — also the About entry; subtle dot when an update is available */}
        <div className="flex items-center justify-center w-11 shrink-0">
          <button
            onClick={() => setAboutOpen(true)}
            title={updateAvailable ? 'Update available — open About' : 'About DataWeave Studio'}
            className="relative w-[22px] h-[22px] flex items-center justify-center cursor-pointer"
          >
            <img src={logoUrl} alt="DataWeave Studio" width="22" height="22" />
            {updateAvailable && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-accent ring-2 ring-surface" />
            )}
          </button>
        </div>

        {/* Workspace menu — project name doubles as a dropdown trigger */}
        <WorkspaceMenu
          projectName={workspace.projectName}
          activeRequestName={workspace.request.name}
          isDirty={workspace.isDirty}
          onSave={() => { beginTransforming(); handleSave(); }}
          onNew={handleNewScript}
          onOpen={() => setOpenWsOpen(true)}
          onDuplicate={() => { beginTransforming(); workspace.duplicateWorkspace(); }}
          onImportPlayground={handleImportPlayground}
          onExportPlayground={handleExportPlayground}
        />

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

          {/* Layout switch — Workbench (full IDE) vs Playground (clean 3-pane).
              Hidden on compact viewports, where the layout is forced anyway. */}
          {!isCompact && (
            <div
              className="inline-flex gap-0.5 p-0.5 rounded-md border"
              style={{ background: 'var(--surface-2)', borderColor: 'var(--line)' }}
              title="Switch layout (⌘⇧1 / ⌘⇧2)"
            >
              {([['workbench', 'Workbench'], ['focus', 'Playground']] as const).map(([id, name]) => {
                const active = layout === id;
                return (
                  <button
                    key={id}
                    onClick={() => setLayout(id)}
                    className="inline-flex items-center h-5 px-2 rounded text-[11px] cursor-pointer transition-colors"
                    style={{
                      background: active ? 'var(--surface)' : 'transparent',
                      color: active ? 'var(--content)' : 'var(--content-faint)',
                      fontWeight: active ? 600 : 500,
                    }}
                  >
                    {name}
                  </button>
                );
              })}
            </div>
          )}

          {/* Tools menu — same actions as the sidebar / ⌘K, surfaced here so the
              Playground (which has no sidebar) can still reach every tool. */}
          <div className="relative">
            <button
              onClick={() => setToolsMenuOpen((o) => !o)}
              className="inline-flex items-center gap-1 h-7 px-2 rounded-md text-[12px] font-medium text-content-faint hover:text-content-secondary hover:bg-surface-2 cursor-pointer transition-colors"
              title="Tools"
            >
              Tools <Icons.ChevronDown size={12} />
            </button>
            {toolsMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setToolsMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-2 z-50 w-56 py-1 rounded-lg border border-line bg-surface shadow-2xl">
                  {([
                    ['Function reference', () => setReferenceOpen(true)],
                    ['DataWeave cookbook', () => setRecipesOpen(true)],
                    ['Message Flow designer', () => setFlowDesignerOpen(true)],
                    ['Java tester', () => setJavaTesterOpen(true)],
                    ['Module library', () => setModulesOpen(true)],
                    ['MCP Server', () => setMcpOpen(true)],
                    ['Secure Properties tool', () => setSecureToolOpen(true)],
                    ['Compare tool', () => setCompareToolOpen(true)],
                    ['Import cURL', handleOpenImport],
                    ['OpenAPI / Swagger reader', () => { introFeature('openapi'); setOpenApiOpen(true); }],
                    ['Snippets', handleOpenSnippets],
                    ['Keyboard shortcuts', () => setShortcutsOpen(true)],
                    ['Send feedback', () => setFeedbackOpen(true)],
                    ['About DataWeave Studio', () => setAboutOpen(true)],
                  ] as const).map(([label, run]) => (
                    <button
                      key={label}
                      onClick={() => { setToolsMenuOpen(false); run(); }}
                      className="w-full text-left px-3 h-8 flex items-center text-[12.5px] text-content-secondary hover:bg-surface-2 hover:text-content cursor-pointer transition-colors"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <IconBtn title="Settings (⌘,)" onClick={() => setSettingsOpen(true)}>
            <Icons.Settings size={15} />
          </IconBtn>

          <div className="w-px h-4 bg-line mx-1" />

          {/* Pane switch — Script vs Tests. Test count badge appears when
              the active request has at least one test. */}
          <div
            className="inline-flex gap-0.5 p-0.5 rounded-md border"
            style={{ background: 'var(--surface-2)', borderColor: 'var(--line)' }}
            title="Switch between the script editor and the tests panel"
          >
            {(['script', 'tests'] as const).map((m) => {
              const active = viewMode === m;
              const isTests = m === 'tests';
              const failingCount = isTests
                ? workspace.tests.filter((t) => t.lastStatus === 'fail').length
                : 0;
              return (
                <button
                  key={m}
                  onClick={() => setViewMode(m)}
                  className="inline-flex items-center gap-1.5 h-5 px-2.5 rounded text-[11px] cursor-pointer transition-colors"
                  style={{
                    background: active ? 'var(--surface)' : 'transparent',
                    color: active ? 'var(--content)' : 'var(--content-faint)',
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {isTests ? <Icons.Activity size={10} /> : <Icons.Braces size={10} />}
                  {isTests ? 'Tests' : 'Script'}
                  {isTests && workspace.tests.length > 0 && (
                    <span
                      className="font-mono text-[9.5px] px-1 rounded"
                      style={{
                        background: failingCount > 0
                          ? 'color-mix(in oklch, var(--err) 14%, transparent)'
                          : 'var(--accent-dim)',
                        color: failingCount > 0 ? 'var(--err)' : 'var(--accent)',
                      }}
                    >
                      {workspace.tests.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="w-px h-4 bg-line mx-1" />

          {!runner.isWarmedUp && (
            <div className="flex items-center gap-1.5 text-[11px] text-accent mr-1">
              <div className="w-3 h-3 rounded-full border-2 border-t-transparent border-accent animate-spin" />
              <span>Warming up…</span>
            </div>
          )}

          <button
            onClick={() => { if (!autoRun) introFeature('autorun'); setAutoRun(!autoRun); }}
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
        <WindowControls />
      </header>

      {/* Runtime error banner */}
      {runner.engineError && (
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
            <span className="text-[12px] font-medium" style={{ color: 'var(--err)' }}>DataWeave runtime unavailable</span>
            <span className="text-[12px] text-content-muted ml-2">{runner.engineError}</span>
          </div>
          <button
            onClick={() => { handleRestartEngine(); }}
            className="shrink-0 h-6 px-2 rounded text-[11px] font-medium text-content-secondary hover:text-content border border-line hover:bg-surface-2 cursor-pointer"
            title="Restart the DataWeave runtime"
          >
            Restart Engine
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

      {/* Update available banner */}
      {updateAvailable && !updateBannerDismissed && (
        <div className="shrink-0 flex items-center gap-3 px-4 py-1.5 bg-accent-dim border-b border-accent-border text-[12px]">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="var(--accent)" className="shrink-0">
            <path d="M8 16A8 8 0 108 0a8 8 0 000 16zm.93-9.412l-1 4.705c-.07.34.029.533.304.533.194 0 .487-.07.686-.246l-.088.416c-.287.346-.92.598-1.465.598-.703 0-1.002-.422-.808-1.319l.738-3.468c.064-.293.006-.399-.287-.399l-.009-.004.013-.045h2.09l-.174.82zM8 5.5a1 1 0 110-2 1 1 0 010 2z"/>
          </svg>
          <span className="text-accent font-medium">{downloadPct === null ? 'A new version of DataWeave Studio is available.' : `Downloading update… ${downloadPct}%`}</span>
          {downloadPct === null ? (
            <button
              onClick={() => { void installUpdate(); }}
              className="px-2.5 py-0.5 rounded-md text-[11px] font-medium bg-accent text-accent-ink hover:opacity-90 transition-opacity cursor-pointer"
            >
              Update now
            </button>
          ) : (
            <div className="w-40 h-1.5 rounded-full overflow-hidden" style={{ background: 'color-mix(in oklch, var(--accent) 25%, transparent)' }}>
              <div className="h-full transition-all duration-200" style={{ width: `${downloadPct}%`, background: 'var(--accent)' }} />
            </div>
          )}
          <span className="flex-1" />
          <button
            onClick={() => setUpdateBannerDismissed(true)}
            className="text-accent/60 hover:text-accent transition-colors cursor-pointer p-0.5"
            title="Dismiss"
          >
            <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M4.646 4.646a.5.5 0 0 1 .708 0L8 7.293l2.646-2.647a.5.5 0 0 1 .708.708L8.707 8l2.647 2.646a.5.5 0 0 1-.708.708L8 8.707l-2.646 2.647a.5.5 0 0 1-.708-.708L7.293 8 4.646 5.354a.5.5 0 0 1 0-.708z"/>
            </svg>
          </button>
        </div>
      )}

      {/* Body: Sidebar + Main
          (The old RequestTabs strip was removed — the Sidebar's Workspaces
           tab now shows the active workspace and its requests as a tree.) */}
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
          requests={workspace.requests}
          activeRequestId={workspace.activeRequestId}
          onSelectRequest={workspace.selectRequest}
          onAddRequest={() => workspace.addRequest()}
          onRenameRequest={workspace.renameRequest}
          onRemoveRequest={workspace.removeRequest}
          onDuplicateRequest={workspace.duplicateRequest}
          onOpenCurlImport={handleOpenImport}
          onInsertSnippet={(body) => scriptEditorRef.current?.insertSnippet(body)}
          onOpenSecure={() => { introFeature('secure'); setSecureToolOpen(true); }}
          onOpenCompare={() => { introFeature('compare'); setCompareToolOpen(true); }}
          onOpenFlowDesigner={() => { introFeature('flow'); setFlowDesignerOpen(true); }}
          onOpenJavaTester={() => { introFeature('java'); setJavaTesterOpen(true); }}
          onOpenOpenApi={() => { introFeature('openapi'); setOpenApiOpen(true); }}
          onOpenModules={() => { introFeature('modules'); setModulesOpen(true); }}
          onOpenMcp={() => { introFeature('mcp'); setMcpOpen(true); }}
          mcpRunning={mcpRunning}
          onOpenSettings={() => setSettingsOpen(true)}
          onOpenReference={() => { introFeature('reference'); setReferenceOpen(true); }}
          onOpenRecipes={() => { introFeature('cookbook'); setRecipesOpen(true); }}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />}

        {/* Main — empty state, then compact pane tabs, then three resizable columns */}
        {!hasStarted ? (
          <EmptyState
            onBlankTransform={handleNewScript}
            onImportCurl={handleOpenImport}
            onImportPlayground={handleImportPlayground}
            onOpenSnippets={handleOpenSnippets}
            onOpenWorkspace={() => setOpenWsOpen(true)}
            onStartTour={() => {
              // Tour highlights elements (editor, payload, context, output)
              // that only mount inside the workspace. Open it before starting.
              beginTransforming();
              setLayout('workbench');
              setSidebarCollapsed(false);
              // Wait for the workspace to render before the tour measures rects
              setTimeout(() => setShowTour(true), 50);
            }}
            onOpenFlowDesigner={() => setFlowDesignerOpen(true)}
            lastWorkspace={lastWorkspace}
            hasDraftSession={hasDraftSession && !lastWorkspace}
            onResumeLast={async () => {
              // Prefer the draft if it exists — it's strictly newer than any
              // saved file (auto-draft writes on every edit; explicit saves
              // clear the draft so the file becomes source of truth, and any
              // subsequent edits create a new draft on top). This matches
              // user expectation: "Resume" restores the state they had at
              // close, regardless of when they last hit Save.
              const d = readDraft();
              if (d) {
                // v2 draft: restore the whole collection in one shot. The
                // hook seeds per-(request, label) script cache from the
                // restored requests so role-switching keeps working.
                workspace.restoreSnapshot({
                  projectName: d.projectName,
                  requests: d.requests,
                  activeRequestId: d.activeRequestId,
                  flow: d.flow,
                });
                beginTransforming();
                return;
              }
              // No draft — fall back to the saved file if there is one.
              if (lastWorkspace) {
                try {
                  await workspace.loadWorkspace(lastWorkspace);
                  beginTransforming();
                  return;
                } catch (e) {
                  console.warn('Resume: lastWorkspace load failed.', e);
                  writeLastWorkspace(null);
                }
              }
              toast('No previous session found to restore.', 'error');
            }}
          />
        ) : viewMode === 'tests' ? (
          // Tests wins over the compact layout — otherwise the Tests toggle
          // silently does nothing at narrow widths.
          <main className="flex-1 overflow-hidden bg-bg flex">
            <TestsView
              request={workspace.request}
              onTestsChange={workspace.setTests}
              onScriptChange={workspace.setScript}
            />
          </main>
        ) : isCompact ? (
          <main className="flex-1 overflow-hidden bg-bg">
            <CompactLayout
              badges={{
                context:
                  contextCount(workspace.context.queryParams) +
                  contextCount(workspace.context.headers) +
                  workspace.context.vars.filter((v) => v.key).length,
                output: runner.error ? '!' : (runner.executionTimeMs ? `${runner.executionTimeMs}ms` : undefined),
              }}
              scriptPane={
                <ScriptEditor
                  ref={scriptEditorRef}
                  modelPath={`req-${workspace.activeRequestId || 'default'}.dwl`}
                  code={workspace.script}
                  onChange={handleScriptChange}
                  onRun={handleRun}
                  errorLine={runner.errorLine}
                  payload={workspace.payload}
                  payloadMimeType={workspace.payloadMimeType}
                  contextData={contextDataMemo}
                  onCursorChange={publishCursor}
                />
              }
              payloadPane={
                <PayloadTabs
                  payload={workspace.payload}
                  onPayloadChange={handlePayloadChange}
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
                  logs={runner.logs}
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

            {/* Left column: Inputs — Payload (top) + Context (bottom).
                Inputs lead the flow left→right: Input/Context → Transformation
                → Output. Context is inline in BOTH layouts now (no more drawer). */}
            <Panel defaultSize={28} minSize={18}>
              <PanelGroup orientation="vertical" className="h-full">
                <Panel defaultSize={55} minSize={20}>
                  <div className="h-full pb-1" data-tour="payload">
                    <PayloadTabs
                      payload={workspace.payload}
                      onPayloadChange={handlePayloadChange}
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
                <PanelResizeHandle className="h-1.5 flex items-center justify-center cursor-row-resize group">
                  <div className="w-8 h-0.5 rounded-full bg-line-secondary group-hover:bg-accent/50 transition-colors" />
                </PanelResizeHandle>
                <Panel defaultSize={45} minSize={15}>
                  <div className="h-full pt-1" data-tour="context-panel">
                    <ContextPanel
                      context={workspace.context}
                      onChange={workspace.setContext}
                      encryptionKey={encryptionKey}
                      onEncryptionKeyChange={setEncryptionKey}
                    />
                  </div>
                </Panel>
              </PanelGroup>
            </Panel>

            <PanelResizeHandle className="w-px bg-line hover:bg-accent/50 transition-colors cursor-col-resize relative group mx-1">
              <div className="absolute top-1/2 -translate-y-1/2 -left-[1px] h-8 w-[3px] rounded bg-line group-hover:bg-accent transition-colors" />
            </PanelResizeHandle>

            {/* Center: Transformation — the DataWeave script. In query mode the
                SOQL/SQL template editor sits on top of the parameters script. */}
            <Panel defaultSize={40} minSize={20} data-tour="script-editor">
              <PanelGroup orientation="vertical" className="h-full">
                {isQueryMode && (
                  <>
                    <Panel defaultSize={35} minSize={10}>
                      <div className="h-full pb-1">
                        <QueryEditor
                          query={workspace.queryTemplate}
                          onChange={(val) => workspace.setQueryTemplate(val || '')}
                          language={queryLanguage}
                        />
                      </div>
                    </Panel>
                    <PanelResizeHandle className="h-1.5 flex items-center justify-center cursor-row-resize group">
                      <div className="w-8 h-0.5 rounded-full bg-line-secondary group-hover:bg-accent/50 transition-colors" />
                    </PanelResizeHandle>
                  </>
                )}
                <Panel defaultSize={isQueryMode ? 65 : 100} minSize={15}>
                  <div className="h-full flex flex-col">
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
                      modelPath={`req-${workspace.activeRequestId || 'default'}.dwl`}
                      code={workspace.script}
                      onChange={handleScriptChange}
                      onRun={handleRun}
                      errorLine={runner.errorLine}
                      payload={workspace.payload}
                      payloadMimeType={workspace.payloadMimeType}
                      headerLabel={isQueryMode ? 'Parameters (DataWeave 2.0)' : undefined}
                      contextData={contextDataMemo}
                      onCursorChange={publishCursor}
                    />
                    </div>
                  </div>
                </Panel>
              </PanelGroup>
            </Panel>

            <PanelResizeHandle className="w-px bg-line hover:bg-accent/50 transition-colors cursor-col-resize relative group mx-1">
              <div className="absolute top-1/2 -translate-y-1/2 -left-[1px] h-8 w-[3px] rounded bg-line group-hover:bg-accent transition-colors" />
            </PanelResizeHandle>

            {/* Right: Output */}
            <Panel defaultSize={32} minSize={15} data-tour="output">
              <OutputPane
                output={runner.output}
                error={runner.error}
                isRunning={runner.isRunning}
                executionTimeMs={runner.executionTimeMs}
                errorLine={runner.errorLine}
                logs={runner.logs}
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
      />

      {/* About dialog */}
      {aboutOpen && (
        <Suspense fallback={null}>
          <AboutDialog open={aboutOpen} onClose={() => setAboutOpen(false)} appVersion={appVersion} updateAvailable={updateAvailable} onUpdateInstalled={() => setUpdateAvailable(false)} />
        </Suspense>
      )}

      {/* Feedback / bug report — composes a pre-filled GitHub issue (opens in the browser). */}
      {feedbackOpen && (
        <Suspense fallback={null}>
          <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} appVersion={appVersion} />
        </Suspense>
      )}

      {/* Secure Properties Tool dialog */}
      {secureToolOpen && (
        <Suspense fallback={null}>
          <SecurePropertiesTool open={secureToolOpen} onClose={() => setSecureToolOpen(false)} />
        </Suspense>
      )}

      {/* Compare tool — paste two texts, see the diff. */}
      {compareToolOpen && (
        <Suspense fallback={null}>
          <CompareTool open={compareToolOpen} onClose={() => setCompareToolOpen(false)} />
        </Suspense>
      )}

      {/* First-launch guided tour */}
      {showTour && (
        <Suspense fallback={null}>
          <WelcomeTour onComplete={() => { setShowTour(false); markTourSeen(); }} />
        </Suspense>
      )}


      {/* Command palette */}
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} commands={paletteCommands} />

      {/* Shortcuts reference */}
      {shortcutsOpen && (
        <Suspense fallback={null}>
          <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
        </Suspense>
      )}

      {/* Open workspace quick picker */}
      <OpenWorkspaceDialog
        open={openWsOpen}
        onClose={() => setOpenWsOpen(false)}
        listWorkspaces={workspace.listWorkspaces}
        onOpen={(f) => workspace.loadWorkspace(f)}
        onNew={handleNewScript}
        currentFile={workspace.currentFile}
      />

      {/* Settings */}
      {settingsOpen && (
        <Suspense fallback={null}>
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
            onShowTour={() => {
              // Same prep as the palette command: the tour filters steps by
              // which data-tour anchors are mounted, so from the empty state
              // it would show one step (or nothing) without this.
              setSettingsOpen(false);
              beginTransforming();
              setLayout('workbench');
              setSidebarCollapsed(false);
              setTimeout(() => setShowTour(true), 50);
            }}
            onShowAbout={() => { setSettingsOpen(false); setAboutOpen(true); }}
            onRestartEngine={handleRestartEngine}
          />
        </Suspense>
      )}

      {/* First-run welcome — brand hero + live demo + feature bento. */}
      {showFirstRun && (
        <Suspense fallback={null}>
          <WelcomeScreen
            appVersion={appVersion}
            onOpenPlayground={() => { markFirstRunSeen(); setShowFirstRun(false); }}
            onTakeTour={() => {
              markFirstRunSeen();
              setShowFirstRun(false);
              // Land in a real workbench first so every pane/rail anchor the
              // spotlight points at is actually mounted (else the tour is thin).
              handleNewScript();
              setTimeout(() => setShowTour(true), 400);
            }}
          />
        </Suspense>
      )}

      {/* What's new — once per release, for returning users after an update. */}
      {showWhatsNew && !showFirstRun && (
        <WhatsNew version={appVersion} onClose={() => setShowWhatsNew(false)} />
      )}

      {/* cURL import — full-screen modal, opened directly (⌘⇧I, rail icon,
          empty state) rather than via a near-empty sidebar tab. */}
      <CurlImporter open={curlImportOpen} onClose={() => setCurlImportOpen(false)} onImport={handleCurlImport} />

      <OpenApiReader open={openApiOpen} onClose={() => setOpenApiOpen(false)} onImport={handleOpenApiImport} />

      {/* One-time feature coachmarks — fired by introFeature(key) from button
          handlers; renders at most one card at a time. */}
      <FeatureIntroHost />

      {/* First-workspace prompt — one-time, lands the user inside a real
          workspace so the "what's a workspace? what's a request?" mental
          model is clear from the start. */}
      <FirstWorkspacePrompt
        open={showFirstWorkspace}
        onCreate={handleFirstWorkspaceCreate}
      />

      {/* Splash screen — covers everything until engine is ready */}
      <SplashScreen isReady={runner.isWarmedUp} hasError={!!runner.engineError} />

      {referenceOpen && (
        <Suspense fallback={null}>
          <FunctionBrowser
            open={referenceOpen}
            onClose={() => setReferenceOpen(false)}
            onInsertAtCursor={(text) => scriptEditorRef.current?.insertAtCursor(text)}
          />
        </Suspense>
      )}

      {recipesOpen && (
        <Suspense fallback={null}>
          <RecipeBrowser
            open={recipesOpen}
            onClose={() => setRecipesOpen(false)}
            onInsertAtCursor={(text) => scriptEditorRef.current?.insertAtCursor(text)}
            onOpenInPlayground={(r) => {
              workspace.setScript(r.script);
              workspace.setPayload(r.input || '');
              workspace.setPayloadMimeType(isValidMimeType(r.inputMime) ? r.inputMime : 'application/json');
              setRecipesOpen(false);
              // Let the new script/payload commit, then run + focus.
              setTimeout(() => { handleRunRef.current?.(); scriptEditorRef.current?.focus(); }, 120);
            }}
          />
        </Suspense>
      )}

      {flowDesignerOpen && (
        <Suspense fallback={null}>
          <FlowDesigner open={flowDesignerOpen} onClose={() => setFlowDesignerOpen(false)} />
        </Suspense>
      )}

      {javaTesterOpen && (
        <Suspense fallback={null}>
          <JavaTester open={javaTesterOpen} onClose={() => setJavaTesterOpen(false)} />
        </Suspense>
      )}

      {mcpOpen && (
        <Suspense fallback={null}>
          <MCPServerPanel open={mcpOpen} onClose={() => setMcpOpen(false)} onRunningChange={setMcpRunning} />
        </Suspense>
      )}

      {modulesOpen && (
        <Suspense fallback={null}>
          <ModulesPanel open={modulesOpen} onClose={() => setModulesOpen(false)} modules={modules} onChange={handleModulesChange} />
        </Suspense>
      )}

      <ToastHost />
    </div>
  );
}

export default App;
