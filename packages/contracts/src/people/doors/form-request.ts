/**
 * What a request sent through one of the business's forms leaves for its owner (the Forms plan, 3.5), beside what a
 * website's own form leaves (website-form.ts): the note that waits on the person's page for a member's Keep (decision
 * 0007: a stranger's words are no fact until a member keeps them), and the owner's notice, which opens the request in
 * Inbox. Both read the answers once, as the request's page does (forms/request-words.ts requestLines). Pure.
 */
import { requestAddress } from "../../forms/address";
import type { FormAnswer } from "../../forms/answers";
import type { FormFieldKind } from "../../forms/limits";
import { requestLines, throughPlace } from "../../forms/request-words";
import type { FormDescription } from "../../forms/shape";
import { NOTE_MAX } from "../../notes/person-notes";
import type { JobNews } from "../../today/notifications/feed-input";

/** The kinds that say who the person is, which their page holds already and a note never repeats. */
const WHO_KINDS: ReadonlySet<FormFieldKind> = new Set(["email", "phone"]);

/**
 * The note a request suggests on the person's page: which form, how they came where that is known (`came`: "Through
 * Instagram", the place its link was shared, or "From Google (spring-offer)"), what they wrote in their own words (the
 * first longer answer), then what else they answered. Never their name, their address or their number: those are on
 * their page. At most a note's length: their words are cut, never the line.
 */
export function formRequestNote(
  form: Pick<FormDescription, "heading" | "fields">,
  answers: Record<string, FormAnswer> | Record<string, unknown>,
  arrived: string | null = null,
): string {
  const lines = requestLines(form, answers);
  const nameId = form.fields.find((field) => field.kind === "short")?.id;
  const wrote = lines.find((line) => line.kind === "long");
  const rest = lines
    .filter((line) => line !== wrote && line.id !== nameId && !WHO_KINDS.has(line.kind))
    .map((line) => ` ${line.label.replace(/[:.\s]+$/, "")}: ${line.words.replace(/[.\s]+$/, "")}.`)
    .join("");
  const head = `Sent a request: ${form.heading.replace(/[.\s]+$/, "")}.${arrived ? ` ${arrived}.` : ""}`;
  if (!wrote) return `${head}${rest}`.slice(0, NOTE_MAX);
  const room = NOTE_MAX - head.length - rest.length - ' They wrote: ""'.length;
  const words = wrote.words.length > room ? `${wrote.words.slice(0, Math.max(0, room - 1)).trimEnd()}…` : wrote.words;
  return `${head} They wrote: "${words}"${rest}`.slice(0, NOTE_MAX);
}

/** Who a request is about, as it was typed, and where it came through: what the notice says beside the answers. */
export interface RequestNoticed {
  entryId: string;
  contactId: string;
  reach: { name: string | null; email: string | null; phone: string | null };
  /** The place its link was shared ("Google listing"), where it came through one. */
  place: string | null;
}

/**
 * The owner's notice of a request: who sent it, what it says, how to reach them and how they came, opening the request
 * in Inbox where it is answered. A number alone says so: nothing can be texted to them first.
 */
export function formRequestNotice(
  form: Pick<FormDescription, "heading" | "fields">,
  answers: Record<string, FormAnswer> | Record<string, unknown>,
  noticed: RequestNoticed,
): Omit<JobNews, "sourceEvent" | "kind"> & { kind: "form_request" } {
  const { reach } = noticed;
  const named = reach.name || reach.email || reach.phone || "Someone";
  const ways = [reach.email, reach.phone].filter(Boolean).join(" · ");
  return {
    kind: "form_request",
    route: requestAddress(noticed.entryId),
    about: { type: "contact", id: noticed.contactId },
    subject: `${named} sent a request: ${form.heading}`.slice(0, 200),
    body: [
      formRequestNote(form, answers),
      ways ? `To reach them: ${ways}` : null,
      !reach.email && reach.phone ? "A number only: nothing can be texted to them first." : null,
      noticed.place?.trim() ? `${throughPlace(noticed.place)}.` : null,
      "It waits in Inbox, in Needs you, until it is answered.",
    ]
      .filter(Boolean)
      .join("\n"),
    redactedBody: "A workspace's form brought a request, and nobody could be told.",
  };
}
