import { addressOf } from "./record-address";

/**
 * Where each kind of thing a ledger row can be about opens, or why it opens nowhere: the one table beside the subjects' names
 * (packages/db events.ts, ownNames), so a new kind of subject cannot be written to the ledger without saying where it opens.
 * The writer takes its `subjectType` from this table's keys (`ActivitySubjectType`, held in events.type-test.ts), and a
 * decision's subject (DECISION_SUBJECTS) and the types the migrations' own inserts write are each held to it by
 * tooling/scripts/tests/links/every-subject-has-a-door-or-a-reason.test.mjs.
 *
 * A door is a route without its slash, from the row's subject id (null where the row names none). A lookup is a page the
 * server finds by reading the subject (a message's thread, a deal's person: server/metrics/activity.ts), which the row alone
 * cannot name. A subject with neither says why in a sentence, so the next person adding one reads that there is a choice.
 */
type SubjectHome = { door: (id: string | null) => string | null } | { lookup: string } | { none: string };

/** A door that opens by the subject's id: a row that names none opens nothing. */
const byId =
  (route: (id: string) => string) =>
  (id: string | null): string | null =>
    id ? route(id) : null;

/** A door to a page that needs no id: the pane, or the lens, the subject lives on. */
const page = (route: string) => (): string => route;

// Every door is the record's own address (record-address.ts addressOf), said once there, never again here.
const CONNECTIONS = addressOf({ kind: "channel" });

export const ACTIVITY_SUBJECT_HOMES = {
  // The subjects with a page of their own.
  contact: { door: byId((id) => addressOf({ kind: "person", id })) },
  conversation: { door: byId((id) => addressOf({ kind: "conversation", id })) },
  call: { door: byId((id) => addressOf({ kind: "call", id })) },
  lead: { door: byId((id) => addressOf({ kind: "lead", id })) },
  lead_search: { door: byId((id) => addressOf({ kind: "lead", searchId: id })) },
  broadcast: { door: byId((id) => addressOf({ kind: "send", id })) },
  // A campaign is a moment of Campaigns' home, open in its drawer (decision of 3 Oct 2026; contracts doorOf).
  playbook: { door: byId((id) => addressOf({ kind: "campaign", id })) },
  // A sequence (0060) is its first step's id: it opens where its campaign does, until the Sequences page has its address.
  sequence: { door: byId((id) => addressOf({ kind: "campaign", id })) },
  // A visit opens its panel on the Calendar. The id alone cannot name its day: the server adds it (activity.ts).
  appointment: { door: byId((id) => addressOf({ kind: "visit", id })) },
  // A review's ledger line (a reply, one held) names the review's row: its door opens that review with its reply box, and the lens
  // itself where the line names none.
  review: { door: (id) => addressOf({ kind: "review", id }) },
  membership: { door: page(addressOf({ kind: "team" })) },
  invitation: { door: page(addressOf({ kind: "team" })) },
  // Connections holds the numbers, the lines, the address mail is sent from, the mailboxes reach-outs write from and the
  // Google listing.
  channel: { door: page(CONNECTIONS) },
  tenant_channel: { door: page(CONNECTIONS) },
  line: { door: page(CONNECTIONS) },
  mailbox: { door: page(CONNECTIONS) },
  mailbox_connection: { door: page(CONNECTIONS) },
  listing: { door: page(CONNECTIONS) },
  subscription: { door: page(addressOf({ kind: "billing" })) },
  // The subjects whose page the server finds.
  message: { lookup: "its thread, which the server reads off the message (activity.ts, doors)" },
  escalation: { lookup: "its thread, which the server reads off the handover (activity.ts, doors)" },
  deal: { lookup: "its person's page, which the server reads off the deal (activity.ts, doors)" },
  template: {
    lookup:
      "the Library message, addressed by its name (campaigns/message:<name>), which the server reads off the template row; one deleted has no page",
  },
  list: { lookup: "its page depends on what kind of list it is, which the log's list route says (listRoute)" },
  // The subjects that open nowhere, and why.
  workspace: {
    none: "the workspace has no page of its own: what changed in it is in the row's sentence, and a change of one of its panes opens that pane (WORKSPACE_CHANGE_DOORS)",
  },
  tenant: {
    none: "the workspace as storage names it: what changed in it is in the row's sentence, and a change of one of its panes opens that pane (WORKSPACE_CHANGE_DOORS)",
  },
  draft: { none: "a held draft is answered in the Inbox, and the row does not know the thread it is in" },
  agent: { none: "the Agents of the mockup are hidden from every real workspace (surface-registry.ts)" },
  job: { none: "a platform job: the back office reads it, and an owner has no page for it" },
  user: { none: "a member's Ask usage: counted, and there is no page it belongs to" },
  lead_round: { none: "one round of a search: the search holds it, and a round has no page of its own" },
} as const satisfies Record<string, SubjectHome>;

/**
 * Where a row about the workspace itself opens, by what changed in it (the wiring's second audit, W-review-facts-rules-6):
 * the workspace has no page, and "An autonomy setting changed" and "Settings changed" could not be opened, though each is
 * of one pane. A kind not here (an export, the workspace starting) opens nowhere, as the subject says.
 */
const WORKSPACE_CHANGE_DOORS: ReadonlyMap<string, string> = new Map([
  ["policy.changed", addressOf({ kind: "rules" })],
  ["settings.changed", addressOf({ kind: "facts" })],
  // A note from a correction waits, and is answered, on Settings › Autonomy (decision 0063).
  ["settings.fact_suggested", addressOf({ kind: "rules" })],
  ["settings.fact_kept", addressOf({ kind: "rules" })],
  ["settings.fact_dismissed", addressOf({ kind: "rules" })],
  ["capability.activated", CONNECTIONS],
  ["capability.deactivated", CONNECTIONS],
  ["member.left", addressOf({ kind: "team" })],
]);

/** The pane a change of the workspace opens, by the row's kind, or null (WORKSPACE_CHANGE_DOORS). */
export function workspaceChangeDoor(kind: string): string | null {
  return WORKSPACE_CHANGE_DOORS.get(kind) ?? null;
}

/** Every kind of thing a ledger row can be about: the keys of the table above. */
export type ActivitySubjectType = keyof typeof ACTIVITY_SUBJECT_HOMES;

const HOMES: ReadonlyMap<string, SubjectHome> = new Map(Object.entries(ACTIVITY_SUBJECT_HOMES));

/** The home a subject type is declared, or undefined for a type nobody declared (a row written before, or by something else). */
export function activitySubjectHome(type: string | null): SubjectHome | undefined {
  return type === null ? undefined : HOMES.get(type);
}
