/**
 * Posting a made post to Instagram and Google from one composer (the content canvas, "Making and posting"), in the open
 * piece's pane: a row for each place that can take it, on or off; on Instagram, a post or a story; one set of words, written
 * from the post and the owner's to change; and when, where every place on can keep a time. One press sends to each place
 * through its own door (POST files/[id]/instagram, POST files/[id]/google). A place that went is switched off, so a second
 * press never sends it twice; one that was refused stays on, its reason under it.
 */
import { useState } from "react";
import {
  CONTENT_WORDS,
  INSTAGRAM_POST_KINDS,
  ON_INSTAGRAM,
  POST_PLACES,
  type InstagramPostKind,
  type PostPlace,
  type PostPlan,
} from "@chanlytics/contracts";
import { pageClock } from "@/bridge/zone";
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { LineField } from "../../kit/line/line";
import type { FrameFlash } from "../../frame-verbs";
import { PostChoice } from "../../files/post-choice";
import { fileVerbs } from "../../files/verbs";
import { postBothBegins, postBothProblemOf, postTimesOf, type PostBothDraft } from "./model/post-both";
import type { PieceTakes } from "./model/piece-open";

const COMPOSER_SAYS = CONTENT_WORDS.post;
const PLACE_GLYPH = { instagram: "instagram", google: "pin" } as const satisfies Record<PostPlace, string>;
type When = "now" | "evening" | "morning";

type Refusals = Partial<Record<PostPlace, string>>;

/** One press, through each place's own door at once: the places that took it, and why each other one did not. */
async function sendToEach(id: string, sending: PostBothDraft): Promise<{ sent: PostPlace[]; refused: Refusals }> {
  const words = sending.words.trim();
  const when = sending.when ?? undefined;
  const sends: [PostPlace, Promise<{ ok: boolean; message?: string }>][] = [];
  if (sending.instagram) sends.push(["instagram", fileVerbs.postToInstagram(id, sending.as, words, when)]);
  if (sending.google) sends.push(["google", fileVerbs.postToGoogle(id, words, when)]);
  const answers = await Promise.all(sends.map(([, answer]) => answer));
  const sent: PostPlace[] = [];
  const refused: Refusals = {};
  sends.forEach(([place], i) => {
    const answer = answers[i];
    if (answer?.ok) sent.push(place);
    else if (answer) refused[place] = answer.message ?? "";
  });
  return { sent, refused };
}

/** What the flash says of the places that took it: on its way now, or set for its time. */
const sentLine = (sending: PostBothDraft, sent: readonly PostPlace[]): string =>
  sending.when ? COMPOSER_SAYS.set(sent, pageClock().when(Date.parse(sending.when))) : COMPOSER_SAYS.sent(sent);

/** The draft, its send, and what each place said back. */
export function usePostBoth(
  piece: { id: string; plan: PostPlan | null; takes: PieceTakes | null },
  tell: { done: (places: readonly PostPlace[]) => void; flash: (f: FrameFlash) => void },
) {
  const { id, plan, takes } = piece;
  const { done, flash } = tell;
  const [draft, setDraft] = useState<PostBothDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<Refusals>({});
  const change = (to: Partial<PostBothDraft>) => setDraft((d) => (d ? { ...d, ...to } : d));
  const send = async (sending: PostBothDraft) => {
    setBusy(true);
    const { sent, refused: no } = await sendToEach(id, sending);
    setBusy(false);
    setRefused(no);
    if (sent.length > 0) flash({ msg: <>{sentLine(sending, sent)}</> });
    if (Object.keys(no).length === 0) {
      setDraft(null);
      done(sent);
      return;
    }
    // What was sent is off now: a second press sends only what was refused.
    setDraft((now) => (now ? { ...now, instagram: !!no.instagram, google: !!no.google } : now));
    if (sent.length > 0) done(sent);
  };
  const problem = draft ? postBothProblemOf(draft) : null;
  return {
    open: draft !== null,
    draft,
    takes,
    busy,
    refused,
    problem,
    canSend: !!draft && !busy && problem === null,
    /** Begun from what the picture says, every place that can take it on; `only` keeps one place on alone. */
    begin: (only?: PostPlace) => {
      if (!plan || !takes) return;
      setRefused({});
      const begun = postBothBegins(plan, takes);
      setDraft(only ? { ...begun, instagram: only === "instagram", google: only === "google" } : begun);
    },
    cancel: () => {
      setRefused({});
      setDraft(null);
    },
    toggle: (place: PostPlace) => setDraft((d) => (d ? { ...d, [place]: !d[place] } : d)),
    choose: (as: InstagramPostKind) => change({ as }),
    write: (words: string) => change({ words }),
    at: (when: string | null) => change({ when }),
    send: () => {
      if (draft && problem === null) void send(draft);
    },
  };
}

