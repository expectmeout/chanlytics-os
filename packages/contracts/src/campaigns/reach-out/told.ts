/**
 * What it's told (decision 0113, How it reaches out): each of the three writers of a cold email, its prompt cut into the
 * parts an owner can name, each with its share of the whole and a way back to the row that writes it, as How it answers'
 * prompt sheet cuts the receptionist's (config/prompt-blocks.ts). The parts are cut from the text the writer is given,
 * never written beside it: the drafter's are the drafter's own lines (drafts/sequence.ts draftAskedParts), and the
 * opening writer's its own lines, each built with its part (opening.ts openingUserLines).
 *
 * An answer to a reply is the receptionist's, over the thread and the lead's note, which differ with every reply: its
 * parts are said with no share, since no one number would be true of them.
 */
import { leadReplyNote } from "./reply-draft";
import type { OpeningLine, OpeningPart } from "./opening";
import type { OpeningRecord } from "./words/opening";

export type ToldKind = "words" | "opening" | "reply";

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
    label: "Your pitch",
    note: "What you sell, who should hear from you, the problem you solve, what you do",
    row: "offer",
    door: null,
  },
  proof: { label: "Your facts", note: "One per email, word for word", row: "proof", door: null },
  writes: { label: "How you sound", note: "Your tone, and the lines learned from you", row: "sound", door: null },
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
  const left = 100 - exact.reduce((n, e) => n + Math.floor(e), 0);
  // What rounding left is fewer than the parts (each lost less than one), so each of the largest remainders takes one.
  const order = exact.map((e, i) => [e - Math.floor(e), i] as const).sort((a, b) => b[0] - a[0]);
  const takes = new Set(order.slice(0, left).map(([, i]) => i));
  return exact.map((e, i) => Math.floor(e) + (takes.has(i) ? 1 : 0));
}

const OPENING_PARTS_SAID: readonly OpeningPart[] = ["business", "words", "listing", "website", "reason", "searched"];

/** The opening writer's prompt, by its parts: the rules, and each part of what its user content says, line for line. */
export function openingToldParts(system: string, lines: readonly OpeningLine[]): ToldPart[] {
  return [
    toldPart("rules", system),
    ...OPENING_PARTS_SAID.flatMap((id) => {
      const text = lines
        .filter((l) => l.part === id && l.text.trim())
        .map((l) => l.text)
        .join("\n");
      return text ? [toldPart(id, text)] : [];
    }),
  ];
}

/**
 * An answer to a reply: the receptionist's parts, which differ with every reply, so said with no share. The lead's note is
 * the drafter's own (leadReplyNote), written for the made-up business as if it answered a first line about its reviews;
 * the thread is each reply's own, so it has no words to show.
 */
export function replyToldParts(): ToldPart[] {
  const example = reachOutExampleRecord();
  const note = leadReplyNote({
    business: example.business_name,
    answered: `${example.business_name} has a ${example.rating} from ${example.reviews} reviews.`,
    kind: "answer",
  });
  return [toldPart("answers", ""), toldPart("reply_offer", ""), toldPart("thread", ""), toldPart("note", note)];
}

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

/** Where a part of a tried email came from: the line written from their listing, a claim of the owner's, or the owner's words. */
export type TrySource = "them" | "proof" | "words";
export interface TryPart {
  text: string;
  source: TrySource;
}

/**
 * Try it's email in parts (decision 0113): the opening written for this business marked as theirs, each claim the words
 * carry word for word marked as the owner's proof, and everything else the owner's words, values and foot included.
 * Found by its text in the email the preview assembled, so a mark is only ever where the words truly are.
 */
export function tryPartsOf(body: string, opening: string | null, claims: readonly string[]): TryPart[] {
  const marks: { at: number; end: number; source: TrySource }[] = [];
  const mark = (needle: string, source: TrySource) => {
    const at = needle ? body.indexOf(needle) : -1;
    if (at < 0 || marks.some((m) => at < m.end && at + needle.length > m.at)) return;
    marks.push({ at, end: at + needle.length, source });
  };
  mark(opening?.trim() ?? "", "them");
  for (const claim of claims) mark(claim.trim(), "proof");
  marks.sort((a, b) => a.at - b.at);
  const parts: TryPart[] = [];
  let from = 0;
  for (const m of marks) {
    if (m.at > from) parts.push({ text: body.slice(from, m.at), source: "words" });
    parts.push({ text: body.slice(m.at, m.end), source: m.source });
    from = m.end;
  }
  if (from < body.length) parts.push({ text: body.slice(from), source: "words" });
  return parts;
}
