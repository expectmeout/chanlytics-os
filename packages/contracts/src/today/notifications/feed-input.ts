/** Notifications: feed input. */

import { agoShort as spanAgo } from "../../shared/time";
import type { LiveCallVM } from "../../voice/live";

/**
 * The bell: what needs the owner, from what the browser already holds.
 *
 * The seeded bell promised five things to read that never happened, and a real session showed nothing. The feed here is
 * built from the rows the surfaces have already fetched — the Inbox threads, the Live calls, the open invitations — so it
 * costs no request and is exactly as fresh as the pages around it. Read state is per device (the bridge keeps it in
 * localStorage): honest, and enough until a person has more than one phone.
 *
 * Pure: the bridge feeds it the globals, the tests feed it fixtures.
 */

export type NotificationKind = "needs_you" | "held_draft" | "missed_call" | "invite" | ServerNotificationKind;

export interface NotificationItem {
  /** Stable across refreshes: the row it stands for. */
  key: string;
  kind: NotificationKind;
  /** When it became true, epoch ms. */
  at: number;
  title: string;
  message: string;
  /** Hash route, without the leading "#/". */
  to: string;
  icon: string;
  tone: "" | "ok" | "warn";
  /** The button under it. */
  action: string;
  /** What a kept row is about, when the edge said: a conversation, a call, a broadcast. */
  about?: { type: string; id: string } | null;
}

/** The slice of the Inbox thread view-model the feed reads. */
export interface FeedThread {
  id: string;
  real?: boolean;
  needsYou?: boolean;
  who: string;
  preview?: string;
  /** The customer's own words beside the decision (InboxThreadVM.ask): what a needs-you row quotes. */
  ask?: { kind: "call" | "wrote" | "sent"; label: string; text: string; quoted: boolean } | null;
  waitingMin?: number;
  /** Absolute times, when the view-model carries them. */
  lastAtMs?: number;
  escalatedAtMs?: number;
  veto?: {
    window: number;
    endsAtMs: number;
    messageId: string;
    draft: string;
    why?: { heldFor?: string | null; summary?: string };
  };
}

/**
 * The slice of the Live call view-model the feed reads: who dialled (a customer's dial that never connected is missed,
 * one we placed is not: callAttemptWords), and the heartbeat a count of calls in progress asks (liveStillUp).
 */
export type FeedCall = Pick<
  LiveCallVM,
  "callId" | "cvId" | "who" | "number" | "direction" | "missed" | "live" | "startedAtMs" | "heartbeatAtMs"
>;

/**
 * The slice of Live's value the bell reads (LiveVM): the calls on the line, the page's recent list, and every missed
 * call still news (missedCalls, uncapped: the recent list holds only the newest few, and a busy day's would push the
 * morning's missed call out of the bell).
 */
export interface FeedLive {
  now?: readonly FeedCall[] | null;
  recent?: readonly FeedCall[] | null;
  missedCalls?: readonly FeedCall[] | null;
}

/** Every call Live holds, each once, for the bell: the feed's rows and the names a kept row borrows are read off this. */
export function bellCalls(live: FeedLive | null | undefined): FeedCall[] {
  const seen = new Set<string>();
  const out: FeedCall[] = [];
  for (const c of [...(live?.now ?? []), ...(live?.missedCalls ?? []), ...(live?.recent ?? [])]) {
    if (seen.has(c.callId)) continue;
    seen.add(c.callId);
    out.push(c);
  }
  return out;
}

export interface FeedInvite {
  id: string;
  email: string;
  created_at: string;
  /** When it closes (the roster's `expires_at`): the bell says Expired once it has, as Team does. Absent where the roster did not say. */
  expires_at?: string | null;
}

export interface FeedInput {
  threads?: FeedThread[] | null;
  calls?: FeedCall[] | null;
  invites?: FeedInvite[] | null;
  now: number;
}

/** What one device remembers about the bell. */
export interface NotificationReadState {
  /** Closing the bell and Mark all read move this: the bell's number counts what came after it. It reads no note. */
  seenAt: number;
  read: string[];
  dismissed: string[];
  /** Device alerts while the app is in the background. */
  alerts: boolean;
}

export const EMPTY_READ_STATE: NotificationReadState = { seenAt: 0, read: [], dismissed: [], alerts: false };

export interface NotificationRow extends NotificationItem {
  unread: boolean;
}

