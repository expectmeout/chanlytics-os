/**
 * Every wait is one row, from one list (the Campaigns wiring review's rule D, lane 4, 19 Oct 2026). The runs waiting for
 * you are drawn by this one builder wherever they are drawn: the Inbox's Needs you, the whole list, and Today's queue, a
 * part of it. Each is the kit's attention row with the same act: Approve where an OK alone sends it, with its toast and
 * its Stop; Open where the run is answered on its screen (a reach-out's, one whose emails the check holds, one too late to
 * approve). Which runs are a row is the list's (waitRowsOf): To send's one row, cold email's one row where two or more of
 * its runs wait (decision 0120), the runs waiting for an OK folded into one where two or more do (the run review's item
 * 5), and a row a run for the rest. The Inbox drew its own rows, which only opened, and Today's were its own
 * (queue-runs.tsx).
 *
 * A row opens its run through the frame's move, so a run opens over the page it was pressed on (rule C): Today and the
 * Inbox stay under it, and Back closes it.
 */
import { Fragment, type ReactElement } from "react";
import {
  CAMPAIGNS_PAUSED_WORDS,
  TO_SEND_ALL_WORDS,
  TO_SEND_ROUTE,
  batchFactsOf,
  batchHeldEmails,
  isReachOutRun,
  runApproveWords,
  runDraftedEmails,
  runHeldEmails,
  runRoute,
  runTitleOf,
  sequenceRoute,
  todayRunWords,
  type BroadcastVM,
} from "@chanlytics/contracts";
import { WAIT_ROW_WORDS, waitRowsOf, type WaitRowOf } from "./rows";
import { bcLateWords, bcOpensOnItsSheet } from "../campaigns/broadcasts/when-words";
import { AttnRow } from "../kit/attention/attn-row";
import { gatedProps } from "../frame-verbs";
import { gate } from "../shell-doors";
import {
  broadcastsRead,
  campaignsPaused,
  runActsOf,
  runsPending,
  type RunActs,
  type RunsActing,
  type Say,
} from "./run-acts";

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
  /**
   * The Inbox's Needs you (Ruben, 19 Nov 2026, decision 0142): a row a conversation's height, its name, one fact in the
   * words Campaigns' list says it and one verb, where a run's row stood four lines and a row of verbs tall and said its
   * state three times. The run's own screen says the rest.
   */
  slim?: boolean;
}

/** What a row says under its name: all of it, or, slim, the one fact alone. */
const rowSaidOf = (
  p: WaitRowsPorts,
  whole: { meta: string; sentence: string; status: readonly string[] },
  short: string,
): { meta: string; sentence: string; status: readonly string[] } =>
  p.slim ? { meta: "", sentence: short, status: [] } : whole;

/** The rows a page has room for, each one's name, how many rows there are, and how many rows it had no room for. */
interface WaitRowsDrawn {
  drawn: ReactElement[];
  /** What each row drawn is called, in the rows' order: what a line that folds them says it holds. */
  names: string[];
  count: number;
  cut: number;
}

/** What a row is called: To send's and cold email's own names, how many runs wait where they are folded, or the run's. */
const waitRowName = (row: WaitRowOf<BroadcastVM>): string =>
  row.kind === "to_send"
    ? TO_SEND_ALL_WORDS.title
    : row.kind === "cold_email"
      ? WAIT_ROW_WORDS.cold.name
      : row.kind === "run"
        ? runTitleOf(row.run)
        : WAIT_ROW_WORDS.approvals.name(row.runs.length);

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
        {...rowSaidOf(
          p,
          {
            meta: TO_SEND_ALL_WORDS.meta,
            sentence: TO_SEND_ALL_WORDS.sentence(t.count, t.from),
            status: [TO_SEND_ALL_WORDS.status],
          },
          TO_SEND_ALL_WORDS.short(t.count, t.from),
        )}
        tone="escalated"
        cta={{ label: TO_SEND_ALL_WORDS.open, kind: p.verbKind(), onClick: press }}
        also={null}
        onOpen={press}
        testid="brief-to-send"
      />
    </Fragment>
  );
}

