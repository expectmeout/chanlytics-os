/**
 * Where the Pipeline stands, said to the frame's head in Glass (the plan's step 5.4, canvas D1): the page's name, the
 * line over its table in words, and the page's one filled button, New proposal, at the right of the row of views, where
 * the canvas puts it. Classic draws no head, so the button stays in the controls row there (scope-screen.tsx); the
 * sentence is the same parts the standing line draws (contracts pipelineOf `line`), so no two of them say different
 * numbers. People's and a person's standing are said by page/people-head.tsx; the Pipeline says its own because the act
 * is the page's, and the route cannot reach it.
 */
import { useStanding } from "../../kit/head/standing";
import { Icon } from "../../kit/icon/icon";
import { useLook } from "../../kit/look/look";
import type { gate } from "../../legacy-verbs";
import { P } from "./pipe";

/** New proposal as the page offers it: the press, and the honesty gate's props for a role that may not. */
export interface PipelineNewAct {
  openNew: () => void;
  gate: ReturnType<typeof gate>;
}

export function usePipelineStanding(line: readonly { words: string }[], newAct: PipelineNewAct | null): void {
  const glass = useLook() === "glass";
  const sentence = line.map((part) => part.words).join(" · ");
  useStanding({
    title: "Pipeline",
    sentence: sentence || undefined,
    // The one filled button, shown to every role and said why where the role may not press it (as the controls row draws it).
    act:
      glass && newAct ? (
        <button
          type="button"
          className="btn btn-primary btn-sm pipe-new-btn"
          onClick={newAct.openNew}
          data-testid="pipeline-new-open"
          {...newAct.gate}
        >
          <Icon name="plus" size={12} /> {P.words.newProposal.button}
        </button>
      ) : undefined,
    // A scope is picked in the page's own strip (People | Leads | Pipeline), so it has no way back above its name (D1).
    back: null,
  });
}
