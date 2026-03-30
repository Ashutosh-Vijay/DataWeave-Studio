import { useState, useEffect, useCallback } from 'react';
import { CurlImporter, CurlImportResult } from './CurlImporter';
import { MIME_OPTIONS, NODE_LABELS, NODE_LABEL_COLORS, MimeType } from '../types';

interface SidebarProps {
  // Workspace
  projectName: string;
  onProjectNameChange: (name: string) => void;
  currentFile: string | null;
  isDirty: boolean;
  onNew: () => void;
  onSave: () => Promise<unknown>;
  onLoad: (filename: string) => Promise<void>;
  onDelete: (filename: string) => Promise<void>;
  listWorkspaces: () => Promise<string[]>;
  // Settings
  nodeLabel: string;
  onNodeLabelChange: (label: string) => void;
  payloadMimeType: MimeType;
  onPayloadMimeTypeChange: (mime: MimeType) => void;
  // cURL
  onCurlImport: (result: CurlImportResult) => void;
  // Collapse
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function Sidebar({
  projectName,
  onProjectNameChange,
  currentFile,
  isDirty,
  onNew,
  onSave,
  onLoad,
  onDelete,
  listWorkspaces,
  nodeLabel,
  onNodeLabelChange,
  payloadMimeType,
  onPayloadMimeTypeChange,
  onCurlImport,
  collapsed,
  onToggleCollapse,
}: SidebarProps) {
  const [files, setFiles] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveFlash, setSaveFlash] = useState(false);

  const refreshFiles = useCallback(() => {
    listWorkspaces().then(setFiles).catch(() => setFiles([]));
  }, [listWorkspaces]);

  useEffect(() => {
    refreshFiles();
  }, [refreshFiles]);

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

  const handleLoad = async (filename: string) => {
    await onLoad(filename);
  };

  const handleDelete = async (filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await onDelete(filename);
    setFiles((prev) => prev.filter((f) => f !== filename));
  };

  // Collapsed state: thin strip with toggle
  if (collapsed) {
    return (
      <div data-tour="sidebar" className="w-10 shrink-0 bg-surface-sidebar border-r border-[#00a0df]/10 flex flex-col items-center py-2 gap-3">
        <button
          onClick={onToggleCollapse}
          className="text-content-faint hover:text-content-secondary text-sm cursor-pointer"
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 3l5 5-5 5V3z" />
          </svg>
        </button>
        {/* Quick save icon */}
        <button
          onClick={handleSave}
          className="text-content-faint hover:text-[#00a0df] cursor-pointer"
          title="Save (Ctrl+S)"
          aria-label="Save workspace"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M13.5 1H3.5C2.67 1 2 1.67 2 2.5v11c0 .83.67 1.5 1.5 1.5h10c.83 0 1.5-.67 1.5-1.5v-11c0-.83-.67-1.5-1.5-1.5zM8 13c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM11 6H4V3h7v3z" />
          </svg>
        </button>
        {isDirty && (
          <div className="w-2 h-2 rounded-full bg-yellow-500" title="Unsaved changes" />
        )}
      </div>
    );
  }

