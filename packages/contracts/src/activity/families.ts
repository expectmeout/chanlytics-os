import type { DecisionVerb, EVENT_KINDS } from "../shared/enums";
import { ACTIVITY_KINDS, activityKindWords, isActivityNoise } from "../workspace/activity";
import { activityTone } from "./tones";
import { UNKNOWN_MEMBER_WORD } from "../shared/words";

/**
 * The activity log's families: where in the product a row belongs, in the words the sidebar and Settings say.
 *
 * The log's picker listed a hundred and fifty kinds as the ledgers spell them (`open_recording`,
 * `message.send_failed`), in a browser's own datalist, and most rows drew a plain dot because the page's two glyph
 * tables named a third of the kinds. A family is said once here: the picker groups by it, the page draws its mark from
 * it, and the route narrows the log to one. A verb's family is named verb by verb (a verb has no prefix to read), an
 * event's by the family its kind is filed under, with the few kinds that belong elsewhere named one by one. Both
 * tables are typed by the closed sets, so a verb or a family of events added later does not compile without its row.
 */
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
  "records",
] as const;
export type ActivityFamily = (typeof ACTIVITY_FAMILIES)[number];

/** Each family's name, as the product says it. */
const FAMILY_WORDS: Record<ActivityFamily, string> = {
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
  records: "Kept records",
};

const VERB_FAMILY: Record<DecisionVerb, ActivityFamily> = {
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
  make_sequence: "campaigns",
  discard_sequence: "campaigns",
};

/** The word an event kind is filed under: `message` of `message.sent`. */
type EventPrefix = (typeof EVENT_KINDS)[number] extends `${infer P}.${string}` ? P : never;

const PREFIX_FAMILY: Record<EventPrefix, ActivityFamily> = {
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
  ingest: "records",
};

/** An event kind that belongs with another family than the one its prefix names. */
const KIND_FAMILY: Partial<Record<(typeof EVENT_KINDS)[number], ActivityFamily>> = {
  // A reply held past its window is a conversation's news, though the rule that held it is a setting.
  "policy.veto_window_skipped": "conversations",
};

/** The family a kind belongs to; null for a kind neither table names (a row a newer build wrote). */
export function activityFamily(kind: string): ActivityFamily | null {
  if (Object.hasOwn(VERB_FAMILY, kind)) return VERB_FAMILY[kind as DecisionVerb];
  if (Object.hasOwn(KIND_FAMILY, kind)) return KIND_FAMILY[kind as (typeof EVENT_KINDS)[number]] ?? null;
  const dot = kind.indexOf(".");
  const prefix = dot > 0 ? kind.slice(0, dot) : "";
  return Object.hasOwn(PREFIX_FAMILY, prefix) ? PREFIX_FAMILY[prefix as EventPrefix] : null;
}

export const isActivityFamily = (v: unknown): v is ActivityFamily =>
  typeof v === "string" && (ACTIVITY_FAMILIES as readonly string[]).includes(v);

/** Every kind either ledger may hold that belongs to a family, as the ledgers spell them: what the route narrows by. */
export function activityFamilyKinds(family: ActivityFamily): string[] {
  return ACTIVITY_KINDS.filter((k) => activityFamily(k) === family);
}

/**
 * What went wrong, or was stopped: the kinds whose tone is a failure or a warning (activityTone), the rows an owner
 * opens the log to find. Never the kept records, which are asked for by name.
 */
export const ACTIVITY_PROBLEM_KINDS: readonly string[] = ACTIVITY_KINDS.filter((k) => {
  const tone = activityTone(k);
  return (tone === "danger" || tone === "warn") && !isActivityNoise(k);
});

/** One family of the picker: its name, and each kind in the words its rows say. */
export interface ActivityKindGroup {
  family: ActivityFamily;
  label: string;
  kinds: { kind: string; label: string }[];
}

/**
 * The kinds the log may be narrowed to, family by family in the families' order, each said as its rows say it
 * ("Listened to a call's recording"), never as the ledger spells it. A family none of the kinds belongs to is left
 * out, and so is a kind with no family.
 */
export function activityKindGroups(kinds: readonly string[]): ActivityKindGroup[] {
  return ACTIVITY_FAMILIES.map((family) => ({
    family,
    label: FAMILY_WORDS[family],
    kinds: kinds.filter((k) => activityFamily(k) === family).map((k) => ({ kind: k, label: activityKindWords(k) })),
  })).filter((g) => g.kinds.length > 0);
}

/** The spans of days the log may be narrowed to, besides one day picked by hand. */
export const ACTIVITY_SPANS = ["today", "yesterday", "week", "month"] as const;
export type ActivitySpan = (typeof ACTIVITY_SPANS)[number];

/** How many days back a span reaches, today included; yesterday is the one day before today. */
export const ACTIVITY_SPAN_DAYS: Record<ActivitySpan, number> = { today: 1, yesterday: 1, week: 7, month: 30 };

/** Who a row may be narrowed to besides a member: the receptionist, or what the system did by itself. */
export const ACTIVITY_ACTORS = ["receptionist", "system"] as const;
export type ActivityActor = (typeof ACTIVITY_ACTORS)[number];

/** Every word the Activity pane says that is not a row's own. */
export const ACTIVITY_PAGE_WORDS = {
  title: "Activity",
  sub: "What happened, and who did it · newest first",
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
    pick: "Pick the day",
  },
  person: {
    label: "A person, by name or number",
    find: "Find a person",
    everyone: (name: string): string => `Everyone, not only ${name}`,
  },
  reading: "Reading the activity log…",
  /** An empty log: narrowed, the filters are why; whole, nothing has happened in the workspace yet. */
  none: "Nothing here for that.",
  noneYet: "Nothing has happened yet.",
  clear: "Clear the filters",
  clearShort: "Clear",
  more: "Show more",
  moreReading: "Reading…",
  /**
   * Lines newer than the ones on screen, read while the log is open: offered above it rather than moved in under the reader
   * (the wiring's second audit, X2-3). Not counted: a burst of one kind is one line, and the rows read are not the lines drawn.
   */
  newer: {
    fact: "Newer activity",
    since: "since this was read",
    show: "Show it",
    label: "Newer activity since this was read",
  },
  soFar: (n: number): string => `${n} so far`,
  /** A fold's name to a screen reader: its sentence, then what a press on it does. */
  fold: {
    show: (said: string): string => `${said}: show them`,
    hide: (said: string): string => `${said}: hide them`,
  },
  since: (time: string): string => `since ${time}`,
  /** Who did a row whose member the roster does not know (they have left the team): memberWords' word for it. */
  member: UNKNOWN_MEMBER_WORD,
  foot: "Model usage, webhook receipts and unplaced messages are kept out of the log. Pick Kept records to see them.",
  ownerOnly:
    "Only an owner can read the activity log: it is the whole record of the workspace, including what every member did.",
} as const;
