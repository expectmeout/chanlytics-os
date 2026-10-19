/**
 * The playbook runs Today's queue draws (moved from pages/dashboard-a-command.jsx, decision 0015, step 4).
 *
 * A playbook's run that waits for a person, or one under the veto window (scheduled, not yet sending) as rows of the
 * same grammar, with Approve or Cancel where the button goes. What already went out is a line of the day's card. The
 * page keeps deciding WHICH rows wait or are scheduled; the words are contracts' (todayRunWords, runStopWords). Cancel
 * asks what Sent asks before the same cancel ("Cancel X? Nothing will send."): it was a "Stop" at one tap here
 * (D1-run-words). A run's Approve or Cancel waits while it is on its way (useRunsActing), as Sent's does: a second press
 * was a second request (the wiring's second audit, S9-10).
 */
import { useMemo, useReducer, useRef, useState } from "react";
import {
  CAMPAIGNS_PAUSED_WORDS,
  LIFECYCLE_WORDS,
  TO_SEND_ALL_WORDS,
  TO_SEND_ROUTE,
  runStopWords,
  runStoppedWords,
  runHeldEmails,
  runDraftedEmails,
  runsThatWait,
  runTitleOf,
  runTooLate,
  toSendRunsOf,
  type BroadcastVM,
} from "@chanlytics/contracts";
import type { BroadcastsSurface } from "@/surfaces/campaigns/broadcasts/surface";
import { approvalDaysNow } from "@/surfaces/campaigns/broadcasts/when-words";
import { AttnRow } from "../../kit/attention/attn-row";
import { Confirm } from "../../kit/confirm/confirm";
import { gatedProps } from "../../legacy-verbs";
import { surfaceValue } from "../../surface-values";
import { TODAY_HELPERS } from "../helpers";
import {
  bcLateWords,
  bcOpensOnItsSheet,
  bcWhenWords,
  borrowed,
  broadcastVerbs,
  canDo,
  gate,
  refreshPlaybooks,
  refusalFlash,
  type Flash,
  type VerbAnswer,
} from "../shell";

/** Move to a route (the frame's `appNavigate`). */
export type Nav = (to: string) => void;

/** The shell's one toast, raised. */
type Say = (flash: Flash) => void;

/** The kind the next verb is drawn as: the page's one primary verb is the first row's, every other is quiet. */
export type VerbKind = () => "primary" | "ghost";

/** The runs with a press on its way: whether one is, and the press, which does nothing while one is. */
interface RunsActing {
  busy: (runId: string) => boolean;
  run: (runId: string, act: () => Promise<unknown>) => Promise<void>;
}

/**
 * Which runs have an Approve or a Cancel on its way, for the queue's run rows (the wiring's second audit, S9-10). Their buttons
 * wait until the server answers, and a second press of either does nothing: the steps and visits leave the card at once, but
 * a run stays, since what it becomes (approved, going, canceled) is the read's to say. Held in a ref, so a second press before
 * the redraw is refused too; the redraw draws the buttons waiting.
 */
export function useRunsActing(): RunsActing {
  const onTheirWay = useRef(new Set<string>());
  const [, redraw] = useReducer((n: number) => n + 1, 0);
  return useMemo(
    () => ({
      busy: (runId) => onTheirWay.current.has(runId),
      run: async (runId, act) => {
        if (onTheirWay.current.has(runId)) return;
        onTheirWay.current.add(runId);
        redraw();
        try {
          await act();
        } finally {
          onTheirWay.current.delete(runId);
          redraw();
        }
      },
    }),
    [],
  );
}

/** The broadcasts surface as the bridge published it, or nothing before its first read (`window.__BROADCASTS`). */
export const broadcastsRead = () => borrowed<BroadcastsSurface>("__BROADCASTS");

/**
 * The runs that want a seat: one waiting for your word (`waiting`, the count's own rule: contracts runWaitsOnYou), which is
 * a run an approval can still send or a going run whose emails the check holds for your say, one whose day has passed and
 * can only be skipped (`late`, which waits on nobody and the hourly sweep skips), and one inside the veto window, about to
 * send (`soon`).
 */
export const runsPending = () => {
  const s = broadcastsRead();
  const all = (s && s.rows) || [];
  const pending = all.filter((r) => r.state === "pending_approval");
  // The business's days, asked only over runs to judge.
  const judged = all.filter((r) => r.state === "pending_approval" || runHeldEmails(r) > 0 || runDraftedEmails(r) > 0);
  const days = judged.length ? approvalDaysNow() : null;
  return {
    waiting: days ? runsThatWait(judged, days) : [],
    late: days ? pending.filter((r) => runTooLate(r, days)) : [],
    soon: all.filter((r) => r.state === "scheduled" && r.playbook_id && Date.parse(r.scheduled_for) > Date.now()),
  };
};

