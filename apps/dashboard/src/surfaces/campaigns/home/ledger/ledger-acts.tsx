/**
 * What a row of Campaigns' ledger presses where it stands (spec 2026-10-09 §4.3; decisions 5, 7, 14 and 19). A run that
 * waits is approved or skipped on its row and nowhere else on the screen: "Approve · 7 people" and "Skip", each naming
 * its run to a screen reader, Skip asking first (the kit's Confirm, as Sent's row asks it), and where the verb would
 * refuse the approval (its day has passed, the workspace is paused) its whole sentence and Skip alone. A paused campaign
 * is resumed by a question in place that says when it runs next and to about how many, and an `auto` mode in full. An
 * empty moment's Turn on and a group's add are a press, or a door where they open a page. No switch on a row (decision
 * 5): these are the only presses a row carries. Moved from Coming up's line (tiles.tsx), which keeps the time and
 * "Waiting on you".
 */
import { useEffect, useRef, useState } from "react";
import { LIFECYCLE_WORDS } from "@chanlytics/contracts";
import type { LifecycleAct, LifecycleRow, LifecycleWaiting } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Confirm } from "../../../kit/confirm/confirm";
import { Icon } from "../../../kit/icon/icon";
import type { RouteDoor } from "../../../legacy-verbs";

/**
 * What a waiting run's acts press (home-page.tsx decides; the row only says which): approve it, or skip it once the
 * question is answered. One run at a time: while one is with the server, every row's acts wait.
 */
export interface LedgerApproval {
  /** The run a press is working on now. */
  busy: string | null;
  /** The run whose Skip was pressed and waits for its answer. */
  asking: string | null;
  onAsk: (runId: string | null) => void;
  onApprove: (r: LifecycleRow) => Promise<void>;
  onSkip: (r: LifecycleRow) => Promise<void>;
  /** Whether the role may approve or skip; Approve is drawn for every role and says who may (`gated`). */
  canAct: boolean;
  gated: Record<string, unknown>;
}

/** What the ledger's rows and heads press: the page decides (home-page.tsx). */
export interface LedgerActs {
  /** The door a row's name or a group's add is, where its act opens a page (the drawer, pushed; Sent, the Library). */
  door: (act: LifecycleAct) => RouteDoor | null;
  /** A press that acts where it stands: Turn on, Resume once asked. */
  onAct: (act: LifecycleAct) => void;
  /** The role's gate on Turn on and Resume. */
  gated: Record<string, unknown>;
  approval: LedgerApproval;
}

interface WaitingProps {
  r: LifecycleRow;
  w: LifecycleWaiting;
  /** "Approve · 7 people": the ledger's words for it (decision 19). */
  approve: string;
  approval: LedgerApproval;
}

/** Why a waiting run cannot be approved: the verb's whole sentence. */
function Refusal({ why }: { why: string }) {
  return (
    <span className="cmh-dim cmh-row-why" data-testid="cmh-row-refusal">
      {why}
    </span>
  );
}

/** A waiting run's acts, or the question Skip asks in their place. A No hands the keyboard back to the Skip that asked. */
export function WaitingActs({ r, w, approve, approval }: WaitingProps) {
  const W = LIFECYCLE_WORDS.coming.approval;
  const asking = approval.canAct && approval.asking === w.runId;
  const skip = useRef<HTMLButtonElement>(null);
  const asked = useRef(false);
  useEffect(() => {
    if (asked.current && !asking) skip.current?.focus();
    asked.current = asking;
  }, [asking]);
  const busy = approval.busy === w.runId;
  const inFlight = approval.busy !== null;
  // A role that may not skip a run the verb would refuse has nothing to press: its words say why it waits.
  if (w.refusal && !approval.canAct) return <Refusal why={w.refusal} />;
  return (
    <div className="cmh-row-decide" data-testid="cmh-waiting-acts">
      {asking ? (
        <Confirm
          question={W.question(r.name)}
          detail={W.detail}
          yes={W.yes}
          danger
          busy={busy}
          ready={!inFlight || busy}
          onYes={() => void approval.onSkip(r)}
          onNo={() => approval.onAsk(null)}
          testid="cmh-skip"
        />
      ) : (
        <>
          {w.refusal ? (
            <Refusal why={w.refusal} />
          ) : (
            <Button
              variant="primary"
              size="sm"
              disabled={inFlight}
              onClick={() => approval.onApprove(r)}
              aria-label={busy ? undefined : W.approveOf(r.name)}
              data-testid="cmh-approve"
              {...approval.gated}
            >
              <Icon name="check" size={12} /> {busy ? W.approving : approve}
            </Button>
          )}
          {approval.canAct ? (
            <Button
              ref={skip}
              size="sm"
              disabled={inFlight}
              onClick={() => approval.onAsk(w.runId)}
              aria-label={W.skipOf(r.name)}
              data-testid="cmh-skip"
            >
              {LIFECYCLE_WORDS.ledger.skip}
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

type ResumeOf = Extract<LifecycleAct, { kind: "resume" }>;

/**
 * A Resume's question, held by whoever draws it: the press and the question where the press stood (a desk row, a card),
 * or apart (a phone row: the press at the row's end, the question under the row at its whole width, as a waiting run's
 * acts stand). No puts the press back with the keyboard on it.
 */
export function useResumeAsk() {
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
export function ResumePress({
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
export function ResumeQuestion({
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

/** A group's add or an empty moment's Turn on: a door where it opens a page (Leads), a press where it acts. */
export function AddAct({ act, acts, testid }: { act: LifecycleAct; acts: LedgerActs; testid: string }) {
  const door = acts.door(act);
  const glyph = act.kind === "turn_on" ? <Icon name="plus" size={12} /> : null;
  if (door) {
    return (
      <Button variant="quiet" size="sm" {...door} data-testid={testid}>
        {glyph} {act.label}
      </Button>
    );
  }
  return (
    <Button variant="quiet" size="sm" onClick={() => acts.onAct(act)} data-testid={testid} {...acts.gated}>
      {glyph} {act.label}
    </Button>
  );
}
