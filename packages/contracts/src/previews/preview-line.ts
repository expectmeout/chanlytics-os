/**
 * What the sender sees of a lead's own receptionist (decision 0079, L5): the lead sheet's line and its three presses, read
 * from the row the sender's workspace holds (LeadPreviewDto, GET leads/:id/preview). Apart from the page's words
 * (preview-words.ts), so the public page carries none of this.
 *
 *   previewLineOf    the line: none yet, being set up, couldn't be made (why), ready, sent, opened, tried, made theirs or
 *                    ended; what they said is not right under it; and which of Make their preview, Open it and Copy link
 *                    it offers
 *
 * What a lead's trying came to, and what it said is not right, are preview-tried.ts's, which Today shares.
 */
import { DAY_MS } from "../shared/time";
import { previewClaimable, previewStateOf } from "./lead-preview";
import { previewSaidOf, previewTriedWords } from "./preview-tried";

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
}

/** GET leads/:id/preview: the lead's preview, or none made; and whether this workspace makes them (ours). */
export interface LeadPreviewDto {
  preview: LeadPreviewFacts | null;
  makes: boolean;
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

/** The sheet's words. */
export const PREVIEW_LINE_WORDS = {
  title: "Their preview",
  none: "No preview yet. One is made when an email that names {{their preview}} goes.",
  building: "Being set up. It takes about half a minute.",
  failed: (why: string | null) =>
    `Couldn't be made: ${why === "no_name" ? "the lead has no name to set it up under" : "its set-up failed"}.`,
  ready: "Ready, not sent yet",
  sent: "Sent, not opened yet",
  opened: (n: number) => (n === 1 ? "Opened once" : `Opened ${n} times`),
  claimed: "Made theirs. They're a customer now.",
  ended: "Ended",
  endsIn: (days: number) => (days <= 1 ? "ends tomorrow" : `ends in ${days} days`),
  make: "Make their preview",
  open: "Open it",
  copy: "Copy link",
  copied: "Link copied",
  notOurs: "Only Chanlytics' own workspace makes previews.",
} as const;

/** The line for a lead's preview, or null where there is none and this workspace makes none. */
export function previewLineOf(dto: LeadPreviewDto, now: Date): LeadPreviewLineVM | null {
  const W = PREVIEW_LINE_WORDS;
  const p = dto.preview;
  if (!p) return dto.makes ? { words: W.none, tone: "quiet", said: [], make: true, open: null, link: null } : null;
  const said = previewSaidOf(p.not_right);
  const look = (link: string | null): Pick<LeadPreviewLineVM, "open" | "link"> => ({
    open: `/preview/${encodeURIComponent(p.token)}?look=1`,
    link,
  });
  const base = { said, make: false };
  if (p.state === "building") return { ...base, words: W.building, tone: "busy", open: null, link: null };
  if (p.state === "failed") return { ...base, words: W.failed(p.failed_why), tone: "warn", open: null, link: null };
  if (p.state === "claimed") return { ...base, words: W.claimed, tone: "done", ...look(null) };
  const page = previewStateOf(p, now);
  const tried = previewTriedWords(p);
  if (!previewClaimable(page))
    return { ...base, words: tried ? `${W.ended} · ${tried}` : W.ended, tone: "quiet", open: null, link: null };
  const days = Math.max(1, Math.ceil((Date.parse(p.ends_at) - now.getTime()) / DAY_MS));
  const stage =
    p.tried_at && tried
      ? `Tried · ${tried}`
      : p.opened_count > 0
        ? W.opened(p.opened_count)
        : p.first_sent_at
          ? W.sent
          : W.ready;
  const path = `/preview/${encodeURIComponent(p.token)}`;
  return { ...base, words: `${stage} · ${W.endsIn(days)}`, tone: p.tried_at ? "go" : "quiet", ...look(path) };
}
