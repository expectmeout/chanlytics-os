/**
 * A line that stopped part-way, set up again in place (verb:retry-line:<id>): the one retry Start's row and Connections' phone
 * row both press (contracts ownLineStandOf says when it is offered), with the one set of words after it. Connections' Retry
 * walked to the first-run phone step instead of retrying (D1-line-row-derivations).
 */
import { canDo, type LegacyFlash } from "../legacy-verbs";
import { setupVerbs } from "./surface";

/** Set the line up again, and say what came of it. A member who may not manage the team is not offered the press, and is refused here. */
export async function retryLineInPlace(lineId: string, flash: (f: LegacyFlash) => void): Promise<void> {
  if (!canDo("team")) return;
  flash({ tone: "info", msg: <>Retrying — usually a minute or two.</> });
  const r = await setupVerbs.lines.retry(lineId);
  flash({
    tone: r.ok ? "ok" : "danger",
    msg: r.ok ? (
      r.queued ? (
        <>Setting up again — this page updates by itself.</>
      ) : (
        <>Your line answers now.</>
      )
    ) : (
      <>{r.message || "It stopped again — a person at Chanlytics has it."}</>
    ),
  });
}
