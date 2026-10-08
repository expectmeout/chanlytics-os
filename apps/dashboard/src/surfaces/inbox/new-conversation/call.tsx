/**
 * A new conversation's call (the design's 4.2): the brief Ask wrote, with what is known of them said by code; the
 * member's own phone rings them, as a lead is called and as their page offers, never the receptionist; and after it,
 * one line of how it went, kept as a note, with whether the receptionist should know. Hookless: the sheet's state is
 * handed in (state.ts). A person with no number, or on the do-not-contact list, is offered no call, and told why.
 */
import { NEW_CONVERSATION_WORDS as W, PLAN_NOTE_MAX, type CallBrief, type PersonReachDto } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Field } from "../../kit/field/field";
import { Switch } from "../../kit/switch/switch";
import { onSendKey } from "./state";
import type { SheetState } from "./state";

/** A part of the brief that holds lines: said only where it holds one. */
function briefLines(lead: string, lines: readonly string[]) {
  if (!lines.length) return null;
  return (
    <>
      <p className="ix-new-lead">{lead}</p>
      <ul className="ix-new-list">
        {lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </>
  );
}

/** The brief: what is known, how to open, what to say, what to leave out, what to ask for. */
function briefPart(brief: CallBrief, facts: readonly string[]) {
  const B = W.brief;
  return (
    <section className="ix-new-part" data-testid="ix-new-brief">
      {briefLines(B.know, facts)}
      {brief.opening ? (
        <>
          <p className="ix-new-lead">{B.open}</p>
          <p className="ix-new-quote">{brief.opening}</p>
        </>
      ) : null}
      {briefLines(B.say, brief.points)}
      {briefLines(B.avoid, brief.avoid)}
      {brief.ask ? (
        <>
          <p className="ix-new-lead">{B.ask}</p>
          <p className="ix-new-quote">{brief.ask}</p>
        </>
      ) : null}
    </section>
  );
}

/** Copy their number, and say so. */
function copyNumber(s: SheetState, tel: string) {
  try {
    if (navigator.clipboard) void navigator.clipboard.writeText(tel);
  } catch {
    /* a browser that will not */
  }
  s.flashed({ msg: W.call.copied });
}

export function NewCall({ s, reach }: { s: SheetState; reach: PersonReachDto }) {
  const C = W.call;
  const { tel } = reach.call;
  if (!reach.call.ok || !tel)
    return (
      <p className="ix-new-lead" data-testid="ix-new-no-call">
        {reach.call.why}
      </p>
    );
  const { brief, facts } = s.ask.asked;
  return (
    <>
      {brief ? briefPart(brief, facts) : null}
      <div className="ix-new-acts">
        {/* One filled act at a time: the call, until something is written of how it went; then keeping it (the foot's). */}
        <Button
          variant={s.written.after.trim() ? "secondary" : "primary"}
          href={`tel:${tel.replace(/[^\d+]/g, "")}`}
          data-testid="ix-new-call"
        >
          {C.from}
        </Button>
        <Button onClick={() => copyNumber(s, tel)} data-testid="ix-new-copy">
          {C.copy}
        </Button>
      </div>
      <section className="ix-new-part">
        <Field
          label={C.after}
          rows={2}
          value={s.written.after}
          onValueChange={(after) => s.patch({ after })}
          onKeyDown={onSendKey(() => void s.finishCall())}
          maxLength={PLAN_NOTE_MAX}
          data-testid="ix-new-after"
        />
        {reach.receptionist.answers ? (
          <Field
            label={C.tell}
            control={
              <Switch
                label={C.tell}
                checked={s.written.tell}
                onCheckedChange={(tell) => s.patch({ tell })}
                data-testid="ix-new-tell"
              />
            }
          />
        ) : null}
      </section>
    </>
  );
}
