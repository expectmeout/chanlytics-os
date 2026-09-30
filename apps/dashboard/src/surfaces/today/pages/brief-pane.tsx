/**
 * Your brief (canvas E3, Glass): what the day says in prose, beside the queue -- the day's one line, then the lines
 * that are not numbers (a reply that failed, a review that landed, what ran, the receipts), which the day's card draws
 * under its figures in Classic (card.tsx recapBeats: the same lines, drawn once, here in Glass and there in Classic).
 * One door: a follow-up to Ask, grounded in the same line. Drawn by the Glass composition alone (today-page.tsx).
 */
import type { TodayVM } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { surfaceValue } from "../../surface-values";
import { appNavigate, askAbout, useMoved, workspaceClock } from "../shell";
import { recapBeats } from "./card";

/** The brief's line: the day's own, or a quiet day's headline with the proof the lines are listening. */
export function briefLine(vm: TodayVM): string | null {
  return vm.recap ? vm.recap.line : vm.quiet ? `${vm.quiet.headline} ${vm.proof}` : null;
}

export const TodayBriefPane = () => {
  useMoved(["today", "reports"]);
  const vm = surfaceValue("today");
  if (!vm) return null;
  const line = briefLine(vm);
  if (!line) return null;
  const clock = workspaceClock();
  const asOf = clock ? clock.time(Date.now()) : null;
  return (
    <section className="tsec tb" data-testid="today-brief" aria-labelledby="today-brief-title">
      <div className="tsec-head">
        <span className="tsec-title" id="today-brief-title">
          Your brief
        </span>
        {asOf && <span className="tb-eyebrow tabular">As of {asOf}</span>}
      </div>
      <div className="tb-body">
        <p className="tb-line" data-testid="today-brief-line">
          {line}
        </p>
        {recapBeats(vm, appNavigate)}
      </div>
      <div className="tb-foot" data-testid="today-brief-ask">
        <Button variant="quiet" size="sm" onClick={() => askAbout({ prompt: `${line} What should I do next?` })}>
          Ask a follow-up
        </Button>
      </div>
    </section>
  );
};
