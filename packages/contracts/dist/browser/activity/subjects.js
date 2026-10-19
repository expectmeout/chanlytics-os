import { addressOf } from "./record-address.js";
const byId = (route) => (id) => id ? route(id) : null;
const page = (route) => () => route;
const CONNECTIONS = addressOf({ kind: "channel" });
export const ACTIVITY_SUBJECT_HOMES = {
  // The subjects with a page of their own.
  contact: { door: byId((id) => addressOf({ kind: "person", id })) },
  conversation: { door: byId((id) => addressOf({ kind: "conversation", id })) },
  call: { door: byId((id) => addressOf({ kind: "call", id })) },
  lead: { door: byId((id) => addressOf({ kind: "lead", id })) },
  lead_search: { door: byId((id) => addressOf({ kind: "lead", searchId: id })) },
  broadcast: { door: byId((id) => addressOf({ kind: "send", id })) },
  // A campaign is a sequence (decision 0060), open on its record.
  playbook: { door: byId((id) => addressOf({ kind: "campaign", id })) },
  // A sequence (0060) is its first step's id: it opens where its campaign does, on its record.
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
    lookup: "the Library message, addressed by its name (campaigns/messages/<name>, the Library open on it), which the server reads off the template row; one deleted has no page"
  },
  list: { lookup: "its page depends on what kind of list it is, which the log's list route says (listRoute)" },
  // The subjects that open nowhere, and why.
  workspace: {
    none: "the workspace has no page of its own: what changed in it is in the row's sentence, and a change of one of its panes opens that pane (WORKSPACE_CHANGE_DOORS)"
  },
  tenant: {
    none: "the workspace as storage names it: what changed in it is in the row's sentence, and a change of one of its panes opens that pane (WORKSPACE_CHANGE_DOORS)"
  },
  draft: { none: "a held draft is answered in the Inbox, and the row does not know the thread it is in" },
  agent: { none: "the Agents of the mockup are hidden from every real workspace (surface-registry.ts)" },
  job: { none: "a platform job: the back office reads it, and an owner has no page for it" },
  user: { none: "a member's Ask usage: counted, and there is no page it belongs to" },
  lead_round: { none: "one round of a search: the search holds it, and a round has no page of its own" }
};
const WORKSPACE_CHANGE_DOORS = /* @__PURE__ */ new Map([
  ["policy.changed", addressOf({ kind: "rules" })],
  ["settings.changed", addressOf({ kind: "facts" })],
  // A note from a correction waits, and is answered, on Settings › Autonomy (decision 0063).
  ["settings.fact_suggested", addressOf({ kind: "rules" })],
  ["settings.fact_kept", addressOf({ kind: "rules" })],
  ["settings.fact_dismissed", addressOf({ kind: "rules" })],
  ["capability.activated", CONNECTIONS],
  ["capability.deactivated", CONNECTIONS],
  ["member.left", addressOf({ kind: "team" })]
]);
export function workspaceChangeDoor(kind) {
  return WORKSPACE_CHANGE_DOORS.get(kind) ?? null;
}
const HOMES = new Map(Object.entries(ACTIVITY_SUBJECT_HOMES));
export function activitySubjectHome(type) {
  return type === null ? void 0 : HOMES.get(type);
}
