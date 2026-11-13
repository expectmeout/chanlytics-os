/**
 * A fill-in on the lead's card (decision 0127). A blank's value is a press of its own in the email's words: it wears a
 * dotted line, and its bubble says what it is, where it came from and whether it changes, with a way into the box at
 * that spot. The receptionist's link has no value to show, so it is a mark that says what will happen (model/fill-ins.ts
 * previewMarkOf), and its bubble is the line the Sequence line draws (../preview.tsx PreviewLine), with Make it now, Open
 * it and Copy link. Both carry `data-fill`, which the email's own tap-to-type looks for and leaves alone (email-words.tsx).
 */
import { PREVIEW_LINE_WORDS, previewLineOf, type LeadEmailPiece, type SlotLead } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Popover } from "../../../kit/popover/popover";
import { LEAD_FILL_WORDS, fillInSaysOf, previewMarkOf } from "../model/fill-ins";
import { PreviewLine } from "../preview";
import { useLeadPreview } from "./preview-read";

/** A blank's value: plain words where nothing can be said of it, else a press that opens its bubble. */
export function FillIn({
  piece,
  lead,
  onChange,
}: {
  piece: LeadEmailPiece;
  lead: SlotLead | null;
  onChange: ((at: number) => void) | null;
}) {
  const says = lead && piece.slot ? fillInSaysOf(piece.slot, lead) : null;
  if (!says) return <span data-at={piece.at}>{piece.text}</span>;
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
