/**
 * What Settings › Notifications says the workspace is told, and when: the kinds of email the edge really sends, and
 * the lines it writes to the bell alone (the day's reach-out numbers), grouped, each with the words of when it is sent. No switch is offered that no code reads (settings.jsx's own rule),
 * so these are rows, not choices. "To Chanlytics" marks the platform's alerts, which no workspace's addresses receive.
 *
 * WHAT IS EMAILED IS DECLARED ONCE, HERE. `NOTIFICATION_DELIVERY` says, for every kind the edge keeps a row for
 * (SERVER_NOTIFICATION_KINDS), whether it is also emailed. The edge's notify() asks it (`emailsNotificationKind`) before
 * it mails, and the pane's rows are typed by it: a row that is emailed names only emailed kinds, a row that is a line in
 * the bell names only the bell's. A kind added to the table does not compile until it is classified here, and a test
 * holds the pane's rows to the kinds that are emailed, both ways, so the pane cannot say less than the edge does, or
 * more.
 */
import { LEAD_QUESTION_WAIT_LINE } from "../leads/lead-plan";
import { SERVER_NOTIFICATION_KINDS, type ServerNotificationKind } from "./notifications";

/**
 * How each kept kind reaches the owner, beyond the row on the bell: by email as well, or on the bell alone.
 *
 * "email" is a kind notify() is handed and mails: to the workspace's addresses, or, for the platform's own (`alert`), to
 * Chanlytics. "bell" is a row the edge or a database function writes and no mail follows (the calendar's new people, a
 * review, a finished search, a note left for you, the day's reach-out numbers). Two kinds are written both ways and are
 * "email" because notify() is handed them: `billing` is mailed when a number is about to go back, and a Stripe event
 * (a card declined, a trial ending) is written to the bell alone by its own path; `leads_question`'s mail is sent by the
 * lead runner beside the row its trigger keeps.
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
} as const satisfies Record<ServerNotificationKind, "email" | "bell">;

/** A kept kind that is emailed. */
export type EmailedNotificationKind = {
  [K in ServerNotificationKind]: (typeof NOTIFICATION_DELIVERY)[K] extends "email" ? K : never;
}[ServerNotificationKind];
/** A kept kind that is a line in the bell and no more. */
export type BellNotificationKind = Exclude<ServerNotificationKind, EmailedNotificationKind>;

/** Every kind the edge emails: the closed list the pane's rows and notify() both read. */
export const EMAILED_NOTIFICATION_KINDS: readonly EmailedNotificationKind[] = SERVER_NOTIFICATION_KINDS.filter(
  (k): k is EmailedNotificationKind => NOTIFICATION_DELIVERY[k] === "email",
);

/**
 * Whether a notice of this kind is emailed. A kind the table does not know is kept as a plain alert (notify.ts), and
 * so is emailed as one; no kind said is a plain alert.
 */
export function emailsNotificationKind(kind: string | null | undefined): boolean {
  const known = (SERVER_NOTIFICATION_KINDS as readonly string[]).includes(kind ?? "");
  return NOTIFICATION_DELIVERY[known ? (kind as ServerNotificationKind) : "alert"] === "email";
}

interface NotificationKindRowBase {
  title: string;
  /** When it is sent, in a sentence: the row's tip. */
  what: string;
}

/** A row that is emailed: it speaks for emailed kinds only. */
interface NotificationEmailRow extends NotificationKindRowBase {
  kinds: readonly EmailedNotificationKind[];
  /** Sent to Chanlytics, not to the workspace's addresses. */
  platform?: true;
  bell?: undefined;
}

/** A row that is a line in the bell and no email: it speaks for the bell's kinds only. */
interface NotificationBellRow extends NotificationKindRowBase {
  kinds: readonly BellNotificationKind[];
  bell: true;
  platform?: undefined;
}

export type NotificationKindRow = NotificationEmailRow | NotificationBellRow;

export interface NotificationKindGroup {
  title: string;
  rows: NotificationKindRow[];
}

