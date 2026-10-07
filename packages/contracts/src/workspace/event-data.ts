/**
 * The events that have a writer on each side: TypeScript (packages/db events.ts) and SQL (functions that insert into
 * public.events themselves). One declared shape and one version for each kind, here.
 *
 * The ledger says which version of a kind's data a row holds (events.version, 00264), so a reader can tell an old row
 * from a new one. That only works if the version names one shape. Three kinds were written from both sides in two
 * shapes under one version: `contact.added` was declared as the calendar sweep's (`{ source: "calendar", title, uid,
 * start }`) while import_person, create_person, lead_set_stage and reach_out_person wrote `{ source, title, by }` and
 * `{ source: "lead", lead_id, by }`; `contact.consent_changed` was declared as the carrier's opt-out while a dozen
 * functions wrote the door's, with purpose, evidence, note and the member; `platform.acted` was declared as a line's
 * retry while the partner functions wrote standings and statuses. Raising the declared version would have left every
 * SQL row saying 1, and nothing could have told the shapes apart.
 *
 * So each shape is the union of what the writers write, told apart by their own field (`source`, `purpose`, `action`),
 * every field a writer may leave out optional, and every field a writer adds still allowed (looseObject: evidence
 * carries whatever the door recorded). The version is declared once, in SHARED_EVENT_VERSIONS: the TypeScript writer
 * files its rows at it, and the database suite (database/event-shapes.db.test.mjs) runs every SQL writer and parses
 * its row against the shape and holds its version to this one, so raising a version here fails until the SQL writers
 * write it too.
 */
import { z } from "zod";

/** The version each shared kind's data is written at, from TypeScript (events.ts WRITES) and from SQL alike. */
export const SHARED_EVENT_VERSIONS = {
  "contact.added": 1,
  "contact.consent_changed": 1,
  "platform.acted": 1,
} as const;
export type SharedEventKind = keyof typeof SHARED_EVENT_VERSIONS;

const wireText = z.string();

/**
 * A person was added, and how. `source` is `calendar` (the calendar sweep, which says the appointment: title, uid and
 * start; or create_person for an appointment's guest, which says title), `lead` (the finder's trigger, lead_set_stage,
 * reach_out_person: the lead's id when it is known), `import` (a client list an owner brought in), or the hand's own
 * word (`manual`, or whatever POST contacts was given). `by` is the member's user id, or `reach_out` for the sender.
 */
export const ContactAddedData = z.looseObject({
  source: wireText,
  title: wireText.nullish(),
  uid: wireText.nullish(),
  start: wireText.nullish(),
  by: wireText.nullish(),
  lead_id: wireText.nullish(),
});
export type ContactAddedData = z.infer<typeof ContactAddedData>;

/**
 * A consent answer changed. `consent` is the answer, `source` how it was given; `purpose` says whose answer it is
 * (absent for the conversational one, `marketing`, `email_marketing`); the rest is what the door recorded: the
 * answer it replaced, the member, their note, and for one the customer texted, the channel, the message and their
 * words.
 */
export const ContactConsentChangedData = z.looseObject({
  consent: wireText,
  source: wireText,
  purpose: wireText.optional(),
  previous: wireText.nullish(),
  by: wireText.nullish(),
  note: wireText.nullish(),
  channel: wireText.nullish(),
  message_external_id: wireText.nullish(),
  message_id: wireText.nullish(),
  words: wireText.nullish(),
});
export type ContactConsentChangedData = z.infer<typeof ContactConsentChangedData>;

/**
 * The platform acted on a workspace. `action` says what (a line retried, a partner's standing or status set, a
 * partner's second factor reset), `by` who (the platform member's user id) and `by_email` their address where the
 * back office records it; a partner's change also says the answer it moved from.
 */
export const PlatformActedData = z.looseObject({
  action: wireText,
  by: wireText,
  by_email: wireText.nullish(),
  partner_id: wireText.nullish(),
  standing: wireText.nullish(),
  status: wireText.nullish(),
  from: wireText.nullish(),
});
export type PlatformActedData = z.infer<typeof PlatformActedData>;

/** The declared shape of each shared kind: what a row of it must parse as. */
export const SHARED_EVENT_SHAPES = {
  "contact.added": ContactAddedData,
  "contact.consent_changed": ContactConsentChangedData,
  "platform.acted": PlatformActedData,
} as const;
