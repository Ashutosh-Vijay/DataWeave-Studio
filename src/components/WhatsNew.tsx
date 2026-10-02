/**
 * "What's new" dialog — shown once after an update (App compares the running
 * version against the last one the user saw). Lists the headline features of the
 * current release so people actually discover what changed instead of having to
 * stumble onto it. Returning users only; fresh installs get the WelcomeScreen.
 */
import { useEffect } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';
import { isTauri } from '../bridge';

interface Highlight { title: string; desc: string; tag?: string; only?: 'vscode' | 'desktop'; }
interface Release { version: string; date: string; headline: string; highlights: Highlight[]; }

// Two independent tracks, because the desktop app (2.x) and the VS Code
// extension (1.x) ship on their own version numbers and cadence — keeping them
// separate means a release that only touches one runtime never shows stale notes
// in the other. Each list is newest-first; the dialog/toast pick by runtime.
const V321_HIGHLIGHTS: Highlight[] = [
  { title: 'Shared links wait for you', tag: 'NEW',
    desc: 'A script opened from a share link or an imported Playground zip doesn’t run until you press Run, and a notice says if it uses readUrl, Java, dw::io or eval. Those can reach your files or the network, so it’s worth a read first.' },
  { title: 'A stricter Safe mode',
    desc: 'Safe mode on the local server is now enforced by the DataWeave engine itself, the same way MuleSoft’s online playground does it: readUrl, eval and run, Java, file access and environment variables are refused however a script is written. The server also turns away requests from web pages.' },
];

const V32_HIGHLIGHTS: Highlight[] = [
  { title: 'Practice DataWeave', tag: 'NEW',
    desc: '739 problems across 40 topics, from picking fields out of a payload to recursive tree walks. Write a script, fix a broken one, predict what a snippet returns, or pick the right answer. Your solution runs on the real engine against test cases you can’t see. Open it from the rail or from Tools.' },
  { title: 'Errors that name the problem', tag: 'NEW',
    desc: 'When a run fails, the error panel shows the type checker’s diagnosis, naming the expression that went wrong.' },
  { title: 'One set of workspaces on each computer', tag: 'NEW',
    desc: 'The desktop app and the VS Code extension now save to the same folder, so a workspace saved in one opens in the other. Workspaces already in the extension are copied over the first time; if both had one with the same name, the extension’s copy is marked “(VS Code)”.' },
  { title: 'Fixes', only: 'desktop',
    desc: 'The payload toolbar no longer cuts off Load file on a narrow pane.' },
  { title: 'Fixes', only: 'vscode',
    desc: 'The payload toolbar no longer cuts off Load file on a narrow pane, and the Open button in the Side Bar no longer disappears once you have saved a workspace.' },
];

