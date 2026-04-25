import { useState, useEffect, useCallback } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { CurlImporter, CurlImportResult } from './CurlImporter';
import { MIME_OPTIONS, NODE_LABELS, NODE_LABEL_COLORS, MimeType } from '../types';
import { Icons } from './Icons';

type RailTab = 'workspaces' | 'import' | 'secure' | 'settings';

interface SidebarProps {
  projectName: string;
  onProjectNameChange: (name: string) => void;
  currentFile: string | null;
  isDirty: boolean;
  onNew: () => void;
  onSave: () => Promise<unknown>;
  onLoad: (filename: string) => Promise<void>;
  onDelete: (filename: string) => Promise<void>;
  listWorkspaces: () => Promise<string[]>;
  nodeLabel: string;
  onNodeLabelChange: (label: string) => void;
  payloadMimeType: MimeType;
  onPayloadMimeTypeChange: (mime: MimeType) => void;
  classpath: string[];
  onClasspathChange: (cp: string[]) => void;
  timeoutMs: number;
  onTimeoutMsChange: (ms: number) => void;
  onCurlImport: (result: CurlImportResult) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

const RAIL_ITEMS: { id: RailTab; title: string; Icon: (typeof Icons)[keyof typeof Icons] }[] = [
  { id: 'workspaces', title: 'Workspaces', Icon: Icons.Workspaces },
  { id: 'import', title: 'Import (cURL)', Icon: Icons.Import },
  { id: 'secure', title: 'Secure properties', Icon: Icons.Secure },
];

export function Sidebar(props: SidebarProps) {
  const {
    projectName, onProjectNameChange, currentFile, isDirty,
    onNew, onSave, onLoad, onDelete, listWorkspaces,
    nodeLabel, onNodeLabelChange,
    payloadMimeType, onPayloadMimeTypeChange,
    classpath, onClasspathChange,
    timeoutMs, onTimeoutMsChange,
    onCurlImport, collapsed, onToggleCollapse,
  } = props;

  const [tab, setTab] = useState<RailTab>('workspaces');
  const [files, setFiles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);

  const refreshFiles = useCallback(() => {
    listWorkspaces().then(setFiles).catch(() => setFiles([]));
  }, [listWorkspaces]);

  useEffect(() => { refreshFiles(); }, [refreshFiles]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave();
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 1200);
      refreshFiles();
    } finally {
      setSaving(false);
    }
  };

  const handleRailClick = (id: RailTab) => {
    if (collapsed) {
      onToggleCollapse();
      setTab(id);
    } else if (tab === id) {
      onToggleCollapse();
    } else {
      setTab(id);
    }
  };

  const handleSettingsClick = () => {
    if (collapsed) {
      onToggleCollapse();
      setTab('settings');
    } else if (tab === 'settings') {
      onToggleCollapse();
    } else {
      setTab('settings');
    }
  };

  return (
    <div data-tour="sidebar" className="flex shrink-0 overflow-hidden">
      {/* Icon Rail — 48px */}
      <div className="w-12 shrink-0 bg-rail border-r border-line flex flex-col py-2.5">
        {RAIL_ITEMS.map(({ id, title, Icon }) => {
          const isActive = !collapsed && tab === id;
          return (
            <button
              key={id}
              onClick={() => handleRailClick(id)}
              title={title}
              aria-label={title}
              className={`relative h-9 mx-2 my-0.5 rounded-md flex items-center justify-center cursor-pointer transition-colors ${
                isActive
                  ? 'bg-surface-2 text-content'
                  : 'text-content-faint hover:text-content-secondary'
              }`}
            >
              {isActive && (
                <span className="absolute -left-2 top-2 bottom-2 w-0.5 bg-accent rounded-sm" />
              )}
              <Icon size={18} />
            </button>
          );
        })}
        <div className="flex-1" />
        {isDirty && (
          <div className="mx-auto w-1.5 h-1.5 rounded-full bg-warn mb-1" title="Unsaved changes" />
        )}
        <button
          onClick={handleSettingsClick}
          title="Settings (Node label, MIME, Timeout, Classpath)"
          aria-label="Settings"
          className={`relative h-9 mx-2 my-0.5 rounded-md flex items-center justify-center cursor-pointer transition-colors ${
            !collapsed && tab === 'settings'
              ? 'bg-surface-2 text-content'
              : 'text-content-faint hover:text-content-secondary'
          }`}
        >
          {!collapsed && tab === 'settings' && (
            <span className="absolute -left-2 top-2 bottom-2 w-0.5 bg-accent rounded-sm" />
          )}
          <Icons.Settings size={18} />
        </button>
      </div>

      {/* Side Panel — 240px */}
      {!collapsed && (
        <div className="w-60 shrink-0 bg-surface border-r border-line flex flex-col min-h-0 overflow-hidden">
          {/* Header */}
          <div className="h-9 shrink-0 flex items-center px-3 border-b border-line-subtle">
            <span className="flex-1 text-[12.5px] font-semibold text-content">
              {tab === 'workspaces' && 'Workspaces'}
              {tab === 'import' && 'Import'}
              {tab === 'secure' && 'Secure Properties'}
              {tab === 'settings' && 'Settings'}
            </span>
            {tab === 'workspaces' && (
              <button
                onClick={() => { onNew(); refreshFiles(); }}
                title="New workspace"
                aria-label="New workspace"
                className="w-[22px] h-[22px] rounded flex items-center justify-center text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer"
              >
                <Icons.Plus size={13} />
              </button>
            )}
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto">
            {tab === 'workspaces' && (
              <div className="p-2 space-y-3">
                {/* Project name + save */}
                <div className="px-1 space-y-2">
                  <label className="text-[10px] text-content-faint uppercase tracking-wide">Project Name</label>
                  <input
                    type="text"
                    value={projectName}
                    onChange={(e) => onProjectNameChange(e.target.value)}
                    className="w-full bg-surface-2 border border-line rounded px-2 py-1.5 text-xs text-content placeholder-content-ghost focus:border-accent focus:outline-none"
                    placeholder="Untitled"
                  />
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className={`w-full py-1.5 rounded text-xs font-medium transition-all cursor-pointer ${
                      saveFlash
                        ? 'bg-emerald-600 text-white'
                        : 'bg-accent hover:bg-accent-hover text-accent-ink disabled:opacity-50'
                    }`}
                  >
                    {saveFlash ? 'Saved!' : saving ? 'Saving…' : 'Save'}
                    <span className="text-[10px] opacity-60 ml-1">Ctrl+S</span>
                  </button>
                  {currentFile && !isDirty && (
                    <div className="text-[10px] text-content-ghost truncate" title={currentFile}>
                      {currentFile}
                    </div>
                  )}
                </div>

                {/* List */}
                <div>
                  <div className="px-2 pb-1 text-[10px] text-content-faint uppercase tracking-wide">Saved</div>
                  {files.length === 0 ? (
                    <div className="px-2 text-[10px] text-content-ghost italic">No saved workspaces</div>
                  ) : (
                    <div className="space-y-0.5">
                      {files.map((f) => {
                        const isActive = f === currentFile;
                        return (
                          <div
                            key={f}
                            onClick={() => onLoad(f)}
                            className={`relative group flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer text-xs transition-colors ${
                              isActive
                                ? 'bg-surface-3 text-content'
                                : 'text-content-muted hover:bg-surface-2 hover:text-content'
                            }`}
                          >
                            {isActive && (
                              <span className="absolute -left-0.5 top-2 bottom-2 w-0.5 bg-accent rounded-sm" />
                            )}
                            <span className="truncate flex-1">{f.replace('.dwstudio', '')}</span>
                            <button
                              onClick={async (e) => {
                                e.stopPropagation();
                                await onDelete(f);
                                setFiles((prev) => prev.filter((x) => x !== f));
                              }}
                              title="Delete"
                              aria-label={`Delete workspace ${f.replace('.dwstudio', '')}`}
                              className="text-content-ghost hover:text-err opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                            >
                              <Icons.X size={11} />
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {tab === 'import' && (
              <div className="p-3">
                <CurlImporter onImport={onCurlImport} />
              </div>
            )}

            {tab === 'secure' && (
              <div className="p-3 text-[11.5px] text-content-muted space-y-2">
                <div className="p-3 rounded-md border border-dashed border-line bg-surface-2 text-center text-content-faint">
                  <Icons.Secure size={18} />
                  <div className="mt-1.5">Use the Secure Properties tool in the top bar to encrypt or decrypt values.</div>
                </div>
              </div>
            )}

            {tab === 'settings' && (
              <div className="p-3 space-y-4">
                {/* Input format */}
                <div className="space-y-1">
                  <label className="text-[10px] text-content-faint uppercase tracking-wide">Input Format</label>
                  <select
                    value={payloadMimeType}
                    onChange={(e) => onPayloadMimeTypeChange(e.target.value as MimeType)}
                    className="w-full bg-surface-2 border border-line rounded px-2 py-1.5 text-xs text-content focus:outline-none focus:border-accent cursor-pointer"
                  >
                    {MIME_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Node label */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-content-faint uppercase tracking-wide">Node Label</label>
                  <div className="space-y-1">
                    {NODE_LABELS.map((l) => {
                      const colors = NODE_LABEL_COLORS[l] || NODE_LABEL_COLORS.Transform;
                      const isActive = nodeLabel === l;
                      return (
                        <button
                          key={l}
                          onClick={() => onNodeLabelChange(l)}
                          className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-all cursor-pointer border ${
                            isActive
                              ? `${colors.bg} ${colors.text} ${colors.border} font-medium`
                              : 'bg-transparent border-transparent text-content-faint hover:text-content-secondary hover:bg-surface-2'
                          }`}
                        >
                          {l}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Timeout */}
                <div className="space-y-1">
                  <label className="text-[10px] text-content-faint uppercase tracking-wide">Timeout (ms)</label>
                  <input
                    type="number"
                    min={0}
                    step={1000}
                    value={timeoutMs}
                    onChange={(e) => onTimeoutMsChange(Number(e.target.value))}
                    className="w-full bg-surface-2 border border-line rounded px-2 py-1 text-xs text-content focus:border-accent focus:outline-none"
                    title="0 = no timeout"
                  />
                  <div className="text-[9px] text-content-ghost">0 = no timeout</div>
                </div>

                {/* Classpath */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] text-content-faint uppercase tracking-wide">Classpath</label>
                    <div className="flex gap-1">
                      <button
                        onClick={async () => {
                          const selected = await open({ multiple: true, directory: true });
                          if (selected) {
                            const entries = Array.isArray(selected) ? selected : [selected];
                            onClasspathChange([...classpath, ...entries.filter(e => !classpath.includes(e))]);
                          }
                        }}
                        className="text-[10px] text-accent hover:text-accent-hover cursor-pointer"
                        title="Add directory"
                      >+ Dir</button>
                      <span className="text-content-ghost text-[10px]">·</span>
                      <button
                        onClick={async () => {
                          const selected = await open({
                            multiple: true,
                            directory: false,
                            filters: [{ name: 'JAR / DWL', extensions: ['jar', 'dwl'] }],
                          });
                          if (selected) {
                            const entries = Array.isArray(selected) ? selected : [selected];
                            onClasspathChange([...classpath, ...entries.filter(e => !classpath.includes(e))]);
                          }
                        }}
                        className="text-[10px] text-accent hover:text-accent-hover cursor-pointer"
                        title="Add JAR or .dwl file"
                      >+ JAR</button>
                    </div>
                  </div>
                  {classpath.length === 0 ? (
                    <div className="text-[10px] text-content-ghost italic">No entries</div>
                  ) : (
                    <div className="space-y-0.5 max-h-40 overflow-y-auto">
                      {classpath.map((entry, i) => (
                        <div key={i} className="flex items-center gap-1 group px-1.5 py-1 rounded hover:bg-surface-2">
                          <span className="flex-1 text-[10px] text-content-muted font-mono truncate" title={entry}>
                            {entry.split(/[/\\]/).pop()}
                          </span>
                          <button
                            onClick={() => onClasspathChange(classpath.filter((_, j) => j !== i))}
                            className="text-content-ghost hover:text-err opacity-0 group-hover:opacity-100 cursor-pointer"
                            aria-label="Remove"
                          >
                            <Icons.X size={10} />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-3 py-2 border-t border-line-subtle text-[9px] text-content-ghost space-y-0.5 shrink-0">
            <div className="truncate">Saves to AppData/Local/com.dwstudio.desktop</div>
            <div className="truncate" title="DataWeave CLI by MuleSoft/Salesforce, BSD-3-Clause License">
              DW CLI by MuleSoft (BSD-3-Clause)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
