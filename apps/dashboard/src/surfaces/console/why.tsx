/**
 * The reason ask (decision 0066, the canvas's "Ask" board): every act the Console takes asks why before it runs, armed
 * in place under the control that armed it. What the act does and what it costs first, then why (a ticket, they asked
 * on a call, found it, cleanup), the ticket when that is the reason, and a note; the act is written down against
 * the person with all of it before it runs. A partner reads the note of a decision about them, so there it is asked for.
 *
 * Drawn from the kit: the segmented control, two fields and the one Confirm, whose Yes waits until the reason is whole.
 */
import { useState, type ReactNode } from "react";
import {
  CONSOLE_WORDS,
  REASON_KINDS,
  REASON_LIMITS,
  REASON_WORDS,
  type ConsoleWhy,
  type ReasonKind,
} from "@chanlytics/contracts";
import { Confirm } from "../kit/confirm/confirm";
import { Field } from "../kit/field/field";
import { Panel } from "../kit/panel/panel";
import { Segmented } from "../kit/segmented/segmented";

/** The reason as typed so far, and whether the act may go on it. */
function reasonOf(kind: ReasonKind, ticket: string, note: string, noteNeeded: boolean): ConsoleWhy | null {
  const t = ticket.trim();
  const n = note.trim();
  if (kind === "ticket" && !t) return null;
  if (noteNeeded && !n) return null;
  if (t.length > REASON_LIMITS.ticket || n.length > REASON_LIMITS.note) return null;
  return { kind, ticket: t || null, note: n || null };
}

export function WhyAsk({
  question,
  detail = null,
  yes,
  danger = false,
  busy = false,
  noteFor = null,
  whole = true,
  children = null,
  onYes,
  onNo,
  testid,
}: {
  question: ReactNode;
  detail?: ReactNode;
  yes: string;
  danger?: boolean;
  busy?: boolean;
  /** Who reads the note besides the log ("the partner"): the note is then asked for. */
  noteFor?: string | null;
  /** The act's own fields (a payout's reference), drawn above the reason. */
  children?: ReactNode;
  /** Whether those fields are whole: the Yes waits for them as for the reason. */
  whole?: boolean;
  onYes: (why: ConsoleWhy) => void;
  onNo: () => void;
  testid: string;
}) {
  const [kind, setKind] = useState<ReasonKind>("found");
  const [ticket, setTicket] = useState("");
  const [note, setNote] = useState("");
  const why = reasonOf(kind, ticket, note, !!noteFor);
  return (
    <Panel variant="inset" size="sm" className="cs-why" data-testid={`${testid}-why`}>
      <span className="cs-why-q">{question}</span>
      {detail ? <span className="cs-why-detail">{detail}</span> : null}
      {children}
      <Segmented
        label={CONSOLE_WORDS.why}
        value={kind}
        onValueChange={setKind}
        options={REASON_KINDS.map((k) => ({ value: k, label: REASON_WORDS[k], testid: `${testid}-why-${k}` }))}
      />
      {kind === "ticket" && (
        <Field
          label={CONSOLE_WORDS.ticket}
          value={ticket}
          onValueChange={setTicket}
          placeholder={CONSOLE_WORDS.ticketHint}
          maxLength={REASON_LIMITS.ticket}
          spellCheck={false}
          data-testid={`${testid}-why-ticket`}
        />
      )}
      <Field
        label={noteFor ? `Why, for ${noteFor}` : CONSOLE_WORDS.note}
        value={note}
        onValueChange={setNote}
        placeholder={CONSOLE_WORDS.noteHint}
        maxLength={REASON_LIMITS.note}
        rows={2}
        data-testid={`${testid}-why-note`}
      />
      <Confirm
        block
        question={CONSOLE_WORDS.recorded}
        yes={yes}
        no={CONSOLE_WORDS.notNow}
        danger={danger}
        busy={busy}
        ready={!!why && whole}
        onYes={() => why && onYes(why)}
        onNo={onNo}
        testid={testid}
      />
    </Panel>
  );
}