const V31_HIGHLIGHTS: Highlight[] = [
  { title: 'Name your encryption key once', tag: 'NEW',
    desc: 'Encrypting a value meant pasting the same key in every single time, and picking the right one out of your head, uat or prod. Save them instead, under names you choose, and pick one from a row of chips. The key itself goes into the operating system’s own keychain (Credential Manager on Windows, Keychain on macOS, the secret service on Linux), never into a workspace file or a share link. Rename one, rotate the value behind a name, or forget it entirely.' },
  { title: 'A whole config encrypts in the time one value used to', tag: 'NEW',
    desc: 'Secure properties used to start a fresh JVM per value, a quarter of a second each, so a thirty-field config took the better part of eight seconds. The same work now happens inside the engine already running: 3ms a value, and that config finishes in under a tenth of a second. It also fixed a silent corruption on Windows, where non-English characters were being encrypted as “?” because the key and value travelled as command-line arguments.' },
  { title: 'An encrypted config is inert until Mule is told about it',
    desc: 'The file on its own does nothing. The runtime needs to know which file, which cipher, and where the key comes from. After an encrypt, a Mule config button writes that snippet out: the pom dependency, the namespace, the secure-properties config with your algorithm and mode already filled in, and the deploy-time flag that supplies the key. The key stays a placeholder, so it is safe to commit.' },
  { title: 'Replay a request that only exists in a log', tag: 'NEW',
    desc: 'Mule’s wire logger prints the whole outbound request when DEBUG is on for HttpMessageLogger. It’s the only trace of what left an environment you can’t attach to, and it’s unusable because you have to retype it into cURL by hand. Paste the log instead: every request in it comes back as a cURL command, and Import hands one to the cURL importer, which turns it into a payload, a context and a starting transform. Log to a script under test, nothing retyped.' },
  { title: 'A cURL can leave as the connector call that makes it',
    desc: 'A pasted cURL can now leave as the Mule elements that perform it (an http:request-config for the host and an http:request with headers, query params and body), in a tab beside the generated script. It keeps what the command actually said: -u becomes basic auth (with the password left as a property placeholder, so the snippet is safe to commit), -L becomes followRedirects, --max-time becomes responseTimeout. A toggle switches the values between the ones the cURL used and attributes.queryParams.region. The second is what a flow behind an HTTP listener wants, forwarding what it was given with no transform in between. And config encryption grew a To properties / To YAML button, because Mule reads both and which one a project uses was decided years ago by somebody else.' },
  { title: 'The Side Bar does the work now, instead of opening the app', tag: 'NEW', only: 'vscode',
    desc: 'It held one button that opened the panel. It now has three views that answer things without leaving the editor: your saved workspaces, with a click to open one; a search across all 361 DataWeave functions, with Insert and Copy on any signature; and secure properties, encrypting or decrypting a value on the spot with your saved keys.' },
  { title: 'The engine writes the test', tag: 'NEW',
    desc: 'Put the cursor on a fun declaration and press Ctrl+. and the engine generates a dw::test suite for that function, with its cases laid out and the function carried in, as a new Tests entry ready to run. Doc comments are checked as you type, too, in the same pass as the type checker.' },
  { title: 'Your AI assistant can ask what a lambda parameter actually is', tag: 'NEW',
    desc: 'A tenth MCP tool. Inside items map ((item, i) -> …), writing the body means knowing what item is, and the engine knows: { price: Number, name: String }, inferred from your sample payload. Until now the only way to find out was to run the thing and read the error. It answers at any line and column, which is what run and lint already report.' },
  { title: 'The app knows what day it is', tag: 'NEW',
    desc: 'On Diwali, Holi, Halloween, Christmas and New Year the startup screen dresses up with lamps, gulal, a burning scarecrow, a tree that draws itself on or a snowman, and the bars and empty panels get a little of it too. Never over an editor, never over a line of text. Keeping the colours for the whole app is a question asked once per festival, and Settings → Appearance turns the lot off. Vampire is in there as well, for any day you like.' },
  { title: 'Fixes',
    desc: 'A workspace saved with a partial request context took the whole app down on open. Every backend error in the crypto tools rendered as an empty red box, because Tauri rejects with a plain string and the code read .message off it. Two refactor entries in the lightbulb menu did nothing at all (the engine declines every selection), so they are gone.' },
];

const V30_HIGHLIGHTS: Highlight[] = [
  { title: 'A real debugger', tag: 'NEW', only: 'desktop',
    desc: 'Click the gutter beside a line number to set a breakpoint and press Debug. The script stops there and you get the call stack, every variable in scope, step over / into / out, and a box to evaluate any expression against the paused frame. It is the engine’s own debugger, running in-process, so there’s no port to open and no second process to attach.' },
  { title: 'Every value, without a single log()', tag: 'NEW',
    desc: 'A Trace panel under the output lists what each expression in your script evaluated to, in source order; click a row to jump to it. A map body that ran 500 times is one row with a count rather than 500 rows, and a script that fails shows everything it worked out before the throw. It replaces wrapping an expression in log() and then having to take it back out, and it is on by default.' },
  { title: 'Tests you can actually trust', tag: 'NEW',
    desc: 'The snapshot runner is gone. In its place are real dw::test suites, the same framework MuleSoft ships, with named assertions, the engine’s own failure messages and the line that failed. The old runner only ever answered “did the output change”, and went stale the moment a transform legitimately changed.' },
  { title: 'Check against the Mule you actually deploy to', tag: 'NEW',
    desc: 'Point Studio at your runtime (Mule 4.1 through 4.12) and anything newer stops being a surprise on the server. A 2.10 function on a 4.4 runtime now fails here, in the editor, with the version that introduced it. It gates the compiler and the runtime’s own version-dependent behaviour, not just a lint, and it applies to Run, the Tests panel and the editor’s diagnostics alike.' },
  { title: 'Encrypt a whole config, not one value at a time', tag: 'NEW',
    desc: 'A new page takes a YAML or .properties config and encrypts every value at once, or decrypts one so you can read it. Values already written as ![…] are left alone rather than encrypted twice, comments and layout survive untouched, and every field is listed with what will happen to it before anything runs.' },
  { title: 'The editor caught up with the engine',
    desc: 'Diagnostics now come with fixes you can apply, colouring comes from the parsed syntax tree instead of text patterns, and hovers render the real documentation instead of raw AsciiDoc markup. Studio can generate a doc comment from a function’s signature, generate realistic sample data from a declared type, and it warns when a script hashes with MD5 or leaves a log() behind.' },
  { title: 'DataWeave 2.12, and 52 functions nobody documented',
    desc: 'The bundled engine moves to 2.12 and the reference was regenerated against it. Beyond that, the reference now covers the modules MuleSoft’s own docs leave out entirely (all 25 dw::test::Asserts matchers, the file module, protobuf), read from the doc comments inside the engine itself. 309 functions to 361.' },
  { title: 'Your AI assistant can test and lint, not just run', tag: 'NEW',
    desc: 'The MCP server grew from six tools to nine. An agent can now run a dw::test suite and get back which assertions passed, type-check a script without running it at all, which helps when there’s no sample payload, and ask for every expression’s value when a transform compiles but the output is wrong. Encrypting a config over MCP is one call for the whole file rather than one per secret. Its offline reference had also been stuck at 309 functions and 83 recipes since June; it now serves the same 361 and 172 the app does.' },
  { title: 'Less in the way',
    desc: 'Run follows the pane you are in, so pressing it with the Tests panel open runs the suite instead of silently running the script. Debug is a toggle rather than a start button with a stop hidden elsewhere. The target runtime moved to the status bar and auto-run and trace moved into a caret beside Run, which took five controls out of the top bar. And the engine now says why it failed to start instead of sitting at 85%.' },
];

