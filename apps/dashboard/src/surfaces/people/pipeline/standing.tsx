/**
 * Where the Pipeline stands, said to the frame's head in Glass (the plan's step 5.4, canvas D1): the page's name, the
 * line over its table in words, and the page's one filled button, New proposal, at the right of the row of views, where
 * the canvas puts it, a desk's tools before it (the page heads canvas, H1, 31 Oct 2026). The sentence is the same parts
 * the standing line draws (contracts pipelineOf `line`), so no two of them say different numbers. People's and a person's standing are said by page/people-head.tsx; the Pipeline says its own because the act
 * is the page's, and the route cannot reach it.
 */
import type { ReactNode } from "react";
import { Button } from "../../kit/button/button";
import { ActWords } from "../../kit/head/act-words";
import { useStanding } from "../../kit/head/standing";
import { Icon } from "../../kit/icon/icon";
import type { gate } from "../../legacy-verbs";
import { P } from "./pipe";

/** New proposal as the page offers it: the press, and the honesty gate's props for a role that may not. */
interface PipelineNewAct {
  openNew: () => void;
  gate: ReturnType<typeof gate>;
}

export function usePipelineStanding(
  line: readonly { words: string }[],
  newAct: PipelineNewAct | null,
  tools: ReactNode = null,
): void {
  const sentence = line.map((part) => part.words).join(" · ");
  // The one filled button, shown to every role and said why where the role may not press it.
  const add = newAct ? (
    <Button
      variant="primary"
      size="sm"
      className="pipe-new-btn"
      onClick={newAct.openNew}
      data-testid="pipeline-new-open"
      {...newAct.gate}
    >
      <ActWords icon={<Icon name="plus" size={12} />} words={P.words.newProposal.button} />
    </Button>
  ) : null;
  useStanding({
    title: "Pipeline",
    sentence: sentence || undefined,
    // A desk's tools before it (scope-screen.tsx pipelineTools: Columns, the list or the board).
    act: tools ? (
      <>
        {tools}
        {add}
      </>
    ) : (
      (add ?? undefined)
    ),
    // A scope is picked in the page's own strip (People | Leads | Pipeline), so it has no way back above its name (D1).
    back: null,
  });
}
