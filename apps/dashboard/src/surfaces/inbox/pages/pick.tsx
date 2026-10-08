/**
 * A pick: rows chosen for one act over all of them. What the Inbox's list and Conversations' both draw and run -- the
 * row's box, the select-all over the rows, the bar of acts, the archive question, the keys, and the acts themselves.
 *
 * It was the Inbox list's alone (inbox-list.tsx, inbox-bulk.tsx), so Conversations, the tab beside it, drew the same
 * people with no box to pick them by (Ruben, 7 Oct 2026). Written once here, the two tabs cannot part again: a row
 * says what it is (types.ts `Picked`), and the bar offers what applies to the rows picked -- the reader's own mark
 * where a person is behind one, Snooze and Archive where a thread is.
 */
import type { KeyboardEvent } from "react";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import { seePeople, unseePeople } from "../../seen";
import { ixRefusedWords } from "../rules";
import { canDo, gate, type Flash } from "../shell";
import { OWN_VERBS } from "../store";
import type { Picked } from "../types";
import { inboxBulk, type BulkVerb } from "../verbs";

/* ------------------------------------ the boxes ------------------------------------ */

/** The mouse's box on a row: the row itself says selected to a screen reader, and Space picks it. */
export function pickBox(p: { picked: boolean; onToggle: () => void }) {
  return (
    <input
      type="checkbox"
      className="ix-thread-check"
      checked={p.picked}
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        e.stopPropagation();
        p.onToggle();
      }}
      onClick={(e) => e.stopPropagation()}
    />
  );
}

/** The select-all box, over the rows' own boxes: `ids` are the rows on screen that can be picked. */
export function pickAll(p: { ids: string[]; selected: string[]; onToggle: (id: string) => void; onClear: () => void }) {
  const { ids, selected, onToggle, onClear } = p;
  const allSelected = ids.length > 0 && ids.every((id) => selected.includes(id));
  return (
    <label className="ix-checkall" title={allSelected ? "Clear the selection" : `Select all ${ids.length}`}>
      <input
        type="checkbox"
        checked={allSelected}
        aria-label={
          allSelected ? "Clear the selection" : `Select all ${ids.length} conversation${ids.length === 1 ? "" : "s"}`
        }
        onChange={() => {
          if (allSelected) onClear();
          else ids.forEach((id) => !selected.includes(id) && onToggle(id));
        }}
      />
    </label>
  );
}

/* ------------------------------------ the bar ------------------------------------ */

/**
 * The reader's mark over a pick, by the one rule the bar's word and the act both read: read while anyone picked is new
 * to the reader, else unread, and whom that marks. Null where nobody is behind the rows picked.
 */
export function pickMark<T extends { personId: string | null; unread: boolean }>(
  picks: T[],
): { seen: boolean; whom: T[] } | null {
  const people = picks.filter((p) => !!p.personId);
  if (!people.length) return null;
  const seen = people.some((p) => p.unread);
  return { seen, whom: people.filter((p) => p.unread === seen) };
}

/** What the bar says of the reader's mark. */
const pickMarkWords = (seen: boolean): string => (seen ? "Mark as read" : "Mark as unread");

/**
 * What is picked: the count, and the acts over it. An act the rows picked cannot take is not offered (`null`): the
 * mark with nobody behind them, Snooze and Archive with no thread.
 */
export function pickBar(p: {
  count: number;
  /** The act running, "snooze" or "archive", for the bar to say so. */
  busy: string | null;
  /** The mockup's own act, over seeded threads that hold a plan. */
  approve?: (() => void) | null;
  mark: { seen: boolean; press: () => void } | null;
  snooze: (() => unknown) | null;
  archive: (() => unknown) | null;
  clear: () => void;
}) {
  const { count, busy, approve = null, mark, snooze, archive, clear } = p;
  return (
    <div className="ix-bulk" data-testid="pick-bar">
      <span className="ix-bulk-count tabular">{count} selected</span>
      <div className="ix-bulk-actions">
        {approve && (
          <Button
            variant="primary"
            size="sm"
            onClick={approve}
            title="Approves selected approvals with ≥80% confidence"
            {...gate("approve")}
          >
            Approve all safe
          </Button>
        )}
        {mark && (
          <Button variant="quiet" size="sm" onClick={mark.press} data-testid="pick-mark">
            {pickMarkWords(mark.seen)}
          </Button>
        )}
        {snooze && (
          <Button
            variant="quiet"
            size="sm"
            onClick={snooze}
            aria-busy={busy === "snooze" || undefined}
            data-testid="pick-snooze"
            {...gate("approve")}
          >
            {busy === "snooze" ? "Snoozing…" : "Snooze"}
          </Button>
        )}
        {archive && (
          <Button
            variant="quiet"
            size="sm"
            onClick={archive}
            aria-busy={busy === "archive" || undefined}
            data-testid="pick-archive"
            {...gate("approve")}
          >
            {busy === "archive" ? "Archiving…" : "Archive"}
          </Button>
        )}
        <Button
          variant="quiet"
          size="sm"
          iconOnly
          aria-label="Clear the selection"
          onClick={clear}
          data-testid="pick-clear"
        >
          <Icon name="x" size={12} />
        </Button>
      </div>
    </div>
  );
}

