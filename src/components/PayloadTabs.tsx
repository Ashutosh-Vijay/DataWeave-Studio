import { useState } from 'react';
import Editor, { BeforeMount } from '@monaco-editor/react';
import { open } from '@tauri-apps/plugin-dialog';
import { NamedInput, MIME_OPTIONS, MimeType } from '../types';
import { defineDataWeaveTheme, DATAWEAVE_THEME_NAME, DATAWEAVE_LIGHT_THEME_NAME } from '../dataweaveTheme';
import { useTheme } from '../ThemeContext';

const handleBeforeMount: BeforeMount = (monaco) => defineDataWeaveTheme(monaco);

function mimeToLanguage(mime: string): string {
  if (mime.includes('json') || mime.includes('java')) return 'json';
  if (mime.includes('xml') || mime.includes('multipart')) return 'xml';
  if (mime.includes('csv') || mime.includes('flatfile')) return 'plaintext';
  if (mime.includes('form-urlencoded')) return 'plaintext';
  if (mime.includes('dw')) return 'plaintext';
  return 'plaintext';
}

function mimeToLabel(mime: string): string {
  if (mime.includes('json')) return 'JSON';
  if (mime.includes('xml') && !mime.includes('multipart')) return 'XML';
  if (mime.includes('csv')) return 'CSV';
  if (mime.includes('form-urlencoded')) return 'Form';
  if (mime.includes('multipart')) return 'Multipart';
  if (mime.includes('flatfile')) return 'Flat File';
  if (mime.includes('dw')) return 'DW';
  if (mime.includes('java')) return 'Java';
  return 'Text';
}

interface PayloadTabsProps {
  payload: string;
  onPayloadChange: (val: string | undefined) => void;
  payloadMimeType: string;
  payloadFilePath?: string | null;
  onPayloadFilePathChange?: (path: string | null) => void;
  namedInputs: NamedInput[];
  onNamedInputsChange: (inputs: NamedInput[]) => void;
}