type PostBothState = ReturnType<typeof usePostBoth>;

/** Which of the offered times is chosen. */
function timeChosenOf(draft: PostBothDraft, times: ReturnType<typeof postTimesOf>): When {
  if (draft.when && draft.when === times.evening) return "evening";
  if (draft.when && draft.when === times.morning) return "morning";
  return "now";
}

/** The composer, in the pane's body under the picture. */
export function PostBoth({ both }: { both: PostBothState }) {
  const { draft, takes } = both;
  if (!draft || !takes) return null;
  const clock = pageClock();
  const times = postTimesOf(Date.now(), clock.zone());
  const offered: When[] = times.evening ? ["now", "evening", "morning"] : ["now", "morning"];
  const timeOf = (when: When) => (when === "evening" ? times.evening : when === "morning" ? times.morning : null);
  const words = { now: COMPOSER_SAYS.now, evening: COMPOSER_SAYS.evening, morning: COMPOSER_SAYS.morning };
  const showsWords = draft.google || draft.as === "picture";
  return (
    <div className="cnv-compose" data-testid="cnv-compose">
      <div className="cnv-places" role="group" aria-label={COMPOSER_SAYS.title}>
        {POST_PLACES.filter((place) => takes[place]).map((place) => (
          <div key={place} className="cnv-place">
            <Button
              variant={draft[place] ? "soft" : "quiet"}
              aria-pressed={draft[place]}
              onClick={() => both.toggle(place)}
              data-testid={`cnv-place-${place}`}
            >
              <Icon name={PLACE_GLYPH[place]} size={15} />
              {CONTENT_WORDS.piece.place[place]}
              {draft[place] ? <Icon name="check" size={13} /> : null}
            </Button>
            {place === "instagram" && draft.instagram ? (
              <PostChoice
                label={COMPOSER_SAYS.asWhat}
                options={INSTAGRAM_POST_KINDS}
                words={{ picture: ON_INSTAGRAM.asPicture, story: ON_INSTAGRAM.asStory }}
                value={draft.as}
                choose={both.choose}
                testid="cnv-as"
              />
            ) : null}
            {both.refused[place] ? (
              <p className="cnv-note cnv-refused" role="alert" data-testid={`cnv-refused-${place}`}>
                {COMPOSER_SAYS.oneFailed(place, both.refused[place] ?? "")}
              </p>
            ) : null}
          </div>
        ))}
      </div>
      {showsWords ? (
        <label className="post-say">
          <span className="post-say-label">{COMPOSER_SAYS.words}</span>
          <LineField
            className="post-say-box post-say-long"
            rows={4}
            value={draft.words}
            onChange={(e) => both.write(e.currentTarget.value)}
            data-testid="cnv-words"
          />
          <span className="cnv-note">{COMPOSER_SAYS.wordsNote}</span>
        </label>
      ) : (
        <p className="cnv-note">{ON_INSTAGRAM.storyNoCaption}</p>
      )}
      {draft.instagram || draft.google ? (
        <div className="cnv-when">
          <PostChoice
            label={COMPOSER_SAYS.when}
            options={offered}
            words={words}
            value={timeChosenOf(draft, times)}
            choose={(when) => both.at(timeOf(when))}
            testid="cnv-when"
            said
          />
          {draft.when ? <span className="cnv-note">{clock.when(Date.parse(draft.when))}</span> : null}
        </div>
      ) : null}
      {both.problem ? (
        <p className="cnv-note" role="alert" data-testid="cnv-compose-problem">
          {both.problem}
        </p>
      ) : null}
    </div>
  );
}

/** The composer's foot: Not now, and the send, which says where it goes. */
export function PostBothActs({ both }: { both: PostBothState }) {
  const on = both.draft ? POST_PLACES.filter((place) => both.draft?.[place]) : [];
  return (
    <div className="cnv-acts" data-foot-acts="">
      <Button variant="secondary" onClick={both.cancel} disabled={both.busy} data-testid="cnv-compose-cancel">
        {COMPOSER_SAYS.cancel}
      </Button>
      <Button
        variant="primary"
        className="cnv-lead"
        onClick={both.send}
        disabled={!both.canSend}
        aria-busy={both.busy}
        data-testid="cnv-compose-send"
      >
        <Icon name="send" size={14} />
        {on.length > 0 ? COMPOSER_SAYS.send(on) : COMPOSER_SAYS.title}
      </Button>
    </div>
  );
}
