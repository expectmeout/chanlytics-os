/**
 * What the sender sees of a lead's own receptionist (decision 0079, L5): the lead sheet's line and its three presses, read
 * from the row the sender's workspace holds (LeadPreviewDto, GET leads/:id/preview). Apart from the page's words
 * (previews/words.ts), so the public page carries none of this.
 *
 *   previewLineOf    the line: none yet, being set up, couldn't be made (why), ready, sent, opened, tried, made theirs or
 *                    ended; what they said is not right under it; and which of Make their preview, Open it and Copy link
 *                    it offers
 *
 * What a lead's trying came to, and what it said is not right, are previews/tried.ts's, which Today shares.
 */
import { DAY_MS, MIN_MS } from "../shared/time";
import { previewClaimable, previewStateOf } from "./lead-preview";
import { previewSaidOf, previewTriedWords } from "./tried";

/** A lead's preview as its sender's workspace reads it: the row's facts the line says, never its chat. */
export interface LeadPreviewFacts {
  state: string;
  token: string;
  failed_why: string | null;
  ends_at: string;
  first_sent_at: string | null;
  opened_count: number;
  asked_count: number;
  call_count: number;
  call_seconds: number;
  tried_at: string | null;
  claimed_at: string | null;
  /** What the business said is not right, as the row keeps it (00497 preview_not_right): `{ fact, said?, at }`. */
  not_right: unknown;
  /** When it was made (its row's created_at), so one being set up can say how long it has taken; absent on an older answer. */
  made_at?: string | null;
}

/**
 * GET leads/:id/preview: the lead's preview, or none made; whether this workspace makes them (ours); and, where it does
 * and none is made, why this lead can get none, as its door would refuse it (00497 preview_make: not a business that
 * takes bookings, a lead that is closed, no name to set it up under). Null or absent: nothing stands in the way.
 */
export interface LeadPreviewDto {
  preview: LeadPreviewFacts | null;
  makes: boolean;
  cannot?: "not_a_business" | "closed" | "no_name" | null;
}

/** The lead sheet's line. */
export interface LeadPreviewLineVM {
  words: string;
  tone: "quiet" | "busy" | "go" | "done" | "warn";
  /** What they said is not right, each a line. */
  said: string[];
  /** Make their preview: offered where this workspace makes them and none is made. */
  make: boolean;
  /** The page as the sender looks at it, counting nothing (`?look=1`); null where there is no page to look at. */
  open: string | null;
  /** The link's path, for Copy link; null where it can no longer be made theirs. */
  link: string | null;
}

/** How long a set-up may take before it is said to be slower than usual: four of its usual half minutes. */
const PREVIEW_SLOW_AFTER_MS = 2 * MIN_MS;

const NO_NAME = "the lead has no name to set it up under";

/** Why a lead can get none, each as the line ends its sentence. */
const CANNOT_WHY: Record<NonNullable<LeadPreviewDto["cannot"]>, string> = {
  not_a_business: "it is for a business that takes bookings, and this is a company",
  closed: "this lead is closed",
  no_name: NO_NAME,
};

/** The sheet's words. */
export const PREVIEW_LINE_WORDS = {
  title: "Their receptionist",
  none: "Not made yet. It is made when an email that carries its link goes, and that email waits for it.",
  /** None made, and its door would refuse this lead: said before any email goes, with nothing to press. */
  cannot: (why: NonNullable<LeadPreviewDto["cannot"]>) =>
    `Can't be made: ${CANNOT_WHY[why]}. An email that carries its link is skipped.`,
  building: "Being set up. It takes about half a minute.",
  slow: "Still being set up. It usually takes half a minute; this one is slower, and it is checked again by itself.",
  failed: (reason: string | null) => `Couldn't be made: ${reason === "no_name" ? NO_NAME : "its set-up failed"}.`,
  ready: "Ready, not sent yet",
  sent: "Sent, not opened yet",
  opened: (n: number) => (n === 1 ? "Opened once" : `Opened ${n} times`),
  claimed: "Made theirs. They're a customer now.",
  ended: "Ended",
  endsIn: (days: number) => (days <= 1 ? "ends tomorrow" : `ends in ${days} days`),
  make: "Make it now",
  open: "Open it",
  copy: "Copy link",
  copied: "Link copied",
  notOurs: "Only Chanlytics' own workspace makes these.",
} as const;

/** Whether one being set up has taken longer than usual, by when it was made; never a guess where its answer says no time. */
export function previewBuildSlow(preview: Pick<LeadPreviewFacts, "state" | "made_at">, now: Date): boolean {
  if (preview.state !== "building" || !preview.made_at) return false;
  return now.getTime() - Date.parse(preview.made_at) > PREVIEW_SLOW_AFTER_MS;
}

/** The line where none is made: nothing where this workspace makes none, why this lead can get none, or that one is made when its email goes. */
function noneLineOf(dto: LeadPreviewDto): LeadPreviewLineVM | null {
  const words = PREVIEW_LINE_WORDS;
  if (!dto.makes) return null;
  const none = { said: [], open: null, link: null };
  return dto.cannot
    ? { ...none, words: words.cannot(dto.cannot), tone: "warn", make: false }
    : { ...none, words: words.none, tone: "quiet", make: true };
}

/** The line for a lead's preview, or null where there is none and this workspace makes none. */
export function previewLineOf(dto: LeadPreviewDto, now: Date): LeadPreviewLineVM | null {
  const words = PREVIEW_LINE_WORDS;
  const preview = dto.preview;
  if (!preview) return noneLineOf(dto);
  const phrases = previewSaidOf(preview.not_right);
  const look = (link: string | null): Pick<LeadPreviewLineVM, "open" | "link"> => ({
    open: `/preview/${encodeURIComponent(preview.token)}?look=1`,
    link,
  });
  const base = { said: phrases, make: false };
  if (preview.state === "building") {
    const said = previewBuildSlow(preview, now) ? words.slow : words.building;
    return { ...base, words: said, tone: "busy", open: null, link: null };
  }
  if (preview.state === "failed")
    return { ...base, words: words.failed(preview.failed_why), tone: "warn", open: null, link: null };
  if (preview.state === "claimed") return { ...base, words: words.claimed, tone: "done", ...look(null) };
  const page = previewStateOf(preview, now);
  const tried = previewTriedWords(preview);
  if (!previewClaimable(page))
    return { ...base, words: tried ? `${words.ended} · ${tried}` : words.ended, tone: "quiet", open: null, link: null };
  const days = Math.max(1, Math.ceil((Date.parse(preview.ends_at) - now.getTime()) / DAY_MS));
  const stage =
    preview.tried_at && tried
      ? `Tried · ${tried}`
      : preview.opened_count > 0
        ? words.opened(preview.opened_count)
        : preview.first_sent_at
          ? words.sent
          : words.ready;
  const path = `/preview/${encodeURIComponent(preview.token)}`;
  return { ...base, words: `${stage} · ${words.endsIn(days)}`, tone: preview.tried_at ? "go" : "quiet", ...look(path) };
}