/**
 * Why a waiting run cannot be approved now, or null. A run whose day has passed is refused by the verb (bcLateWords,
 * contracts runApprovalRefusal): its row says so in the verb's sentence and opens the run, where Skip is, instead of an
 * Approve that answers 409. A reach-out's run has no day to pass (the predicate's own exemption).
 */
const runLate = (r: BroadcastVM): string | null => bcLateWords(r);

interface SoonRunProps {
  r: BroadcastVM;
  nav: Nav;
  verbKind: VerbKind;
  stop: (r: BroadcastVM) => unknown;
  /** A Cancel of this run is on its way: the button waits. */
  busy: boolean;
}

/**
 * A run under the veto window: its row, and, once Cancel is pressed, the question Sent asks before the same cancel (contracts
 * runStopWords: "Cancel X?", "Nothing will send."), in the kit's Confirm under it.
 */
function SoonRun({ r, nav, verbKind, stop, busy }: SoonRunProps) {
  const [asking, setAsking] = useState(false);
  const W = runStopWords("scheduled");
  const words = TODAY_HELPERS.runs(r).soon;
  return (
    <>
      <AttnRow
        initials="▶"
        glyph="bolt"
        name={runTitleOf(r)}
        meta={words.meta}
        sentence={words.sentence}
        status={words.status}
        tone="warn"
        cta={{ label: "Open", kind: verbKind(), onClick: () => nav(`broadcasts/run:${r.id}`) }}
        also={{ label: W.verb, onClick: () => setAsking(true), busy, gate: gate("approve", "cancel a run") }}
        onOpen={() => nav(`broadcasts/run:${r.id}`)}
        testid="brief-run-soon"
      />
      {asking && (
        <Confirm
          block
          danger
          question={W.question({ name: runTitleOf(r) })}
          detail={W.detail}
          yes={W.yes}
          onYes={() => {
            setAsking(false);
            void stop(r);
          }}
          onNo={() => setAsking(false)}
          testid="brief-run-soon-stop"
        />
      )}
    </>
  );
}

/** The one To send's row: how many emails wait for you to send them, from how many reach-outs, and its door. */
function toSendRow(t: NonNullable<ReturnType<typeof toSendRunsOf>>, nav: Nav, verbKind: VerbKind) {
  return (
    <AttnRow
      key="run-to-send"
      initials="▶"
      glyph="bolt"
      name={TO_SEND_ALL_WORDS.title}
      meta={TO_SEND_ALL_WORDS.meta}
      sentence={TO_SEND_ALL_WORDS.sentence(t.count, t.from)}
      status={[TO_SEND_ALL_WORDS.status]}
      tone="escalated"
      cta={{ label: "Open", kind: verbKind(), onClick: () => nav(TO_SEND_ROUTE) }}
      also={null}
      onOpen={() => nav(TO_SEND_ROUTE)}
      testid="brief-to-send"
    />
  );
}

/** The run rows the queue has room for, and the runs with a press on its way (useRunsActing). */
interface RunSeat {
  room: number;
  acting: RunsActing;
}