/**
 * The feed as a device sees it: dismissed rows gone, unread decided. A row is unread until it is read where it stands
 * (`state.read`) or Mark all read has passed it (`readMs`, how far the member has read: decision 0124). A look at the
 * bell (`state.seenAt`) reads nothing: it moves the bell's number alone. `readMs` is asked of every caller, since the
 * look and the read were one moment until 00614 and a caller that passed neither would read by the wrong one.
 */
export function applyReadState(
  items: NotificationItem[],
  state: NotificationReadState,
  readMs: number,
): NotificationRow[] {
  const read = new Set(state.read);
  const gone = new Set(state.dismissed);
  return items.filter((i) => !gone.has(i.key)).map((i) => ({ ...i, unread: i.at > readMs && !read.has(i.key) }));
}

/**
 * How far a member has read their bell, epoch ms: the server's read-through moment (00614), or their seen moment from
 * a server that says none (before it, a look read everything); 0 where neither is known. THE reading: a kept row's dot
 * (serverNotificationRows), the bell's rows (bellFeed) and the bridge's Undo read it here.
 */
export function bellReadThroughMs(
  dto: Pick<NotificationsDto, "seen_at" | "read_through_at"> | null | undefined,
): number {
  return Date.parse(dto?.read_through_at ?? dto?.seen_at ?? "") || 0;
}

/**
 * The number on the bell's badge.
 *
 * Lives here because two surfaces say it: the badge itself, and Today's "While you were away" head. They were two
 * spellings of one fact and read 4 and 0 on the same screen.
 */
export function unreadCount(rows: readonly { unread: boolean }[]): number {
  return rows.filter((r) => r.unread).length;
}

/** The bell's time, "now", "5m", "2h", "3d": one family with every other surface (time.ts). */
export const agoLabel = (atMs: number, now: number): string => spanAgo(atMs, now);

/**
 * A search waiting on its question is one of them: it waits a day and then ends, and nothing else tells the owner
 * while the tab is not in view (the bridge alerts on kept rows of these kinds as on derived ones).
 */
export const ALERT_KINDS: readonly NotificationKind[] = ["needs_you", "held_draft", "missed_call", "leads_question"];

/* ------------------------------------------------- rows the workspace keeps */

/** What the edge writes when it raises an alert: the same kinds it emails. */
export const SERVER_NOTIFICATION_KINDS = [
  "handoff",
  "deadman",
  "call",
  "number",
  "sweep",
  "job_failed",
  "playbook",
  "calendar_people",
  "booking_notice",
  "alert",
  "review",
  "billing",
  "template_ready",
  "template_blocked",
  "broadcast_sent",
  "broadcast_stopped",
  "leads_ready",
  "leads_question",
  /** A note left for one member (0007, 00158): addressed to them alone. */
  "note_for_you",
  /** A business wrote back to a reach-out, and what it meant (Reach out Part 5, 00222): told once per reading. */
  "reach_out_replied",
  /** The day's reach-out numbers, at 6 PM in the business's zone (Reach out Part 6, H12): a line in the bell, no more. */
  "reach_out_day",
  /**
   * A customer asked to stop, by any door (decision 0048): a typed STOP, an unsubscribe, a complaint, a carrier's report.
   * News and no wait: a line on the bell, told once from the consent event (core SUBSCRIBERS.consent_notice); the mail
   * is the business's choice, never always, and no phone is told.
   */
  "opted_out",
  /**
   * A booking arrived, by a booking tool's email or the owner's calendar (S1-01): news and no wait, a line on the bell that
   * opens the visit on its day, told once from the record's appointment.changed event (core SUBSCRIBERS.visit_notice). No
   * mail, no phone: the owner chose the tool, and the Calendar is where they look.
   */
  "booking",
  /**
   * A teammate accepted an invitation and joined (S1-19): news, a line on the bell that opens Settings > Team, told once
   * from the seat's member.joined event (core SUBSCRIBERS.team_notice). No mail, no phone.
   */
  "member_joined",
  /**
   * A teammate left the workspace, by their own hand or with their account (the wiring's second audit, R11
   * W-channel-team-plus-5): news, a line on the bell that opens Settings > Team, told once from the member.left event
   * (core SUBSCRIBERS.team_notice, 00437). No mail, no phone.
   */
  "member_left",
  /**
   * The receptionist can keep what an owner said when they corrected it (decision 0063, 00448 fact_suggest): a line on the
   * bell that opens Settings › Autonomy, where the note waits for Keep or Dismiss. Its words stay on the pane. No mail, no
   * phone; the answer closes it.
   */
  "note_to_keep",
  /**
   * The receptionist's reply waits to go in the owner's name (decision 0064, step 2): the hold window they set, or a reply
   * it was not sure of. A line on the bell and the phone, told once per reply as it is queued (the edge's draft queue),
   * that opens the thread; closed when the reply goes or is stopped (00462 messages_reply_held_closes). No mail: it waits
   * minutes, not hours.
   */
  "reply_held",
  // Ask's morning left cards on Today (decision 0070): the member's own line, once a morning; no mail, no phone.
  "ask_cards",
  // Someone used a form on the business's website (00488): the row opens their page; mailed as chosen, the phone told.
  "website_form",
  // Photos an import found wait in Files' Inbox for a person's word (00551): the row opens that page.
  "files_waiting",
  // A video the owner asked Ask for can be played (00613): the row opens Files, where it is under Made by Ask.
  "video_ready",
] as const;

