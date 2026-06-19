import { useEffect, useState, memo } from 'react';
import Editor, { BeforeMount, useMonaco } from '@monaco-editor/react';
import { configureEditor } from '../editorInit';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '../bridge';
import { NamedInput, MIME_OPTIONS, MimeType, MultipartPart } from '../types';
import { defineDataWeaveTheme, DATAWEAVE_THEME_NAME, DATAWEAVE_LIGHT_THEME_NAME } from '../dataweaveTheme';
import { useTheme } from '../ThemeContext';
import { useEditorFont } from '../hooks/useEditorFont';

const handleBeforeMount: BeforeMount = (monaco) => defineDataWeaveTheme(monaco);

/** Binary payload formats — these need the file picker; the editor textarea
 *  can't render or accept their bytes. Flatfile is intentionally excluded
 *  (it's text — COBOL copybooks and fixed-width records can be pasted). */
const BINARY_PAYLOAD_FORMATS = new Set<string>([
  'application/octet-stream',
  'application/xlsx',
  'application/avro',
  'application/protobuf',
]);

function isBinaryPayloadFormat(mime: string): boolean {
  return BINARY_PAYLOAD_FORMATS.has(mime);
}

function binaryFormatHint(mime: string): string {
  switch (mime) {
    case 'application/xlsx':     return 'Excel workbook — pick an .xlsx file. DataWeave reads it via the excel-module.';
    case 'application/avro':     return 'Avro file — pick an .avro file. The schema is read from the file header.';
    case 'application/protobuf': return 'Protobuf binary — pick a .proto / .pb file. You\'ll typically pair this with a vars-supplied schema.';
    case 'application/octet-stream':
    default:                     return 'Binary payload — select a file to pass to the script.';
  }
}

function mimeFromExtension(filename: string): MimeType | null {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, MimeType> = {
    json:  'application/json',
    xml:   'application/xml',
    csv:   'application/csv',
    txt:   'text/plain',
    dwl:   'application/dw',
    yaml:  'application/yaml',
    yml:   'application/yaml',
    ndjson:'application/x-ndjson',
    properties: 'text/x-java-properties',
    // Binary formats backed by separate DW modules (excel-module, avro-module,
    // protobuf-module, flatfile-module). When loaded via "Load file" the
    // content is the raw bytes and the module on the JVM side reads them.
    xlsx:  'application/xlsx',
    xls:   'application/xlsx',
    avro:  'application/avro',
    proto: 'application/protobuf',
    pb:    'application/protobuf',
    cpy:   'application/flatfile', // COBOL copybook
    ff:    'application/flatfile',
    ffd:   'application/flatfile',
  };
  return map[ext] ?? null;
}

function contentTypeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    json: 'application/json',
    xml: 'application/xml',
    csv: 'text/csv',
    txt: 'text/plain',
    html: 'text/html',
    htm: 'text/html',
    pdf: 'application/octet-stream',
    png: 'application/octet-stream',
    jpg: 'application/octet-stream',
    jpeg: 'application/octet-stream',
    gif: 'application/octet-stream',
    webp: 'application/octet-stream',
    zip: 'application/octet-stream',
    gz: 'application/octet-stream',
    doc: 'application/octet-stream',
    docx: 'application/octet-stream',
    mp4: 'application/octet-stream',
    mp3: 'application/octet-stream',
    // Map common binary-format extensions to their DW MIME so the engine
    // picks the right reader instead of treating the bytes as opaque.
    xlsx: 'application/xlsx',
    xls: 'application/xlsx',
    avro: 'application/avro',
    proto: 'application/protobuf',
    pb: 'application/protobuf',
    cpy: 'application/flatfile',
    ff: 'application/flatfile',
    ffd: 'application/flatfile',
  };
  return map[ext] || 'application/octet-stream';
}

function mimeToLanguage(mime: string): string {
  if (mime.includes('json') || mime.includes('java')) return 'json';
  if (mime.includes('xml') || mime.includes('multipart')) return 'xml';
  if (mime.includes('csv') || mime.includes('yaml') || mime.includes('properties') || mime.includes('ndjson')) return 'plaintext';
  if (mime.includes('form-urlencoded')) return 'plaintext';
  if (mime.includes('dw')) return 'plaintext';
  return 'plaintext';
}


