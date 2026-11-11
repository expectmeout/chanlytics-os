/**
 * What a fill-in on the lead's card says when it is pressed (decision 0127): what it is, where its value came from, and
 * whether it changes from one business to the next. The line written for them and the receptionist's link say nothing
 * here: the first has its own tint and its Rewrite, the second its own mark (previews/line.ts previewChipOf).
 *
 *   fillInSaysOf    a blank's three sentences for this lead, or null where it has none
 */
import type { SlotLead } from "../../campaigns/reach-out/rules";
import { leadAddresseeOf } from "../kind";

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
} as const;

const F = LEAD_FILL_WORDS;

/** A fill-in's bubble: what it is, where its value came from, whether it changes. */
export interface FillInSaysVM {
  title: string;
  from: string;
  varies: string;
}

/**
 * Where a lead was found, as its fill-ins say it: by its source where the lead says one (the Maps card's, the people
 * card's, a file of the owner's), else by its kind, since the card's lead carries no source: a company is the people
 * card's, a place the Maps card's.
 */
function foundWords(lead: SlotLead): string {
  const source = lead.source;
  if (source === "maps" || source === "local_businesses") return F.fromMaps;
  if (source === "people_at_companies") return F.fromDirectory;
  if (source) return F.fromList;
  return lead.kind === "company" ? F.fromDirectory : F.fromMaps;
}

/** What the blank `slot` says for this lead; null for the line, the receptionist's link, or a name that is no blank. */
export function fillInSaysOf(slot: string, lead: SlotLead): FillInSaysVM | null {
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
