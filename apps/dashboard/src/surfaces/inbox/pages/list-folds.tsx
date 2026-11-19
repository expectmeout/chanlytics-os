/**
 * The Inbox list's folds: what a list holds and does not draw among its rows until it is asked for.
 *
 * - Whoever has waited past a week, at Needs you's foot, as Today draws them (today/need-you/older.tsx): one row, how
 *   many and who, in no count and never the page's coral (the one count leaves them out: 0048, amended 2 Nov 2026), which
 *   opens in place into their conversations' own rows and the rows of those the Inbox holds no conversation of.
 * - One person past a week (17 Nov 2026): their own row, where the Inbox drew a fold of one, "1 waiting over a week",
 *   under a card that said nobody was waiting. Who, what happened, how long, "toll-free" beside a toll-free number, and
 *   Mark done at its right, which hands them back to the receptionist (today/need-you/sheet/hand-back.ts) and says so in
 *   a toast with its Undo, since the row leaves with the hold. A press on the row opens their conversation where the
 *   Inbox holds it, else their row's door.
 * - What a reading set aside as not a customer's (decision 0093: sales pitches and programs' mail), at Handled's head: one
 *   quiet row, which opens in place into their conversations, each asked whether they are a customer. It was a tab of its
 *   own, drawn only while it held any (decision 0142: no list to keep an eye on, and a fifth tab ran a phone's strip into
 *   its search). Today's own words for it (need-you/words.ts setAside).
 *
 * The rows a fold opens into are the list's own (list-rows.tsx threadRows), which the list hands in: this module leans
 * on neither the list nor its rows.
 */
import { useState, type KeyboardEvent, type ReactNode } from "react";
import { INBOX_BUCKET_WORDS, NEED_YOU_WORDS as W, type TodayQueueRowVM } from "@chanlytics/contracts";
import { AttnRow } from "../../kit/attention/attn-row";
import { Confirm } from "../../kit/confirm/confirm";
import type { ShownRows } from "../../kit/rows/shown-rows";
import type { Flash } from "../../shell-doors";
import { handBackAll, handedBackWords } from "../../today/need-you/sheet/hand-back";
import { doorRow, olderWords } from "../../today/need-you/sheet/row-words";
import { appNavigate, gate } from "../shell";
import type { Thread } from "../types";
import { pickKeys } from "./pick";

/**
 * Mark done, for one person past a week or for all of them: each handed back to the receptionist
 * (today/need-you/sheet/hand-back.ts), said in a toast with its one Undo, since the rows leave with their holds.
 */
function useMarkDone(rows: readonly TodayQueueRowVM[], flash: (flash: Flash) => void) {
  const [busy, setBusy] = useState(false);
  const mark = async () => {
    setBusy(true);
    const back = await handBackAll(rows);
    setBusy(false);
    const undo = back.undo;
    flash(
      back.done
        ? { msg: handedBackWords(back), undo: undo ? () => void undo() : null }
        : { tone: "danger", msg: handedBackWords(back) || W.oldDone.failed(rows.length) },
    );
  };
  return { busy, mark };
}

function OlderOne({ row, onOpen, flash }: { row: TodayQueueRowVM; onOpen: () => void; flash: (flash: Flash) => void }) {
  const { busy, mark } = useMarkDone([row], flash);
  return (
    <AttnRow
      {...olderWords(row)}
      testid="inbox-older-one"
      ctaTestid="inbox-older-done"
      onOpen={onOpen}
      cta={
        row.conversationId
          ? {
              label: W.oldDone.yes,
              kind: "ghost",
              busy,
              onClick: () => void mark(),
              gate: gate("approve", "mark them done"),
            }
          : null
      }
    />
  );
}

/** What Needs you folds at its foot (needs-you-list.ts): their conversations, the rows of those it does not hold, and the row of each. */
interface Folded {
  older: readonly Thread[];
  olderRows: readonly TodayQueueRowVM[];
  rowOf: (t: Thread) => TodayQueueRowVM | null;
}

