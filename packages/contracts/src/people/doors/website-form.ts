/**
 * A form on the business's own website (00488): a sign-up for its offers, or a request (a seat in a class, a chair to
 * rent, a question). The site hands each one to the workspace's door on the edge (api/website-form), which resolves the
 * person through the one door (resolve_person, source 'website'), suggests what they asked as a note on their page, and
 * tells the owner. A site that emailed each one to an agency's mailbox brought nobody to its workspace (28 Oct 2026).
 *
 * What a form says is a stranger's words: it waits on the person's page as a suggestion, and the receptionist reads it
 * only once a member keeps it (0007), as it reads a caller's. Here: what the door takes, the note's words and the owner's
 * notice. Pure.
 */
import { z } from "zod";
import { NOTE_MAX } from "../../notes/person-notes";
import { normalizePhone } from "../../shared/phone";
import { dateFormat, HOUR_MS } from "../../shared/time";
import type { JobNews } from "../../today/notifications";

/** What a form on the site is: a sign-up for the business's offers, or a request the business answers. */
const WEBSITE_FORMS = ["signup", "request"] as const;
export type WebsiteForm = (typeof WEBSITE_FORMS)[number];

const line = (max: number) => z.optional(z.string().trim().max(max));

/**
 * What the site posts (POST /api/website-form): the workspace and its key (websiteFormKeyOf, edge), which form, and what
 * the visitor wrote. `about` is what the site says the request is ("A seat in the spring class"); `at` is when the
 * visitor sent it, which a form re-sent later passes as it was.
 */
export const WebsiteFormBody = z.object({
  workspace: z.uuid(),
  key: z.string().min(20).max(100),
  form: z.enum(WEBSITE_FORMS),
  name: line(120),
  email: z.optional(z.email().max(254)),
  phone: line(40),
  about: line(200),
  note: line(1000),
  page: line(200),
  lang: line(10),
  at: z.optional(z.iso.datetime({ offset: true })),
});
export type WebsiteFormInput = z.infer<typeof WebsiteFormBody>;

/** Who the form is about, as the person door takes them: a name, and at least one way to reach them; null when none. */
export function websiteFormPerson(f: Pick<WebsiteFormInput, "name" | "email" | "phone">): {
  name: string | null;
  email: string | null;
  phone: string | null;
} | null {
  const email = f.email ? f.email.trim().toLowerCase() : null;
  const phone = normalizePhone(f.phone);
  if (!email && !phone) return null;
  return { name: f.name?.trim() || null, email, phone };
}

/**
 * A day as the note says it ("Oct 21"), for a form sent before it reached the workspace: in the workspace's own zone, so
 * a form sent on an evening in New York is that evening's day, never the next one UTC has already reached. A zone the
 * runtime does not know reads as UTC.
 */
function sentOn(iso: string, tz: string): string {
  const at = new Date(iso);
  try {
    return dateFormat("en-US", { month: "short", day: "numeric", timeZone: tz }).format(at);
  } catch {
    return dateFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(at);
  }
}

/** When a form is read: the moment it arrives, and the zone its workspace keeps its days in. */
interface WebsiteFormWhen {
  nowMs: number;
  tz: string;
}

/** A form older than this reached the workspace late (re-sent): its note says the day it was sent. */
const LATE_MS = HOUR_MS;

/**
 * Whether a form reached the workspace late: sent over an hour before it arrived (a form re-sent from where it was kept
 * before the door). Its note says the day, and the owner is told on the bell alone: old news is not an alarm.
 */
export function websiteFormLate(f: Pick<WebsiteFormInput, "at">, nowMs: number): boolean {
  return !!f.at && nowMs - Date.parse(f.at) > LATE_MS;
}

/**
 * The note a form suggests on the person's page: what they signed up for or asked, in their own words where they wrote
 * any, and the day they sent it, in the workspace's zone, when it arrived late. At most a note's length: their words are
 * cut, never the line.
 */
export function websiteFormNote(f: WebsiteFormInput, when: WebsiteFormWhen): string {
  const first =
    f.about?.trim() ||
    (f.form === "signup" ? "Signed up for your offers on your website" : "Sent a request on your website");
  const head = `${first.replace(/[.\s]+$/, "")}.`;
  const late = f.at && websiteFormLate(f, when.nowMs) ? ` Sent ${sentOn(f.at, when.tz)}.` : "";
  const words = f.note?.trim();
  if (!words) return `${head}${late}`.slice(0, NOTE_MAX);
  const room = NOTE_MAX - head.length - late.length - ' They wrote: ""'.length;
  const said = words.length > room ? `${words.slice(0, Math.max(0, room - 1)).trimEnd()}…` : words;
  return `${head} They wrote: "${said}"${late}`.slice(0, NOTE_MAX);
}

/** The owner's notice of a form: who sent it, what it says, and their page, where the note waits. */
export function websiteFormNotice(
  f: WebsiteFormInput,
  who: { contactId: string; name: string | null; email: string | null; phone: string | null },
  when: WebsiteFormWhen,
): Omit<JobNews, "sourceEvent" | "kind"> & { kind: "website_form" } {
  const named = who.name || who.email || who.phone || "Someone";
  const reach = [who.email, who.phone].filter(Boolean).join(" · ");
  return {
    kind: "website_form",
    route: `clients/${who.contactId}`,
    about: { type: "contact", id: who.contactId },
    subject: (f.form === "signup"
      ? `${named} signed up on your website`
      : `${named} sent a request on your website`
    ).slice(0, 200),
    body: [
      websiteFormNote(f, when),
      reach ? `To reach them: ${reach}` : null,
      "They are in People now, and what they asked waits on their page as a note to keep.",
    ]
      .filter(Boolean)
      .join("\n"),
    redactedBody: "A workspace's website form brought someone, and nobody could be told.",
  };
}
