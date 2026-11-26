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
import { LEAD_QUESTION_WAIT_LINE } from "../leads/plan";
import { agoShort } from "../shared/time";
// The kinds as a type alone: the list is NOTIFICATION_DELIVERY's own keys, so the page's entry (alert-pane.ts) loads
// nothing of the bell's feed.
import type { ServerNotificationKind } from "./notifications/feed-input";
import type { PushKind } from "./push";
import { ALERT_PANE_WORDS } from "./alert-pane-words";
import { isOneOf, keysOf, entryOf } from "../shared/unknown";

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
  // A time asked for that ran out, and AI told the customer (decision 0061): news, a line on the bell and no more.
  booking_lapsed: "bell",
  // A note from an owner's correction, to keep or dismiss on the Autonomy pane (00448): a line on the bell, no more.
  note_to_keep: "bell",
  // A reply counting down to go in the owner's name (decision 0064): the bell and the phone, never a mail for a wait of minutes.
  reply_held: "bell",
  // Ask's morning cards on Today (00470): a line on the member's own bell, no more.
  ask_cards: "bell",
  // Photos an import found, waiting for a person's word in Files (00551): a line on the bell, no more.
  files_waiting: "bell",
  // A video asked for can be played (00613): a line on the bell, no more.
  video_ready: "bell",
  // A post set for its time went up, or did not (00616): a line on the bell, no more; Content says the rest.
  post_up: "bell",
  post_stopped: "bell",
  // A piece taken down everywhere it was up, or one a place leaves to its owner to delete (00682): lines on the bell.
  post_down: "bell",
  post_by_hand: "bell",
  // A week of posts ready (00706; the content loop PRD's 12.5, call 24): with every rung at "AI asks first" a week nobody
  // opens never posts, so it is mailed once, as the business chooses, and the phone told. What to film is the bell and
  // the phone, once a week at most, never a mail.
  plan_ready: "email",
  footage_ask: "bell",
  // A lead tried the preview they were sent (00632): a line on the bell as it happens, written by the database.
  preview_tried: "bell",
  // An ad account that needs its owner (00653): the platform signed Chanlytics out, or cannot charge for it. A line on
  // the bell, written by the database as it learns it; Campaigns › Ads says the rest.
  ad_account: "bell",
  // A watched Google Drive folder (00657): one that needs someone, and the day's new photos and videos counted up in
  // place. Lines on the bell, written by the database as the folder's state turns; the folder's row says the rest.
  footage: "bell",
  footage_in: "bell",
  // An owner's ads (00658, decision 0050 call 15): Meta didn't approve one or couldn't charge for one, one ended or spent
  // its total, or no one wrote from one in a week. Lines on the owner's bell, written by the database as each read turns
  // them; Campaigns › Ads says the rest. The two that stop an ad are also mailed, once a cause (Ruben, 20 Nov 2026): the
  // ring marks the row's mail owed (00664) and the account's read sends it (the edge's ads/mail.ts), as the business
  // chooses. The other three stay on the bell.
  ad_refused: "email",
  ad_unpaid: "email",
  ad_ended: "bell",
  ad_spent: "bell",
  ad_quiet: "bell",
  // A draft ad someone left for the owner (00659): a line on the owner's bell, written by the database as it is kept, and
  // closed when the owner keeps it.
  ad_draft: "bell",
  // A launch here that couldn't finish, or a switch Meta never answered (00676): lines on the owner's bell; nothing was
  // spent by the first, and the second's drawer has Check.
  ad_unfinished: "bell",
  ad_unconfirmed: "bell",
  // An ad on that AI can't answer, and ads Chanlytics paused for the workspace (00676): both about money, so mailed once,
  // as the business chooses, under the `ads` topic.
  ad_way_in: "email",
  ads_paused: "email",
  // Someone used a form on the business's website (00488): mailed as the business chooses, and the phone told.
  website_form: "email",
  // A request came through a form the business shares (00680): mailed as the business chooses, and the phone told.
  form_request: "email",
} as const satisfies Record<ServerNotificationKind, "email" | "bell">;

/** A kept kind that is emailed. */
export type EmailedNotificationKind = {
  [K in ServerNotificationKind]: (typeof NOTIFICATION_DELIVERY)[K] extends "email" ? K : never;
}[ServerNotificationKind];
/** A kept kind that is a line in the bell and no more. */
export type BellNotificationKind = Exclude<ServerNotificationKind, EmailedNotificationKind>;

/** Every kind the edge emails. */
export const EMAILED_NOTIFICATION_KINDS: readonly EmailedNotificationKind[] = keysOf(NOTIFICATION_DELIVERY).filter(
  (k): k is EmailedNotificationKind => NOTIFICATION_DELIVERY[k] === "email",
);