export const NOTIFICATION_KIND_GROUPS: readonly NotificationKindGroup[] = [
  {
    title: "Customers",
    rows: [
      {
        title: "A customer needs a person",
        what: "It stopped on a thread and someone is waiting. The alert carries their message.",
        kinds: ["handoff"],
      },
      { title: "Still waiting", what: "A handoff has gone unanswered for a while.", kinds: ["deadman"] },
      { title: "After every phone call", what: "Who called, how long, how it went.", kinds: ["call"] },
    ],
  },
  {
    // What stopped, finished or was paused in the sending: a reply, a broadcast, a playbook, the offers by email, a job.
    title: "Sending",
    rows: [
      {
        title: "Something did not finish",
        what: "A reply may not have been sent, or a search, a broadcast or another background job stopped partway. It says what stopped and whether it carries on in a fresh run.",
        kinds: ["job_failed"],
      },
      {
        title: "A broadcast finished, or stopped",
        what: "When a broadcast has gone to everyone it could reach, with how many got it and how many were held back; and when one stops partway or never goes out.",
        kinds: ["broadcast_sent", "broadcast_stopped"],
      },
      {
        title: "A playbook could not run",
        what: "It could not run for the day, or could not read your calendar, so nobody was sent it. Tomorrow's run tries again.",
        kinds: ["playbook"],
      },
      {
        title: "Offers and news by email are paused",
        what: "Complaints or bounces went over the line, so they wait until it is fixed. Messages about a visit, replies by email and everything on WhatsApp go on.",
        kinds: ["sweep"],
      },
    ],
  },
  {
    title: "Numbers and templates",
    rows: [
      {
        title: "Your WhatsApp number needs attention",
        what: "WhatsApp flagged it, lowered how many new conversations it can start, restricted the account or rejected its review, or the business removed Chanlytics from it. Good news about the number is not emailed.",
        kinds: ["number"],
      },
      {
        title: "A WhatsApp template was approved or blocked",
        what: "WhatsApp approved a template, or rejected, paused or disabled it, or moved it to marketing, where a send needs the customer's recorded yes.",
        kinds: ["template_ready", "template_blocked"],
      },
      {
        title: "Your phone number is going back",
        what: "Your subscription ended: a warning with the day your receptionist's number goes back to the phone company, and a note once it has. A card declined or a trial ending is on the bell, not emailed.",
        kinds: ["billing"],
      },
    ],
  },
  {
    title: "Lead searches",
    rows: [
      {
        title: "A search is waiting for your answer",
        what: `A lead search stopped to ask you something. ${LEAD_QUESTION_WAIT_LINE}`,
        kinds: ["leads_question"],
      },
    ],
  },
  {
    // Reach out, Part 5 (N2): what a reach-out tells its owner, each the moment it happens; and Part 6 (H12), the
    // day's numbers at 6 PM, the one row that is a line in the bell rather than an email.
    title: "Reach-outs",
    rows: [
      {
        title: "They wrote back",
        what: "A business answered a reach-out: what the reply was read as, what was done, and the receptionist's draft when it wrote one.",
        kinds: ["reach_out_replied"],
      },
      {
        title: "A reach-out waits for you",
        what: "A run is planned and waits for your yes before anything sends.",
        kinds: ["playbook"],
      },
      {
        title: "A reach-out holds an email for you",
        what: "The check held an email of a run it could not pass, and it waits for your call.",
        kinds: ["playbook"],
      },
      {
        title: "A sending domain is held, and when it sends again",
        what: "A domain stopped sending (bounces, a complaint, its records), which stops its runs; and when it sends again.",
        kinds: ["sweep"],
      },
      {
        // Part 6 (H12): a line in the bell, never an email.
        title: "The day's numbers",
        what: "At 6 PM your time, a line in the bell, not an email: what your reach-outs wrote that day, who wrote back, and what waits for you.",
        kinds: ["reach_out_day"],
        bell: true,
      },
    ],
  },
  {
    // A switched-off number has no workspace to address, and a stalled sweep belongs to nobody's workspace. Listing
    // them beside "goes to each of these addresses" without saying so promised an email the owner never receives.
    title: "To Chanlytics",
    rows: [
      {
        title: "Messages arriving for a switched-off number",
        what: "Someone is texting a channel this workspace switched off. Goes to Chanlytics, not to the addresses above: a switched-off number has no workspace to alert.",
        kinds: ["alert"],
        platform: true,
      },
      {
        title: "Background checks",
        what: "When the watchdog over unanswered threads stops, and when it recovers. Goes to Chanlytics, not to the addresses above.",
        kinds: ["alert"],
        platform: true,
      },
    ],
  },
];

/**
 * The sentences the pane says around its rows. The recipients' card names who an alert goes to, and which are not theirs;
 * the kinds' card says that what is not listed is not emailed; the sender line says the address the mail comes from.
 */
export const NOTIFICATION_PANE_WORDS = {
  recipients:
    "Each alert below is emailed to every one of these, except the two marked for Chanlytics and the day's numbers, a line in the bell.",
  kinds:
    "By email, the moment it happens; the day's reach-out numbers are a line in the bell. What is not listed here is not emailed.",
  /** The address the alerts come from, said before the config's own `from` where an operator set one (nothing in the app writes it). */
  sentFrom: "Sent from",
  /** And where none is set, which is every workspace the app made: the platform's own. Nothing swaps it for a verified sending domain of the workspace's. */
  sentFromPlatform: "Sent from the Chanlytics alert address.",
} as const;