interface PayloadTabsProps {
  payload: string;
  onPayloadChange: (val: string | undefined) => void;
  payloadMimeType: string;
  onPayloadMimeTypeChange?: (mime: MimeType) => void;
  payloadFilePath?: string | null;
  onPayloadFilePathChange?: (path: string | null) => void;
  multipartParts: MultipartPart[];
  onMultipartPartsChange: (parts: MultipartPart[]) => void;
  namedInputs: NamedInput[];
  onNamedInputsChange: (inputs: NamedInput[]) => void;
}

export const PayloadTabs = memo(function PayloadTabs({
  payload,
  onPayloadChange,
  payloadMimeType,
  onPayloadMimeTypeChange,
  payloadFilePath,
  onPayloadFilePathChange,
  multipartParts,
  onMultipartPartsChange,
  namedInputs,
  onNamedInputsChange,
}: PayloadTabsProps) {
  const [activeTab, setActiveTab] = useState(0); // 0 = payload
  const { isDark } = useTheme();
  const editorFont = useEditorFont();
  const monaco = useMonaco();
  useEffect(() => {
    const apply = () => { if (monaco) defineDataWeaveTheme(monaco); };
    apply();
    window.addEventListener('dw:accent-changed', apply);
    return () => window.removeEventListener('dw:accent-changed', apply);
  }, [isDark, monaco]);
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

  const loadPayloadFromFile = async (onMimeChange?: (mime: MimeType) => void) => {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Data files', extensions: ['csv', 'json', 'xml', 'txt', 'dwl', 'ff', 'ffd'] }],
    });
    if (!selected) return;
    const fp = typeof selected === 'string' ? selected : selected[0];
    try {
      const content = await invoke<string>('read_text_file', { path: fp });
      onPayloadChange(content);
      const fname = fp.split(/[/\\]/).pop() || fp;
      const detectedMime = mimeFromExtension(fname);
      if (detectedMime && onMimeChange) onMimeChange(detectedMime);
    } catch (e) {
      console.error('Failed to load file:', e);
    }
  };

  const loadInputFromFile = async (index: number) => {
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'Data files', extensions: ['csv', 'json', 'xml', 'txt', 'dwl', 'ff', 'ffd'] }],
    });
    if (!selected) return;
    const fp = typeof selected === 'string' ? selected : selected[0];
    try {
      const content = await invoke<string>('read_text_file', { path: fp });
      updateInput(index, 'content', content);
      const fname = fp.split(/[/\\]/).pop() || fp;
      const detectedMime = mimeFromExtension(fname);
      if (detectedMime) updateInput(index, 'mimeType', detectedMime as string);
    } catch (e) {
      console.error('Failed to load file:', e);
    }
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
    <div className="flex flex-col h-full overflow-hidden bg-surface">
      {/* Tab bar */}
      <div className="flex items-center border-b border-line shrink-0 pl-1">
        {/* Payload tab */}
        <button
          onClick={() => setActiveTab(0)}
          className={`relative h-7 px-3 text-[12px] whitespace-nowrap cursor-pointer transition-colors ${
            isPayloadTab ? 'text-content font-semibold' : 'text-content-faint hover:text-content-secondary font-medium'
          }`}
        >
          payload
          {isPayloadTab && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded-sm bg-accent" />}
        </button>

        {/* Named input tabs */}
        {namedInputs.map((inp, i) => {
          const active = effectiveTab === i + 1;
          return (
            <button
              key={i}
              onClick={() => setActiveTab(i + 1)}
              className={`group relative h-7 px-3 text-[12px] whitespace-nowrap cursor-pointer transition-colors inline-flex items-center gap-1.5 ${
                active ? 'text-content font-semibold' : 'text-content-faint hover:text-content-secondary font-medium'
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
                className="text-content-ghost hover:text-err opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer text-[11px]"
                title="Remove input"
              >
                ✕
              </span>
              {active && (
                <span
                  className="absolute left-2 right-2 -bottom-px h-0.5 rounded-sm"
                  style={{ background: 'var(--violet)' }}
                />
              )}
            </button>
          );
        })}

        {/* Add button */}
        <button
          onClick={addInput}
          className="inline-flex items-center justify-center w-6 h-6 ml-0.5 rounded text-content-faint hover:text-accent hover:bg-surface-2 cursor-pointer transition-colors"
          title="Add named input"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </button>

        {/* Right side: MIME selector + Load file */}
        <div className="ml-auto flex items-center gap-1 pr-2">
          {/* Inline MIME type selector for active tab */}
          {isPayloadTab && onPayloadMimeTypeChange && (
            <select
              value={payloadMimeType}
              onChange={(e) => onPayloadMimeTypeChange(e.target.value as MimeType)}
              className="h-6 bg-surface-2 border border-line rounded-md px-1.5 text-[10.5px] text-content-muted focus:outline-none focus:border-accent cursor-pointer"
              title="Payload MIME type"
            >
              {MIME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}
          {!isPayloadTab && activeInput && (
            <select
              value={activeInput.mimeType}
              onChange={(e) => updateInput(activeInputIndex, 'mimeType', e.target.value as MimeType)}
              className="h-6 bg-surface-2 border border-line rounded-md px-1.5 text-[10.5px] text-content-muted focus:outline-none focus:border-accent cursor-pointer"
              title="Input MIME type"
            >
              {MIME_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          )}
          {/* Load file — only for text formats; binary formats have their
              own full-pane picker below. */}
          {isPayloadTab && !isBinaryPayloadFormat(payloadMimeType) && payloadMimeType !== 'multipart/form-data' && (
            <button
              onClick={() => loadPayloadFromFile(onPayloadMimeTypeChange)}
              className="h-6 inline-flex items-center text-[10.5px] text-content-faint hover:text-accent px-2 rounded-md border border-line hover:border-accent-border hover:bg-accent-dim transition-colors cursor-pointer"
              title="Load file contents into editor (CSV, JSON, XML, TXT…)"
            >
              Load file
            </button>
          )}
          {!isPayloadTab && activeInput && !isBinaryPayloadFormat(activeInput.mimeType) && (
            <button
              onClick={() => loadInputFromFile(activeInputIndex)}
              className="h-6 inline-flex items-center text-[10.5px] text-content-faint hover:text-accent px-2 rounded-md border border-line hover:border-accent-border hover:bg-accent-dim transition-colors cursor-pointer"
              title="Load file contents into this input (CSV, JSON, XML, TXT…)"
            >
              Load file
            </button>
          )}
        </div>
      </div>

      {/* Settings bar for named inputs */}
      {!isPayloadTab && activeInput && (
        <div className="bg-surface-section px-3 py-1 flex items-center gap-2 border-b border-line/50 shrink-0">
          <span className="text-[10px] text-content-faint">Name:</span>
          <input
            type="text"
            value={activeInput.name}
            onChange={(e) => updateInput(activeInputIndex, 'name', e.target.value)}
            className="bg-surface-panel border border-line rounded px-1.5 py-0.5 text-[11px] text-content font-mono w-28 focus:border-accent focus:outline-none"
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

      {/* Multipart form-data parts builder */}
      {isPayloadTab && payloadMimeType === 'multipart/form-data' && (
        <div className="flex-1 overflow-auto p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-content-faint uppercase tracking-wide">Parts</span>
            <button
              onClick={() => onMultipartPartsChange([
                ...multipartParts,
                { name: `part${multipartParts.length + 1}`, value: '', contentType: 'text/plain', isFile: false },
              ])}
              className="text-[10px] text-accent hover:text-accent-hover cursor-pointer"
            >+ Add Part</button>
          </div>

          {multipartParts.length === 0 && (
            <div className="text-[10px] text-content-ghost italic py-2">No parts yet — add text or file parts</div>
          )}

          {multipartParts.map((part, i) => (
            <div key={i} className="bg-surface-section border border-line-secondary rounded-lg p-2 space-y-1.5">
              <div className="flex items-center gap-2">
                {/* Name */}
                <input
                  type="text"
                  value={part.name}
                  onChange={(e) => {
                    const updated = [...multipartParts];
                    updated[i] = { ...part, name: e.target.value.replace(/[^a-zA-Z0-9_-]/g, '') };
                    onMultipartPartsChange(updated);
                  }}
                  placeholder="name"
                  className="flex-1 bg-surface-input border border-line rounded px-2 py-1 text-[11px] font-mono text-content focus:border-accent focus:outline-none"
                />
                {/* Text/File toggle */}
                <button
                  onClick={() => {
                    const updated = [...multipartParts];
                    updated[i] = { ...part, isFile: !part.isFile, filePath: undefined, value: '', contentType: !part.isFile ? 'application/octet-stream' : 'text/plain' };
                    onMultipartPartsChange(updated);
                  }}
                  className={`px-2 py-1 text-[10px] rounded border cursor-pointer transition-colors ${
                    part.isFile
                      ? 'bg-violet-tint text-violet border-violet-border'
                      : 'bg-accent-dim text-accent border-accent-border'
                  }`}
                >
                  {part.isFile ? 'File' : 'Text'}
                </button>
                {/* Content-Type */}
                <input
                  type="text"
                  value={part.contentType}
                  onChange={(e) => {
                    const updated = [...multipartParts];
                    updated[i] = { ...part, contentType: e.target.value };
                    onMultipartPartsChange(updated);
                  }}
                  placeholder="text/plain"
                  className="w-32 bg-surface-input border border-line rounded px-2 py-1 text-[10px] text-content-muted focus:border-accent focus:outline-none"
                />
                {/* Remove */}
                <button
                  onClick={() => onMultipartPartsChange(multipartParts.filter((_, j) => j !== i))}
                  className="text-content-ghost hover:text-err cursor-pointer text-xs px-1"
                >✕</button>
              </div>

              {part.isFile ? (
                <div className="flex items-center gap-2">
                  {part.filePath ? (
                    <>
                      <span className="flex-1 text-[10px] font-mono text-accent truncate">{part.filePath.split(/[/\\]/).pop()}</span>
                      <button
                        onClick={async () => {
                          const selected = await open({ multiple: false, directory: false });
                          if (selected) {
                            const fp = typeof selected === 'string' ? selected : selected[0];
                            const fname = fp.split(/[/\\]/).pop() || fp;
                            const updated = [...multipartParts];
                            updated[i] = { ...part, filePath: fp, filename: fname, contentType: contentTypeFromFilename(fname) };
                            onMultipartPartsChange(updated);
                          }
                        }}
                        className="text-[10px] text-accent border border-accent-border rounded px-2 py-0.5 cursor-pointer hover:bg-accent-dim"
                      >Change</button>
                      <button
                        onClick={() => {
                          const updated = [...multipartParts];
                          updated[i] = { ...part, filePath: undefined, filename: undefined };
                          onMultipartPartsChange(updated);
                        }}
                        className="text-[10px] text-content-ghost hover:text-err cursor-pointer"
                      >Clear</button>
                    </>
                  ) : (
                    <button
                      onClick={async () => {
                        const selected = await open({ multiple: false, directory: false });
                        if (selected) {
                          const fp = typeof selected === 'string' ? selected : selected[0];
                          const fname = fp.split(/[/\\]/).pop() || fp;
                          const updated = [...multipartParts];
                          updated[i] = { ...part, filePath: fp, filename: fname, contentType: contentTypeFromFilename(fname) };
                          onMultipartPartsChange(updated);
                        }
                      }}
                      className="text-[10px] text-accent border border-accent-border rounded px-2 py-1 cursor-pointer hover:bg-accent-dim"
                    >Pick File...</button>
                  )}
                </div>
              ) : (
                <input
                  type="text"
                  value={part.value}
                  onChange={(e) => {
                    const updated = [...multipartParts];
                    updated[i] = { ...part, value: e.target.value };
                    onMultipartPartsChange(updated);
                  }}
                  placeholder="value"
                  className="w-full bg-surface-input border border-line rounded px-2 py-1 text-[11px] font-mono text-content focus:border-accent focus:outline-none"
                />
              )}
            </div>
          ))}

          {multipartParts.length > 0 && (
            <div className="text-[9px] text-content-ghost pt-1">
              Real multipart body sent to DW CLI — access via <code className="text-content-faint">payload.parts.name.content</code>
            </div>
          )}
        </div>
      )}

      {/* Binary file picker for payload tab
          Formats that can't be pasted as text — xlsx/avro/protobuf are
          binary, octet-stream is generic binary. Flatfile is text but
          stays in the textarea (it's COBOL copybook / fixed-width which
          is short enough to paste). */}
      {isPayloadTab && isBinaryPayloadFormat(payloadMimeType) && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
          <div className="text-content-faint text-[12px] text-center">{binaryFormatHint(payloadMimeType)}</div>
          {payloadFilePath ? (
            <div className="w-full max-w-[420px] space-y-2">
              <div className="bg-surface-2 border border-line rounded-md px-3 py-2 text-[12px] font-mono text-accent break-all">
                {payloadFilePath}
              </div>
              <div className="flex gap-2">
                <button onClick={pickPayloadFile} className="flex-1 h-7 inline-flex items-center justify-center px-3 text-[11.5px] font-medium bg-accent-dim border border-accent-border text-accent rounded-md cursor-pointer hover:bg-accent-dim/80 transition-colors">
                  Change File
                </button>
                <button onClick={clearPayloadFile} className="h-7 inline-flex items-center justify-center px-3 text-[11.5px] font-medium border border-line text-content-faint rounded-md cursor-pointer hover:text-err hover:border-err-border transition-colors">
                  Clear
                </button>
              </div>
            </div>
          ) : (
            <button onClick={pickPayloadFile} className="h-8 inline-flex items-center justify-center px-4 text-[12.5px] font-medium bg-accent-dim border border-accent-border text-accent rounded-md cursor-pointer hover:bg-accent-dim/80 transition-colors">
              Pick File…
            </button>
          )}
        </div>
      )}

      {/* Binary file picker for named input tab */}
      {!isPayloadTab && activeInput && isBinaryPayloadFormat(activeInput.mimeType) && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 p-6">
          <div className="text-content-faint text-[12px] text-center">{binaryFormatHint(activeInput.mimeType)}</div>
          {activeInput.filePath ? (
            <div className="w-full max-w-[420px] space-y-2">
              <div className="bg-surface-2 border border-line rounded-md px-3 py-2 text-[12px] font-mono text-accent break-all">
                {activeInput.filePath}
              </div>
              <div className="flex gap-2">
                <button onClick={() => pickInputFile(activeInputIndex)} className="flex-1 h-7 inline-flex items-center justify-center px-3 text-[11.5px] font-medium bg-accent-dim border border-accent-border text-accent rounded-md cursor-pointer hover:bg-accent-dim/80 transition-colors">
                  Change File
                </button>
                <button onClick={() => clearInputFile(activeInputIndex)} className="h-7 inline-flex items-center justify-center px-3 text-[11.5px] font-medium border border-line text-content-faint rounded-md cursor-pointer hover:text-err hover:border-err-border transition-colors">
                  Clear
                </button>
              </div>
            </div>
          ) : (
            <button onClick={() => pickInputFile(activeInputIndex)} className="h-8 inline-flex items-center justify-center px-4 text-[12.5px] font-medium bg-accent-dim border border-accent-border text-accent rounded-md cursor-pointer hover:bg-accent-dim/80 transition-colors">
              Pick File…
            </button>
          )}
        </div>
      )}

      {/* Text editor for non-binary, non-multipart tabs */}
      {!(isPayloadTab && isBinaryPayloadFormat(payloadMimeType)) &&
       !(isPayloadTab && payloadMimeType === 'multipart/form-data') &&
       !(!isPayloadTab && activeInput && isBinaryPayloadFormat(activeInput.mimeType)) && (
        <div className="flex-1">
          <Editor
            height="100%"
            language={mimeToLanguage(currentMime)}
            theme={editorTheme}
            beforeMount={handleBeforeMount}
            onMount={configureEditor}
            value={currentContent}
            onChange={handleEditorChange}
            options={{
              minimap: { enabled: false },
              automaticLayout: true,
              ...editorFont,
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              folding: true,
              autoClosingBrackets: 'beforeWhitespace',
              autoClosingQuotes: 'beforeWhitespace',
              autoSurround: 'languageDefined',
              autoIndent: 'full',
              scrollbar: { alwaysConsumeMouseWheel: false },
            }}
          />
        </div>
      )}
    </div>
  );
});
