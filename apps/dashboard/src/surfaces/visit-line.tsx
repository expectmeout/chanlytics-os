/**
 * A visit, said where it is seen (decision 0047, D1-visit-mark): the parts every page that draws a visit line shares, so the
 * Calendar's panel, the person's History and Coming up, People's Visits cell, the Inbox's chip and Today say how a visit
 * stands in one way and ask the same two questions in one way. The line is contracts' (calendar-words.ts visitLineOf): its
 * state, its match and the presses it may be asked with are worked out there, and these parts draw them, with the kit.
 *
 * What a press does is the Calendar's own door (POST calendar/visits/[id], an operator's: the gate says so to anyone else,
 * and the door refuses what it would not allow in its own sentence). The refresh map re-reads every page that draws a visit
 * behind it (refresh-map.ts `visits`), so a press made here moves the board, People, the Inbox's chip and Today at once.
 */
import { useState } from "react";
import {
  VISIT_ASK_WORDS,
  VISIT_WORDS,
  appointmentWordOf,
  appointmentWords,
  type AppointmentWord,
  type VisitLineVM,
  type VisitMark,
  type VisitStateVM,
  type VisitWord,
} from "@chanlytics/contracts";
import { api } from "@/legacy-bridge/api";
import { workspaceOverride } from "@/legacy-bridge/surface-data";
import { Button } from "./kit/button/button";
import { Confirm } from "./kit/confirm/confirm";
import { StatePill } from "./kit/pill/state-pill";
import { gate } from "./shell-doors";

/**
 * What this workspace calls a visit (contracts appointmentWordOf: how its customers buy, as the workspace list the shell holds
 * says it), for the words a page says of one: the cancel's question here, and the booking link handed to the customer. An
 * appointment while the list is not held, as everywhere a workspace has said nothing.
 */
export function visitWordHere(): AppointmentWord {
  return appointmentWordOf({ stored: null, sellsBy: workspaceOverride.current()?.sells_by ?? null });
}

/** What the door answered: it wrote, or it refused in a sentence for the person who asked. */
type VisitSaid = { ok: true } | { ok: false; message: string };

/** Say what became of a visit, on the record's row for it: the one door every page presses (POST calendar/visits/[id]). */
export async function sayVisit(id: string, status: VisitWord): Promise<VisitSaid> {
  const r = await api()("POST calendar/visits/[id]", { params: { id }, body: { status } });
  return r.ok ? { ok: true } : { ok: false, message: r.message };
}

/**
 * How a visit stands, as the kit's pill in the tone its state wears (Kept done, Missed for a person to look at, Past and
 * Cancelled plain); nothing while it is ahead. A visit that has ended and nobody has marked says so on hover.
 */
export function VisitState({
  state,
  unmarked = false,
  className,
  testid,
}: {
  state: VisitStateVM | null;
  unmarked?: boolean;
  className?: string;
  testid?: string;
}) {
  if (!state) return null;
  return (
    <StatePill
      kind="tone"
      value={state.pill}
      label={state.text}
      title={unmarked ? VISIT_ASK_WORDS.unmarked : null}
      className={className}
      testid={testid}
    />
  );
}

/**
 * The presses a visit may be said with (the contracts' list: the door's own rules), each gated as a deal's are, and the door's
 * refusal in its own sentence. Cancelled is final (the door keeps it so), so it is asked first, in the kit's one shape; kept
 * and missed are said at once, and correct each other. Once the door has written, the word is said in place of the presses
 * until the page reads again and the visit stands as it was told. `testid` names each press, the question and the refusal;
 * `door` is the Calendar's (sayVisit), which a test of the part hands its own in place of.
 */
export function VisitActs({
  mark,
  acts,
  testid,
  door = sayVisit,
  variant = "quiet",
}: {
  mark: VisitMark;
  acts: readonly VisitWord[];
  testid: string;
  door?: typeof sayVisit;
  /** The presses' look: quiet words on a line of words, the default button where they are a row's act (Up next). */
  variant?: "quiet" | "secondary";
}) {
  const [busy, setBusy] = useState<VisitWord | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  // The word the door has taken, kept while the visit still stands as it did: a page that reads again brings new acts.
  const [said, setSaid] = useState<{ from: string; word: VisitWord } | null>(null);
  if (said && said.from === mark.status)
    return (
      <span className="visit-said" role="status" data-testid={`${testid}-said`}>
        {VISIT_WORDS[said.word]}
      </span>
    );
  if (acts.length === 0) return null;
  const say = async (status: VisitWord) => {
    setBusy(status);
    setProblem(null);
    try {
      const r = await door(mark.id, status);
      if (r.ok) setSaid({ from: mark.status, word: status });
      else setProblem(r.message);
    } finally {
      setBusy(null);
      setAsking(false);
    }
  };
  return (
    <>
      <span className="visit-acts">
        {acts.map((status) => (
          <Button
            key={status}
            variant={variant}
            size="sm"
            data-testid={`${testid}-${status}`}
            disabled={busy !== null || asking}
            onClick={() => (status === "cancelled" ? setAsking(true) : void say(status))}
            {...gate("approve", VISIT_ASK_WORDS.gate)}
          >
            {VISIT_WORDS[status]}
          </Button>
        ))}
      </span>
      {asking && (
        <Confirm
          question={appointmentWords(visitWordHere()).cancelAsk}
          detail={VISIT_ASK_WORDS.cancel.detail}
          yes={VISIT_ASK_WORDS.cancel.yes}
          no={VISIT_ASK_WORDS.cancel.no}
          danger
          busy={busy === "cancelled"}
          onYes={() => void say("cancelled")}
          onNo={() => setAsking(false)}
          testid={`${testid}-cancel`}
        />
      )}
      {problem && (
        <span className="visit-refused" role="alert" data-testid={`${testid}-refused`}>
          {problem}
        </span>
      )}
    </>
  );
}

/**
 * "Did they come?", with Kept and Missed, for a visit that has begun and nobody has marked (visitLineOf's `asks`): the
 * person's History and Coming up. Nothing for a visit the record has no row for or one that has been marked.
 */
export function VisitAsk({ line, testid, door }: { line: VisitLineVM; testid: string; door?: typeof sayVisit }) {
  if (!line.mark || !line.mark.id || line.asks.length === 0) return null;
  return (
    <span className="visit-ask" data-testid={testid}>
      <span className="visit-ask-question">{VISIT_ASK_WORDS.question}</span>
      <VisitActs mark={line.mark} acts={line.asks} testid={`${testid}-act`} door={door} />
    </span>
  );
}