  return (
    <div data-tour="sidebar" className="w-56 shrink-0 bg-surface-sidebar border-r border-[#00a0df]/10 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-line-subtle">
        <span className="text-xs font-medium text-[#00a0df]/70 uppercase tracking-wide">Explorer</span>
        <button
          onClick={onToggleCollapse}
          className="text-content-faint hover:text-content-secondary cursor-pointer"
          title="Collapse sidebar"
          aria-label="Collapse sidebar"
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10 3L5 8l5 5V3z" />
          </svg>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Project section */}
        <div className="px-3 py-3 border-b border-line-subtle space-y-2">
          <label className="text-[10px] text-content-faint uppercase tracking-wide">Project Name</label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => onProjectNameChange(e.target.value)}
            className="w-full bg-surface-elevated border border-line rounded px-2 py-1.5 text-xs text-content placeholder-content-ghost focus:border-[#00a0df] focus:outline-none"
            placeholder="Untitled"
          />

          {/* Save button */}
          <button
            onClick={handleSave}
            disabled={saving}
            className={`w-full py-1.5 rounded text-xs font-medium transition-all cursor-pointer ${
              saveFlash
                ? 'bg-emerald-600 text-white'
                : 'bg-[#00a0df] hover:bg-[#0090c5] text-white disabled:opacity-50'
            }`}
          >
            {saveFlash ? 'Saved!' : saving ? 'Saving...' : 'Save'}
            <span className="text-[10px] text-white/50 ml-1">Ctrl+S</span>
          </button>
          {isDirty && (
            <div className="text-[10px] text-yellow-500 flex items-center gap-1">
              <div className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
              Unsaved changes
            </div>
          )}
          {currentFile && !isDirty && (
            <div className="text-[10px] text-content-ghost truncate" title={currentFile}>
              {currentFile}
            </div>
          )}
        </div>

        {/* Workspaces list */}
        <div className="px-3 py-3 border-b border-line-subtle">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] text-content-faint uppercase tracking-wide">Workspaces</span>
            <button
              onClick={() => { onNew(); refreshFiles(); }}
              className="text-[10px] text-[#00a0df] hover:text-[#00c8ff] cursor-pointer"
            >
              + New
            </button>
          </div>
          <div className="space-y-0.5 max-h-40 overflow-y-auto">
            {files.length === 0 ? (
              <div className="text-[10px] text-content-ghost italic py-1">No saved workspaces</div>
            ) : (
              files.map((f) => (
                <div
                  key={f}
                  onClick={() => handleLoad(f)}
                  className={`flex items-center justify-between px-2 py-1.5 rounded cursor-pointer group text-xs transition-colors ${
                    f === currentFile
                      ? 'bg-[#00a0df]/10 text-[#00a0df] border-l-2 border-[#00a0df]'
                      : 'text-content-muted hover:bg-[var(--hover-overlay)] hover:text-content border-l-2 border-transparent'
                  }`}
                >
                  <span className="truncate flex-1">{f.replace('.dwstudio', '')}</span>
                  <button
                    onClick={(e) => handleDelete(f, e)}
                    className="text-content-ghost hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity ml-1 cursor-pointer"
                    title="Delete"
                    aria-label={`Delete workspace ${f.replace('.dwstudio', '')}`}
                  >
                    ✕
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* cURL Import */}
        <div className="px-3 py-3 border-b border-line-subtle">
          <span className="text-[10px] text-content-faint uppercase tracking-wide block mb-2">Import</span>
          <CurlImporter onImport={onCurlImport} />
        </div>

        {/* Settings */}
        <div className="px-3 py-3 space-y-3">
          <span className="text-[10px] text-content-faint uppercase tracking-wide block">Settings</span>

          <div className="space-y-1">
            <label className="text-[10px] text-content-faint">Input Format</label>
            <select
              value={payloadMimeType}
              onChange={(e) => onPayloadMimeTypeChange(e.target.value as MimeType)}
              className="w-full bg-surface-elevated border border-line rounded px-2 py-1.5 text-xs text-content-secondary focus:outline-none cursor-pointer"
            >
              {MIME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-[10px] text-content-faint">Node Label</label>
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
                        : 'bg-transparent border-transparent text-content-faint hover:text-content-secondary hover:bg-[var(--hover-overlay)]'
                    }`}
                  >
                    {l}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-3 py-2 border-t border-line-subtle text-[9px] text-content-ghost space-y-0.5">
        <div className="truncate">Saves to AppData/Local/com.dwstudio.desktop</div>
        <div className="truncate" title="DataWeave CLI by MuleSoft/Salesforce, BSD-3-Clause License">
          DW CLI by MuleSoft (BSD-3-Clause)
        </div>
      </div>
    </div>
  );
}
