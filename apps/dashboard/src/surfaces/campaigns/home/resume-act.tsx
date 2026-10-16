/**
 * A paused campaign's Resume, asked in place (spec 2026-10-09 §4.3, decision 7): the press, and where it stood the question
 * that says when it runs next and to about how many, and an `auto` mode in full. Drawn by a reach-out's lines on Leads
 * (leads/reach-out/lines.tsx); the ledger of Campaigns' home that drew it first went with decision 0060's S6.
 */
import { useEffect, useRef, useState } from "react";
import { LIFECYCLE_WORDS } from "@chanlytics/contracts";
import type { LifecycleAct } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";

type ResumeOf = Extract<LifecycleAct, { kind: "resume" }>;

/**
 * A Resume's question, held by whoever draws it: the press and the question where the press stood (a desk row, a card),
 * or apart (a phone row: the press at the row's end, the question under the row at its whole width, as a waiting run's
 * acts stand). No puts the press back with the keyboard on it.
 */
function useResumeAsk() {
  const [asking, setAsking] = useState(false);
  const back = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current && !asking) back.current?.focus();
    asked.current = asking;
  }, [asking]);
  return { asking, setAsking, back };
}
type ResumeAsk = ReturnType<typeof useResumeAsk>;

interface ResumePartProps {
  act: ResumeOf;
  ask: ResumeAsk;
  testid?: string;
  /** The class a row hands it (a phone row's end, or its line under the row). */
  className?: string;
}

/** Resume's press: drawn while nothing is asked. */
function ResumePress({
  act,
  ask,
  gated,
  testid = "cmh-resume",
  className,
}: ResumePartProps & { gated: Record<string, unknown> }) {
  if (ask.asking) return null;
  return (
    <Button
      ref={ask.back}
      size="sm"
      className={className}
      onClick={() => ask.setAsking(true)}
      data-testid={testid}
      {...gated}
    >
      <Icon name="play" size={12} /> {act.label}
    </Button>
  );
}

/**
 * Resume's question (decision 7): when it runs next and to about how many, and an `auto` mode in full, in the view
 * model's words; Yes resumes, No puts the press back.
 */
function ResumeQuestion({
  act,
  ask,
  onAct,
  testid = "cmh-resume",
  className,
}: ResumePartProps & { onAct: (act: LifecycleAct) => void }) {
  if (!ask.asking) return null;
  return (
    <Confirm
      question={act.ask.question}
      detail={act.ask.detail}
      yes={LIFECYCLE_WORDS.ledger.resume.yes}
      onYes={() => {
        ask.setAsking(false);
        onAct(act);
      }}
      onNo={() => ask.setAsking(false)}
      className={className}
      testid={testid}
    />
  );
}

interface ResumeProps {
  act: ResumeOf;
  onAct: (act: LifecycleAct) => void;
  gated: Record<string, unknown>;
  testid?: string;
}

/** A paused campaign's Resume, asked in place (decision 7): its press, or its question where the press stood. */
export function ResumeAct({ act, onAct, gated, testid = "cmh-resume" }: ResumeProps) {
  const ask = useResumeAsk();
  return ask.asking ? (
    <ResumeQuestion act={act} ask={ask} onAct={onAct} testid={testid} />
  ) : (
    <ResumePress act={act} ask={ask} gated={gated} testid={testid} />
  );
}