/**
 * The one person the fold holds, as their own row: drawn from their conversation's row where the Inbox holds the
 * conversation, and a press opens it; else from their row, whose door a press takes. Null where no row says them.
 */
function olderOne(
  folded: Folded | null | undefined,
  acts: { flash: (flash: Flash) => void; onSelectThread: (id: string) => void },
) {
  const [thread] = folded?.older ?? [];
  const row = thread ? folded?.rowOf(thread) : folded?.olderRows[0];
  if (!row) return null;
  return (
    <div className="ix-runs" data-testid="inbox-older">
      <OlderOne
        row={row}
        flash={acts.flash}
        onOpen={() => (thread ? acts.onSelectThread(thread.id) : appNavigate(row.cta.to))}
      />
    </div>
  );
}

/** What the folds read of the list they stand in (inbox-list.tsx ListCtx holds all of it). */
interface FoldsList {
  activeThreadId: string | undefined;
  onSelectThread: (id: string) => void;
  onToggleSelect: (id: string) => void;
  flash: (flash: Flash) => void;
  visible: Thread[];
  tabStopId: string | undefined;
  onRowKey: (e: KeyboardEvent<HTMLDivElement>, i: number) => void;
  needsYou?: (Folded & { older: Thread[] }) | null;
  aside: Thread[];
  olderOpen: boolean;
  setOlderOpen: (v: boolean) => void;
  asideOpen: boolean;
  setAsideOpen: (v: boolean) => void;
}

/** A list's own rows, as it draws them: what a fold opens into. */
type RowsOf<L> = (list: L, shown: ShownRows) => ReactNode;

/** A fold as it is drawn: its one row, and the conversations it opens into. */
interface FoldDrawn {
  testid: string;
  /** The fold's one row: how many and who, and its press, which opens it. */
  head: ReactNode;
  /** The listbox's name, for a reader. */
  label: string;
  rows: Thread[];
  /** Who it holds that the Inbox has no conversation of, each a row of its own while it is open. */
  away?: readonly TodayQueueRowVM[];
  open: boolean;
}

/** Who a fold holds, by name: its conversations' people, then those the Inbox has no conversation of. */
const namesOf = (rows: readonly Thread[], away: readonly TodayQueueRowVM[] = []): string =>
  [...rows.map((t) => t.who), ...away.map((r) => r.who)].join(", ");

/**
 * Needs you's fold of whoever has waited past a week, as its one row: how many and who, and Mark all done at its right,
 * as Today's has (today/need-you/older.tsx): the Inbox's had no press but opening each of them, thirty-seven in the
 * demo's (Ruben, 19 Nov 2026). Only those whose conversation is held can be marked, as on Today.
 *
 * It asks first, in the row's own place (contracts NEED_YOU_WORDS oldDone.ask): one press let all of them go, and those
 * nobody answered are archived, which Undo does not bring back; the Inbox's own Archive of several asks for the same
 * reason. One person's Mark done is one person, named on its row, and goes at the press.
 */
function OlderAll({
  count,
  names,
  marked,
  flash,
  onOpen,
}: {
  count: number;
  names: string;
  marked: readonly TodayQueueRowVM[];
  flash: (flash: Flash) => void;
  onOpen: () => void;
}) {
  const { busy, mark } = useMarkDone(marked, flash);
  const [asking, setAsking] = useState(false);
  // Who the press can let go: those whose conversation is held; and, of them, those archived for having no hold.
  const going = marked.filter((row) => !!row.conversationId);
  const archived = going.filter((row) => row.closes === "archive").length;
  const ask = asking ? (
    <Confirm
      block
      question={W.oldDone.ask.question(going.length)}
      detail={W.oldDone.ask.detail(going.length, archived)}
      yes={W.oldDone.ask.yes(going.length)}
      no={W.oldDone.ask.no}
      busy={busy}
      busyLabel={W.oldDone.ask.busy}
      onYes={() => void mark().then(() => setAsking(false))}
      onNo={() => setAsking(false)}
      testid="inbox-older-ask"
    />
  ) : null;
  return (
    <AttnRow
      glyph="clock"
      initials=""
      name={W.older.row(count)}
      sentence={names}
      tone=""
      testid="inbox-older-row"
      ctaTestid="inbox-older-all-done"
      onOpen={onOpen}
      cta={
        going.length && !asking
          ? {
              label: W.oldDone.act,
              kind: "ghost",
              onClick: () => setAsking(true),
              gate: gate("approve", "mark them done"),
            }
          : null
      }
      work={ask}
    />
  );
}

