/**
 * The two lines under the top bar (moved from legacy/components/topbar.jsx, the one-system plan's step 7d): a call going
 * on, and the shell's one status. The frame's JSX draws them by their old names (`LiveCallBar`, `ShellStatusBar`,
 * frame-globals.ts) until the frame itself is TypeScript (step 7e). And yesterday's visits nobody has marked, in the
 * call's place while no call is up (`UnmarkedVisitsBar`).
 */
import { useEffect, useReducer, useState } from "react";
import { VISIT_ASK_WORDS, todayVisitsAsked, todayVisitsSub, type CalendarLike } from "@chanlytics/contracts";
import { surfaceValue } from "../../surface-values";
import { visitWordHere } from "../../workspace-word";
import { frameChrome, frameGlyph, frameSurfaceHook } from "../frame-window";

const CLOCK_SECOND_MS = 1000;

/** The live surface's hook, where the frame has one: drawn again when the calls are read again. */
/** No redraw hook where the frame has none (the standalone mockup's): nothing is read again, so nothing moves. */
const useNoSurface = (): number => 0;
const useLiveRead = () => {
  const useSurface = frameSurfaceHook() ?? useNoSurface;
  useSurface("live");
};

/** The bars that move while a call lasts: drawn once, moved by the stylesheet, held still where motion is not welcome. */
const LIVE_WAVE = Array.from({ length: 6 }, (_, i) => <i key={i} />);

/**
 * The live call, in the header (Ruben, 20 Oct 2026: never on the page): who is on the phone right now, and how long. A call
 * in progress is the most time-critical thing this product knows, and it is true for minutes a week, so it is a capsule in
 * the header's row while it is happening, on every page, on a phone and on a desk, and a press opens Live, where handing
 * over and ending ask before they act. One call is its caller's name and clock, two their first names and a clock each,
 * three or more the count alone (contracts liveBar). The rule for "still up" is contracts' (liveStillUp), the same one the
 * Live page applies between refreshes. Where it stands in the header is components.css's.
 */
export function LiveCallBar() {
  const Glyph = frameGlyph();
  const [, tick] = useReducer((n: number) => n + 1, 0);
  // Drawn again when the calls are read again (the live surface's own signal): a call ended on Live, or by the caller, is
  // a row that changed on the live feed, and nothing else announces it.
  useLiveRead();
  const chrome = frameChrome();
  const bar = chrome && chrome.liveBar ? chrome.liveBar(window.__LIVE, Date.now()) : null;
  // A second, so the clocks read like clocks, and only while a call is up.
  const up = !!bar;
  useEffect(() => {
    if (!up) return undefined;
    const t = window.setInterval(tick, CLOCK_SECOND_MS);
    return () => window.clearInterval(t);
  }, [up]);
  if (!bar) return null;
  const open = () => window.CHANLY?.nav?.(bar.callId ? `live/${bar.callId}` : "live");
  const clock = (sinceMs: number | null) =>
    sinceMs === null ? null : (
      <span className="live-bar-clock tabular">
        {chrome && chrome.fmtClock ? chrome.fmtClock(Math.floor(sinceMs / CLOCK_SECOND_MS)) : ""}
      </span>
    );
  const [only] = bar.calls;
  return (
    <button
      type="button"
      className="live-bar"
      onClick={open}
      aria-label={bar.label}
      data-count={bar.count}
      data-testid="live-bar"
    >
      <span className="live-bar-dot" aria-hidden="true" />
      <span className="live-bar-text">{bar.lead}</span>
      <span className="live-bar-more">{bar.more}</span>
      {bar.count === 1 && only ? clock(only.sinceMs) : null}
      {bar.count === 2 && (
        <span className="live-bar-calls" data-testid="live-bar-calls">
          {bar.calls.map((c, i) => (
            <span key={c.who + i}>
              {i > 0 && " · "}
              {c.who} {clock(c.sinceMs)}
            </span>
          ))}
        </span>
      )}
      {bar.checking && <span className="live-bar-checking">still marked live · checking</span>}
      <span className="live-bar-wave" aria-hidden="true">
        {LIVE_WAVE}
      </span>
      <span className="live-bar-act">
        <span className="live-bar-act-words">{bar.act}</span>
        <Glyph name="chevron" size={11} />
      </span>
    </button>
  );
}

/** The Calendar's hook, where the frame has one: drawn again when its weeks are read again, or the day turns. */
const useCalendarRead = () => {
  const useSurface = frameSurfaceHook() ?? useNoSurface;
  useSurface("calendar");
};

/**
 * Yesterday's visits nobody has marked, in the header (Ruben, 20 Oct 2026: off the Calendar's page, into the header, as
 * the live call is): the island's place, on every page but Today, whose queue asks each one by name with Kept and Missed. A
 * call going on outranks it and has the place while it lasts (components.css), and where the date's place holds a way back,
 * or a thread has taken the screen, it stands down rather than push the page. Counted by Today's own rule (contracts
 * todayVisitsAsked) over the Calendar's weeks as the tab holds them: nothing is read for it, and nothing is claimed while
 * those weeks are unread or could not be. A press opens the first, asking "Did they come?", as the Calendar's line did.
 */