// Newest first. The dialog opens on the running version and lists the rest
// below it, so someone who skipped a release still finds it. Releases before
// 3.0.0 had separate desktop and extension version numbers; the dialog links
// to GitHub for those.
const DESKTOP_RELEASES: Release[] = [
  { version: '3.2.1', date: 'October 2026', headline: 'Safer shared links', highlights: V321_HIGHLIGHTS },
  { version: '3.2.0', date: 'September 2026', headline: 'Practice DataWeave, graded by the real engine', highlights: V32_HIGHLIGHTS },
  { version: '3.1.0', date: 'September 2026', headline: 'Stop retyping the key', highlights: V31_HIGHLIGHTS },
  { version: '3.0.0', date: 'September 2026', headline: 'Stop guessing what your script did', highlights: V30_HIGHLIGHTS },
];

const VSCODE_RELEASES: Release[] = [
  { version: '3.2.1', date: 'October 2026', headline: 'Safer shared links', highlights: V321_HIGHLIGHTS },
  { version: '3.2.0', date: 'September 2026', headline: 'Practice DataWeave, graded by the real engine', highlights: V32_HIGHLIGHTS },
  { version: '3.1.0', date: 'September 2026', headline: 'Stop retyping the key', highlights: V31_HIGHLIGHTS },
  { version: '3.0.0', date: 'September 2026', headline: 'Stop guessing what your script did', highlights: V30_HIGHLIGHTS },
];

const RELEASES: Release[] = isTauri ? DESKTOP_RELEASES : VSCODE_RELEASES;

export function getRelease(version: string): Release | null {
  return RELEASES.find((r) => r.version === version) ?? null;
}
export function hasWhatsNew(version: string): boolean {
  return getRelease(version) !== null;
}
/** Newest release version for this runtime — what the release toast announces / opens. */
export const LATEST_VERSION = RELEASES[0]?.version ?? '';

const svg = (paths: React.ReactNode, size = 16) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">{paths}</svg>
);

