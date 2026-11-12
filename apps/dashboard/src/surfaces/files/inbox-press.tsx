/** The Inbox's one press (decision 0099): what the look found nothing against, kept at once, and what is left for a person to open. */
import { useState } from "react";
import { FILE_WORDS as W, inboxCleanOf, type FileDto } from "@chanlytics/contracts";
import { Button } from "../kit/button/button";
import { Notice } from "../kit/notice/notice";
import type { FrameFlash } from "../frame-verbs";
import { fileVerbs } from "./verbs";

export /**
 * What was found online says of itself, and its two presses for all of it at once: Keep what the look found nothing against,
 * and Not mine for everything still waiting (the same Keep and Set aside each photo has, for many: one door, 00619).
 */
function InboxPress({ inbox, flash }: { inbox: readonly FileDto[]; flash: (f: FrameFlash) => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  if (inbox.length === 0) return null;
  const clean = inbox.filter(inboxCleanOf);
  const said = W.inboxSays(clean.length, inbox.length - clean.length);
  const move = async (ids: readonly string[], to: "filed" | "set_aside") => {
    setBusy(true);
    const r = await fileVerbs.keepMany(ids, to);
    setBusy(false);
    if (!r.ok) return setProblem(r.message);
    setProblem(null);
    flash({ msg: <>{to === "filed" ? W.kept(r.data.kept) : W.setAsideMany(r.data.kept)}</> });
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
          <span className="files-inbox-acts">
            {clean.length > 0 ? (
              <Button
                size="sm"
                onClick={() =>
                  void move(
                    clean.map((f) => f.id),
                    "filed",
                  )
                }
                disabled={busy}
                data-testid="fl-keep-many"
              >
                {W.keepMany(clean.length)}
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="quiet"
              onClick={() =>
                void move(
                  inbox.map((f) => f.id),
                  "set_aside",
                )
              }
              disabled={busy}
              data-testid="fl-not-mine"
            >
              {W.notMine}
            </Button>
          </span>
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
