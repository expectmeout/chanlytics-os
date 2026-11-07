/**
 * What it's told (decision 0113, How it reaches out): each of the three writers of a cold email, its prompt cut into the
 * parts an owner can name, each with its share of the whole and a way back to the row that writes it, as How it answers'
 * prompt sheet cuts the receptionist's (config/prompt-blocks.ts). The parts are cut from the text the writer is given,
 * never written beside it: the drafter's are the drafter's own lines (drafts/sequence.ts draftAskedParts), and the
 * opening writer's are read off its prompt by the labels its lines carry.
 *
 * An answer to a reply is the receptionist's, over the thread and the lead's note, which differ with every reply: its
 * parts are said with no share, since no one number would be true of them.
 */
import { z } from "zod";
import type { OpeningRecord } from "./words/opening";

export const TOLD_KINDS = ["words", "opening", "reply"] as const;
export type ToldKind = (typeof TOLD_KINDS)[number];

/** GET settings/reach-out/told: which writer's prompt, of the two composed from what the workspace holds. */
export const ReachOutToldQuerySchema = z.object({ kind: z.enum(["words", "opening"]) });

export interface ToldPart {
  id: string;
  label: string;
  note: string;
  /** The part's own words as the writer is given them; "" where they differ every time. */
  text: string;
  /** The row of How it reaches out that writes it, or null. */
  row: string | null;
  /** Another page that holds it (an address), or null. */
  door: string | null;
}

export interface ReachOutToldDto {
  kind: ToldKind;
  parts: ToldPart[];
}

const PART = {
  rules: { label: "The rules", note: "Chanlytics keeps these for every business", row: null, door: null },
  offer: {
    label: "What you offer",
    note: "Your offer, who it's for, what you fix, what you do",
    row: "offer",
    door: null,
  },
  proof: { label: "Your proof", note: "One per email, word for word", row: "proof", door: null },
  writes: { label: "How you write", note: "Your tone, and the lines learned from you", row: "cold_tone", door: null },
  examples: {
    label: "Emails you sent before",
    note: "What Ask drafted, what you changed, what wrote back",
    row: null,
    door: null,
  },
  sources: { label: "Your searches and lists", note: "Who can hear from you now", row: null, door: "leads" },
  asked: { label: "What you ask for", note: "The line you type in New", row: null, door: null },
  business: { label: "Your business", note: "Its name, what you offer, your tone", row: "offer", door: null },
  words: { label: "Your words for this step", note: "The email the line opens", row: null, door: "campaigns" },
  listing: {
    label: "Their listing",
    note: "Name, kind, city, rating, reviews, hours, their own about",
    row: null,
    door: null,
  },
  website: { label: "Their website", note: "Its title, description and first lines", row: null, door: null },
  reason: { label: "Why the search picked them", note: "The finder's one line", row: null, door: null },
  searched: { label: "What you searched for", note: "Told, never said about them", row: null, door: null },
  answers: {
    label: "How it answers",
    note: "The receptionist's own instructions, as for any email",
    row: null,
    door: "admin/receptionist",
  },
  reply_offer: {
    label: "What a reply offers",
    note: "Your booking link, a call, or the answer alone",
    row: "reply_offer",
    door: null,
  },
  thread: { label: "The thread", note: "Their reply, and the email it answers", row: null, door: null },
  note: { label: "The lead's note", note: "Who they are, and how the sequence signs", row: null, door: null },
} as const;
export type ToldPartId = keyof typeof PART;

/** A part, by its id, with its words. */
export const toldPart = (id: ToldPartId, text: string): ToldPart => ({ id, text, ...PART[id] });

/**
 * Each part's share of the whole, in whole percents that add to 100 (the largest remainders take what rounding left), or
 * null where any part's words differ every time: a share that could not be true is never drawn.
 */
export function toldShares(parts: readonly ToldPart[]): number[] | null {
  if (parts.length === 0 || parts.some((p) => !p.text)) return null;
  const total = parts.reduce((n, p) => n + p.text.length, 0);
  const exact = parts.map((p) => (p.text.length * 100) / total);
  const shares = exact.map(Math.floor);
  const left = 100 - shares.reduce((n, s) => n + s, 0);
  const order = exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < left; k++) {
    const at = order[k % order.length]?.[1];
    if (at !== undefined) shares[at] = (shares[at] ?? 0) + 1;
  }
  return shares;
}

/** Which part of the opening writer's prompt a line of it is, by the label the line carries. */
function openingPartOf(line: string, current: ToldPartId): ToldPartId {
  if (line.startsWith("website_says:")) return "website";
  if (line.startsWith("why_it_fits:")) return "reason";
  if (line.startsWith("What the owner searched for")) return "searched";
  if (line.startsWith("The business's record:") || line === "<record>") return "listing";
  if (line === "</record>") return "listing";
  if (/^(The owner's business|What they do|Their tone):/.test(line)) return "business";
  if (line.startsWith("The owner's email")) return "words";
  // A record's field line is the listing's, and a line after the owner's email starts is the email's.
  if (current === "words") return "words";
  return /^[a-z_]+: /.test(line) ? "listing" : current;
}

/** The opening writer's prompt, cut into its parts: the rules, and what its user content says, by its lines' labels. */
export function openingToldParts(system: string, user: string): ToldPart[] {
  const texts = new Map<ToldPartId, string[]>();
  let current: ToldPartId = "listing";
  for (const line of user.split("\n")) {
    if (!line.trim()) continue;
    current = openingPartOf(line, current);
    texts.set(current, [...(texts.get(current) ?? []), line]);
  }
  const order: ToldPartId[] = ["business", "words", "listing", "website", "reason", "searched"];
  return [
    toldPart("rules", system),
    ...order.flatMap((id) => {
      const lines = texts.get(id);
      return lines ? [toldPart(id, lines.join("\n"))] : [];
    }),
  ];
}

/** An answer to a reply: the receptionist's parts, which differ with every reply, so said with no share. */
export const replyToldParts = (): ToldPart[] =>
  (["answers", "reply_offer", "thread", "note"] as const).map((id) => toldPart(id, ""));

/**
 * The made-up business the opening's prompt is shown for (the sequence sheet's example, rules.ts EXAMPLE_LEAD): what one
 * business's record holds, so the shares read as they would for a business a search found.
 */
export const reachOutExampleRecord = (): OpeningRecord => ({
  business_name: "Lakeside Bakery",
  category: "Bakery",
  city: "Springfield",
  region: "IL",
  rating: 4.8,
  reviews: 212,
  website: "lakesidebakery.example.com",
  hours: "Mon–Sat 7–6",
  about: "A neighbourhood bakery baking bread, pastries and cakes every morning since 2009.",
  why_it_fits: "A busy local business that takes orders by phone",
  website_says: "Lakeside Bakery · Fresh bread daily · Order a cake for pickup",
  what_you_asked: "Bakeries and cafes in Springfield",
});