export function WhatsNew({ version, onClose }: { version: string; onClose: () => void }) {
  // Exact match for the running build, else the newest release (the toast opens
  // it without a version, and VS Code can't read the Tauri app version).
  const release = getRelease(version) ?? RELEASES[0] ?? null;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!release) return null;

  // Some highlights only apply to one runtime (e.g. VS Code theme adoption).
  const visible = (r: Release) => r.highlights.filter((h) => !h.only || (h.only === 'vscode' ? !isTauri : isTauri));
  const highlights = visible(release);
  const earlier = RELEASES.filter((r) => r !== release);

  return (
    <div className="fixed inset-0 z-[126] grid place-items-center" style={{ background: 'color-mix(in oklch, var(--bg) 70%, transparent)', backdropFilter: 'blur(3px)', fontSize: 13 }} onClick={onClose}>
      <style>{`@keyframes wnPop { from { opacity:0; transform: translateY(14px) scale(.98) } to { opacity:1; transform: none } }`}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ width: 'min(560px, calc(100vw - 40px))', maxHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 16, boxShadow: '0 30px 80px rgba(0,0,0,.55)', animation: 'wnPop .3s cubic-bezier(.2,.9,.3,1) both', overflow: 'hidden' }}
      >
        {/* header */}
        <div style={{ padding: '20px 22px 16px', borderBottom: '1px solid var(--line-subtle)', background: 'linear-gradient(150deg, color-mix(in oklch, var(--accent) 12%, var(--surface)), var(--surface))' }}>
          <div className="flex items-center" style={{ gap: 9 }}>
            <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: 0.8, textTransform: 'uppercase', color: 'var(--accent-ink)', background: 'var(--accent)', padding: '3px 8px', borderRadius: 6 }}>What’s new</span>
            <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, color: 'var(--content-faint)' }}>v{version || release.version} · {release.date}</span>
            <div className="flex-1" />
            <button onClick={onClose} className="grid place-items-center cursor-pointer hover:text-content" style={{ width: 26, height: 26, border: 'none', background: 'transparent', borderRadius: 7, color: 'var(--content-faint)' }} title="Close (Esc)">
              {svg(<><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>, 15)}
            </button>
          </div>
          <h2 style={{ margin: '12px 0 0', fontSize: 22, fontWeight: 800, letterSpacing: -0.5 }}>{release.headline}</h2>
        </div>

        {/* highlights */}
        <div style={{ padding: '8px 22px 4px', overflowY: 'auto' }}>
          {highlights.map((h) => (
            <div key={h.title} className="flex items-start" style={{ gap: 12, padding: '13px 0', borderBottom: '1px solid var(--line-subtle)' }}>
              <span className="grid place-items-center shrink-0" style={{ width: 28, height: 28, borderRadius: 8, marginTop: 1, color: 'var(--accent)', background: 'var(--accent-dim)', border: '1px solid var(--accent-border)' }}>
                {svg(<><polyline points="20 6 9 17 4 12" /></>, 15)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="flex items-center" style={{ gap: 8 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: -0.2 }}>{h.title}</span>
                  {h.tag && <span style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.6, padding: '2px 6px', borderRadius: 5, color: 'var(--accent-ink)', background: 'var(--accent)' }}>{h.tag}</span>}
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--content-muted)', lineHeight: 1.55, marginTop: 3 }}>{h.desc}</div>
              </div>
            </div>
          ))}

          {/* Every other release, so someone who skipped one still finds it. */}
          {earlier.length > 0 && (
            <div style={{ padding: '16px 0 10px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', color: 'var(--content-faint)', marginBottom: 4 }}>Earlier releases</div>
              {earlier.map((r) => (
                <details key={r.version} style={{ borderBottom: '1px solid var(--line-subtle)' }}>
                  <summary className="flex items-baseline cursor-pointer hover:text-content" style={{ gap: 10, padding: '10px 0', listStyle: 'none', color: 'var(--content-secondary)' }}>
                    <span style={{ fontFamily: "'JetBrains Mono', ui-monospace, monospace", fontSize: 11, color: 'var(--content-faint)', minWidth: 42 }}>v{r.version}</span>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{r.headline}</span>
                    <span className="flex-1" />
                    <span style={{ fontSize: 11, color: 'var(--content-faint)' }}>{r.date}</span>
                  </summary>
                  <div style={{ padding: '0 0 10px 52px' }}>
                    {visible(r).map((h) => (
                      <div key={h.title} style={{ padding: '6px 0' }}>
                        <div style={{ fontSize: 12.5, fontWeight: 600 }}>{h.title}</div>
                        <div style={{ fontSize: 12, color: 'var(--content-muted)', lineHeight: 1.55, marginTop: 2 }}>{h.desc}</div>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
              <button
                onClick={() => openUrl('https://github.com/Ashutosh-Vijay/DataWeave-Studio/releases')}
                className="cursor-pointer hover:text-content"
                style={{ marginTop: 10, border: 'none', background: 'transparent', padding: 0, fontSize: 12, color: 'var(--content-faint)' }}
              >
                Releases before 3.0 are on GitHub ↗
              </button>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex items-center" style={{ padding: '14px 22px', borderTop: '1px solid var(--line-subtle)', gap: 10 }}>
          <span style={{ fontSize: 11.5, color: 'var(--content-faint)' }}>Click a tool in the left rail and we’ll explain it the first time.</span>
          <div className="flex-1" />
          <button onClick={onClose} className="cursor-pointer hover:brightness-110" style={{ height: 34, padding: '0 20px', borderRadius: 9, border: '1px solid var(--accent)', background: 'var(--accent)', color: 'var(--accent-ink)', fontSize: 13, fontWeight: 600 }}>
            Start exploring
          </button>
        </div>
      </div>
    </div>
  );
}
