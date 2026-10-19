/**
 * What Settings › Notifications says the workspace is told, where each alert goes, and who chooses (decision 0040).
 *
 * WHAT IS EMAILED IS DECLARED ONCE, HERE. `NOTIFICATION_DELIVERY` says, for every kind the edge keeps a row for
 * (SERVER_NOTIFICATION_KINDS), whether it is also emailed. The edge's notify() asks `emailsFor` before it mails: the
 * kind is one that is emailed, and the business has not turned it off (`notifications.email_off`). A kind added to the
 * table does not compile until it is classified here.
 *
 * WHAT THE PAGE OFFERS IS A TOPIC. A topic is what an owner recognises ("After every phone call"): it names its kinds,
 * and every kind a workspace is told is in exactly one topic or in the bell's own line (`BELL_LINE_KINDS`), which a test
 * holds both ways. A topic says by its type which channels carry it: email always (the receptionist must reach
 * someone), as the business chooses, or never; and whether a phone is told (PUSH_KINDS), which each member chooses for
 * themselves (`pushesFor`, push.ts). A topic whose kinds and channels disagree does not compile, so the page cannot offer
 * a tick no code reads.
 */
import { ALERT_ADDRESSES_MAX } from "../config/workspace-config/alerts";
import { LEAD_QUESTION_WAIT_LINE } from "../leads/lead-plan";
import { agoShort } from "../shared/time";
// The kinds as a type alone: the list is NOTIFICATION_DELIVERY's own keys, so the page's entry (alert-pane.ts) loads
// nothing of the bell's feed.
import type { ServerNotificationKind } from "./notifications";
import { BELL_LIST_ROWS, BELL_WINDOW_DAYS, type PushKind } from "./push";

/**
 * How each kept kind reaches the owner, beyond the row on the bell: by email as well, or on the bell alone.
 *
 * "email" is a kind notify() is handed and mails: to the workspace's addresses, or, for the platform's own (`alert`), to
 * Chanlytics. "bell" is a row the edge or a database function writes and no mail follows (the calendar's new people, a
 * review, a finished search, a note left for you, the day's reach-out numbers). Two kinds are written both ways and are
 * "email" because notify() is handed them: `billing` is mailed when the receptionist stops (a plan paused, a card
 * declined: S6-11) and when a number is about to go back, and its other news (a trial started or ending, the receptionist
 * back) is written to the bell and the phone alone; `leads_question`'s mail is sent by the lead runner beside the row
 * its trigger keeps.
 */
const NOTIFICATION_DELIVERY = {
  handoff: "email",
  deadman: "email",
  call: "email",
  number: "email",
  sweep: "email",
  job_failed: "email",
  playbook: "email",
  calendar_people: "bell",
  booking_notice: "bell",
  alert: "email",
  review: "bell",
  billing: "email",
  template_ready: "email",
  template_blocked: "email",
  broadcast_sent: "email",
  broadcast_stopped: "email",
  leads_ready: "bell",
  leads_question: "email",
  note_for_you: "bell",
  reach_out_replied: "email",
  reach_out_day: "bell",
  // A customer asked to stop: news and no wait (decision 0048). Emailed only as the business chooses, never always.
  opted_out: "email",
  // A booking that arrived and a teammate who joined: news and no wait, a line on the bell and no mail, no phone.
  booking: "bell",
  member_joined: "bell",
  // A teammate who left: the same, the other way (00437).
  member_left: "bell",
  // A note from an owner's correction, to keep or dismiss on the Autonomy pane (00448): a line on the bell, no more.
  note_to_keep: "bell",
  // A reply counting down to go in the owner's name (decision 0064): the bell and the phone, never a mail for a wait of minutes.
  reply_held: "bell",
} as const satisfies Record<ServerNotificationKind, "email" | "bell">;

