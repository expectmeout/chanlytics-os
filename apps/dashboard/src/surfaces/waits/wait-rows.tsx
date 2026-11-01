/**
 * Every wait is one row, from one list (the Campaigns wiring review's rule D, lane 4, 19 Oct 2026). The runs waiting for
 * you are drawn by this one builder wherever they are drawn: the Inbox's Needs you, the whole list, and Today's queue, a
 * part of it. Each is the kit's attention row with the same act: Approve where an OK alone sends it, with its toast and
 * its Stop; Open where the run is answered on its screen (a reach-out's, one whose emails the check holds, one too late to
 * approve). Which runs are a row is contracts' (waitRowsOf): To send's one row, the runs waiting for an OK folded into one
 * where two or more do (the run review's item 5), and a row a run for the rest. The Inbox drew its own rows, which only
 * opened, and Today's were its own (queue-runs.tsx).
 *
 * A row opens its run through the frame's move, so a run opens over the page it was pressed on (rule C): Today and the
 * Inbox stay under it, and Back closes it.
 */
import { Fragment, type ReactElement } from "react";
import {
  CAMPAIGNS_PAUSED_WORDS,
  TO_SEND_ALL_WORDS,
  TO_SEND_ROUTE,
  WAIT_ROW_WORDS,
  runApproveWords,
  runDraftedEmails,
  runHeldEmails,
  runRoute,
  runTitleOf,
  todayRunWords,
  waitRowsOf,
  type BroadcastVM,
  type WaitRowOf,
} from "@chanlytics/contracts";
import { bcLateWords, bcOpensOnItsSheet } from "../campaigns/broadcasts/when-words";
import { AttnRow } from "../kit/attention/attn-row";
import { gatedProps } from "../legacy-verbs";
import { gate } from "../shell-doors";
import { campaignsPaused, runActsOf, runsPending, type RunActs, type RunsActing, type Say } from "./run-acts";

/** Move to a route: the frame's, which opens a run over a page that is no home of Campaigns' (rule C). */
export type Nav = (to: string) => void;

/** The kind the next verb is drawn as: a page's one primary verb is its first row's, every other is quiet. */
export type VerbKind = () => "primary" | "ghost";

/** What a page hands the rows: its move, its toast, its verbs' kinds, its runs on their way, and To send's place. */
interface WaitRowsPorts {
  nav: Nav;
  flash: Say;
  verbKind: VerbKind;
  acting: RunsActing;
  /**
   * Whether the runs too late to approve are rows: Today's queue draws them, to be skipped; Needs you, whose count is of
   * what waits on you, leaves them out, since nothing of theirs does (the hourly sweep skips them).
   */
  late?: boolean;
  /**
   * Today on a phone (his look, 29 Oct 2026): a run waiting for your OK says so once, in its sentence, without the state
   * line under it, and a row that opens says Review.
   */
  phone?: boolean;
}

/** The rows a page has room for, how many rows there are, and how many runs the rows it had no room for hold. */
interface WaitRowsDrawn {
  drawn: ReactElement[];
  count: number;
  cut: number;
}

/** The run's home, where its row opens it: over the page it was pressed on, where that page is no home of Campaigns'. */
const homeOf = (r: BroadcastVM) => runRoute(r.id, r.sequence_id);

/**
 * To send's one row: how many emails wait for you to send them, from how many reach-outs. Its press opens the list as a
 * sheet over the page (the frame's move, see-over.ts `inPlace`), as a run's row opens its run: never unfolded under it.
 */
function toSendRow(t: Extract<WaitRowOf<BroadcastVM>, { kind: "to_send" }>, p: WaitRowsPorts): ReactElement {
  const press = () => p.nav(TO_SEND_ROUTE);
  return (
    <Fragment key="run-to-send">
      <AttnRow
        initials="▶"
        glyph="bolt"
        name={TO_SEND_ALL_WORDS.title}
        meta={TO_SEND_ALL_WORDS.meta}
        sentence={TO_SEND_ALL_WORDS.sentence(t.count, t.from)}
        status={[TO_SEND_ALL_WORDS.status]}
        tone="escalated"
        cta={{ label: TO_SEND_ALL_WORDS.open, kind: p.verbKind(), onClick: press }}
        also={null}
        onOpen={press}
        testid="brief-to-send"
      />
    </Fragment>
  );
}

