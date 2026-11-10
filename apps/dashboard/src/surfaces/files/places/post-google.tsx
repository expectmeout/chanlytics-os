/**
 * A kept post on the business's Google profile (decision 0099, step 3), from its sheet: the picture as Google shows it, the words that go
 * under it, and one press that a person makes. It is public from there, as soon as Google has looked at it, so nothing does this by
 * itself, and the sheet says it is up and how to take it down. Connected or not is the record's: a press that can't work isn't offered.
 */
import { useState } from "react";
import { FILE_GOOGLE_WORDS_MAX, FILE_WORDS, type FilePosted, type PostPlan } from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { Confirm } from "../../kit/confirm/confirm";
import { LineField } from "../../kit/line/line";
import type { FrameFlash } from "../../frame-verbs";
import { usePostDraft } from "../post-draft";
import { PostFrame } from "../post-frame";
import { fileVerbs } from "../verbs";

const ON_GOOGLE = FILE_WORDS.google;

/** What goes under the picture to begin with: what the picture says, as a sentence a person can change. */
const wordsToBeginWith = (plan: PostPlan): string =>
  [plan.line, plan.under]
    .filter((w): w is string => !!w)
    .map((w) => (/[.!?]$/.test(w) ? w : `${w}.`))
    .join(" ");

/** The draft of a post on its way to Google, for the sheet: its body and its foot both draw from it. */
export function usePostGoogle(
  id: string,
  plan: PostPlan | null,
  saidUp: (posted: FilePosted) => void,
  flash: (f: FrameFlash) => void,
) {
  const [words, setWords] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const clean = words?.trim() ?? "";
  const send = async () => {
    setBusy(true);
    setProblem(null);
    const r = await fileVerbs.postToGoogle(id, clean);
    setBusy(false);
    if (!r.ok) return setProblem(r.message);
    setWords(null);
    flash({ msg: <>{ON_GOOGLE.posted}</> });
    saidUp({ name: r.data.name, search_url: r.data.search_url, at: new Date().toISOString() });
  };
  return {
    open: words !== null,
    words: words ?? "",
    plan,
    busy,
    problem,
    tooLong: clean.length > FILE_GOOGLE_WORDS_MAX,
    canSend: !busy && clean.length > 0 && clean.length <= FILE_GOOGLE_WORDS_MAX,
    begin: () => {
      if (plan) setWords(wordsToBeginWith(plan));
    },
    cancel: () => {
      setProblem(null);
      setWords(null);
    },
    write: setWords,
    send: () => void send(),
  };
}

type PostGoogleDraft = ReturnType<typeof usePostGoogle>;

/** The sheet's body: the picture as Google will show it, and what it will say. The picture is real, and costs nothing, as a card's is. */
export function PostGoogle({ google, plan }: { google: PostGoogleDraft; plan: PostPlan }) {
  const draft = usePostDraft(plan, true, "wide");
  const note =
    google.problem ?? (google.tooLong ? ON_GOOGLE.tooLong : google.words.trim() ? null : ON_GOOGLE.wordsNeeded);
  return (
    <div className="post-version" data-testid="post-google">
      <PostFrame
        src={draft.picture}
        shape="wide"
        alt={plan.line}
        waiting={plan.line}
        drawing={draft.drawing && !!draft.picture}
      />
      <label className="post-say">
        <span className="post-say-label">{ON_GOOGLE.words}</span>
        <LineField
          className="post-say-box post-say-long"
          rows={3}
          value={google.words}
          onChange={(e) => google.write(e.currentTarget.value)}
          data-testid="post-google-words"
        />
      </label>
      {note ? (
        <p className="post-said" role="alert" data-testid="post-google-note">
          {note}
        </p>
      ) : null}
    </div>
  );
}

/** The sheet's foot. */
export function PostGoogleActs({ google }: { google: PostGoogleDraft }) {
  return (
    <div className="files-acts" data-foot-acts="">
      <Button onClick={google.send} disabled={!google.canSend} data-testid="post-google-send">
        {ON_GOOGLE.post}
      </Button>
      <Button variant="quiet" onClick={google.cancel} disabled={google.busy} data-testid="post-google-cancel">
        {ON_GOOGLE.cancel}
      </Button>
    </div>
  );
}

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
            size="sm"
            variant="quiet"
            href={posted.search_url}
            target="_blank"
            rel="noreferrer"
            data-testid="post-google-see"
          >
            {ON_GOOGLE.see}
          </Button>
        ) : null}
        {may ? (
          <Button size="sm" variant="quiet" onClick={() => setAsking(true)} data-testid="post-google-down">
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