export function PayloadTabs({
  payload,
  onPayloadChange,
  payloadMimeType,
  payloadFilePath,
  onPayloadFilePathChange,
  namedInputs,
  onNamedInputsChange,
}: PayloadTabsProps) {
  const [activeTab, setActiveTab] = useState(0); // 0 = payload
  const { isDark } = useTheme();
  const editorTheme = isDark ? DATAWEAVE_THEME_NAME : DATAWEAVE_LIGHT_THEME_NAME;

  // Clamp tab if a named input was removed
  const effectiveTab = activeTab > namedInputs.length ? 0 : activeTab;

  const addInput = () => {
    const newName = `input${namedInputs.length + 1}`;
    onNamedInputsChange([
      ...namedInputs,
      { name: newName, content: '', mimeType: 'application/json' },
    ]);
    setActiveTab(namedInputs.length + 1);
  };

  const updateInput = (index: number, field: keyof NamedInput, value: string) => {
    const updated = namedInputs.map((inp, i) => {
      if (i !== index) return inp;
      if (field === 'name') {
        return { ...inp, name: value.replace(/[^a-zA-Z0-9_]/g, '') };
      }
      return { ...inp, [field]: value };
    });
    onNamedInputsChange(updated);
  };

  const removeInput = (index: number) => {
    onNamedInputsChange(namedInputs.filter((_, i) => i !== index));
    setActiveTab(0);
  };

  const pickPayloadFile = async () => {
    const selected = await open({ multiple: false, directory: false });
    if (selected && onPayloadFilePathChange) {
      onPayloadFilePathChange(typeof selected === 'string' ? selected : selected[0]);
    }
  };

  const clearPayloadFile = () => {
    if (onPayloadFilePathChange) onPayloadFilePathChange(null);
  };

  const pickInputFile = async (index: number) => {
    const selected = await open({ multiple: false, directory: false });
    if (selected) {
      const fp = typeof selected === 'string' ? selected : selected[0];
      updateInput(index, 'filePath' as keyof NamedInput, fp);
    }
  };

  const clearInputFile = (index: number) => {
    updateInput(index, 'filePath' as keyof NamedInput, '');
  };

  const isPayloadTab = effectiveTab === 0;
  const activeInputIndex = effectiveTab - 1;
  const activeInput = isPayloadTab ? null : namedInputs[activeInputIndex];

  const currentContent = isPayloadTab ? payload : (activeInput?.content || '');
  const currentMime = isPayloadTab ? payloadMimeType : (activeInput?.mimeType || 'application/json');

  const handleEditorChange = (val: string | undefined) => {
    if (isPayloadTab) {
      onPayloadChange(val);
    } else if (activeInput) {
      updateInput(activeInputIndex, 'content', val || '');
    }
  };

  return (
    <div className="flex flex-col h-full border border-line rounded-md overflow-hidden bg-surface-panel">
      {/* Tab bar */}
      <div className="bg-surface-elevated flex items-center border-b border-line shrink-0">
        {/* Payload tab */}
        <button
          onClick={() => setActiveTab(0)}
          className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer transition-colors ${
            isPayloadTab
              ? 'text-content bg-surface-panel border-b-2 border-blue-500'
              : 'text-content-faint hover:text-content-secondary'
          }`}
        >
          payload
          <span className="text-content-ghost ml-1 text-[10px]">({mimeToLabel(payloadMimeType)})</span>
        </button>

        {/* Named input tabs */}
        {namedInputs.map((inp, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i + 1)}
            className={`px-3 py-1.5 text-xs font-medium whitespace-nowrap cursor-pointer transition-colors group flex items-center ${
              effectiveTab === i + 1
                ? 'text-content bg-surface-panel border-b-2 border-purple-500'
                : 'text-content-faint hover:text-content-secondary'
            }`}
          >
            <span>{inp.name || 'unnamed'}</span>
            <span
              role="button"
              aria-label={`Remove input ${inp.name || 'unnamed'}`}
              onClick={(e) => {
                e.stopPropagation();
                removeInput(i);
              }}
              className="ml-1.5 text-content-ghost hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              title="Remove input"
            >
              ✕
            </span>
          </button>
        ))}

        {/* Add button */}
        <button
          onClick={addInput}
          className="px-2.5 py-1.5 text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
          title="Add named input"
        >
          +
        </button>
      </div>

      {/* Settings bar for named inputs */}
      {!isPayloadTab && activeInput && (
        <div className="bg-surface-section px-3 py-1 flex items-center gap-2 border-b border-line/50 shrink-0">
          <span className="text-[10px] text-content-faint">Name:</span>
          <input
            type="text"
            value={activeInput.name}
            onChange={(e) => updateInput(activeInputIndex, 'name', e.target.value)}
            className="bg-surface-panel border border-line rounded px-1.5 py-0.5 text-[11px] text-content font-mono w-28 focus:border-blue-500 focus:outline-none"
            placeholder="inputName"
          />
          <span className="text-[10px] text-content-faint">Type:</span>
          <select
            value={activeInput.mimeType}
            onChange={(e) => updateInput(activeInputIndex, 'mimeType', e.target.value as MimeType)}
            className="bg-surface-panel border border-line rounded px-1 py-0.5 text-[10px] text-content-muted focus:outline-none cursor-pointer"
          >
            {MIME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Binary file picker for payload tab */}
      {isPayloadTab && payloadMimeType === 'application/octet-stream' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4">
          <div className="text-content-faint text-xs text-center">Binary payload — select a file to pass to the script</div>
          {payloadFilePath ? (
            <div className="w-full space-y-2">
              <div className="bg-surface-input border border-green-700/40 rounded px-3 py-2 text-xs font-mono text-green-400 break-all">
                {payloadFilePath}
              </div>
              <div className="flex gap-2">
                <button onClick={pickPayloadFile} className="flex-1 px-3 py-1.5 text-xs bg-[#00a0df]/15 border border-[#00a0df]/30 text-[#00a0df] rounded cursor-pointer hover:bg-[#00a0df]/25 transition-colors">
                  Change File
                </button>
                <button onClick={clearPayloadFile} className="px-3 py-1.5 text-xs border border-line-secondary text-content-faint rounded cursor-pointer hover:text-red-400 hover:border-red-700/40 transition-colors">
                  Clear
                </button>
              </div>
            </div>
          ) : (
            <button onClick={pickPayloadFile} className="px-4 py-2 text-sm bg-[#00a0df]/15 border border-[#00a0df]/30 text-[#00a0df] rounded cursor-pointer hover:bg-[#00a0df]/25 transition-colors">
              Pick File...
            </button>
          )}
        </div>
      )}

      {/* Binary file picker for named input tab */}
      {!isPayloadTab && activeInput && activeInput.mimeType === 'application/octet-stream' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-4">
          <div className="text-content-faint text-xs text-center">Binary input — select a file</div>
          {activeInput.filePath ? (
            <div className="w-full space-y-2">
              <div className="bg-surface-input border border-green-700/40 rounded px-3 py-2 text-xs font-mono text-green-400 break-all">
                {activeInput.filePath}
              </div>
              <div className="flex gap-2">
                <button onClick={() => pickInputFile(activeInputIndex)} className="flex-1 px-3 py-1.5 text-xs bg-[#00a0df]/15 border border-[#00a0df]/30 text-[#00a0df] rounded cursor-pointer hover:bg-[#00a0df]/25 transition-colors">
                  Change File
                </button>
                <button onClick={() => clearInputFile(activeInputIndex)} className="px-3 py-1.5 text-xs border border-line-secondary text-content-faint rounded cursor-pointer hover:text-red-400 hover:border-red-700/40 transition-colors">
                  Clear
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => pickInputFile(activeInputIndex)} className="px-4 py-2 text-sm bg-[#00a0df]/15 border border-[#00a0df]/30 text-[#00a0df] rounded cursor-pointer hover:bg-[#00a0df]/25 transition-colors">
              Pick File...
            </button>
          )}
        </div>
      )}

      {/* Text editor for non-binary tabs */}
      {!(isPayloadTab && payloadMimeType === 'application/octet-stream') &&
       !(!isPayloadTab && activeInput && activeInput.mimeType === 'application/octet-stream') && (
        <div className="flex-1">
          <Editor
            height="100%"
            language={mimeToLanguage(currentMime)}
            theme={editorTheme}
            beforeMount={handleBeforeMount}
            value={currentContent}
            onChange={handleEditorChange}
            options={{
              minimap: { enabled: false },
              fontSize: 14,
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              folding: true,
              autoClosingBrackets: 'always',
              autoClosingQuotes: 'always',
              autoSurround: 'brackets',
              autoIndent: 'full',
            }}
          />
        </div>
      )}
    </div>
  );
}
