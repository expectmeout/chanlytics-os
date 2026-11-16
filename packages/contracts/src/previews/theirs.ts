/**
 * What a business makes of its own preview before it signs up (decision 0079; the canvas's calls P4 and P5): what it
 * teaches it, and what it puts right. Both are notes of the preview's own record (config brain.profile.notes), which is
 * where everything AI says is composed from (compose.ts) and where a price the business itself gave may be said
 * (price-allowance.ts). Nothing here is a second record: the page, the chat and the call all read the one.
 *
 *   withPreviewTaught   a thing they told it, added: three at most, each short
 *   withPreviewFix      a fact they put right: the listing's is let go, and theirs is told under the fact's own title, so a
 *                       second fix of the same fact replaces the first
 *   previewTheirsOf     what the record holds of theirs: what they told it, and each fact as they put it right
 *   previewFactOf       the fact a page's row names
 */
import type { BusinessProfile } from "../config/workspace-config/business-profile";
import { PROFILE_LIMITS } from "../config/workspace-config/config-rules";
import { entryOf, keysOf } from "../shared/unknown";
import { PREVIEW_FACT_NAMES } from "./tried";

/** What a business teaches its preview: how the sender's line files it, its note's title, how many and how long. */
export const PREVIEW_TAUGHT = {
  fact: "taught",
  title: "The business told us",
  most: 3,
  chars: 280,
} as const;

/** How long what is right may be: the line the sender is given holds as much (00497 preview_not_right). */
const FIX_CHARS = 300;

type PreviewFact = keyof typeof PREVIEW_FACT_NAMES;

const FACTS = keysOf(PREVIEW_FACT_NAMES);

/** The fact a row names, by its key ("hours") or its label ("Hours"); null for anything else. */
export function previewFactOf(named: string): PreviewFact | null {
  const key = named.trim().toLowerCase();
  return FACTS.find((fact) => fact === key || PREVIEW_FACT_NAMES[fact].toLowerCase() === key) ?? null;
}

/** The title a fix is kept under: its fact's, said as theirs, so one fact has one. */
const fixTitle = (fact: PreviewFact): string => `${PREVIEW_FACT_NAMES[fact]}, as the business says`;

/**
 * The record with a thing they told it added. "full" where it holds three already, or its notes have no room; null where
 * there is nothing to add, or too much.
 */
export function withPreviewTaught(profile: BusinessProfile, text: string): BusinessProfile | "full" | null {
  const sentence = text.replace(/\s+/g, " ").trim();
  if (!sentence || sentence.length > PREVIEW_TAUGHT.chars) return null;
  const notes = profile.notes ?? [];
  const taught = notes.filter((note) => note.title === PREVIEW_TAUGHT.title).length;
  if (taught >= PREVIEW_TAUGHT.most || notes.length >= PROFILE_LIMITS.notes) return "full";
  return { ...profile, notes: [...notes, { title: PREVIEW_TAUGHT.title, text: sentence }] };
}

/** The record without what the listing said of a fact a sentence replaces whole: its address, its hours, its website. */
function withoutListed(profile: BusinessProfile, fact: PreviewFact): BusinessProfile {
  const next = { ...profile };
  if (fact === "address") delete next.address;
  if (fact === "hours") delete next.hours;
  if (fact === "website") delete next.website;
  return next;
}

/**
 * The record with a fact put right. Its address, hours and website are let go as the listing gave them, so AI is never
 * told two; its services are a list no sentence replaces, so the list stays and what they said is told beside it; its
 * number is the line's own, told beside it too. Null where nothing was said, or the record's notes have no room.
 */
export function withPreviewFix(profile: BusinessProfile, fact: PreviewFact, right: string): BusinessProfile | null {
  const words = right.replace(/\s+/g, " ").trim().slice(0, FIX_CHARS);
  if (!words) return null;
  const title = fixTitle(fact);
  const others = (profile.notes ?? []).filter((note) => note.title !== title);
  if (others.length >= PROFILE_LIMITS.notes) return null;
  return { ...withoutListed(profile, fact), notes: [...others, { title, text: words }] };
}

/** What a record holds of theirs: what they told it, in order, and each fact as they put it right. */
export function previewTheirsOf(profile: Pick<BusinessProfile, "notes"> | null | undefined): {
  taught: string[];
  fixed: Partial<Record<PreviewFact, string>>;
} {
  const notes = profile?.notes ?? [];
  const fixed: Partial<Record<PreviewFact, string>> = {};
  for (const fact of FACTS) {
    const note = notes.find((kept) => kept.title === fixTitle(fact));
    if (note) fixed[fact] = note.text;
  }
  return { taught: notes.filter((note) => note.title === PREVIEW_TAUGHT.title).map((note) => note.text), fixed };
}

/** Whether a line the sender is given is a thing they told it, not a fact they said is not right. */
export const isPreviewTaughtLine = (fact: string): boolean => entryOf({ [PREVIEW_TAUGHT.fact]: true }, fact) === true;
