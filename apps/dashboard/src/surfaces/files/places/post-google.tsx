/**
 * A kept post that is up on the business's Google profile (decision 0099, step 3): where to see it, once Google says, and how
 * to take it down. A post is made in Content's one sheet (Post it, campaigns/content/post-both.tsx); this is the door its row
 * keeps to the post once it is up.
 */
import { useState } from "react";
import { FILE_WORDS, type FilePosted } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { Icon } from "../../kit/icon/icon";
import type { FrameFlash } from "../../frame-verbs";
import { fileVerbs } from "../verbs";

const ON_GOOGLE = FILE_WORDS.google;

/** It is up: where to see it, once Google says, and how to take it down, behind a question. */
export function PostOnGoogle({
  id,
  posted,
  may,
  saidDown,
  flash,
}: {
  id: string;
  posted: FilePosted;
  /** Whether this person may take it down: a reader sees that it is up, and nothing dead to press. */
  may: boolean;
  saidDown: () => void;
  flash: (f: FrameFlash) => void;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const down = async () => {
    setBusy(true);
    const r = await fileVerbs.takeOffGoogle(id, posted.name);
    setBusy(false);
    setAsking(false);
    if (!r.ok) return setProblem(r.message);
    flash({ msg: <>{ON_GOOGLE.downed}</> });
    saidDown();
  };
  if (asking)
    return (
      <Confirm
        question={ON_GOOGLE.downAsk}
        detail={ON_GOOGLE.downNote}
        yes={ON_GOOGLE.down}
        no={ON_GOOGLE.downKeep}
        danger
        busy={busy}
        onYes={() => void down()}
        onNo={() => setAsking(false)}
        testid="post-google-down-ask"
      />
    );
  return (
    <>
      <div className="files-made-from" data-testid="post-on-google">
        <span className="files-from">{ON_GOOGLE.on}</span>
        {posted.search_url ? (
          <Button
            size="text"
            variant="quiet"
            href={posted.search_url}
            target="_blank"
            rel="noreferrer"
            data-testid="post-google-see"
          >
            {ON_GOOGLE.see}
            <Icon name="external" size={11} />
          </Button>
        ) : null}
        {may ? (
          <Button size="text" variant="quiet" onClick={() => setAsking(true)} data-testid="post-google-down">
            {ON_GOOGLE.down}
          </Button>
        ) : null}
      </div>
      {problem ? (
        <p className="post-said" role="alert" data-testid="post-google-note">
          {problem}
        </p>
      ) : null}
    </>
  );
}