/** Two or more runs waiting for an OK, one row: who they are, and the first opened, whose screen walks the rest. */
function approvalsRow(first: BroadcastVM, runs: readonly BroadcastVM[], p: WaitRowsPorts): ReactElement {
  const W = WAIT_ROW_WORDS.approvals;
  const open = () => p.nav(homeOf(first));
  return (
    <AttnRow
      key={`runs-${first.id}`}
      initials="▶"
      glyph="bolt"
      name={W.name(runs.length)}
      meta={W.meta}
      sentence={campaignsPaused() ? CAMPAIGNS_PAUSED_WORDS : W.sentence(runs.map(runTitleOf))}
      status={p.phone ? [] : W.status}
      tone="escalated"
      cta={{ label: p.phone ? WAIT_ROW_WORDS.review : W.open, kind: p.verbKind(), onClick: open }}
      also={null}
      onOpen={open}
      testid="brief-runs-row"
    />
  );
}

/** A run's own row: what it waits for, and Approve where an OK alone sends it, else Open, where its screen answers it. */
function runRow(r: BroadcastVM, late: boolean, p: WaitRowsPorts, acts: RunActs): ReactElement {
  const words = todayRunWords(r);
  // A going run whose emails the check holds is answered on the run, where each held email is put back or skipped; one
  // whose emails are handed to you is sent from there, each from your own inbox (00429).
  const held = runHeldEmails(r) > 0 ? words.held : runDraftedEmails(r) > 0 ? words.drafted : null;
  // A run whose day has passed is refused by the verb (contracts runApprovalRefusal): its row says so in the verb's
  // sentence and opens the run, where Skip is, instead of an Approve that answers 409.
  const lateWords = held ? null : late ? bcLateWords(r) : null;
  // Decided on its screen alone (the run's offer, contracts waitingRunOffer): a reach-out's run, one held, one too late.
  const opens = !!held || bcOpensOnItsSheet(r) || !!lateWords;
  const said = held ?? (lateWords ? { ...words.late, sentence: lateWords } : words.waiting);
  // Waiting for your OK, its sentence says so: on a phone the state line under it would say it again.
  const saidOnce = !!p.phone && said === words.waiting;
  const paused = campaignsPaused();
  const open = () => p.nav(homeOf(r));
  return (
    <AttnRow
      key={`run-${r.id}`}
      initials="▶"
      glyph="bolt"
      name={runTitleOf(r)}
      meta={said.meta}
      sentence={held || lateWords ? said.sentence : paused ? CAMPAIGNS_PAUSED_WORDS : said.sentence}
      status={saidOnce ? [] : said.status}
      tone="escalated"
      // A reach-out's run is opened, never approved from a row (decision D6): its screen counts and names each send first,
      // Ask refuses to approve one, and a one-tap send is the wrong habit for a first cold email.
      cta={
        opens
          ? { label: p.phone && !lateWords ? WAIT_ROW_WORDS.review : "Open", kind: p.verbKind(), onClick: open }
          : {
              // One word per act (decision 19 of the spec of 9 Oct 2026): "Approve all 7", as every screen says it.
              label: runApproveWords(r.recipient_count),
              kind: p.verbKind(),
              onClick: () => acts.approve(r),
              busy: p.acting.busy(r.id),
              gate: paused ? gatedProps(CAMPAIGNS_PAUSED_WORDS) : gate("approve", "approve a run"),
            }
      }
      also={opens ? null : { label: "See who's on it", onClick: open }}
      onOpen={open}
      testid="brief-run-row"
    />
  );
}

/** How many runs a row holds: To send's and the folded row's every one of theirs. */
const runsIn = (row: WaitRowOf<BroadcastVM>): number => (row.kind === "run" ? 1 : row.runs.length);

/**
 * The rows of the runs waiting for you, as many as the page has room for: those waiting first, then those too late to
 * approve, through the same row. What the page had no room for is counted in runs, for the door to the rest.
 */
export function waitRows(p: WaitRowsPorts, room: number = Infinity): WaitRowsDrawn {
  const { waiting, late } = runsPending();
  // To send opens as a sheet over the page (see-sheet.tsx), never under its row, so the rows never hold it open.
  const rows = waitRowsOf(waiting, p.late === false ? [] : late);
  const acts = runActsOf(p.flash, p.acting);
  const shown = rows.slice(0, Math.max(0, room));
  const drawn = shown.flatMap((row) => {
    if (row.kind === "to_send") return [toSendRow(row, p)];
    if (row.kind === "run") return [runRow(row.run, row.late, p, acts)];
    const [first] = row.runs;
    return first ? [approvalsRow(first, row.runs, p)] : [];
  });
  return { drawn, count: rows.length, cut: rows.slice(shown.length).reduce((n, row) => n + runsIn(row), 0) };
}
