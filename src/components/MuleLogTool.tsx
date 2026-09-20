/**
 * Mule log → cURL.
 *
 * Paste a log, get back the requests that are in it as cURL commands you can
 * replay — or hand straight to the importer, which turns one into a payload and
 * a transform to work on. That last step is the reason this lives in the app
 * rather than being a web page: a failing request in a log becomes a script
 * under test without anything being retyped.
 *
 * The parsing is in ../muleLog; this is the paste box, the list, and the two
 * things you can do with what it found.
 */
import { useEffect, useMemo, useState } from 'react';
import { WindowControls } from './WindowControls';
import { Icons } from './Icons';
import { parseMuleLog, toCurl } from '../muleLog';
import { parseCurl, CurlImportResult } from './CurlImporter';

const SAMPLE = `DEBUG 2026-05-01 10:00:02,123 [http.requester.HTTP_Request_Config.01] org.mule.service.http.impl.service.HttpMessageLogger: REQUEST
POST /api/v1/orders?region=eu HTTP/1.1
Content-Type: application/json
X-Api-Key: 7f8b9c0d1e2f
Host: api.example.com:443
Content-Length: 58

{"customer":"ACME","items":[{"sku":"A-1","qty":2}]}
DEBUG 2026-05-01 10:00:02,456 [http.requester] HttpMessageLogger: RESPONSE
HTTP/1.1 500 Internal Server Error

{"error":"order total did not match"}
`;

export function MuleLogTool({
  open,
  onClose,
  onImport,
}: {
  open: boolean;
  onClose: () => void;
  onImport: (result: CurlImportResult) => void;
}) {
  const [text, setText] = useState('');
  const [picked, setPicked] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.defaultPrevented) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const requests = useMemo(() => parseMuleLog(text), [text]);
  const current = requests[Math.min(picked, requests.length - 1)];
  const curl = current ? toCurl(current) : '';

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-bg">
      <header data-tauri-drag-region className="h-11 shrink-0 flex items-center gap-3 pl-4 pr-3 bg-surface border-b border-line">
        <button
          onClick={onClose}
          className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[12px] text-content-faint hover:text-content hover:bg-surface-2 cursor-pointer transition-colors"
          title="Close (Esc)"
        >
          <Icons.ChevronRight size={12} className="rotate-180" />
          Back
        </button>
        <div className="w-px h-4 bg-line" />
        <Icons.Terminal size={14} className="shrink-0" style={{ color: 'var(--accent)' }} />
        <span className="text-[13px] font-semibold text-content tracking-tight">Mule log → cURL</span>
        {text.trim() && (
          <span
            className="text-[10px] font-mono px-2 py-0.5 rounded-full"
            style={{
              background: `color-mix(in oklch, var(--${requests.length ? 'accent' : 'content-muted'}) 12%, transparent)`,
              color: requests.length ? 'var(--accent)' : 'var(--content-muted)',
            }}
          >
            {requests.length} request{requests.length === 1 ? '' : 's'}
          </span>
        )}
        <span className="flex-1" />
        <WindowControls />
      </header>

      <div className="flex-1 flex min-h-0">
        {/* Paste */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-line">
          <div className="h-8 shrink-0 flex items-center gap-2 px-3.5 border-b border-line-subtle">
            <span className="text-[11px] font-medium text-content-secondary flex-1">Log</span>
            {!text && (
              <button
                onClick={() => setText(SAMPLE)}
                className="inline-flex items-center h-[21px] px-2 rounded text-[10.5px] font-medium border border-line bg-surface text-content-secondary hover:border-line-secondary cursor-pointer"
              >
                Paste a sample
              </button>
            )}
            {text && (
              <button
                onClick={() => { setText(''); setPicked(0); }}
                className="inline-flex items-center h-[21px] px-2 rounded text-[10.5px] font-medium border border-line bg-surface text-content-secondary hover:border-line-secondary cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setPicked(0); }}
            spellCheck={false}
            placeholder={
              'Paste log output containing an HTTP request.\n\n' +
              'Mule writes one per call with DEBUG on\n' +
              'org.mule.service.http.impl.service.HttpMessageLogger —\n' +
              'a raw request pasted from anywhere else works too.'
            }
            className="flex-1 w-full resize-none outline-none px-3.5 py-3 text-[11.5px] font-mono leading-[1.55] bg-bg text-content-secondary"
            autoFocus
          />
        </div>

        {/* Found */}
        <div className="w-[46%] flex flex-col min-w-0">
          <div className="h-8 shrink-0 flex items-center gap-2 px-3.5 border-b border-line-subtle">
            <span className="text-[11px] font-medium text-content-secondary flex-1">cURL</span>
            <button
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(curl);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 1400);
                } catch { /* ignore */ }
              }}
              disabled={!curl}
              className="inline-flex items-center h-[21px] px-2 rounded text-[10.5px] font-medium border border-line bg-surface text-content-secondary hover:border-line-secondary cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
            <button
              onClick={() => { if (curl) { onImport(parseCurl(curl)); onClose(); } }}
              disabled={!curl}
              className="inline-flex items-center h-[21px] px-2 rounded text-[10.5px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
              title="Load this request as the payload and a starting transform"
            >
              Import
            </button>
          </div>

          {/* One row per request found, when there is more than one. */}
          {requests.length > 1 && (
            <div className="shrink-0 max-h-[132px] overflow-y-auto border-b border-line-subtle">
              {requests.map((r, i) => (
                <button
                  key={`${r.line}-${i}`}
                  onClick={() => setPicked(i)}
                  className="w-full text-left px-3.5 h-7 flex items-center gap-2 text-[11.5px] font-mono cursor-pointer transition-colors"
                  style={{
                    background: i === picked ? 'var(--accent-dim)' : 'transparent',
                    color: i === picked ? 'var(--accent)' : 'var(--content-faint)',
                  }}
                >
                  <span className="flex-1 truncate">{r.label}</span>
                  <span className="text-[10px] opacity-70">line {r.line}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 min-h-0 overflow-auto">
            {curl ? (
              <pre className="m-0 px-3.5 py-3 text-[11.5px] font-mono leading-[1.55] text-content select-text whitespace-pre-wrap">
                {curl}
              </pre>
            ) : (
              <div className="h-full flex items-center justify-center text-center px-8 text-[12px] text-content-faint leading-relaxed">
                {text.trim()
                  ? 'No HTTP request found in this text. The parser looks for a request line — GET /path HTTP/1.1 — followed by headers.'
                  : 'Paste a log on the left. Every request in it turns up here as a cURL command, ready to replay or to import as a payload and transform.'}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