export const runRows = (nav: Nav, flash: Say, verbKind: VerbKind, { room, acting }: RunSeat) => {
  const api = broadcastVerbs();
  const refreshed = () => refreshPlaybooks();
  const { waiting, late: tooLate, soon } = runsPending();
  const words = (r: BroadcastVM) => TODAY_HELPERS.runs(r);
  const can = canDo("approve");
  // A paused workspace sends nothing, and approving is refused (core approveRun): the row says so, in the words every
  // campaign says it, instead of a button that answers 402. Today's own read says it, as its band does (it hears the plan on
  // every page; the wiring's second audit, W-campaign-run-template-reachout-1); Sent's reading where Today's is not in yet.
  const paused = (surfaceValue("today")?.standing.paused ?? broadcastsRead()?.ready?.paused) === true;
  // Each is said the moment the server takes it, from what it answered, not once the runs are read again behind it.
  // What a verb returns is the caller's (the tests await it), so it is typed as nothing React would read.
  const stop: (r: BroadcastVM) => unknown = (r) => acting.run(r.id, () => stopNow(r));
  const approve: (r: BroadcastVM) => unknown = (r) => acting.run(r.id, () => approveNow(r));
  const stopNow = async (r: BroadcastVM) => {
    if (!can || !api) return;
    let said = false;
    // What the server stopped, said as Sent says it (runStoppedWords): a run still to come is canceled, nothing will send.
    const say = (data?: Record<string, unknown>) => {
      said = true;
      flash({
        msg: (
          <>
            <b>{runTitleOf(r)}</b> {runStoppedWords(typeof data?.was === "string" ? data.was : "scheduled")}
          </>
        ),
      });
    };
    const res = await api.cancel(r.id, { onAccepted: say });
    if (res.ok) refreshed();
    if (!res.ok) flash(refusalFlash(res, "Not canceled"));
    else if (!said) say();
  };
  const approveNow = async (r: BroadcastVM) => {
    if (!can || !api || paused) return;
    let said = false;
    const say = (data: NonNullable<VerbAnswer["data"]>) => {
      said = true;
      const n = data.recipient_count || r.recipient_count;
      // When it really goes (broadcasts-real.jsx bcWhenWords): the server moves a send outside 9:00-20:59 to nine.
      const when = bcWhenWords(data);
      const t = TODAY_HELPERS.runApproved(runTitleOf(r), n, when);
      flash({
        msg: (
          <>
            <b>{t.lead}</b> {t.rest}
          </>
        ),
      });
    };
    const res = await api.approve(r.id, { onAccepted: say });
    if (res.ok) refreshed();
    if (!res.ok) flash(refusalFlash(res, "Not approved"));
    // The JSX called `say(res.data)` with whatever the server answered: an accepted approve always carries its data.
    else if (!said) say(res.data as NonNullable<VerbAnswer["data"]>);
  };
  // Each row opens its own run (broadcasts/run:<id>): who is on it, and what it has done so far. The runs waiting first,
  // then the ones too late to approve, through the same row (which says it is too late and opens the run, where Skip is).
  // Two or more whose emails are handed to you are one row, first: the one To send (broadcasts/to-send), the list the
  // owner works down, never a row a run (00429). One alone opens its run.
  const toSend = toSendRunsOf(waiting);
  const asked = [...waiting.filter((r) => !toSend || !toSend.runs.includes(r)), ...tooLate];
  const count = asked.length + (toSend ? 1 : 0) + soon.length;
  const handed = toSend && room > 0 ? [toSendRow(toSend, nav, verbKind)] : [];
  const left = room - handed.length;
  const drawn = [
    ...handed,
    ...asked.slice(0, left).map((r) => {
      // A going run whose emails the check holds is answered on the run, where each held email is put back or skipped;
      // one whose emails are handed to you is sent from there, each from your own inbox (00429).
      const held = runHeldEmails(r) > 0 ? words(r).held : runDraftedEmails(r) > 0 ? words(r).drafted : null;
      const late = held ? null : runLate(r);
      // Decided on its sheet alone, as Sent's row and the ledger's door decide it (the run's offer, contracts
      // waitingRunOffer): a reach-out's run, or one whose day has passed and is skipped there.
      const opens = !!held || bcOpensOnItsSheet(r) || !!late;
      const said = held ?? (late ? { ...words(r).late, sentence: late } : words(r).waiting);
      return (
        <AttnRow
          key={`run-${r.id}`}
          initials="▶"
          glyph="bolt"
          name={runTitleOf(r)}
          meta={said.meta}
          sentence={held || late ? said.sentence : paused ? CAMPAIGNS_PAUSED_WORDS : said.sentence}
          status={said.status}
          tone="escalated"
          // A reach-out's run is opened, never approved from here (decision D6): its sheet counts and names each send
          // first, Ask refuses to approve one, and a one-tap send from Today is the wrong habit for a first cold email.
          cta={
            opens
              ? { label: "Open", kind: verbKind(), onClick: () => nav(`broadcasts/run:${r.id}`) }
              : {
                  // One word per act (decision 19 of the spec of 9 Oct 2026): "Approve · 7 people", as every screen says it.
                  label: LIFECYCLE_WORDS.ledger.approve(r.recipient_count),
                  kind: verbKind(),
                  onClick: () => approve(r),
                  busy: acting.busy(r.id),
                  gate: paused ? gatedProps(CAMPAIGNS_PAUSED_WORDS) : gate("approve", "approve a run"),
                }
          }
          also={opens ? null : { label: "See who's on it", onClick: () => nav(`broadcasts/run:${r.id}`) }}
          onOpen={() => nav(`broadcasts/run:${r.id}`)}
          testid="brief-run-row"
        />
      );
    }),
    ...soon
      .slice(0, Math.max(0, left - Math.min(asked.length, left)))
      .map((r) => (
        <SoonRun key={`run-${r.id}`} r={r} nav={nav} verbKind={verbKind} stop={stop} busy={acting.busy(r.id)} />
      )),
  ];
  return { drawn, count, cut: count - drawn.length };
};