/** A kept kind that is emailed. */
export type EmailedNotificationKind = {
  [K in ServerNotificationKind]: (typeof NOTIFICATION_DELIVERY)[K] extends "email" ? K : never;
}[ServerNotificationKind];
/** A kept kind that is a line in the bell and no more. */
export type BellNotificationKind = Exclude<ServerNotificationKind, EmailedNotificationKind>;

/** Every kind the edge emails. */
export const EMAILED_NOTIFICATION_KINDS: readonly EmailedNotificationKind[] = (
  Object.keys(NOTIFICATION_DELIVERY) as ServerNotificationKind[]
).filter((k): k is EmailedNotificationKind => NOTIFICATION_DELIVERY[k] === "email");

/**
 * Whether a notice of this kind is a kind that is emailed. A kind the table does not know is kept as a plain alert
 * (notify.ts), and so is emailed as one; no kind said is a plain alert.
 */
export function emailsNotificationKind(kind: string | null | undefined): boolean {
  const known = Object.hasOwn(NOTIFICATION_DELIVERY, kind ?? "");
  return NOTIFICATION_DELIVERY[known ? (kind as ServerNotificationKind) : "alert"] === "email";
}

/** The kinds that are always emailed: the receptionist must reach someone when a customer needs a person. */
export const EMAIL_ALWAYS_KINDS = ["handoff", "deadman"] as const satisfies readonly EmailedNotificationKind[];
type EmailAlwaysKind = (typeof EMAIL_ALWAYS_KINDS)[number];
/** The kinds the business chooses to be emailed or not: every emailed kind but the always ones and the platform's own. */
type EmailChoiceKind = Exclude<EmailedNotificationKind, EmailAlwaysKind | "alert">;

/** The groups a topic stands in, by how much it asks of the owner. */
export type AlertGroup = "needs_you" | "worth_knowing" | "for_you";

type EmailKindsOf<E> = E extends "always"
  ? EmailAlwaysKind
  : E extends "choice"
    ? EmailChoiceKind
    : BellNotificationKind;
type PhoneKindsOf<P> = P extends true ? PushKind : Exclude<ServerNotificationKind, PushKind>;

/** A topic whose email is `E` and whose phone is `P`: its kinds are those both say. */
interface AlertTopicOf<E extends "always" | "choice" | null, P extends boolean> {
  /** Stable: the page's test ids and the tests read it. */
  key: string;
  group: AlertGroup;
  title: string;
  /** When it is sent, in a sentence: the row's tip. */
  what: string;
  email: E;
  phone: P;
  kinds: readonly Extract<EmailKindsOf<E>, PhoneKindsOf<P>>[];
  /** What the bell's line calls it where the topic has nothing to choose (no email, and no phone of the member's). */
  onBell?: string;
}

/** One line of the page's grid. A topic with nothing to choose and nothing locked is the bell's line, not a topic. */
export type AlertTopic =
  | AlertTopicOf<"always", true>
  | AlertTopicOf<"always", false>
  | AlertTopicOf<"choice", true>
  | AlertTopicOf<"choice", false>
  | AlertTopicOf<null, true>;

const ALERT_GROUP_TITLES: Record<AlertGroup, string> = {
  needs_you: "Needs you",
  worth_knowing: "Worth knowing",
  for_you: "For your information",
};

