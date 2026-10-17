import { ACTIVITY_KINDS, activityKindWords, isActivityNoise } from "../workspace/activity.js";
import { activityTone } from "./tones.js";
import { UNKNOWN_MEMBER_WORD } from "../shared/words.js";
export const ACTIVITY_FAMILIES = [
  "conversations",
  "calls",
  "people",
  "lists",
  "leads",
  "deals",
  "campaigns",
  "calendar",
  "google",
  "connections",
  "team",
  "settings",
  "billing",
  "partner",
  "records"
];
const FAMILY_WORDS = {
  conversations: "Conversations",
  calls: "Calls",
  people: "People",
  lists: "Lists",
  leads: "Leads",
  deals: "Deals",
  campaigns: "Campaigns",
  calendar: "Calendar",
  google: "Google",
  connections: "Connections",
  team: "Team",
  settings: "Settings",
  billing: "Billing",
  partner: "Partner",
  records: "Kept records"
};
const VERB_FAMILY = {
  approve: "conversations",
  edit: "conversations",
  decline: "conversations",
  snooze: "conversations",
  wake: "conversations",
  take_over: "conversations",
  hand_back: "conversations",
  resolve: "conversations",
  archive: "conversations",
  reply: "conversations",
  cancel_send: "conversations",
  pause_agent: "conversations",
  resume_agent: "conversations",
  invite: "team",
  revoke_invite: "team",
  change_role: "team",
  remove_member: "team",
  erase: "people",
  merge: "people",
  whisper: "calls",
  connect_channel: "connections",
  consent_change: "people",
  send_broadcast: "campaigns",
  cancel_broadcast: "campaigns",
  start_playbook: "campaigns",
  pause_playbook: "campaigns",
  change_playbook: "campaigns",
  reply_review: "google",
  export: "settings",
  end_call: "calls",
  record_deal: "deals",
  make_list: "lists",
  rename_list: "lists",
  change_list_rule: "lists",
  add_to_list: "lists",
  drop_from_list: "lists",
  archive_list: "lists",
  restore_list: "lists",
  delete_list: "lists",
  import: "people",
  open_recording: "calls",
  mark_visit: "calendar",
  change_step: "campaigns",
  leave_sequence: "campaigns",
  return_to_sequence: "campaigns",
  make_sequence: "campaigns",
  discard_sequence: "campaigns",
  answer_booking_request: "calendar"
};
const PREFIX_FAMILY = {
  message: "conversations",
  conversation: "conversations",
  escalation: "conversations",
  member: "team",
  template: "campaigns",
  capability: "connections",
  booking_link: "conversations",
  policy: "settings",
  contact: "people",
  person: "people",
  call: "calls",
  voice: "connections",
  line: "connections",
  channel: "connections",
  mailbox: "connections",
  mailbox_connection: "connections",
  setup: "connections",
  google: "google",
  lead: "leads",
  reach_out: "leads",
  deal: "deals",
  broadcast: "campaigns",
  playbook: "campaigns",
  appointment: "calendar",
  business: "settings",
  settings: "settings",
  workspace: "settings",
  platform: "settings",
  billing: "billing",
  partner: "partner",
  usage: "records",
  webhook: "records",
  ingest: "records"
};
const KIND_FAMILY = {
  // A reply held past its window is a conversation's news, though the rule that held it is a setting.
  "policy.veto_window_skipped": "conversations"
};
export function activityFamily(kind) {
  if (Object.hasOwn(VERB_FAMILY, kind)) return VERB_FAMILY[kind];
  if (Object.hasOwn(KIND_FAMILY, kind)) return KIND_FAMILY[kind] ?? null;
  const dot = kind.indexOf(".");
  const prefix = dot > 0 ? kind.slice(0, dot) : "";
  return Object.hasOwn(PREFIX_FAMILY, prefix) ? PREFIX_FAMILY[prefix] : null;
}
export const isActivityFamily = (v) => typeof v === "string" && ACTIVITY_FAMILIES.includes(v);
export function activityFamilyKinds(family) {
  return ACTIVITY_KINDS.filter((k) => activityFamily(k) === family);
}
export const ACTIVITY_PROBLEM_KINDS = ACTIVITY_KINDS.filter((k) => {
  const tone = activityTone(k);
  return (tone === "danger" || tone === "warn") && !isActivityNoise(k);
});
export function activityKindGroups(kinds) {
  return ACTIVITY_FAMILIES.map((family) => ({
    family,
    label: FAMILY_WORDS[family],
    kinds: kinds.filter((k) => activityFamily(k) === family).map((k) => ({ kind: k, label: activityKindWords(k) }))
  })).filter((g) => g.kinds.length > 0);
}
export const ACTIVITY_SPANS = ["today", "yesterday", "week", "month"];
export const ACTIVITY_SPAN_DAYS = { today: 1, yesterday: 1, week: 7, month: 30 };
export const ACTIVITY_ACTORS = ["receptionist", "system"];
export const ACTIVITY_PAGE_WORDS = {
  title: "Activity",
  sub: "What happened, and who did it \xB7 newest first",
  narrow: "Narrow it",
  /** The first box: every part of the product, or what went wrong. The second, once a part is picked: its kinds. */
  area: { label: "Part of the product", any: "All activity", problems: "What went wrong or was stopped" },
  kind: { label: "Kind of activity", any: "All kinds" },
  who: { label: "Who did it", any: "Anyone", receptionist: "Receptionist", system: "System" },
  when: {
    label: "When",
    any: "Any time",
    today: "Today",
    yesterday: "Yesterday",
    week: "Last 7 days",
    month: "Last 30 days",
    day: "One day",
    pick: "Pick the day"
  },
  person: {
    label: "A person, by name or number",
    find: "Find a person",
    everyone: (name) => `Everyone, not only ${name}`
  },
  reading: "Reading the activity log\u2026",
  /** An empty log: narrowed, the filters are why; whole, nothing has happened in the workspace yet. */
  none: "Nothing here for that.",
  noneYet: "Nothing has happened yet.",
  clear: "Clear the filters",
  clearShort: "Clear",
  more: "Show more",
  moreReading: "Reading\u2026",
  /**
   * Lines newer than the ones on screen, read while the log is open: offered above it rather than moved in under the reader
   * (the wiring's second audit, X2-3). Not counted: a burst of one kind is one line, and the rows read are not the lines drawn.
   */
  newer: {
    fact: "Newer activity",
    since: "since this was read",
    show: "Show it",
    label: "Newer activity since this was read"
  },
  soFar: (n) => `${n} so far`,
  /** A fold's name to a screen reader: its sentence, then what a press on it does. */
  fold: {
    show: (said) => `${said}: show them`,
    hide: (said) => `${said}: hide them`
  },
  since: (time) => `since ${time}`,
  /** Who did a row whose member the roster does not know (they have left the team): memberWords' word for it. */
  member: UNKNOWN_MEMBER_WORD,
  foot: "Model usage, webhook receipts and unplaced messages are kept out of the log. Pick Kept records to see them.",
  ownerOnly: "Only an owner can read the activity log: it is the whole record of the workspace, including what every member did."
};
