/**
 * Shown when the DataWeave engine never started at all.
 *
 * The old behaviour was worse than useless: the splash crawled to 85% and sat
 * there, because a Java process that endpoint security had suspended never
 * printed its handshake and never exited, so nothing ever settled. If an error
 * did arrive, it went into a one-line banner above a UI where every button was
 * dead — a whole app pretending to work with no engine behind it.
 *
 * Both hosts now time the handshake out and capture the JVM's stderr, so by the
 * time this renders there is something real to read. This screen's whole job is
 * to put that text somewhere the user can select, copy and forward to whoever
 * administers their machine, because the fix is nearly always an allowlist
 * entry rather than anything they can do themselves.
 *
 * Only for the never-started case. An engine that worked and later died keeps
 * the thin banner in App.tsx — there the UI still holds the user's work.
 */
import { useState } from 'react';

const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

export function EngineDownScreen({
  error,
  onRetry,
  retrying,
}: {
  error: string;
  onRetry: () => void;
  retrying: boolean;
}) {
  const [copied, setCopied] = useState(false);

  // The first line is a headline; everything after it is detail. Both hosts
  // build the message that way (see javaFailureMessage / try_start_java).
  const [headline, ...rest] = error.split('\n');
  const detail = rest.join('\n').trim();

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center" style={{ background: 'var(--bg)', padding: 24 }}>
      <div style={{ width: 'min(680px, 96vw)', maxHeight: '92vh', display: 'flex', flexDirection: 'column' }}>
        <div className="flex items-center" style={{ gap: 10, marginBottom: 6 }}>
          <span style={{ display: 'inline-flex', color: 'var(--err)' }}>
            <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round">
              <circle cx="12" cy="12" r="9" />
              <line x1="12" y1="8" x2="12" y2="13" />
              <line x1="12" y1="16.5" x2="12" y2="16.5" />
            </svg>
          </span>
          <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--content)' }}>
            The DataWeave engine didn&rsquo;t start
          </div>
        </div>

        <div style={{ fontSize: 12.5, lineHeight: 1.65, color: 'var(--content-muted)', marginBottom: 14 }}>
          {headline}
        </div>

        {detail && (
          <pre
            style={{
              margin: 0,
              padding: '12px 14px',
              background: 'var(--surface)',
              border: '1px solid var(--line)',
              borderRadius: 10,
              fontFamily: MONO,
              fontSize: 11,
              lineHeight: 1.7,
              color: 'var(--content-secondary)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              overflowY: 'auto',
              maxHeight: '46vh',
              userSelect: 'text',
            }}
          >
            {detail}
          </pre>
        )}

        <div className="flex items-center" style={{ gap: 9, marginTop: 16 }}>
          <button
            onClick={onRetry}
            disabled={retrying}
            className="inline-flex items-center cursor-pointer"
            style={{
              height: 30,
              padding: '0 14px',
              border: '1px solid var(--line)',
              background: 'var(--accent)',
              color: 'var(--on-accent, #fff)',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
              opacity: retrying ? 0.6 : 1,
            }}
          >
            {retrying ? 'Starting…' : 'Try again'}
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(error);
              setCopied(true);
              setTimeout(() => setCopied(false), 1800);
            }}
            className="inline-flex items-center cursor-pointer hover:text-content"
            style={{
              height: 30,
              padding: '0 14px',
              border: '1px solid var(--line)',
              background: 'var(--surface)',
              color: 'var(--content-secondary)',
              borderRadius: 8,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            {copied ? 'Copied' : 'Copy diagnostics'}
          </button>
        </div>

        <div style={{ fontSize: 11.5, lineHeight: 1.7, color: 'var(--content-faint)', marginTop: 18 }}>
          The Java runtime ships inside the app, so this is rarely a missing Java. On a
          managed machine the usual cause is application allowlisting &mdash; ManageEngine,
          Ivanti, AppLocker, Carbon Black &mdash; refusing to run an unsigned{' '}
          <span style={{ fontFamily: MONO }}>java.exe</span> from a user-writable folder.
          Copying the text above into a mail to your IT desk, asking them to allowlist the
          path it names, is the fastest route. Installing a Java 17 JDK system-wide and
          setting <span style={{ fontFamily: MONO }}>JAVA_HOME</span> also works &mdash; the
          app tries that before giving up.
        </div>
      </div>
    </div>
  );
}