/** The archive question, as the bar asks it: about the one row picked, or about how many. */
function pickArchiveWords(picked: Array<{ who?: string }>): { one: boolean; question: string } {
  const one = picked.length === 1;
  const who = one ? picked[0]?.who : undefined;
  return {
    one,
    question: one ? `Archive ${who ? `${who}'s` : "this"} conversation?` : `Archive ${picked.length} conversations?`,
  };
}

/** Archiving a real thread cannot be undone, so the bar asks first. */
export function pickArchiveAsk(p: {
  picked: Array<{ who?: string }>;
  busy: string | null;
  onYes: () => unknown;
  onNo: () => void;
}) {
  const { picked, busy, onYes, onNo } = p;
  const { one, question } = pickArchiveWords(picked);
  return (
    <Confirm
      block
      question={question}
      detail={
        one
          ? "It leaves the Inbox and their request is closed. If they write again, it comes back."
          : "They leave the Inbox and each request is closed. If they write again, they come back."
      }
      yes={one ? "Yes, archive" : `Yes, archive ${picked.length}`}
      no="Not now"
      busy={busy === "archive"}
      busyLabel="Archiving…"
      onYes={onYes}
      onNo={onNo}
      testid="ix-bulk-archive"
    />
  );
}

/* ------------------------------------ the keys ------------------------------------ */

/** Whether an event's target is an `<input>`: judged by its tag, as the row's key handler always judged it. */
const inInput = (e: KeyboardEvent<HTMLElement>): boolean =>
  !!e.target && "tagName" in e.target && e.target.tagName === "INPUT";

/**
 * The rows are a listbox with one tab stop. Arrows, J/K, Home and End open and focus the row on screen; Enter opens;
 * Space picks the row for an act over several. `attr` is the attribute a row wears its id under.
 */
export function pickKeys(p: {
  rows: ReadonlyArray<{ id: string }>;
  onOpen: (id: string) => void;
  onToggle: (id: string) => void;
  attr: string;
}): (e: KeyboardEvent<HTMLElement>, i: number) => void {
  const { rows, onOpen, onToggle, attr } = p;
  return (e, i) => {
    if (e.metaKey || e.ctrlKey || e.altKey || inInput(e)) return;
    const t = rows[i];
    if (!t) return;
    if (e.key === "Enter") {
      e.preventDefault();
      onOpen(t.id);
      return;
    }
    if (e.key === " ") {
      e.preventDefault();
      onToggle(t.id);
      return;
    }
    const to =
      e.key === "ArrowDown" || e.key === "j"
        ? i + 1
        : e.key === "ArrowUp" || e.key === "k"
          ? i - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? rows.length - 1
              : null;
    if (to === null) return;
    e.preventDefault();
    e.stopPropagation();
    const next = rows[Math.max(0, Math.min(rows.length - 1, to))];
    if (!next || next.id === t.id) return;
    onOpen(next.id);
    const row =
      e.currentTarget.parentNode && e.currentTarget.parentNode.querySelector<HTMLElement>(`[${attr}="${next.id}"]`);
    if (row) row.focus();
  };
}

/* ------------------------------------ the acts ------------------------------------ */

/** A picked row with a thread behind it, as the bulk courier takes it (verbs.ts inboxBulk). */
interface Threaded {
  id: string;
  who: string;
  conversationId: string;
  escalationId: null;
}

const threaded = (picks: Picked[]): Threaded[] =>
  picks.flatMap((p) =>
    p.conversationId ? [{ id: p.id, who: p.who, conversationId: p.conversationId, escalationId: null }] : [],
  );

