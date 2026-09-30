/**
 * Live's list: who is on the phone right now (moved from legacy/pages/live-monitor.jsx, decision 0015). A row per call
 * in progress, drawn the way the Inbox draws a conversation, and what the line is doing when nobody is on it.
 */
import type { KeyboardEvent } from "react";
import type { LiveCallVM, LiveLineVM } from "@chanlytics/contracts";
import { navigate } from "../legacy-verbs";
import { FailedRead } from "../kit/empty/empty";
import { Icon } from "../kit/icon/icon";
import { LrPill, lrClock } from "./call-parts";

// The last thing the caller said, for the row's second line: what the call is about, in their words.
const lrLastSaid = (c: LiveCallVM) => {
  const said = [...(c.transcript || [])].reverse().find((t) => t.speaker === "client" && t.text);
  return said ? said.text : null;
};

interface LrRowProps {
  c: LiveCallVM;
  active: boolean;
  elapsed: number;
  onSelect: (callId: string) => void;
  order?: string[];
}

// A call in progress, drawn the way the Inbox draws a conversation -- Live is a view of the same door
// (#655), and it was a table: When · Length · From, 400px wide, so pressing Live moved the list's edge
// and changed its language. The same 32px avatar with the caller's initials, the name and the running
// clock on the first line, what they last said on the second, the pill on the third.
//
// A row takes the keyboard: it is a button, so Tab reaches it; Enter or Space opens it, and the arrows
// open and focus the call beside it (`order` is every row's id as the list draws them).
const LrRow = ({ c, active, elapsed, onSelect, order = [] }: LrRowProps) => {
  const onKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onSelect(c.callId);
      return;
    }
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = order[order.indexOf(c.callId) + step];
    if (!next) return;
    onSelect(next);
    const list = e.currentTarget.closest ? e.currentTarget.closest(".lm-list") : null;
    const row = list ? list.querySelector<HTMLElement>(`[data-call-id="${next}"]`) : null;
    if (row) row.focus();
  };
  const said = lrLastSaid(c);
  return (
    <button
      type="button"
      className={`lm-row ${active ? "active" : ""}`}
      onClick={() => onSelect(c.callId)}
      onKeyDown={onKey}
      aria-current={active ? "true" : undefined}
      data-call-id={c.callId}
      data-testid="live-row"
    >
      <span className="lm-row-dot" aria-hidden="true">
        {c.live && !c.checking && <span className="live-dot" />}
      </span>
      <span className="lm-row-avatar">{c.initials}</span>
      <span className="lm-row-body">
        <span className="lm-row-line1">
          <span className="lm-row-who">{c.who}</span>
          <span className="lm-row-clock tabular">{lrClock(elapsed)}</span>
        </span>
        <span className={`lm-row-said ${said ? "" : "is-waiting"}`}>
          {said ? <>&ldquo;{said}&rdquo;</> : "The receptionist has picked up"}
        </span>
        <span className="lm-row-foot">
          <LrPill c={c} />
          <span className="lm-row-since">since {c.startedLabel}</span>
        </span>
      </span>
    </button>
  );
};

const LrLineNote = ({ line, lineRead = true }: { line: LiveLineVM | null; lineRead?: boolean }) => {
  // The channels read failed: the line's state is unknown, not absent.
  if (!lineRead)
    return (
      <FailedRead
        kind="line"
        what="the phone line"
        body="Calls still show here; whether the line is on is unknown until it reads."
        surface="live"
        testid="live-line-failed"
      />
    );
  if (line === null)
    return <div className="lm-line-note">No call in progress. This workspace has no phone line yet.</div>;
  if (!line.on)
    return (
      <div className="lm-line-note">
        No call in progress. The line is switched off — the receptionist is not picking up.
      </div>
    );
  return (
    <div className="lm-line-note">
      No call in progress. The line is on
      {line.number ? (
        <>
          {" "}
          — <span className="tabular">{line.number}</span>
        </>
      ) : null}
      .
    </div>
  );
};

interface LrListProps {
  live: LiveCallVM[];
  line: LiveLineVM | null;
  lineRead?: boolean;
  activeId: string | null;
  elapsedOf: (c: LiveCallVM) => number;
  onSelect: (callId: string) => void;
}

// The list is who is on the phone right now, and nothing else. It also drew a "Recent" table of the
// last calls -- the same calls Conversations › Calls lists with their transcripts and recordings, as
// this list's own footer said. With nobody on the line it says what the line is doing and opens those.
// A finished call still opens here from a door that names it (the bar, Today): the panel shows it.
export const LrList = ({ live, line, lineRead = true, activeId, elapsedOf, onSelect }: LrListProps) => {
  const order = live.map((c) => c.callId);
  const dot = (
    <span
      className="live-dot"
      style={{ width: 6, height: 6, ...(live.length ? {} : { opacity: 0.35, animation: "none" }) }}
    />
  );
  return (
    <aside className="lm-list">
      <div className="lm-list-head">
        <span className="lm-list-label">{dot} Right now</span>
        <span className="lm-list-count tabular">
          {live.length} {live.length === 1 ? "call" : "calls"}
        </span>
      </div>
      {live.length ? (
        <div className="lm-rows">
          {live.map((c) => (
            <LrRow
              key={c.callId}
              c={c}
              active={activeId === c.callId}
              elapsed={elapsedOf(c)}
              onSelect={onSelect}
              order={order}
            />
          ))}
        </div>
      ) : (
        <LrLineNote line={line} lineRead={lineRead} />
      )}
      <button
        type="button"
        className="lm-list-door"
        onClick={() => navigate("conversations/phone")}
        data-testid="live-to-calls"
      >
        <span>
          Every call, with its transcript and recording, is in <b>Conversations &rsaquo; Calls</b>
        </span>
        <Icon name="arrow-right" size={12} />
      </button>
    </aside>
  );
};