/**
 * Cold email's one row (decision 0120, D8): what is held for a look and what waits for an OK in all its runs, and the
 * first opened, the held one first, whose screen walks the rest. Paused, it says so, as every run's row does.
 */
function coldEmailRow(c: Extract<WaitRowOf<BroadcastVM>, { kind: "cold_email" }>, p: WaitRowsPorts): ReactElement {
  const W = WAIT_ROW_WORDS.cold;
  const [first] = c.runs;
  const open = () => (first ? p.nav(homeOf(first)) : undefined);
  return (
    <AttnRow
      key="run-cold-email"
      initials="▶"
      glyph="bolt"
      name={W.name}
      // A held email is answered whether or not campaigns are paused; an OK is not asked for while they are.
      {...rowSaidOf(
        p,
        {
          meta: W.meta(c.from),
          sentence: campaignsPaused() && c.held === 0 ? CAMPAIGNS_PAUSED_WORDS : W.sentence(c),
          status: p.phone ? [] : W.status(c),
        },
        campaignsPaused() && c.held === 0 ? CAMPAIGNS_PAUSED_WORDS : W.short(c),
      )}
      tone="escalated"
      cta={{ label: p.phone ? WAIT_ROW_WORDS.review : W.open, kind: p.verbKind(), onClick: open }}
      also={null}
      onOpen={open}
      testid="brief-cold-email"
    />
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
      {...rowSaidOf(
        p,
        {
          meta: W.meta,
          sentence: campaignsPaused() ? CAMPAIGNS_PAUSED_WORDS : W.sentence(runs.map(runTitleOf)),
          status: p.phone ? [] : W.status,
        },
        campaignsPaused() ? CAMPAIGNS_PAUSED_WORDS : W.short(runs.map(runTitleOf)),
      )}
      tone="escalated"
      cta={{ label: p.phone ? WAIT_ROW_WORDS.review : W.open, kind: p.verbKind(), onClick: open }}
      also={null}
      onOpen={open}
      testid="brief-runs-row"
    />
  );
}

/**
 * What a run's row says, whole and in its one fact, and whether its screen alone answers it (the run's offer, contracts
 * waitingRunOffer): a reach-out's run, one whose emails are held or handed over, one too late to approve.
 */
function runSaidOf(run: BroadcastVM, late: boolean, ports: WaitRowsPorts) {
  // A batch to leads says when its first email goes and what the last one earned, off the runs the page holds.
  const batch = isReachOutRun(run.audience) && run.state === "pending_approval";
  const words = todayRunWords(run, batch ? batchFactsOf(run, broadcastsRead()?.rows ?? [], Date.now()) : undefined);
  // A going run whose emails the check holds is answered on the run, where each held email is put back or skipped; one
  // whose emails are handed to you is sent from there, each from your own inbox (00429).
  const held = runHeldEmails(run) > 0 ? words.held : runDraftedEmails(run) > 0 ? words.drafted : null;
  // A run whose day has passed is refused by the verb (contracts runApprovalRefusal): its row says so in the verb's
  // sentence and opens the run, where Skip is, instead of an Approve that answers 409.
  const lateWords = held ? null : late ? bcLateWords(run) : null;
  const said = held ?? (lateWords ? { ...words.late, sentence: lateWords } : words.waiting);
  // A held email and a run too late say their own words whatever is paused; a wait for an OK says campaigns are paused.
  const own = !!held || !!lateWords || !campaignsPaused();
  return {
    opens: !!held || bcOpensOnItsSheet(run) || !!lateWords,
    late: !!lateWords,
    whole: {
      meta: said.meta,
      sentence: own ? said.sentence : CAMPAIGNS_PAUSED_WORDS,
      // Waiting for your OK, its sentence says so: on a phone the state line under it would say it again.
      status: ports.phone && said === words.waiting ? [] : said.status,
    },
    short: own ? said.short : CAMPAIGNS_PAUSED_WORDS,
  };
}

