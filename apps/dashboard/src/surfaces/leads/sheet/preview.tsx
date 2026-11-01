/**
 * The lead sheet's Their preview (decision 0079, L5): the line a lead's own receptionist says to its sender, what the
 * business said is not right under it, and its three presses: Make their preview (a workspace of ours, none made yet),
 * Open it (the page as the sender looks at it, which counts nothing) and Copy link. Its read is its own
 * (GET leads/:id/preview): painted from the tab's last answer, read again behind, and again after a press. A refusal is
 * said where it was pressed. Every word is contracts'.
 */
import { useState } from "react";
import { PREVIEW_LINE_WORDS as W, previewLineOf } from "@chanlytics/contracts";
import type { ApiResult, Output } from "@/client/api";
import { api } from "@/legacy-bridge/api";
import { readCache } from "@/legacy-bridge/read-cache";
import { useSequenceRead } from "../../campaigns/sequences/use-record";
import { Button } from "../../kit/button/button";
import { CopyButton } from "../../kit/copy-button/copy-button";
import { LinkButton } from "../../kit/link-button/link-button";
import { gate } from "../../legacy-verbs";

type PreviewAnswer = ApiResult<Output<"GET leads/[id]/preview">>;
const previews = readCache<PreviewAnswer>("lead_preview", (r) => r.ok);
const readPreview = (leadId: string) =>
  previews.through(leadId, () => api()("GET leads/[id]/preview", { params: { id: leadId } }));
const peekPreview = (leadId: string) => previews.peek(leadId);

/** Their preview, for one lead: nothing where there is none and this workspace makes none. */
export function SheetPreview({ leadId }: { leadId: string }) {
  const [again, setAgain] = useState(0);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);
  const read = useSequenceRead(leadId, readPreview, peekPreview, { again });
  const line = read.state === "read" ? previewLineOf(read.data, new Date()) : null;
  if (!line) return null;
  const make = async () => {
    setBusy(true);
    setRefused(null);
    const r = await api()("POST leads/[id]/preview", { params: { id: leadId } });
    setBusy(false);
    if (r.ok) setAgain((n) => n + 1);
    else setRefused(r.message);
  };
  return (
    <section className="lw-preview" aria-label={W.title} id="lead-sheet-preview" data-testid="lead-sheet-sec-preview">
      <p className="lw-note">{W.title}</p>
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
            {...gate("approve", "make their preview")}
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
    </section>
  );
}
