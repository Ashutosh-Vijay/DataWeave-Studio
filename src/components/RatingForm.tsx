import { useEffect, useState } from 'react';
import { invoke, isTauri } from '../bridge';
import { Icons } from './Icons';

/**
 * In-app rating: five faces and an optional comment, sent to the site's
 * /api/feedback — no GitHub account, so it works from locked-down machines.
 *
 * Nothing is sent unless the user presses Send. What is stored, and how the
 * spam limit works, is on the privacy page; the public results are at
 * ashutosh-vijay.dev/dataweave/feedback.
 */

// Both domains, in the same order as the updater's endpoints: a corporate
// filter that blocks one usually allows the other.
const ENDPOINTS = [
  'https://ashutosh-vijay.dev/dataweave/api/feedback',
  'https://dataweave-studio.pages.dev/api/feedback',
];

const FACES = [
  { rating: 1, face: '😞', label: 'Poor' },
  { rating: 2, face: '🙁', label: 'Meh' },
  { rating: 3, face: '😐', label: 'Okay' },
  { rating: 4, face: '🙂', label: 'Good' },
  { rating: 5, face: '😄', label: 'Great' },
];

/**
 * How many sessions there have been, when the prompt may next ask, and whether
 * to stop — `done` is set by a submitted rating (from anywhere) or by "Don't
 * ask again". Anything short of that only postpones it.
 */
const PROMPT_KEY = 'dw-feedback-prompt-v1';
type PromptState = { sessions: number; snoozeUntil: number; done: boolean };

function readPrompt(): PromptState {
  try {
    return { sessions: 0, snoozeUntil: 0, done: false, ...JSON.parse(localStorage.getItem(PROMPT_KEY) ?? '{}') };
  } catch {
    return { sessions: 0, snoozeUntil: 0, done: false };
  }
}

function writePrompt(s: PromptState) {
  try {
    localStorage.setItem(PROMPT_KEY, JSON.stringify(s));
  } catch {
    /* blocked storage — the prompt may ask again, nothing worse */
  }
}

async function sendFeedback(body: { rating: number; comment: string; app: string; version?: string }) {
  let urls = ENDPOINTS;
  if (import.meta.env.DEV) {
    try {
      const local = localStorage.getItem('dw.feedbackEndpoint');
      if (local) urls = [local];
    } catch {
      /* no override */
    }
  }
  // VS Code's webview CSP only allows its own origin, so the extension host
  // makes the request there.
  if (!isTauri) {
    await invoke('send_feedback', { urls, body });
    return;
  }
  let last = 'Could not reach the feedback server.';
  for (const url of urls) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (r.ok) return;
      last = ((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? `The server answered ${r.status}.`;
      // A refusal is an answer: the other domain is the same server behind it.
      if (r.status === 400 || r.status === 429) break;
    } catch {
      /* blocked or offline — try the other domain */
    }
  }
  throw new Error(last);
}

