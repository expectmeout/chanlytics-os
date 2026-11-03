/**
 * Health's acts (decisions 0068, 0089): Run again, a failed job's fresh row of its kind and payload (POST
 * platform/jobs/requeue, which refuses a send and says where it is sent again); Run every failed one again, a whole
 * kind's after an outage (POST platform/jobs/requeue-kind); Pause and Resume, a kind of background work (POST
 * platform/jobs/pause); and Deliver again, every failed or paused delivery of one subscriber once more (POST
 * platform/deliveries/redrive). Each asks why before it runs, armed in place, as every act of the Console does; each is
 * drawn to a role that may take it, and Health reads again after it.
 */
import { useState } from "react";
import {
  HEALTH_WORDS,
  jobWords,
  subscriberWords,
  staffMay,
  type ConsoleAct,
  type ConsoleWhy,
  type HealthAct,
  type JobKind,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import type { Flash } from "../parts";
import { consoleVerbs, type ConsoleMe } from "../verbs";
import { WhyAsk } from "../why";

type Run = Exclude<HealthAct, { kind: "open" }>;

/** The Console's act each run is, for who may take it (contracts staffMay). */
const ACT_OF: Record<Run["kind"], ConsoleAct> = {
  run_again: "job_requeue",
  redrive: "delivery_redrive",
  run_kind_again: "job_requeue_kind",
  pause_kind: "job_kind_pause",
};

/** What the act is, as its button, its question and its words after say it. */
function actWordsOf(run: Run) {
  switch (run.kind) {
    case "run_again":
      return { press: HEALTH_WORDS.runAgain, ask: HEALTH_WORDS.runAgainAsk, detail: HEALTH_WORDS.runAgainDetail };
    case "redrive":
      return {
        press: HEALTH_WORDS.redrive,
        ask: HEALTH_WORDS.redriveAsk(subscriberWords(run.subscriber)),
        detail: HEALTH_WORDS.redriveDetail,
      };
    case "run_kind_again":
      return {
        press: HEALTH_WORDS.runKindAgain,
        ask: HEALTH_WORDS.runKindAgainAsk(jobWords(run.jobKind).toLowerCase()),
        detail: HEALTH_WORDS.runKindAgainDetail,
      };
    case "pause_kind":
      return run.paused
        ? {
            press: HEALTH_WORDS.pause,
            ask: HEALTH_WORDS.pauseAsk(jobWords(run.jobKind).toLowerCase()),
            detail: HEALTH_WORDS.pauseDetail,
          }
        : {
            press: HEALTH_WORDS.resume,
            ask: HEALTH_WORDS.resumeAsk(jobWords(run.jobKind).toLowerCase()),
            detail: HEALTH_WORDS.resumeDetail,
          };
  }
}

/** The act taken, through its route: what it said, in the words a flash shows. */
async function take(run: Run, why: ConsoleWhy): Promise<{ ok: boolean; msg: string }> {
  switch (run.kind) {
    case "run_again":
      return consoleVerbs
        .requeue({ tenant_id: run.tenantId, job_id: run.jobId, why })
        .then((r) => (r.ok ? { ok: true, msg: HEALTH_WORDS.ranAgain } : { ok: false, msg: r.message }));
    case "redrive":
      return consoleVerbs
        .redrive({ subscriber: run.subscriber, why })
        .then((r) =>
          r.ok ? { ok: true, msg: HEALTH_WORDS.redriven(r.data.scheduled) } : { ok: false, msg: r.message },
        );
    case "run_kind_again":
      return consoleVerbs
        .requeueKind({ kind: run.jobKind as JobKind, since: run.sinceIso, why })
        .then((r) =>
          r.ok
            ? { ok: true, msg: HEALTH_WORDS.ranKindAgain(r.data.requeued, r.data.refused) }
            : { ok: false, msg: r.message },
        );
    case "pause_kind":
      return consoleVerbs
        .pauseKind({ kind: run.jobKind as JobKind, paused: run.paused, why })
        .then((r) =>
          r.ok
            ? { ok: true, msg: r.data.paused ? HEALTH_WORDS.pausedNow : HEALTH_WORDS.resumedNow }
            : { ok: false, msg: r.message },
        );
  }
}

/**
 * The act's button, then its reason asked in place; `armed` held by the page where a key arms it (R on Needs a look).
 * Nothing is drawn to a role the act is not theirs.
 */
export function HealthActButton({
  run,
  me,
  flash,
  again,
  armed,
  setArmed,
  primary = true,
  testid,
}: {
  run: Run;
  me: ConsoleMe;
  flash: Flash;
  again: () => void;
  armed: boolean;
  setArmed: (armed: boolean) => void;
  primary?: boolean;
  testid: string;
}) {
  const [busy, setBusy] = useState(false);
  if (!staffMay(me.role, ACT_OF[run.kind])) return null;
  const words = actWordsOf(run);
  const go = async (why: ConsoleWhy) => {
    setBusy(true);
    const said = await take(run, why);
    setBusy(false);
    setArmed(false);
    flash({ tone: said.ok ? "ok" : "danger", msg: <>{said.msg}</> });
    if (said.ok) again();
  };
  if (armed)
    return (
      <WhyAsk
        question={words.ask}
        detail={words.detail}
        yes={words.press}
        busy={busy}
        onYes={(why) => void go(why)}
        onNo={() => setArmed(false)}
        testid={testid}
      />
    );
  return (
    <Button
      size="sm"
      variant={primary ? "primary" : "secondary"}
      onClick={() => setArmed(true)}
      disabled={busy}
      data-testid={testid}
    >
      {words.press}
    </Button>
  );
}

/** The same act where nothing else arms it, holding its own armed state: a row of Background work. */
export function ActInPlace(props: Omit<Parameters<typeof HealthActButton>[0], "armed" | "setArmed">) {
  const [armed, setArmed] = useState(false);
  return <HealthActButton {...props} armed={armed} setArmed={setArmed} />;
}
