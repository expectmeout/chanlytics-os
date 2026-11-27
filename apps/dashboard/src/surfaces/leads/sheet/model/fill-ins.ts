/**
 * A fill-in on the lead's card (decision 0127): the rules and the words only the sheet says, so they live with it.
 *
 *   fillInSaysOf     what a blank's value says when it is pressed: what it is, where it came from, whether it changes
 *   fillInFixOf      which of a lead's own values a blank is, where it can be put right for every email (00631)
 *   emailBlanksOf    a step's words with every blank by its name, where they name any: what Show the blanks draws
 *   previewMarkOf    what the receptionist's mark says after its name: what the send will do with the email
 *
 * The line written for them and the receptionist's link have no bubble of their own here: the first keeps its tint and
 * its Rewrite, the second is the mark.
 */
import {
  REACH_OUT_SLOT_SET as SLOTS,
  capitalize,
  leadAddresseeOf,
  leadOwnOf,
  previewBuildSlow,
  previewClaimable,
  previewStateOf,
  slotMentions,
  type LeadEmailPiece,
  type LeadEmailText,
  type LeadPreviewDto,
  type LeadPreviewLineVM,
  type SlotLead,
} from "@chanlytics/contracts";

export const LEAD_FILL_WORDS = {
  business: "Their business name",
  city: "Their city",
  firstName: "Their first name",
  title: "Their title",
  role: "Their role",
  // screen-word: "Your" tells the owner's own from the lead's, AI's or a provider's (docs/words.md, The voice 5)
  yourName: "Your name",
  // screen-word: "Your" tells the owner's own from the lead's (docs/words.md, The voice 5)
  yourBusiness: "Your business name",
  // screen-word: "Your" tells the owner's own from the lead's (docs/words.md, The voice 5)
  bookingLink: "Your booking link",
  /** Where their values came from: the row's own Source word, as the Leads table's column says it. */
  source: (word: string) => `Source: ${word}`,
  named: "The person named at this company.",
  nobody: "Nobody is named at this company, so it says “there”.",
  signs: "The name this campaign signs with.",
  settings: "From your settings.",
  each: "Different for each business.",
  same: "The same in every email.",
  change: "Change it for this one",
  /** A name or a city its owner put right (00631 lead_named): whose it is, and what its listing said where that is kept. */
  yours: "From you.",
  yoursWas: (was: string) => `From you. Its listing says “${was}”.`,
  /** Putting a lead's name or city right on the lead itself, so every email to them says it. */
  every: {
    open: "Change it for every email",
    name: "What to call them",
    city: "Their city",
    note: "Every email to them says this from now on.",
    save: "Save",
    saved: (again: number) =>
      again > 0
        ? `Saved. The line about them is being written again in ${again === 1 ? "1 waiting email" : `${again} waiting emails`}.`
        : "Saved. Every email to them says this now.",
    failed: "That didn't save. Try again in a moment.",
  },
  /** What Show the blanks calls the line written for them. */
  lineBlank: "A line about them",
  /** The switch over the email: the email with this lead's values in, or the step's words with each blank named. */
  view: {
    label: "How the email is shown",
    read: "As they'll read it",
    blanks: "Show the blanks",
    note: "These words go to everyone on this step. Only the blanks change.",
  },
  /**
   * What the receptionist's mark says after its name. One that cannot be made, or has ended, means the send skips that
   * one email (channels reachOutWords: no_preview).
   */
  mark: {
    none: "made when this goes",
    /** Its door would refuse this lead one (a company, a closed lead, no name): said before the email goes. */
    cannot: "can't be made for this lead, so this email is skipped",
    /** None is being made for anyone just now (the edge's switch): the email waits, and goes once they are. */
    paused: "paused for now, so this email waits",
    /** The day's are all made (PREVIEW_LIMITS.aDay): the email waits for tomorrow, and its line says the rest. */
    full: "today's limit is reached, so this email waits",
    building: "being made",
    /** Being made for longer than usual: still looked at, and its line says so. */
    slow: "still being made, slower than usual",
    ready: "ready",
    claimed: "made theirs",
    failed: "couldn't be made, so this email is skipped",
    ended: "ended, so this email is skipped",
    notOurs: "can't be made here, so this email is skipped",
  },
} as const;

const F = LEAD_FILL_WORDS;

/** A fill-in's bubble: what it is, where its value came from (null where nothing says), whether it changes. */
interface FillInSays {
  title: string;
  from: string | null;
  varies: string;
}

/** Where a value its owner put right came from: them, and what its listing said where the lead keeps it. */
const ownFrom = (was: string | null): string => (was ? F.yoursWas(was) : F.yours);