/**
 * Whether a notice of this kind is a kind that is emailed. A kind the table does not know is kept as a plain alert
 * (notify.ts), and so is emailed as one; no kind said is a plain alert.
 */
export function emailsNotificationKind(kind: string | null | undefined): boolean {
  return (entryOf(NOTIFICATION_DELIVERY, kind) ?? NOTIFICATION_DELIVERY.alert) === "email";
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
  /**
   * Drawn only where Campaigns › Ads is (the Ads plan's D7: the edge's list of workspaces, or an ad account held): a
   * workspace that cannot run ads is never offered a choice about them. The kinds are no less the topic's elsewhere.
   */
  ads?: true;
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
    what: "AI stopped on a conversation and someone is waiting. The alert carries their message.",
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
    what: "AI wrote a reply that waits before it goes. It says when, and you can stop it in the Inbox until then.",
    onBell: "replies about to go",
    email: null,
    phone: true,
    kinds: ["reply_held"],
  },
  {
    key: "playbook",
    group: "needs_you",
    title: "A campaign waits for your approval",
    what: "A send waits for your approval, cold email holds an email for you, or a campaign couldn't run today.",
    email: "choice",
    phone: true,
    kinds: ["playbook"],
  },
  {
    key: "plan_ready",
    group: "needs_you",
    title: "This week's posts are ready",
    what: "AI planned the week's posts. Nothing goes up until you approve them.",
    email: "choice",
    phone: true,
    kinds: ["plan_ready"],
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
  // An ad that can't run until the owner fixes something in Meta (decision 0050 call 15; Ruben, 20 Nov 2026): mailed
  // once a cause, and never again while its bell row is open. The phone waits for the topic to open beyond D7's list.
  {
    key: "ads",
    group: "needs_you",
    title: "An ad needs you",
    what: "An ad Meta refused or couldn't charge for, one AI can't answer, or ads Chanlytics paused. It says what to do.",
    email: "choice",
    phone: false,
    kinds: ["ad_refused", "ad_unpaid", "ad_way_in", "ads_paused"],
    ads: true,
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
    title: "A business wrote back to your cold email",
    what: "What the reply was read as, what was done, and AI's draft when it wrote one.",
    email: "choice",
    phone: true,
    kinds: ["reach_out_replied"],
  },
  {
    key: "website_form",
    group: "worth_knowing",
    title: "Someone used one of your forms",
    what: "A request from a form you share waits in Inbox. One from your website is added to People, with what they asked.",
    email: "choice",
    phone: true,
    kinds: ["website_form", "form_request"],
  },
  {
    key: "opted_out",
    group: "worth_knowing",
    title: "A customer asked to stop",
    what: "They texted STOP, unsubscribed, or reported an email as spam. Nothing more is sent to them.",
    email: "choice",
    phone: false,
    kinds: ["opted_out"],
  },
  {
    key: "job_failed",
    group: "worth_knowing",
    title: "Something didn't finish",
    what: "A reply may not have gone, or a search or a send stopped partway. It says whether it carries on.",
    email: "choice",
    phone: true,
    kinds: ["job_failed"],
  },
  {
    key: "broadcasts",
    group: "worth_knowing",
    title: "A campaign finished, or stopped",
    what: "A send reached everyone it could, with how many got it, or it stopped partway or never went.",
    email: "choice",
    phone: true,
    kinds: ["broadcast_sent", "broadcast_stopped"],
  },
  {
    key: "number",
    group: "worth_knowing",
    title: "Your WhatsApp number needs attention",
    what: "WhatsApp flagged it, lowered its limit, restricted it or rejected its review, or your business removed Chanlytics.",
    email: "choice",
    phone: true,
    kinds: ["number"],
  },
  {
    key: "templates",
    group: "worth_knowing",
    title: "A WhatsApp message was approved",
    what: "WhatsApp approved a saved message, or treats it as an offer.",
    email: "choice",
    phone: false,
    kinds: ["template_ready"],
  },
  // What sends it waits until the owner acts, so a phone hears it too (the WhatsApp notices plan, step 4, 16 Nov 2026). A
  // business's email choice is kept by kind (email_off), so the two halves of the one row keep what it chose.
  {
    key: "template_changes",
    group: "worth_knowing",
    title: "A WhatsApp message needs a change",
    what: "WhatsApp asked for a change to a saved message, paused it, or turned it off.",
    email: "choice",
    phone: true,
    kinds: ["template_blocked"],
  },
  {
    key: "sweep",
    group: "worth_knowing",
    title: "Sending is paused",
    what: "Email offers, or a cold email mailbox, pause after bounces, complaints or a sign-out. Reminders and WhatsApp go on.",
    email: "choice",
    phone: false,
    kinds: ["sweep"],
  },
  {
    key: "billing",
    group: "worth_knowing",
    title: "Plan",
    what: "A card declined, a trial ending, AI paused, or the number going back. All but a trial ending are emailed.",
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
  {
    key: "footage_ask",
    group: "for_you",
    title: "Clips to film",
    what: "What AI asks you to film for the week's posts, once a week at most.",
    onBell: "clips to film",
    email: null,
    phone: true,
    kinds: ["footage_ask"],
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
  "booking_lapsed",
  "note_to_keep",
  "ask_cards",
  "files_waiting",
  "video_ready",
  "post_up",
  "post_stopped",
  "post_down",
  "post_by_hand",
  "preview_tried",
  // An ad account that needs its owner (00653): signed out by its platform, or a payment the platform cannot take.
  "ad_account",
  // A watched Google Drive folder (00657): one that needs someone, and the day's new photos and videos.
  "footage",
  "footage_in",
  // An owner's ads (00658): on the owner's bell alone until a topic offers their phone (decision 0050, call 15). The two
  // that stop an ad are the `ads` topic's, since they are mailed.
  "ad_ended",
  "ad_spent",
  "ad_quiet",
  // A draft ad left for the owner (00659).
  "ad_draft",
  // A launch here that couldn't finish, or a switch Meta never answered (00676).
  "ad_unfinished",
  "ad_unconfirmed",
] as const satisfies readonly ServerNotificationKind[];

/** The kinds the business may turn off by email: every kind of a topic whose email is a choice. */
const EMAIL_CHOICE_KINDS: readonly EmailChoiceKind[] = ALERT_TOPICS.flatMap((t) =>
  t.email === "choice" ? t.kinds : [],
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
  return !isOneOf(emailOffOf(notifications), kind ?? "");
}

/** Whether a topic's email is on for this business: always, or a choice it has not turned off. */
function topicEmailed(
  topic: AlertTopic,
  notifications: { email_off?: readonly unknown[] | null } | null | undefined,
): boolean {
  if (topic.email === null) return false;
  const off = emailOffOf(notifications);
  return topic.email === "always" || !topic.kinds.some((k) => isOneOf(off, k));
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
  return ALERT_TOPICS.flatMap((t) => (t.phone ? t.kinds : [])).filter((k) => off.has(k));
}

/**
 * The test Settings › Notifications sends (decision 0040): to every address the business's alerts go to, once, so an
 * owner knows each one arrives. It names the business and where the choice is made, and asks nothing.
 */
export function alertTestMail(options: { business: string; link: string }): { subject: string; body: string } {
  return {
    subject: `Test alert for ${options.business}`,
    body:
      `This is a test from Settings › Notifications. If you can read it, alerts for ${options.business} reach this address: ` +
      `a customer who needs a person, and whatever is ticked under Email.\n\nNothing needs doing.\n\n${options.link}`,
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
export function alertGrid(options: {
  notifications: { email_off?: readonly unknown[] | null } | null | undefined;
  emailHeld: EmailHeld;
  phone: { pushOff: readonly string[]; choosable: boolean } | null;
  /** Whether Campaigns › Ads is drawn in this workspace: the Ads topic is drawn only where it is. */
  ads: boolean;
}): AlertGridGroup[] {
  const groups: AlertGroup[] = ["needs_you", "worth_knowing", "for_you"];
  return groups
    .map((group): AlertGridGroup => ({
      group,
      title: ALERT_GROUP_TITLES[group],
      rows: ALERT_TOPICS.filter(
        (t) => t.group === group && !bellOnly(t, !!options.phone) && (options.ads || t.ads !== true),
      ).map((topic): AlertGridRow => ({
        topic,
        email:
          topic.email === "always"
            ? { kind: "always" }
            : topic.email === null
              ? { kind: "none" }
              : { kind: "tick", on: topicEmailed(topic, options.notifications), held: options.emailHeld },
        phone: !options.phone
          ? null
          : !topic.phone
            ? { kind: "none" }
            : options.phone.choosable
              ? { kind: "tick", on: topicPushed(topic, options.phone.pushOff), held: null }
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
export function phoneLine(params: { platform: string; last_seen_at: string | null }, now: number): string {
  const subject = params.platform === "ios" ? "iPhone" : "Android phone";
  const at = params.last_seen_at ? Date.parse(params.last_seen_at) : NaN;
  if (Number.isNaN(at)) return subject;
  const ago = agoShort(at, now);
  return `${subject} · ${ago === "now" ? "seen just now" : `seen ${ago} ago`}`;
}
