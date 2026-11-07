/** The Inbox's one press (decision 0099): what the look found nothing against, kept at once, and what is left for a person to open. */
import { useState } from "react";
import { FILE_WORDS as W, inboxCleanOf, type FileDto } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Notice } from "../kit/notice/notice";
import type { FrameFlash } from "../frame-verbs";
import { fileVerbs } from "./verbs";

export /** What the Inbox says of itself, and its one press: what the look found nothing against, kept at once. */
function InboxPress({ inbox, flash }: { inbox: readonly FileDto[]; flash: (f: FrameFlash) => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const clean = inbox.filter(inboxCleanOf);
  if (clean.length === 0) return null;
  const said = W.inboxSays(clean.length, inbox.length - clean.length);
  const keep = async () => {
    setBusy(true);
    const r = await fileVerbs.keepMany(clean.map((f) => f.id));
    setBusy(false);
    if (!r.ok) return setProblem(r.message);
    setProblem(null);
    flash({ msg: <>{W.kept(r.data.kept)}</> });
  };
  return (
    <>
      <Notice
        className="files-inbox-says"
        label={said}
        fact={said}
        line
        testid="fl-inbox-says"
        act={
          <Button size="sm" onClick={() => void keep()} disabled={busy} data-testid="fl-keep-many">
            {W.keepMany(clean.length)}
          </Button>
        }
      />
      {problem && (
        <div role="alert">
          <Notice label={problem} fact={problem} line testid="fl-problem" />
        </div>
      )}
    </>
  );
}