/**
 * One fold: a row that says how many and who, which opens in place into their conversations' own rows, a list of its
 * own: one tab stop, on the open row or its first, and the arrows walk its rows alone (pick.tsx).
 */
function foldOf<L extends FoldsList>(list: L, shown: ShownRows, drawn: FoldDrawn, rowsOf: RowsOf<L>) {
  const away = drawn.away ?? [];
  const own: L = {
    ...list,
    visible: drawn.rows,
    tabStopId: drawn.rows.some((t) => t.id === list.activeThreadId) ? list.activeThreadId : drawn.rows[0]?.id,
    onRowKey: pickKeys({
      rows: drawn.rows,
      onOpen: list.onSelectThread,
      onToggle: list.onToggleSelect,
      attr: "data-thread-id",
    }),
  };
  return (
    <>
      <div className="ix-runs" data-testid={drawn.testid}>
        {drawn.head}
        {drawn.open ? away.map((r) => doorRow(r, (to) => appNavigate(to))) : null}
      </div>
      {drawn.open && drawn.rows.length > 0 ? (
        <div
          ref={shown.listRef}
          className="ix-thread-rows"
          role="listbox"
          aria-label={drawn.label}
          aria-multiselectable="true"
        >
          {rowsOf(own, shown)}
        </div>
      ) : null}
    </>
  );
}

/** Whoever has waited past a week, at Needs you's foot: one person their own row, several a fold. Nothing while nobody has. */
export function olderFold<L extends FoldsList>(list: L, shown: ShownRows, rowsOf: RowsOf<L>) {
  const older = list.needsYou?.older ?? [];
  const away = list.needsYou?.olderRows ?? [];
  const count = older.length + away.length;
  // One person is their own row, as on Today: a fold of one hid who, what happened and Mark done.
  if (count < 2) return count ? olderOne(list.needsYou, list) : null;
  const rowOf = list.needsYou?.rowOf;
  const head = (
    <OlderAll
      count={count}
      names={namesOf(older, away)}
      marked={[...older.flatMap((t) => rowOf?.(t) ?? []), ...away]}
      flash={list.flash}
      onOpen={() => list.setOlderOpen(!list.olderOpen)}
    />
  );
  return foldOf(
    list,
    shown,
    { testid: "inbox-older", head, label: W.group.old, rows: older, away, open: list.olderOpen },
    rowsOf,
  );
}

/** What a reading set aside as not a customer's, at Handled's head. Nothing while none was. */
export function asideFold<L extends FoldsList>(list: L, shown: ShownRows, rowsOf: RowsOf<L>) {
  if (!list.aside.length) return null;
  const head = (
    <AttnRow
      glyph="archive"
      initials=""
      name={W.setAside(list.aside.length, null)}
      sentence={namesOf(list.aside)}
      tone=""
      testid="inbox-aside-row"
      onOpen={() => list.setAsideOpen(!list.asideOpen)}
    />
  );
  return foldOf(
    list,
    shown,
    { testid: "inbox-aside", head, label: INBOX_BUCKET_WORDS.aside, rows: list.aside, open: list.asideOpen },
    rowsOf,
  );
}