export const ALERT_TOPICS: readonly AlertTopic[] = [
  {
    key: "handoff",
    group: "needs_you",
    title: "A customer needs a person",
    what: "The receptionist stopped on a conversation and someone is waiting. The alert carries their message.",
    email: "always",
    phone: true,
    kinds: ["handoff"],
  },
  {
    key: "deadman",
    group: "needs_you",
    title: "Still waiting for an answer",
    what: "A customer who needed a person has waited a while, a message went unanswered, or a reply never left.",
    email: "always",
    phone: true,
    kinds: ["deadman"],
  },
  {
    key: "reply_held",
    group: "needs_you",
    title: "A reply waits to go in your name",
    what: "The receptionist wrote a reply that waits before it goes: the hold you set for replies, or one it was not sure of. It says when it goes; stop it in the Inbox before then. Closed once it goes or is stopped.",
    onBell: "replies about to go",
    email: null,
    phone: true,
    kinds: ["reply_held"],
  },
  {
    key: "playbook",
    group: "needs_you",
    title: "A campaign or reach-out waits for your yes",
    what: "A run waits for your approval, or goes unless you stop it, with how many people it reaches; a reach-out holds an email for your call; or a campaign could not run today, and tomorrow's run tries again.",
    email: "choice",
    phone: true,
    kinds: ["playbook"],
  },
  {
    key: "leads_question",
    group: "needs_you",
    title: "A lead search asks you something",
    what: `A lead search stopped to ask you something. ${LEAD_QUESTION_WAIT_LINE}`,
    email: "choice",
    phone: true,
    kinds: ["leads_question"],
  },
  {
    key: "call",
    group: "worth_knowing",
    title: "After every phone call",
    what: "Who called, how long, what they wanted and what to do next. The email carries the transcript.",
    email: "choice",
    phone: true,
    kinds: ["call"],
  },
  {
    key: "reach_out_replied",
    group: "worth_knowing",
    title: "A business wrote back to a reach-out",
    what: "What the reply was read as, what was done, and the receptionist's draft when it wrote one.",
    email: "choice",
    phone: true,
    kinds: ["reach_out_replied"],
  },
  {
    key: "opted_out",
    group: "worth_knowing",
    title: "A customer asked to stop",
    what: "Someone texted STOP, unsubscribed from your emails, reported one as spam, or their carrier told us they stopped. Nothing more is sent to them, and nothing waits on you.",
    email: "choice",
    phone: false,
    kinds: ["opted_out"],
  },
  {
    key: "job_failed",
    group: "worth_knowing",
    title: "Something did not finish",
    what: "A reply may not have been sent, or a search, a broadcast or another background job stopped partway. It says what stopped and whether it carries on.",
    email: "choice",
    phone: true,
    kinds: ["job_failed"],
  },
  {
    key: "broadcasts",
    group: "worth_knowing",
    title: "A broadcast finished, or stopped",
    what: "When a broadcast has gone to everyone it could reach, with how many got it and how many were held back; and when one stops partway or never goes out.",
    email: "choice",
    phone: true,
    kinds: ["broadcast_sent", "broadcast_stopped"],
  },
  {
    key: "number",
    group: "worth_knowing",
    title: "Your WhatsApp number needs attention",
    what: "WhatsApp flagged it, lowered how many new conversations it can start, restricted the account or rejected its review, or the business removed Chanlytics from it.",
    email: "choice",
    phone: true,
    kinds: ["number"],
  },
  {
    key: "templates",
    group: "worth_knowing",
    title: "A WhatsApp template was approved or blocked",
    what: "WhatsApp approved a template, or rejected, paused or disabled it, or moved it to marketing, where a send needs the customer's recorded yes.",
    email: "choice",
    phone: false,
    kinds: ["template_ready", "template_blocked"],
  },
  {
    key: "sweep",
    group: "worth_knowing",
    title: "Sending is paused",
    what: "Offers and news by email, or a mailbox your reach-outs write from, are held after bounces or complaints, or when its provider signs it out, and you are told. Reminders, confirmations and everything on WhatsApp go on.",
    email: "choice",
    phone: false,
    kinds: ["sweep"],
  },
  {
    key: "billing",
    group: "worth_knowing",
    title: "Your plan",
    what: "A card declined, a trial ending, your receptionist paused, or the subscription ended and its number is going back. A declined card, a paused receptionist and the number going back are emailed.",
    email: "choice",
    phone: true,
    kinds: ["billing"],
  },
  {
    key: "leads_ready",
    group: "for_you",
    title: "A search found leads",
    what: "A lead search finished, with how many it found.",
    onBell: "finished searches",
    email: null,
    phone: true,
    kinds: ["leads_ready"],
  },
  {
    key: "review",
    group: "for_you",
    title: "A new Google review",
    what: "Someone reviewed the business on its Google profile.",
    onBell: "new Google reviews",
    email: null,
    phone: true,
    kinds: ["review"],
  },
  {
    key: "note_for_you",
    group: "for_you",
    title: "A note left for you",
    what: "A teammate left you a note on a person. Only you are told.",
    onBell: "notes left for you",
    email: null,
    phone: true,
    kinds: ["note_for_you"],
  },
];