export function UnmarkedVisitsBar({ page }: { page: string }) {
  const Glyph = frameGlyph();
  useCalendarRead();
  if (page === "today") return null;
  const cal = surfaceValue("calendar");
  const word = visitWordHere();
  const asked =
    cal && cal.vm && cal.vm.feed.state === "ok" ? todayVisitsAsked(cal.vm as CalendarLike, Date.now(), word) : null;
  const first = asked?.items.at(0);
  if (!asked || !first) return null;
  const lead = todayVisitsSub(asked.count, word);
  return (
    <button
      type="button"
      className="unmarked-bar"
      onClick={() => window.CHANLY?.nav?.(first.to)}
      aria-label={`${lead}. ${VISIT_ASK_WORDS.question}`}
      data-testid="unmarked-bar"
    >
      <span className="unmarked-bar-ring" aria-hidden="true" />
      <span className="unmarked-bar-text">{lead}</span>
      <span className="unmarked-bar-act">
        <span className="unmarked-bar-act-words">{VISIT_ASK_WORDS.question}</span>
        <Glyph name="chevron" size={11} />
      </span>
    </button>
  );
}

// The shell's one line, under the top bar: this device offline, the receptionist paused, a newer build, surfaces that
// stopped refreshing, the live feed not coming through -- one at a time, with the one press that helps. Which one, its
// words and its press are contracts' (chrome.ts shellStatusLine); the status is the bridge's (legacy-bridge/shell.ts). The
// live region stays mounted while all is well, so the next change is announced.
const SHELL_STATUS_ICON: Record<string, string> = {
  offline: "alert",
  paused: "pause",
  preview: "eye",
  stale: "sparkle",
  degraded: "clock",
  disconnected: "bolt",
};

/** What redraws the line: the shell's status, the billing surface (the pause rides with it), and a preview of a role. */
function useStatusRedraws() {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  useEffect(() => {
    const evs = ["shell:status", "surface:billing", "team:changed"];
    evs.forEach((e) => window.addEventListener(e, bump));
    return () => evs.forEach((e) => window.removeEventListener(e, bump));
  }, []);
}

/** The line as contracts word it, from the bridge's status, the workspace's pause and an owner's preview of a role. */
const statusLineNow = () => {
  // The pause rides with the billing surface: the webhook writes the row, the surface repaints, the line says so.
  const B = window.__BILLING_ACCOUNT;
  const paused = !!(B && window.__billing && window.__billing.vm(B.dto).paused);
  const previewing = (window.ST_STORE && window.ST_STORE.viewAsRole) || null;
  const chrome = frameChrome();
  return chrome
    ? chrome.statusLine({ ...(window.__SHELL_STATUS || { stale: false, degraded: [] }), paused, previewing })
    : null;
};

type StatusLine = NonNullable<ReturnType<typeof statusLineNow>>;

/** The line's one press: Billing, out of the preview, a reload, or every surface read again (busy, not disabled). */
const pressOf = (line: StatusLine | null, busy: boolean, setBusy: (b: boolean) => void) => () => {
  if (!line) return;
  if (line.action === "billing") {
    window.CHANLY?.nav?.("admin/billing");
    return;
  }
  if (line.action === "exit-preview") {
    if (window.ST_STORE && window.ST_STORE.setViewAs) window.ST_STORE.setViewAs(null);
    return;
  }
  if (line.action === "reload") {
    window.location.reload();
    return;
  }
  // Busy, not disabled: the focus stays on the button, and a second press waits for the first read.
  if (line.action === "retry" && window.__shell && !busy) {
    setBusy(true);
    void Promise.resolve(window.__shell.retry())
      .catch(() => {})
      .then(() => setBusy(false));
  }
};

export function ShellStatusBar() {
  const Glyph = frameGlyph();
  useStatusRedraws();
  const [busy, setBusy] = useState(false);
  const line = statusLineNow();
  const press = pressOf(line, busy, setBusy);
  return (
    <div className="shell-status-slot" role="status" aria-live="polite">
      {line && (
        <div className={`shell-status tone-${line.tone}`} data-kind={line.kind} data-testid="shell-status">
          <Glyph name={SHELL_STATUS_ICON[line.kind] || "alert"} size={13} />
          <span className="shell-status-words">
            <span className="shell-status-text">{line.text}</span>
            {line.detail && <span className="shell-status-detail">{line.detail}</span>}
          </span>
          {line.cta && (
            <button
              type="button"
              className="btn btn-sm shell-status-cta"
              onClick={press}
              aria-busy={busy || undefined}
              data-testid="shell-status-cta"
            >
              {busy && line.busy ? line.busy : line.cta}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
