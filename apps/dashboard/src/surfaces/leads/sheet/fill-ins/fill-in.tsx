/**
 * A fill-in on the lead's card (decision 0127). A blank's value is a press of its own in the email's words: it wears a
 * dotted line, and its bubble says what it is, where it came from and whether it changes, with a way into the box at
 * that spot. The receptionist's link has no value to show, so it is a mark that says what will happen (model/fill-ins.ts
 * previewMarkOf), and its bubble is the line the Sequence line draws (../preview.tsx PreviewLine), with Make it now, Open
 * it and Copy link. Both carry `data-fill`, which the email's own tap-to-type looks for and leaves alone (email-words.tsx).
 * A lead's own name and city can be put right from the bubble for every email to them (00631 lead_named), by who may
 * find leads: a press of its own under the one that changes this email alone.
 */
import { useState, type SyntheticEvent } from "react";
import {
  LEAD_NAMED,
  PREVIEW_LINE_WORDS,
  previewLineOf,
  type LeadCardLead,
  type LeadEmailPiece,
} from "@chanlytics/contracts";
import { canDo } from "../../../frame-verbs";
import { Button } from "../../../kit/button/button";
import { Field, fieldProblem } from "../../../kit/field/field";
import { Popover } from "../../../kit/popover/popover";
import { LEAD_FILL_WORDS, fillInFixOf, fillInSaysOf, previewMarkOf } from "../model/fill-ins";
import { nameLead } from "../../surface";
import { PreviewLine } from "../preview";
import { useLeadPreview } from "./preview-read";

/**
 * A lead's name or city put right on the lead itself (00631 lead_named): every email to them says it from then on. The
 * box opens on what the email says now; Save waits for something else to be typed, so nothing is sent to be refused.
 */
function FixForEvery({ leadId, field, shown }: { leadId: string; field: "name" | "city"; shown: string }) {
  const words = LEAD_FILL_WORDS.every;
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(shown);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const typed = text.replace(/\s+/g, " ").trim();
  const fits = field === "name" ? typed.length >= LEAD_NAMED.name.min : typed.length > 0;
  const save = async (event: SyntheticEvent) => {
    event.preventDefault();
    if (busy || !fits || typed === shown) return;
    setBusy(true);
    setProblem(null);
    const answer = await nameLead(leadId, field === "name" ? { business_name: typed } : { city: typed }).finally(() =>
      setBusy(false),
    );
    if (!answer.ok) {
      setProblem(answer.message || words.failed);
      return;
    }
    setDone(words.saved(answer.data.again));
    setOpen(false);
  };
  if (done)
    return (
      <p className="lw-note" role="status" data-testid="lead-card-fill-every-done">
        {done}
      </p>
    );
  if (!open)
    return (
      <Button size="sm" variant="secondary" onClick={() => setOpen(true)} data-testid="lead-card-fill-every">
        {words.open}
      </Button>
    );
  return (
    <form className="lw-fill-fix" onSubmit={save}>
      <Field
        label={field === "name" ? words.name : words.city}
        value={text}
        onValueChange={setText}
        readOnly={busy}
        maxLength={field === "name" ? LEAD_NAMED.name.max : LEAD_NAMED.city.max}
        data-testid="lead-card-fill-every-text"
        {...fieldProblem(problem)}
      />
      <p className="lw-note">{words.note}</p>
      <Button
        type="submit"
        size="sm"
        disabled={busy || !fits || typed === shown}
        data-testid="lead-card-fill-every-save"
      >
        {words.save}
      </Button>
    </form>
  );
}

/** A blank's value: plain words where nothing can be said of it, else a press that opens its bubble. */
export function FillIn({
  piece,
  lead,
  leadId,
  onChange,
}: {
  piece: LeadEmailPiece;
  lead: LeadCardLead | null;
  /** The lead whose own name and city can be put right from here; null where the card has none to name. */
  leadId: string | null;
  onChange: ((at: number) => void) | null;
}) {
  const says = lead && piece.slot ? fillInSaysOf(piece.slot, lead, lead.found ?? null) : null;
  if (!says) return <span data-at={piece.at}>{piece.text}</span>;
  const fix = leadId && piece.slot && canDo("find") ? fillInFixOf(piece.slot) : null;
  return (
    <Popover
      label={says.title}
      side="bottom"
      align="start"
      className="lw-fill-says"
      trigger={
        <Button
          variant="quiet"
          size="text"
          className="lw-fill"
          data-fill=""
          data-at={piece.at}
          data-testid="lead-card-fill"
        >
          {piece.text}
        </Button>
      }
    >
      <p className="lw-fill-t">{says.title}</p>
      {says.from ? <p className="lw-note">{says.from}</p> : null}
      <p className="lw-note">{says.varies}</p>
      {onChange ? (
        <Button size="sm" variant="secondary" onClick={() => onChange(piece.at)} data-testid="lead-card-fill-change">
          {LEAD_FILL_WORDS.change}
        </Button>
      ) : null}
      {fix && leadId ? <FixForEvery leadId={leadId} field={fix} shown={piece.text} /> : null}
    </Popover>
  );
}

/** The receptionist's link in the words: a mark that says what will happen, and opens its line and presses. */
export function ReceptionistMark({ leadId, at }: { leadId: string | null; at: number }) {
  const read = useLeadPreview(leadId);
  const dto = read.state === "read" ? read.data : null;
  const now = new Date();
  const mark = previewMarkOf(dto, now);
  const line = dto ? previewLineOf(dto, now) : null;
  const tone = mark ? mark.tone : "quiet";
  const words = (
    <>
      {PREVIEW_LINE_WORDS.title}
      {mark ? <span className="lw-recep-say"> · {mark.say}</span> : null}
    </>
  );
  if (!leadId || !line)
    return (
      <span className="lw-recep" data-fill="" data-at={at} data-tone={tone} data-testid="lead-card-receptionist">
        {words}
      </span>
    );
  return (
    <Popover
      label={PREVIEW_LINE_WORDS.title}
      side="bottom"
      align="start"
      className="lw-fill-says"
      trigger={
        <Button
          variant="quiet"
          size="text"
          className="lw-recep"
          data-fill=""
          data-at={at}
          data-tone={tone}
          data-testid="lead-card-receptionist"
        >
          {words}
        </Button>
      }
    >
      <p className="lw-fill-t">{PREVIEW_LINE_WORDS.title}</p>
      <PreviewLine leadId={leadId} line={line} />
    </Popover>
  );
}
