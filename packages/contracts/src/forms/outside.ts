/**
 * Forms owned elsewhere (00709; Campaigns in three tabs, Lane B): a website's own forms, beside the forms made here, and
 * the sites they come from. A site's form owns its questions; Chanlytics receives only what the website door takes
 * (contracts WebsiteFormBody), so a site's request is read as the same request shape as a form made here through one
 * fixed description of those fields (`siteFormOf`), with no version pretended: the request's page, the owner's notice,
 * the note on the person's page, Needs you and AI all say it as they say a hosted form's. Pure.
 */
import { DAY_MS } from "../shared/time";
import type { EntryHeldWhyDto } from "./limits";
import type { FormField, FormDescription } from "./shape";

/** What a site's form is: a request the business answers, or a sign-up for its offers. */
export type OutsideFormKind = "request" | "signup";

/**
 * What Chanlytics receives from a site's form, as a request's lines say it: the website door's own fields, in its order.
 * Each id is the field's name in what the door keeps (form_entries.answers), so a site's answers read through
 * contracts requestLines as a hosted form's do. Never the site's own questions, which are the site's to change.
 */
export const SITE_FORM_FIELDS: readonly FormField[] = [
  { id: "name", kind: "short", label: "Name", needed: false },
  { id: "email", kind: "email", label: "Email", needed: false },
  { id: "phone", kind: "phone", label: "Phone", needed: false },
  { id: "about", kind: "short", label: "What it's about", needed: false },
  { id: "note", kind: "long", label: "A note", needed: false },
];

/** A site's form as a request is read against: its name as its heading, and the fields the door takes. */
export const siteFormOf = (heading: string): Pick<FormDescription, "heading" | "fields"> => ({
  heading,
  fields: [...SITE_FORM_FIELDS],
});

/** The names a site's form goes by where neither its owner nor its site named it. */
const UNNAMED: Record<OutsideFormKind, string> = {
  request: "Website form",
  signup: "Sign-ups from your website",
};

/** The name a site's form is shown by: its owner's own, else the name its site last sent, else its kind's. */
export function outsideFormNameOf(form: {
  name: string | null;
  sent_name: string | null;
  form: OutsideFormKind;
}): string {
  return form.name?.trim() || form.sent_name?.trim() || UNNAMED[form.form];
}

/** Who a site's entry is about, as it was typed: what its answers hold of a name, an address and a number. */
export function siteReachOf(answers: Record<string, unknown>): {
  name: string | null;
  email: string | null;
  phone: string | null;
} {
  const text = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : null);
  return { name: text(answers.name), email: text(answers.email)?.toLowerCase() ?? null, phone: text(answers.phone) };
}

/**
 * Where a site stands, from what came from it: waiting for its first entry, a test received and nothing real yet,
 * receiving, or nothing lately (no real entry for SITE_QUIET_DAYS, which is no fault: a quiet site is a quiet site).
 */
export type FormSiteStanding = "waiting" | "test" | "receiving" | "quiet";

/** How long a site may send nothing before it stands at "nothing lately". */
export const SITE_QUIET_DAYS = 30;

/** A site's standing at `nowMs`, from when its last real entry and its last test came. */
export function siteStandingOf(
  site: { last_entry_at: string | null; test_at: string | null },
  nowMs: number,
): FormSiteStanding {
  if (site.last_entry_at) {
    return nowMs - Date.parse(site.last_entry_at) > SITE_QUIET_DAYS * DAY_MS ? "quiet" : "receiving";
  }
  return site.test_at ? "test" : "waiting";
}

/** The name a site is shown by: its host once an entry names it, else the name it was given with its first key. */
export const formSiteNameOf = (site: { host: string | null; name: string | null }): string =>
  site.host || site.name?.trim() || "Website";

/** A form owned elsewhere as Forms' list shows it, under its site. */
export interface OutsideFormRowDto {
  id: string;
  /** The name it is shown by (outsideFormNameOf). */
  name: string;
  form: OutsideFormKind;
  site_id: string;
  /** Its site, as the row names it (formSiteNameOf). */
  site: string;
  listed: boolean;
  last_entry_at: string | null;
  /** How many of its entries wait in its held pile (00726). */
  held: number;
}

/** A key of a site's, as the website connection shows it: never the key itself, which is shown once. */
export interface FormSiteKeyDto {
  id: string;
  /** What the owner called it; null for the first key, made from the platform's own. */
  name: string | null;
  first: boolean;
  made_at: string;
  last_used_at: string | null;
  /** From when it is refused: a key changed works a day more; null for one that does not end. */
  ends_at: string | null;
}

/** A site as the website connection shows it: where it stands, its keys that still work, and the forms found on it. */
export interface FormSiteDto {
  id: string;
  name: string;
  host: string | null;
  standing: FormSiteStanding;
  last_entry_at: string | null;
  test_at: string | null;
  keys: FormSiteKeyDto[];
  forms: Array<{ id: string; name: string; form: OutsideFormKind; last_entry_at: string | null }>;
}

/**
 * What a site's form brought over a window: its entries, the people, those new with it, talked and visits, and for a
 * sign-up, how many confirmed from the email it sent them.
 */
export interface OutsideFormResultsDto {
  days: number;
  entries: number;
  people: number;
  new_people: number;
  talked: number;
  visits: number;
  confirmed: number;
}

/** A site's form opened in Forms: its names, its site, what it brought, and its newest entries. */
export interface OutsideFormSheetDto {
  id: string;
  name: string;
  /** The owner's own name, which the rename field holds; null where they gave none. */
  own_name: string | null;
  /** The name its site last sent, where it sent one. */
  sent_name: string | null;
  form: OutsideFormKind;
  listed: boolean;
  /** When its own newest entry came; null before its first. */
  last_entry_at: string | null;
  /** From when its entries are requests: one from before is history, never an open request. */
  requests_from: string;
  site: { id: string; name: string; host: string | null; standing: FormSiteStanding; last_entry_at: string | null };
  results: OutsideFormResultsDto;
  entries: Array<{
    id: string;
    name: string | null;
    created_at: string;
    /**
     * A request, where it stands (dtos.ts EntryStandingDto): open, sending, answered or aged ("Never answered"); a
     * request from before its form's requests_from, or a sign-up: kept.
     */
    standing: "open" | "sending" | "answered" | "aged" | "kept";
    phone_only: boolean;
  }>;
  /** Its entries held for a look (00726): past the door's limit, or set aside by a member. Each says why. */
  held: Array<{
    id: string;
    name: string | null;
    created_at: string;
    held_why: EntryHeldWhyDto | null;
    phone_only: boolean;
  }>;
  /** Whether the reply AI drafts can go by email here. */
  email_ready: boolean;
  can_change: boolean;
}
