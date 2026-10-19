/**
 * What the rows of the runs waiting for you read and press (the Campaigns wiring review's rule D, lane 4, 19 Oct 2026),
 * once for every page that draws them: Today's queue and the Inbox's Needs you (wait-rows.tsx). Moved from Today's
 * queue-runs.tsx, which decided them for Today alone, while the Inbox drew its own rows that only opened.
 *
 * The runs are Sent's, as the bridge published them (`window.__BROADCASTS`), and the verbs its own (`window.__broadcasts`):
 * a page that never opened Campaigns draws them and presses them without its code. A run's Approve waits while it is on
 * its way (useRunsActing), as its screen's does: a second press was a second request (the wiring's second audit, S9-10).
 * What each verb did is said the moment the server takes it, from what it answered, with the way back (#1727).
 */
import { useMemo, useReducer, useRef } from "react";
import {
  SENDING_NOW_WORDS,
  runDraftedEmails,
  runHeldEmails,
  runStopDoorWords,
  runStoppedWords,
  runTitleOf,
  runTooLate,
  runsThatWait,
  todayRunApproved,
  type BroadcastVM,
} from "@chanlytics/contracts";
import type { BroadcastsSurface } from "../campaigns/broadcasts/surface";
import { approvalDaysNow, bcWhenWords } from "../campaigns/broadcasts/when-words";
import { canDo } from "../legacy-verbs";
import { fn, object, type Flash } from "../shell-doors";
import { surfaceValue } from "../surface-values";

/** The page's toast, raised. */
export type Say = (flash: Flash) => void;

/** The runs with a press on its way: whether one is, and the press, which does nothing while one is. */
export interface RunsActing {
  busy: (runId: string) => boolean;
  run: (runId: string, act: () => Promise<unknown>) => Promise<void>;
}

/**
 * Which runs have an Approve or a Stop on its way, for the rows (the wiring's second audit, S9-10). Their buttons wait
 * until the server answers, and a second press of either does nothing: a run stays on the page, since what it becomes
 * (approved, going, canceled) is the read's to say. Held in a ref, so a second press before the redraw is refused too;
 * the redraw draws the buttons waiting.
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
export const broadcastsRead = () => object<BroadcastsSurface>("__BROADCASTS");

/**
 * The runs that want a row: one waiting for your word (`waiting`, the count's own rule: contracts runWaitsOnYou), which is
 * a run an approval can still send or a going run whose emails the check holds or hands to you, and one whose day has
 * passed and can only be skipped (`late`, which waits on nobody and the hourly sweep skips). One about to send is Going
 * today's.
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
  };
};

/**
 * Whether the workspace is paused: it sends nothing, and approving is refused (core approveRun), so a row says so in the
 * words every campaign says it instead of a button that answers 402. Today's own read says it, as its band does (it hears
 * the plan on every page; the wiring's second audit, W-campaign-run-template-reachout-1); Sent's reading where Today's is
 * not in yet.
 */
export const campaignsPaused = (): boolean =>
  (surfaceValue("today")?.standing.paused ?? broadcastsRead()?.ready?.paused) === true;

/** What a run's verbs answer: `ok`, the server's data, or a refusal to say in the shell's words. */
interface VerbAnswer {
  ok: boolean;
  data?: { recipient_count?: number } & Record<string, unknown>;
  [key: string]: unknown;
}

/** The broadcasts surface's verbs, as far as the rows press them (`window.__broadcasts`). */
interface RunVerbs {
  cancel(id: string, opts?: { onAccepted?: (data: NonNullable<VerbAnswer["data"]>) => void }): Promise<VerbAnswer>;
  approve(id: string, opts?: { onAccepted?: (data: NonNullable<VerbAnswer["data"]>) => void }): Promise<VerbAnswer>;
}

/** The broadcasts surface's verbs (`window.__broadcasts`): stop a run, approve one; nothing before the surface is installed. */
export const broadcastVerbs = (): RunVerbs | undefined => object<RunVerbs>("__broadcasts");

/** The toast a refused verb raises, in the shell's words (`window.refusalToast`): its lead, then the server's reason. */
function refusalFlash(res: unknown, lead: string): Flash {
  const say = fn<[unknown, string], Flash>("refusalToast");
  return say ? say(res, lead) : { msg: lead };
}

/** What an accepted approve answered, as the words of when it goes read it: an object, else nothing. */
const receiptOf = (data: unknown) => (data && typeof data === "object" ? data : null);

/** The playbooks surface read again after a run's verb (`window.__refreshPlaybooks`): nothing in a stand-in window. */
export const refreshPlaybooks = (): void => fn<[], void>("__refreshPlaybooks")?.();

/** A run's two verbs on a row, each waiting while it is on its way: what they return is the caller's (the tests await it). */
export interface RunActs {
  approve: (r: BroadcastVM) => unknown;
  stop: (r: BroadcastVM) => unknown;
}

/** An approved run stopped from its toast (#1727): what the server stopped, said as the run's screen says it. */
async function stopNow(r: BroadcastVM, api: RunVerbs, flash: Say): Promise<void> {
  let said = false;
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
  if (res.ok) refreshPlaybooks();
  if (!res.ok) flash(refusalFlash(res, "Not canceled"));
  else if (!said) say();
}

/** A run approved: when it really goes (the server moves a send outside 9:00-20:59 to nine), with its Stop. */
async function approveNow(r: BroadcastVM, api: RunVerbs, flash: Say, stop: (r: BroadcastVM) => unknown): Promise<void> {
  let said = false;
  const say = (data: NonNullable<VerbAnswer["data"]>) => {
    said = true;
    const n = data.recipient_count || r.recipient_count;
    const when = bcWhenWords(receiptOf(data));
    const t = todayRunApproved(runTitleOf(r), n, when);
    flash({
      msg: (
        <>
          <b>{t.lead}</b> {t.rest}
        </>
      ),
      // The way back, as the run's screen and Send once offer it: the same stop as a run still to come has on its row.
      action: { label: runStopDoorWords(when !== SENDING_NOW_WORDS), onClick: () => stop(r) },
    });
  };
  const res = await api.approve(r.id, { onAccepted: say });
  if (res.ok) refreshPlaybooks();
  if (!res.ok) flash(refusalFlash(res, "Not approved"));
  // An accepted approve always carries its data.
  else if (!said) say(res.data as NonNullable<VerbAnswer["data"]>);
}

/** The rows' verbs, through the page's toast: nothing where the role may not, or where the workspace is paused. */
export function runActsOf(flash: Say, acting: RunsActing): RunActs {
  const api = broadcastVerbs();
  const can = canDo("approve");
  const paused = campaignsPaused();
  const stop = (r: BroadcastVM) => acting.run(r.id, () => (can && api ? stopNow(r, api, flash) : Promise.resolve()));
  const approve = (r: BroadcastVM) =>
    acting.run(r.id, () => (can && api && !paused ? approveNow(r, api, flash, stop) : Promise.resolve()));
  return { approve, stop };
}