export type ServerNotificationKind = (typeof SERVER_NOTIFICATION_KINDS)[number];

/**
 * What a BACKGROUND JOB's alert can be. Four things, and a job says which;
 * none of them is read back off the subject.
 *
 * Every alert a job raised used to be kept as `job_failed`, because the one
 * place that addressed it hard-coded that kind for all six of its callers. A
 * broadcast that ran to completion ("Broadcast “Spring offer” sent, 38 people
 * got it") was therefore counted into Today's "6 jobs did not finish", in
 * warn amber, above everything else on the page, with a button to the Inbox.
 * Same defect as 00134's, where a template's approval arrived as the phone
 * number's bad news.
 */
export type JobNewsKind = Extract<
  ServerNotificationKind,
  | "job_failed"
  | "broadcast_sent"
  | "broadcast_stopped"
  | "handoff"
  | "opted_out"
  | "booking"
  | "member_joined"
  | "member_left"
>;

/**
 * One alert from a job: what it IS, where its button goes, and the words.
 * The verb that raises it decides `kind` and `route`; the sender never
 * re-derives either (the rule waba-events.ts already follows). How it then
 * reads is SERVER_LOOK's, and how it groups is today/away.ts AWAY_NOUN's.
 */
export interface JobNews {
  kind: JobNewsKind;
  /** A hash route without the leading "#/". */
  route: string;
  subject: string;
  body: string;
  /** What it is about, when it is one thing. */
  about?: { type: string; id: string } | null;
  /** The platform's copy, for a workspace nobody can be told in: the fact, never the words. The runtime's own when absent. */
  redactedBody?: string;
  /** The event this notice answers (decision 0043): the bell keeps it, and a second delivery of it tells nobody. */
  sourceEvent?: string;
}

export interface NotificationDto {
  id: string;
  kind: string;
  title: string;
  body: string;
  /** A hash route without the leading "#/", or null. */
  route: string | null;
  subject_type: string | null;
  subject_id: string | null;
  created_at: string;
  /** This person's marks. */
  read: boolean;
  dismissed: boolean;
  /** When what the row asked for ended for good, for everyone (00421); absent from a server before it. */
  closed_at?: string | null;
}

/** What `GET /api/v1/notifications` returns: the month's rows and this person's "seen everything" moment. */
export interface NotificationsDto {
  notifications: NotificationDto[];
  seen_at: string | null;
  /**
   * How far this person has read: Mark all read moves it, a look at the bell does not (00614, decision 0124). A row
   * newer than it with no read mark of theirs wears its dot. Null for a member who never read through; absent from a
   * server before it, where the dots follow `seen_at` as they did (bellReadThroughMs).
   */
  read_through_at?: string | null;
  /**
   * This reader's unread kept rows of the whole window, by unreadFor: the listed rows' and the older ones' (the bell lists
   * the newest BELL_LIST_ROWS). Absent from a server before it.
   */
  unread?: number;
  /**
   * The threads of the older unread rows that are a hold's notice: the bell draws a hold that still waits as its own row,
   * so those are not counted twice (waits/hold-rows.ts bellOlderOf). Absent from a server before it.
   */
  older_holds?: string[];
}

/**
 * A row whose wait ended reads as read and wears no warning (a warning over a settled wait is the one thing it must not
 * wear); it stays on the bell, under Earlier, as the record. The server's close (closed_at) and the surfaces' judgement
 * (notice-closes.ts) both settle a row this one way.
 */
export function settledRow<T extends NotificationRow>(row: T): T {
  return { ...row, unread: false, tone: row.tone === "warn" ? "" : row.tone };
}
