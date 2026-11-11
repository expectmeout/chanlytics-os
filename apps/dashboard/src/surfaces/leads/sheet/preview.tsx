/**
 * The lead sheet's Their receptionist (decision 0079, L5): the line a lead's own receptionist says to its sender, what
 * the business said is not right under it, and its three presses: Make it now (a workspace of ours, none made yet),
 * Open it (the page as the sender looks at it, which counts nothing) and Copy link. Its read is the sheet's one
 * (preview-read.ts): painted from the tab's last answer, read again behind, and again after a press. A refusal is said
 * where it was pressed. Every word is contracts'.
 *
 * The line and its presses are a part of their own (PreviewLine), drawn under Sequence here and in the bubble the card's
 * mark opens (fill-in.tsx, decision 0126).
 */
import { useState } from "react";
import { PREVIEW_LINE_WORDS as W, previewLineOf, type LeadPreviewLineVM } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { CopyButton } from "../../kit/copy-button/copy-button";
import { LinkButton } from "../../kit/link-button/link-button";
import { gate } from "../../frame-verbs";
import { makeLeadPreview, useLeadPreview } from "./preview-read";

/** The line and its presses, wherever they are drawn. */
export function PreviewLine({ leadId, line }: { leadId: string; line: LeadPreviewLineVM }) {
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const make = async () => {
    setBusy(true);
    setRefused(null);
    const why = await makeLeadPreview(leadId);
    setBusy(false);
    setRefused(why);
  };
  return (
    <>
      <p className="lw-preview-l" data-tone={line.tone} data-testid="lead-sheet-preview-line">
        {line.words}
      </p>
      {line.said.map((s) => (
        <p key={s} className="lw-note" data-testid="lead-sheet-preview-said">
          {s}
        </p>
      ))}
      <div className="lw-seq-foot">
        {line.make ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => void make()}
            data-testid="lead-sheet-preview-make"
            {...gate("approve", "make their receptionist")}
          >
            {W.make}
          </Button>
        ) : null}
        {line.open ? (
          <LinkButton href={line.open} target="_blank" rel="noreferrer" data-testid="lead-sheet-preview-open">
            {W.open}
          </LinkButton>
        ) : null}
        {line.link ? (
          <CopyButton
            text={`${window.location.origin}${line.link}`}
            label={W.copy}
            said={W.copied}
            testid="lead-sheet-preview-copy"
          />
        ) : null}
      </div>
      {refused ? (
        <p className="lw-note" role="alert" data-testid="lead-sheet-preview-refused">
          {refused}
        </p>
      ) : null}
    </>
  );
}

/** Their receptionist, for one lead: nothing where there is none and this workspace makes none. */
export function SheetPreview({ leadId }: { leadId: string }) {
  const read = useLeadPreview(leadId);
  const line = read.state === "read" ? previewLineOf(read.data, new Date()) : null;
  if (!line) return null;
  return (
    <section className="lw-preview" aria-label={W.title} id="lead-sheet-preview" data-testid="lead-sheet-sec-preview">
      <p className="lw-note">{W.title}</p>
      <PreviewLine leadId={leadId} line={line} />
    </section>
  );
}
