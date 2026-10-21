/**
 * What every Console screen shares (decision 0066): how a screen reads on demand and reads again after its own act,
 * and the two frames it draws while it has nothing to show: reading, or what could not be read, in the kit's card.
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { CONSOLE_WORDS } from "@chanlytics/contracts";
import { FailedRead } from "../kit/empty/empty";
import type { LegacyFlash } from "../legacy-verbs";
import type { Read } from "./verbs";

export type Flash = (f: LegacyFlash) => void;
/** The reader's own time zone: a day the Console names is the day on their calendar. */
export function viewerZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/** Where the one opened stands beside its list (Support's queue, Health's looks): from the kit's 900px down, a sheet. */
const BESIDE = "(min-width: 901px)";
function hearWidth(changed: () => void): () => void {
  if (typeof window === "undefined" || !window.matchMedia) return () => undefined;
  const m = window.matchMedia(BESIDE);
  m.addEventListener("change", changed);
  return () => m.removeEventListener("change", changed);
}
const besideFits = (): boolean => !!window.matchMedia && window.matchMedia(BESIDE).matches;
export const useBeside = (): boolean => useSyncExternalStore(hearWidth, besideFits, () => true);

/** A key pressed where it types is the field's, never the list's. */
export const typingIn = (t: EventTarget | null): boolean =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/** Moves the Console to one of its addresses, as a pushed entry the page follows. */
export type Go = (path: string) => void;

/** A screen's read: what it holds, why it could not be had, and a way to ask again (after an act, or by hand). */
export interface ConsoleRead<T> {
  data: T | null;
  problem: string | null;
  missing: boolean;
  busy: boolean;
  again: () => void;
}

/**
 * Read on open and again when asked. What was read stays on screen while it is read again, so an act's re-read never
 * blanks the page; a read that throws is a failed read like any other, never a page left reading.
 */
export function useConsoleRead<T>(read: () => Promise<Read<T>>, key: string): ConsoleRead<T> {
  const [data, setData] = useState<T | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(true);
  const [turn, setTurn] = useState(0);
  const latest = useRef(read);
  latest.current = read;
  useEffect(() => {
    let on = true;
    setBusy(true);
    Promise.resolve()
      .then(() => latest.current())
      .then(
        (r) => {
          if (!on) return;
          setBusy(false);
          if (r.ok) {
            setData(r.data);
            setProblem(null);
            setMissing(false);
          } else {
            setProblem(r.message || CONSOLE_WORDS.failed);
            setMissing(r.missing);
          }
        },
        () => {
          if (!on) return;
          setBusy(false);
          setProblem(CONSOLE_WORDS.failed);
        },
      );
    return () => {
      on = false;
    };
  }, [key, turn]);
  const again = useCallback(() => setTurn((n) => n + 1), []);
  return { data, problem, missing, busy, again };
}

/** A section that says one thing while its screen reads. */
export function ScreenReading({ words = CONSOLE_WORDS.reading }: { words?: string }) {
  return (
    <section className="rec-card set-card" data-testid="console-reading">
      <div className="set-row">
        <div className="set-row-info">
          <span className="set-row-hint">{words}</span>
        </div>
      </div>
    </section>
  );
}

/** What could not be read, in the kit's failed card, with its way to read again. */
export function ScreenFailed({
  what,
  why,
  busy,
  again,
  testid,
}: {
  what: string;
  why: string;
  busy: boolean;
  again: () => void;
  testid: string;
}) {
  return (
    <section className="rec-card set-card">
      <FailedRead
        kind="card"
        what={what}
        why={why}
        body={CONSOLE_WORDS.failedBody}
        onRetry={again}
        busy={busy}
        testid={testid}
      />
    </section>
  );
}

/** A section of a screen: its title, the line beside it, what it holds. */
export function ScreenSection({
  title,
  sub = null,
  aside = null,
  children,
  testid,
}: {
  title: ReactNode;
  sub?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  testid: string;
}) {
  return (
    <section className="rec-card set-card" data-testid={testid}>
      <div className="rec-card-head">
        <h2 className="rec-card-title">{title}</h2>
        {sub ? <span className="rec-card-sub">{sub}</span> : null}
        {aside}
      </div>
      {children}
    </section>
  );
}

/** One line that says a list is empty, in a list's own row. */
export function NoneRow({ words, testid }: { words: string; testid?: string }) {
  return (
    <div className="set-row" data-testid={testid}>
      <div className="set-row-info">
        <span className="set-row-hint">{words}</span>
      </div>
    </div>
  );
}