/**
 * What the blank `slot` says for this lead; null for the line, the receptionist's link, or a name that is no blank.
 * `found` is the row's own Source word (contracts leadSourceWord: its Maps listing, a business directory, or the owner's
 * own list), the one rule for where a lead's facts came from; null where the sheet has none, and the bubble then says
 * nothing of where. Never a guess from the lead's kind: a lead brought in on a list is a place too.
 */
export function fillInSaysOf(slot: string, lead: SlotLead, found: string | null): FillInSays | null {
  const from = found ? F.source(found) : null;
  const own = leadOwnOf(lead.facts);
  switch (slot) {
    case "business":
    case "company":
      return { title: F.business, from: own.name ? ownFrom(own.was.name) : from, varies: F.each };
    case "city":
      return { title: F.city, from: own.city ? ownFrom(own.was.city) : from, varies: F.each };
    case "first name":
      return { title: F.firstName, from: leadAddresseeOf(lead)?.first_name ? F.named : F.nobody, varies: F.each };
    case "title":
      return { title: F.title, from: F.named, varies: F.each };
    case "role":
      return { title: F.role, from: F.named, varies: F.each };
    case "your name":
      return { title: F.yourName, from: F.signs, varies: F.same };
    case "your business":
      return { title: F.yourBusiness, from: F.settings, varies: F.same };
    case "booking link":
      return { title: F.bookingLink, from: F.settings, varies: F.same };
    default:
      return null;
  }
}

/**
 * Which of a lead's own values the blank `slot` is, where its owner can put it right for every email (00631
 * lead_named): its name or its city. Null for a person's (their source's), the workspace's own, and the line.
 */
export function fillInFixOf(slot: string): "name" | "city" | null {
  if (slot === "business" || slot === "company") return "name";
  return slot === "city" ? "city" : null;
}

/** A step's words with each blank named, in pieces (words, and a blank by its name): its subject, where it has one, and its body. */
export interface EmailBlanks {
  subject: readonly LeadEmailPiece[] | null;
  body: readonly LeadEmailPiece[];
}

/** What the editor calls a blank, as the card names it; the line written for them by what it is. */
const blankName = (key: string): string =>
  key === "opening" ? F.lineBlank : capitalize((SLOTS.labels[SLOTS.keys.indexOf(key)] ?? key).toLowerCase());

/** One text of a step with every blank by its name: what everyone on the step gets, before any value is in. */
function blanksIn(text: string): LeadEmailPiece[] {
  const pieces: LeadEmailPiece[] = [];
  let from = 0;
  for (const mention of slotMentions(SLOTS, text)) {
    if (mention.index > from) pieces.push({ at: from, kind: "words", text: text.slice(from, mention.index) });
    pieces.push({ at: mention.index, kind: "blank", text: blankName(mention.key), slot: mention.key });
    from = mention.index + mention.written.length;
  }
  if (from < text.length) pieces.push({ at: from, kind: "words", text: text.slice(from) });
  return pieces;
}

/** A step's words with each blank named, or null where they name none: no switch is drawn over such an email. */
export function emailBlanksOf(written: LeadEmailText): EmailBlanks | null {
  const subject = written.subject === null ? null : blanksIn(written.subject);
  const body = blanksIn(written.body);
  return [...(subject ?? []), ...body].some((piece) => piece.kind === "blank") ? { subject, body } : null;
}

/** The mark's words after its name, and its tone. */
interface PreviewMark {
  say: string;
  tone: LeadPreviewLineVM["tone"];
}

/**
 * What the card's mark says for a lead's preview, as the send would treat it (contracts previewSlotOf): none yet is made
 * when the email goes, one being made holds it, one ready goes with it, and one that failed, ended or cannot be made here
 * skips that email. Null while the read is out: the mark says its name alone, never a guess.
 */
export function previewMarkOf(dto: LeadPreviewDto | null, now: Date): PreviewMark | null {
  if (!dto) return null;
  const preview = dto.preview;
  if (!preview) {
    if (!dto.makes) return { say: F.mark.notOurs, tone: "warn" };
    if (dto.cannot) return { say: F.mark.cannot, tone: "warn" };
    if (dto.paused) return { say: F.mark.paused, tone: "warn" };
    return dto.full ? { say: F.mark.full, tone: "warn" } : { say: F.mark.none, tone: "quiet" };
  }
  if (preview.state === "building")
    return { say: previewBuildSlow(preview, now) ? F.mark.slow : F.mark.building, tone: "busy" };
  if (preview.state === "failed") return { say: F.mark.failed, tone: "warn" };
  if (preview.state === "claimed") return { say: F.mark.claimed, tone: "done" };
  return previewClaimable(previewStateOf(preview, now))
    ? { say: F.mark.ready, tone: "go" }
    : { say: F.mark.ended, tone: "warn" };
}