/**
 * The kinds that are a line on the bell and nothing more, said once under the grid rather than given a row each: there is
 * nothing to choose about them. `alert` is here for a workspace: its own rows of it are a line's trouble (a texting
 * registration refused, a line that could not be set up), and the platform's alerts of it reach no workspace at all.
 */
export const BELL_LINE_KINDS = [
  "calendar_people",
  "booking_notice",
  "reach_out_day",
  "alert",
  "booking",
  "member_joined",
  "member_left",
  "note_to_keep",
] as const satisfies readonly ServerNotificationKind[];

/** The kinds the business may turn off by email: every kind of a topic whose email is a choice. */
const EMAIL_CHOICE_KINDS: readonly EmailChoiceKind[] = ALERT_TOPICS.flatMap((t) =>
  t.email === "choice" ? (t.kinds as readonly EmailChoiceKind[]) : [],
);

/**
 * The kinds the business turned off by email, from its config's section: the choice kinds only, each once. Read
 * leniently: a kind this build does not know, or one that is always emailed, is left out rather than refused, so a newer
 * dashboard's write never breaks an older edge's read.
 */
function emailOffOf(notifications: { email_off?: readonly unknown[] | null } | null | undefined): EmailChoiceKind[] {
  const off = notifications?.email_off;
  if (!Array.isArray(off)) return [];
  return EMAIL_CHOICE_KINDS.filter((k) => off.includes(k));
}

/**
 * Whether a notice of this kind is emailed to this business: it is a kind that is emailed, and the business has not
 * turned it off. The edge asks it before every mail (notify, notifyOnce, and mail where the caller names its kind).
 */
export function emailsFor(
  notifications: { email_off?: readonly unknown[] | null } | null | undefined,
  kind: string | null | undefined,
): boolean {
  if (!emailsNotificationKind(kind)) return false;
  return !(emailOffOf(notifications) as readonly string[]).includes(kind ?? "");
}

/** Whether a topic's email is on for this business: always, or a choice it has not turned off. */
function topicEmailed(
  topic: AlertTopic,
  notifications: { email_off?: readonly unknown[] | null } | null | undefined,
): boolean {
  if (topic.email === null) return false;
  const off = emailOffOf(notifications) as readonly string[];
  return topic.email === "always" || !topic.kinds.some((k) => off.includes(k));
}

/** Whether a topic reaches this member's phones: a topic phones are told, none of whose kinds the member turned off. */
function topicPushed(topic: AlertTopic, pushOff: readonly string[]): boolean {
  return topic.phone && !topic.kinds.some((k) => pushOff.includes(k));
}

/** The email_off a business holds once a topic's email is turned on or off: the rest of it as it was. */
export function withTopicEmail(
  notifications: { email_off?: readonly unknown[] | null } | null | undefined,
  topic: AlertTopic,
  on: boolean,
): EmailChoiceKind[] {
  const off = new Set<string>(emailOffOf(notifications));
  if (topic.email === "choice") switchKinds(off, topic.kinds, on);
  return EMAIL_CHOICE_KINDS.filter((k) => off.has(k));
}

/** A topic's kinds taken out of a list of what is turned off (`on`), or put in it. */
function switchKinds(off: Set<string>, kinds: readonly string[], on: boolean): void {
  for (const k of kinds) {
    if (on) off.delete(k);
    else off.add(k);
  }
}