/** How many, or who when it is one: what a toast leads with. */
const whom = (rows: Array<{ who: string }>) => <b>{rows.length === 1 && rows[0] ? rows[0].who : rows.length}</b>;

/**
 * The acts over a pick, each one act however many rows it holds: one ask per thread through the bulk courier and one
 * re-read at its end, one toast with the count and each refusal named, the refused left picked to try again, and an
 * Undo where the act has one.
 *
 * Each thread went through the single verb: a toast apiece on a stack that keeps three, a re-read of three surfaces
 * apiece, no count, no busy state and no Undo (the wiring audit's A19).
 */
export const pickRun = (p: {
  setSelected: (ids: string[]) => void;
  setBusy: (verb: string | null) => void;
  /** Whether an act is out: a second press asks nothing. */
  running: { current: boolean };
  flash: (flash: Flash) => void;
}) => {
  const { setSelected, setBusy, running, flash } = p;
  const run = async (rows: Threaded[], verb: BulkVerb) => {
    if (running.current) return null;
    running.current = true;
    setBusy(verb);
    // One of your own acts: its re-read is not news for the open pane (thread-pane.tsx counts these).
    OWN_VERBS.n += 1;
    try {
      return await inboxBulk(rows, verb);
    } finally {
      OWN_VERBS.n -= 1;
      running.current = false;
      setBusy(null);
    }
  };
  const wakeAgain = async (snoozed: Threaded[]) => {
    const r = await run(snoozed, "wake");
    if (!r) return;
    flash(
      r.refused.length
        ? {
            tone: "danger",
            msg: (
              <>
                <b>
                  {r.done.length} of {snoozed.length}
                </b>{" "}
                woken — {ixRefusedWords(r.refused)}
              </>
            ),
          }
        : // A snooze lets go of whoever had the thread (core snooze clears the claim and the pause), so waking it
          // brings it back to the Inbox, not back where it was (I2).
          {
            msg: (
              <>
                Snooze undone — <b>{r.done.length}</b> back in the Inbox
              </>
            ),
          },
    );
  };
  /** Snooze or archive the threads behind the rows picked. */
  const act = async (picks: Picked[], verb: "snooze" | "archive") => {
    if (!canDo("approve")) return;
    const todo = threaded(picks.filter((x) => (verb === "snooze" ? !x.snoozed : !x.archived)));
    if (!todo.length) {
      flash({
        tone: "info",
        msg: <>{verb === "snooze" ? "Those are snoozed already" : "Those are archived already"}</>,
      });
      return;
    }
    const r = await run(todo, verb);
    if (!r) return;
    setSelected(r.refused.map((x) => x.thread.id));
    const past = verb === "snooze" ? "snoozed" : "archived";
    const undo = verb === "snooze" && r.done.length ? () => wakeAgain(r.done) : null;
    if (r.refused.length) {
      flash({
        tone: "danger",
        msg: (
          <>
            {r.done.length ? (
              <>
                <b>
                  {r.done.length} of {todo.length}
                </b>{" "}
                {past}
              </>
            ) : (
              <>Nothing was {past}</>
            )}{" "}
            — {ixRefusedWords(r.refused)}
          </>
        ),
        undo,
      });
    } else {
      flash({
        msg:
          verb === "snooze" ? (
            <>
              <b>{r.done.length}</b> snoozed until tomorrow 10:00
            </>
          ) : (
            <>
              <b>{r.done.length}</b> archived — if they write again, they come back
            </>
          ),
        undo,
      });
    }
  };
  /**
   * The reader's own mark (surfaces/seen.ts) on whom `pickMark` said: read, or put back as unread. Any role's, and
   * kept, so the rows read the same on the next read and on their other screens. Undo is the same door the other way.
   */
  const mark = ({ seen, whom: todo }: { seen: boolean; whom: Picked[] }) => {
    if (!todo.length) return;
    const rows = todo.map((x) => ({
      who: { personId: x.personId, conversationId: x.conversationId },
      reading: x.reading,
    }));
    const set = (to: boolean) => (to ? seePeople(rows) : unseePeople(rows.map((x) => x.who)));
    set(seen);
    setSelected([]);
    flash({
      msg: (
        <>
          {whom(todo)} marked as {seen ? "read" : "unread"}
        </>
      ),
      undo: () => set(!seen),
    });
  };
  return { act, mark };
};
