/**
 * Health's two acts (decision 0068): Run again, a failed job's fresh row of its kind and payload (POST
 * platform/jobs/requeue, which refuses a send and says where it is sent again), and Deliver again, every failed or
 * paused delivery of one subscriber once more (POST platform/deliveries/redrive). Each asks why before it runs, armed in
 * place, as every act of the Console does; each is drawn to a role that may take it, and Health reads again after it.
 */
import { useState } from "react";
import { HEALTH_WORDS, subscriberWords, staffMay, type ConsoleWhy } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import type { Flash } from "../parts";
import { consoleVerbs, type ConsoleMe } from "../verbs";
import { WhyAsk } from "../why";

type Run = { kind: "run_again"; jobId: string; tenantId: string } | { kind: "redrive"; subscriber: string };

/** What the act is, as its button, its question and its words after say it. */
function actWordsOf(run: Run) {
  return run.kind === "run_again"
    ? { press: HEALTH_WORDS.runAgain, ask: HEALTH_WORDS.runAgainAsk, detail: HEALTH_WORDS.runAgainDetail }
    : {
        press: HEALTH_WORDS.redrive,
        ask: HEALTH_WORDS.redriveAsk(subscriberWords(run.subscriber)),
        detail: HEALTH_WORDS.redriveDetail,
      };
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
  if (!staffMay(me.role, run.kind === "run_again" ? "job_requeue" : "delivery_redrive")) return null;
  const words = actWordsOf(run);
  const go = async (why: ConsoleWhy) => {
    setBusy(true);
    const said =
      run.kind === "run_again"
        ? await consoleVerbs
            .requeue({ tenant_id: run.tenantId, job_id: run.jobId, why })
            .then((r) => (r.ok ? { ok: true, msg: HEALTH_WORDS.ranAgain } : { ok: false, msg: r.message }))
        : await consoleVerbs
            .redrive({ subscriber: run.subscriber, why })
            .then((r) =>
              r.ok ? { ok: true, msg: HEALTH_WORDS.redriven(r.data.scheduled) } : { ok: false, msg: r.message },
            );
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