/** The push_off a member holds once a topic's phone is turned on or off: the rest of it as it was. */
export function withTopicPush(pushOff: readonly string[], topic: AlertTopic, on: boolean): PushKind[] {
  const off = new Set(pushOff);
  if (topic.phone) switchKinds(off, topic.kinds, on);
  return ALERT_TOPICS.flatMap((t) => (t.phone ? (t.kinds as readonly PushKind[]) : [])).filter((k) => off.has(k));
}

/**
 * The sentences the page says around its rows. Every one is here, so a test reads the page's words where they are
 * decided.
 */
export const ALERT_PANE_WORDS = {
  where: "Where alerts reach you",
  whereSub: "The bell keeps everything. Choose what else reaches you below.",
  bell: "Bell",
  bellValue: `Everything below, for ${BELL_WINDOW_DAYS} days; the newest ${BELL_LIST_ROWS} are listed`,
  bellOn: "Always on",
  email: "Email",
  emailNobody: "Nobody yet",
  emailNobodyHint: "Until one is added, nobody is emailed when a customer needs a person.",
  emailMore: (n: number) => (n === 1 ? "and 1 more" : `and ${n} more`),
  change: "Change",
  done: "Done",
  you: "you",
  notOnTeam: "Not on the team",
  onTeam: "On the team",
  addPlaceholder: "name@yourbusiness.com",
  addLabel: "Add an address to email",
  teammates: "Teammates not emailed:",
  emailFoot: `Each address gets what is ticked under Email. Up to ${ALERT_ADDRESSES_MAX}.`,
  test: "Send a test",
  testing: "Sending…",
  testSent: (n: number) => (n === 1 ? "A test was sent to 1 address." : `A test was sent to ${n} addresses.`),
  testNot: (why: "no_address" | "not_live" | "not_sent" | null) =>
    why === "no_address"
      ? "There is no address to send a test to."
      : why === "not_live"
        ? "Tests are sent from the live app only, not from a preview."
        : "The test could not be sent. Try again in a minute.",
  phone: (n: number) => (n > 1 ? "Your phones" : "Your phone"),
  phoneHint: "Signing out on a phone stops its alerts.",
  browser: "This browser",
  browserValue: "When someone needs you right now",
  browserHint: "While Chanlytics is open in a tab.",
  browserBlocked:
    "Your browser is blocking alerts from Chanlytics. Allow them in its settings for this site, then switch this on.",
  what: "What you're told about",
  whatSub: "Tick where else each one reaches you. Email is the business's; your phone is yours.",
  emailHead: "Email",
  emailHeadSub: "for the business",
  phoneHead: "Phone",
  phoneHeadSub: "yours",
  always: "Always emailed: the receptionist must always reach someone.",
  ownerChooses: "The owner chooses what the business is emailed.",
  addFirst: "Add an address to email first.",
  phoneTold: "Your phone is told this.",
  notEmailed: "Not sent by email.",
  notPushed: "Not sent to phones.",
  /** The bell's own line: what it holds that nothing else carries, and the topics that have nothing to choose here. */
  bellLine: (also: readonly string[]) => {
    const all = [
      ...also,
      "people added from your calendar",
      "a booking that arrives",
      "a booking email that needs a look",
      "the day's reach-out numbers at 6 PM",
      "a problem with a line",
      "a teammate who joins or leaves",
      "invitations not yet accepted",
    ];
    return `Also on the bell: ${all.slice(0, -1).join(", ")}, and ${all[all.length - 1]}.`;
  },
  never: "Never sent: text messages, or a daily or weekly email. Today is your brief.",
  /** The address the alerts come from, said only where an operator set one (nothing in the app writes it). */
  sentFrom: (from: string) => `Sent from ${from}.`,
} as const;

/**
 * The test Settings › Notifications sends (decision 0040): to every address the business's alerts go to, once, so an
 * owner knows each one arrives. It names the business and where the choice is made, and asks nothing.
 */
