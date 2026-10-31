/**
 * What the sender sees of a lead's own receptionist (decision 0079, L5): the lead sheet's line and its three presses, read
 * from the row the sender's workspace holds (LeadPreviewDto, GET leads/:id/preview). Apart from the page's words
 * (preview-words.ts), so the public page carries none of this.
 *
 *   previewLineOf    the line: none yet, being set up, couldn't be made (why), ready, sent, opened, tried, made theirs or
 *                    ended; what they said is not right under it; and which of Make their preview, Open it and Copy link
 *                    it offers
 *   previewTriedWords  what a lead's trying came to, said once for the line and Today's row
 */
import { DAY_MS, MIN_MS, SECOND_MS } from "../shared/time";
import { previewClaimable, previewStateOf } from "./lead-preview";
import { LEAD_PREVIEW_WORDS } from "./preview-words";

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

/** How far back Today names a lead who tried their preview: a hot lead goes cold in days, not weeks. */
export const PREVIEW_TRIED_DAYS = 3;

/** A preview its lead tried (GET lead-previews): Today's row, by its lead and the business's name. */
export interface PreviewTriedDto {
  id: string;
  lead_id: string;
  state: string;
  tried_at: string;
  asked_count: number;
  call_count: number;
  call_seconds: number;
  not_right: unknown;
  business: string | null;
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
  /** One thing they said is not right: the fact by its row's name, and their words where they gave some. */
  notRight: (fact: string, said: string | null) => {
    // The page sends the fact by its row's label ("Hours"); a key ("hours") reads the same.
    const name = ((LEAD_PREVIEW_WORDS.rows as Record<string, string>)[fact] ?? fact).toLowerCase();
    const isNot = name === "hours" || name === "services" ? "aren't" : "isn't";
    return said ? `Says the ${name} ${isNot} right: “${said}”` : `Says the ${name} ${isNot} right`;
  },
} as const;

/** What a lead's trying came to: its messages and its calls, said as one line ("4 messages · a call of 2 minutes"). */
export function previewTriedWords(f: Pick<LeadPreviewFacts, "asked_count" | "call_count" | "call_seconds">): string {
  const bits: string[] = [];
  if (f.asked_count > 0) bits.push(f.asked_count === 1 ? "1 message" : `${f.asked_count} messages`);
  if (f.call_count > 0) {
    const min = Math.max(1, Math.round((f.call_seconds * SECOND_MS) / MIN_MS));
    const length = min === 1 ? "a minute" : `${min} minutes`;
    bits.push(f.call_count === 1 ? `a call of ${length}` : `${f.call_count} calls, ${length} in all`);
  }
  return bits.join(" · ");
}

/** What they said is not right, as the row keeps it: each a line, the newest last, three at most. */
export function previewSaidOf(notRight: unknown): string[] {
  if (!Array.isArray(notRight)) return [];
  return notRight
    .filter(
      (n: unknown): n is { fact: string; said?: unknown } =>
        !!n && typeof n === "object" && typeof (n as { fact?: unknown }).fact === "string",
    )
    .slice(-3)
    .map((n) => PREVIEW_LINE_WORDS.notRight(n.fact, typeof n.said === "string" ? n.said : null));
}

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
