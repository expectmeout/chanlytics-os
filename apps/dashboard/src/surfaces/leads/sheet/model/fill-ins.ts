/**
 * A fill-in on the lead's card (decision 0127): the rules and the words only the sheet says, so they live with it.
 *
 *   fillInSaysOf     what a blank's value says when it is pressed: what it is, where it came from, whether it changes
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
  yourName: "Your name",
  yourBusiness: "Your business name",
  bookingLink: "Your booking link",
  fromMaps: "From their Google Maps listing.",
  fromDirectory: "From the business directory they are listed in.",
  fromList: "From the list you brought in.",
  named: "The person named at this company.",
  nobody: "Nobody is named at this company, so it says “there”.",
  signs: "The name this sequence signs with.",
  settings: "From your settings.",
  each: "Different for each business.",
  same: "The same in every email.",
  change: "Change it for this one",
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

/**
 * Where a lead was found, as its fill-ins say it, by its source (the Maps card's, the people card's, else a list of the
 * owner's own): the card's lead says it by the one rule (contracts leadSourceOf). Null where a lead says no source: the
 * bubble then says nothing of where, never a guess from its kind.
 */
function foundWords(lead: SlotLead): string | null {
  const source = lead.source;
  if (!source) return null;
  if (source === "maps" || source === "local_businesses") return F.fromMaps;
  return source === "people_at_companies" ? F.fromDirectory : F.fromList;
}

/** What the blank `slot` says for this lead; null for the line, the receptionist's link, or a name that is no blank. */
export function fillInSaysOf(slot: string, lead: SlotLead): FillInSays | null {
  const found = foundWords(lead);
  switch (slot) {
    case "business":
    case "company":
      return { title: F.business, from: found, varies: F.each };
    case "city":
      return { title: F.city, from: found, varies: F.each };
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
    return dto.cannot ? { say: F.mark.cannot, tone: "warn" } : { say: F.mark.none, tone: "quiet" };
  }
  if (preview.state === "building")
    return { say: previewBuildSlow(preview, now) ? F.mark.slow : F.mark.building, tone: "busy" };
  if (preview.state === "failed") return { say: F.mark.failed, tone: "warn" };
  if (preview.state === "claimed") return { say: F.mark.claimed, tone: "done" };
  return previewClaimable(previewStateOf(preview, now))
    ? { say: F.mark.ready, tone: "go" }
    : { say: F.mark.ended, tone: "warn" };
}