export function alertTestMail(o: { business: string; link: string }): { subject: string; body: string } {
  return {
    subject: `Test alert for ${o.business}`,
    body:
      `This is a test from Settings › Notifications. If you can read it, alerts for ${o.business} reach this address: ` +
      `a customer who needs a person, and whatever is ticked under Email.\n\nNothing needs doing.\n\n${o.link}`,
  };
}

/**
 * The last line of an alert mail: the page the notice names, as a link. The words are one place's, as the rest of the
 * mail's are; the link is the edge's (appLink around noticeRoute), the same place the bell and the phone open.
 */
export function openItLine(link: string): string {
  return `Open it: ${link}`;
}

/** Why the business's email ticks cannot be pressed just now, if they cannot: the role, a config that cannot be read, no address. */
export type EmailHeld = "role" | "broken" | "no_address" | null;

/** One cell of the grid: always emailed, not sent this way, a tick (on or off, pressable or held), or told with no choice. */
export type AlertCell =
  { kind: "always" } | { kind: "none" } | { kind: "tick"; on: boolean; held: EmailHeld } | { kind: "told" };

export interface AlertGridRow {
  topic: AlertTopic;
  email: AlertCell;
  /** Null where the member has no phone: the column is not drawn. */
  phone: AlertCell | null;
}

export interface AlertGridGroup {
  group: AlertGroup;
  title: string;
  rows: AlertGridRow[];
}

/**
 * The grid as the page draws it: each topic in its group, its email cell by the business's choice and who may change
 * it, its phone cell by the member's own (`phone` null where they have no phone; `choosable` false where the choice
 * cannot be saved yet, so a phone cell says what it is told and offers nothing).
 */
export function alertGrid(o: {
  notifications: { email_off?: readonly unknown[] | null } | null | undefined;
  emailHeld: EmailHeld;
  phone: { pushOff: readonly string[]; choosable: boolean } | null;
}): AlertGridGroup[] {
  const groups: AlertGroup[] = ["needs_you", "worth_knowing", "for_you"];
  return groups
    .map((group): AlertGridGroup => ({
      group,
      title: ALERT_GROUP_TITLES[group],
      rows: ALERT_TOPICS.filter((t) => t.group === group && !bellOnly(t, !!o.phone)).map((topic): AlertGridRow => ({
        topic,
        email:
          topic.email === "always"
            ? { kind: "always" }
            : topic.email === null
              ? { kind: "none" }
              : { kind: "tick", on: topicEmailed(topic, o.notifications), held: o.emailHeld },
        phone: !o.phone
          ? null
          : !topic.phone
            ? { kind: "none" }
            : o.phone.choosable
              ? { kind: "tick", on: topicPushed(topic, o.phone.pushOff), held: null }
              : { kind: "told" },
      })),
    }))
    .filter((g) => g.rows.length > 0);
}

/** A topic with nothing to choose for this member: never emailed, and no phone of theirs to tell. The bell's line says it. */
const bellOnly = (t: AlertTopic, hasPhone: boolean) => t.email === null && !hasPhone;

/** What the bell's line names for this member, besides its own: the topics with nothing to choose (`onBell`). */
export function bellLineFor(hasPhone: boolean): string {
  return ALERT_PANE_WORDS.bellLine(ALERT_TOPICS.filter((t) => bellOnly(t, hasPhone)).map((t) => t.onBell ?? t.title));
}

/** A phone as the page names it: what it is, and when it was last seen, never its token. */
export function phoneLine(p: { platform: string; last_seen_at: string | null }, now: number): string {
  const what = p.platform === "ios" ? "iPhone" : "Android phone";
  const at = p.last_seen_at ? Date.parse(p.last_seen_at) : NaN;
  if (Number.isNaN(at)) return what;
  const ago = agoShort(at, now);
  return `${what} · ${ago === "now" ? "seen just now" : `seen ${ago} ago`}`;
}