/**
 * A run's row's verbs: Approve where an OK alone sends it, else Open, where its screen answers it, and beside it the
 * look at what an OK does not send, or who is on it. Slim, a row has one verb: the held emails' look where it holds any,
 * and the row's own press still opens the run.
 */
function runVerbsOf(run: BroadcastVM, ports: WaitRowsPorts, acts: RunActs, at: { opens: boolean; late: boolean }) {
  const open = () => ports.nav(homeOf(run));
  // The emails an OK does not send, each decided on the sequence's People.
  const undecided = batchHeldEmails(run);
  const decide = undecided
    ? { label: WAIT_ROW_WORDS.decide(undecided), onClick: () => ports.nav(sequenceRoute(run.sequence_id, "people")) }
    : null;
  if (ports.slim && decide) return { open, cta: { ...decide, kind: ports.verbKind() }, also: null };
  // A reach-out's run is opened, never approved from a row (decision D6): its screen counts and names each send first,
  // Ask refuses to approve one, and a one-tap send is the wrong habit for a first cold email.
  const cta = at.opens
    ? { label: ports.phone && !at.late ? WAIT_ROW_WORDS.review : "Open", kind: ports.verbKind(), onClick: open }
    : {
        // One word per act (decision 19 of the spec of 9 Oct 2026): "Approve all 7", as every screen says it.
        label: runApproveWords(run.recipient_count),
        kind: ports.verbKind(),
        onClick: () => acts.approve(run),
        busy: ports.acting.busy(run.id),
        gate: campaignsPaused() ? gatedProps(CAMPAIGNS_PAUSED_WORDS) : gate("approve", "approve a run"),
      };
  const second = decide ?? (at.opens ? null : { label: "See who's on it", onClick: open });
  return { open, cta, also: ports.slim ? null : second };
}

/** A run's own row: what it waits for, and Approve where an OK alone sends it, else Open, where its screen answers it. */
function runRow(run: BroadcastVM, late: boolean, ports: WaitRowsPorts, acts: RunActs): ReactElement {
  const lines = runSaidOf(run, late, ports);
  const verbs = runVerbsOf(run, ports, acts, lines);
  return (
    <AttnRow
      key={`run-${run.id}`}
      initials="▶"
      glyph="bolt"
      name={runTitleOf(run)}
      {...rowSaidOf(ports, lines.whole, lines.short)}
      tone="escalated"
      cta={verbs.cta}
      also={verbs.also}
      onOpen={verbs.open}
      testid="brief-run-row"
    />
  );
}

/**
 * The rows of the runs waiting for you, as many as the page has room for: those waiting first, then those too late to
 * approve, through the same row. What the page had no room for is counted in rows, as the group that draws them counts
 * its rows (Today in three zones: a folded row is one), for the door to the rest.
 */
export function waitRows(p: WaitRowsPorts, room: number = Infinity): WaitRowsDrawn {
  const { waiting, late } = runsPending();
  // To send opens as a sheet over the page (see-sheet.tsx), never under its row, so the rows never hold it open.
  const rows = waitRowsOf(waiting, p.late === false ? [] : late);
  const acts = runActsOf(p.flash, p.acting);
  const shown = rows.slice(0, Math.max(0, room));
  const drawn = shown.flatMap((row) => {
    if (row.kind === "to_send") return [toSendRow(row, p)];
    if (row.kind === "cold_email") return [coldEmailRow(row, p)];
    if (row.kind === "run") return [runRow(row.run, row.late, p, acts)];
    const [first] = row.runs;
    return first ? [approvalsRow(first, row.runs, p)] : [];
  });
  return { drawn, names: shown.map(waitRowName), count: rows.length, cut: rows.length - shown.length };
}