export function RatingForm({ appVersion, onDone, onSent }: { appVersion?: string; onDone: () => void; onSent?: () => void }) {
  const [rating, setRating] = useState<number | null>(null);
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  const send = async () => {
    if (!rating) return;
    setStatus('sending');
    setError('');
    try {
      await sendFeedback({ rating, comment: comment.trim(), app: isTauri ? 'desktop' : 'vscode', version: appVersion });
      setStatus('sent');
      onSent?.();
      // Rated from anywhere means the prompt has done its job.
      writePrompt({ ...readPrompt(), done: true });
    } catch (e) {
      setStatus('idle');
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (status === 'sent') {
    return (
      <div className="py-2">
        <div className="text-[13.5px] font-semibold text-content">Thank you.</div>
        <p className="text-[12px] text-content-muted mt-1 leading-relaxed">
          It really helps to know. Ratings show up on{' '}
          <span className="text-content-secondary">ashutosh-vijay.dev/dataweave/feedback</span>
          {comment.trim() ? ', and your comment will appear there once it has been read.' : '.'}
        </p>
        <button
          onClick={onDone}
          className="mt-3 h-7 px-3 rounded-md text-[12px] font-medium border border-line text-content-secondary hover:bg-surface-2 cursor-pointer"
        >
          Close
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-1.5">
        {FACES.map((f) => {
          const active = rating === f.rating;
          return (
            <button
              key={f.rating}
              onClick={() => setRating(f.rating)}
              title={f.label}
              aria-label={f.label}
              aria-pressed={active}
              className="flex-1 flex flex-col items-center gap-1 py-2 rounded-lg border cursor-pointer transition-colors"
              style={{
                borderColor: active ? 'var(--accent)' : 'var(--line)',
                background: active ? 'color-mix(in oklch, var(--accent) 12%, transparent)' : 'transparent',
              }}
            >
              <span className="text-[22px] leading-none" style={{ filter: rating && !active ? 'grayscale(1) opacity(.55)' : undefined }}>
                {f.face}
              </span>
              <span className="text-[10.5px]" style={{ color: active ? 'var(--content)' : 'var(--content-faint)' }}>{f.label}</span>
            </button>
          );
        })}
      </div>

      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value.slice(0, 1000))}
        rows={3}
        placeholder="Anything you'd like changed or added? (optional)"
        className="mt-3 w-full px-3 py-2 rounded-md text-[12.5px] leading-relaxed bg-surface-2 border border-line text-content focus:outline-none focus:border-accent resize-none"
      />
      <div className="mt-1.5 text-[11px] leading-relaxed text-content-faint">Your comment may be published.</div>

      {error && <div className="mt-2 text-[12px]" style={{ color: 'var(--err)' }}>{error}</div>}

      <div className="flex justify-end mt-3">
        <button
          onClick={send}
          disabled={!rating || status === 'sending'}
          className="h-8 px-3.5 rounded-md text-[12px] font-semibold cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
          style={{ background: 'var(--accent)', color: 'var(--accent-ink)' }}
        >
          {status === 'sending' ? 'Sending…' : 'Send'}
        </button>
      </div>
    </div>
  );
}

// Counted once per app start. A module flag rather than an effect guard, so
// React's development double-run of effects doesn't count a session twice.
let counted = false;

/**
 * The card that asks. Never in the first sessions, never the moment the app
 * opens, never as a modal. Once somebody has sent a rating it never asks
 * again; until then, dismissing it only postpones it by two weeks.
 */
export function RatingPrompt({ appVersion }: { appVersion?: string }) {
  const [show, setShow] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    const s = readPrompt();
    if (!counted) {
      counted = true;
      s.sessions += 1;
      writePrompt(s);
    }
    if (s.done || s.sessions < 3 || Date.now() < s.snoozeUntil) return;
    const t = setTimeout(() => {
      // Postponed the moment it appears, so closing the app with the card
      // open counts as "not now" rather than asking again next launch.
      writePrompt({ ...readPrompt(), snoozeUntil: Date.now() + 14 * 24 * 3600 * 1000 });
      setShow(true);
    }, 90_000);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  // The snooze was already written when the card appeared.
  const later = () => setShow(false);
  const never = () => {
    writePrompt({ ...readPrompt(), done: true });
    setShow(false);
  };

  return (
    <div
      role="dialog"
      aria-label="Rate DataWeave Studio"
      className="fixed bottom-10 right-4 z-[70] w-[360px] max-w-[calc(100vw-32px)] rounded-xl border border-line bg-surface p-4"
      style={{ boxShadow: '0 18px 50px color-mix(in oklch, oklch(0% 0 0) 45%, transparent)' }}
    >
      <div className="flex items-start gap-2 mb-3">
        <div className="flex-1">
          <div className="text-[13.5px] font-semibold text-content">How is DataWeave Studio working for you?</div>
          <div className="text-[11.5px] text-content-faint mt-0.5">Takes a second. Skipping sends nothing.</div>
        </div>
        <button onClick={later} aria-label="Not now" className="w-6 h-6 rounded-md flex items-center justify-center text-content-faint hover:bg-surface-2 cursor-pointer">
          <Icons.X size={12} />
        </button>
      </div>
      <RatingForm appVersion={appVersion} onDone={() => setShow(false)} onSent={() => setSent(true)} />
      {!sent && <div className="flex gap-3 mt-1 text-[11.5px]">
        <button onClick={later} className="text-content-faint hover:text-content cursor-pointer">Not now</button>
        <button onClick={never} className="text-content-faint hover:text-content cursor-pointer">Don&rsquo;t ask again</button>
      </div>}
    </div>
  );
}
