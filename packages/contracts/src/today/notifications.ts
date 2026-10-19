import { agoShort as spanAgo, MIN_MS } from "../shared/time";
import { callAttemptWords } from "../conversations/call-dto";
import { replyWaitsOnYou } from "../conversations/standing";
import { missedCallIsNews, type LiveCallVM } from "../voice/live";
import { FINISH_SETTING_UP } from "../setup/first-run";
import { lensRoute } from "../reports/lenses";
import { firstLine } from "./push";
import type { JobKind } from "../shared/enums";
import { RUN_OPEN_WORDS } from "../shell/campaign-rooms";
import { invitationExpired } from "../shell/identity";
import { noticeTone } from "../waits/notice-tones";
/**
 * The bell: what needs the owner, from what the browser already holds.
 *
 * The seeded bell promised five things to read that never happened, and a
 * real session showed nothing. The feed here is built from the rows the
 * surfaces have already fetched — the Inbox threads, the Live calls, the open
 * invitations — so it costs no request and is exactly as fresh as the pages
 * around it. Read state is per device (the bridge keeps it in localStorage):
 * honest, and enough until a person has more than one phone.
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

/** Everything that needs the owner right now, newest first. */
export function buildNotificationFeed(input: FeedInput): NotificationItem[] {
  const { now } = input;
  const items: NotificationItem[] = [];

  for (const t of input.threads ?? []) {
    if (!t.real) continue;
    if (t.needsYou) {
      // An absolute moment, never "minutes ago" from the clock: a time derived
      // from `now` drifts forward on every read and undoes Mark all read.
      const at =
        t.escalatedAtMs ?? (typeof t.waitingMin === "number" ? now - t.waitingMin * MIN_MS : (t.lastAtMs ?? now));
      items.push({
        key: `needs:${t.id}`,
        kind: "needs_you",
        at,
        title: `${t.who} needs you`,
        // The customer's own words (the thread's `ask`), never the thread's last message: that was the
        // receptionist's holding reply on every handoff, quoted as if the customer had written it.
        message: t.ask ? `${t.ask.label}: ${t.ask.quoted ? `“${t.ask.text}”` : t.ask.text}` : "Flagged for a person.",
        to: `inbox/${t.id}`,
        icon: "inbox",
        tone: "warn",
        action: "Open in Inbox",
      });
    }
    // A reply counting down to send waits on you while it can still be stopped: the Inbox's own rule (replyWaitsOnYou).
    if (t.veto && replyWaitsOnYou({ endsAtMs: t.veto.endsAtMs }, now)) {
      const held =
        t.veto.why?.heldFor === "low_confidence" ? "Not sure enough to send alone" : "Waiting in the hold window";
      items.push({
        key: `draft:${t.veto.messageId}`,
        kind: "held_draft",
        at: t.veto.endsAtMs - t.veto.window * 1000,
        title: `A reply to ${t.who} is waiting for you`,
        message: `${held} · “${t.veto.draft.slice(0, 90)}${t.veto.draft.length > 90 ? "…" : ""}”`,
        to: `inbox/${t.id}`,
        icon: "clock",
        tone: "",
        action: "Review",
      });
    }
  }

  for (const c of input.calls ?? []) {
    if (!missedCallIsNews(c, now)) continue;
    items.push({
      key: `${MISSED_KEY_PREFIX}${c.callId}`,
      kind: "missed_call",
      at: c.startedAtMs,
      title: `${callAttemptWords(c.direction)} · ${c.who}`,
      message: c.number ? `${c.number} — the call never connected.` : "The call never connected.",
      to: `conversations/${c.cvId}`,
      icon: "phone",
      tone: "warn",
      action: "See the call",
    });
  }

  for (const i of input.invites ?? []) {
    const at = Date.parse(i.created_at);
    // Team marks an invitation that has run out its days Expired (invitationExpired); the bell says the same, not "pending".
    const expired = invitationExpired({ expiresAt: i.expires_at }, now);
    items.push({
      key: `invite:${i.id}`,
      kind: "invite",
      at: Number.isNaN(at) ? now : at,
      title: `${expired ? "Invitation expired" : "Invitation pending"} · ${i.email}`,
      message: expired ? "They did not accept in time. Send it again from Team." : "They have not accepted yet.",
      // Invitations live on the Team pane since Team split from Workspace;
      // the row's own button says "Team", so its door must open Team.
      to: "admin/team",
      icon: "users",
      tone: "",
      action: "Team",
    });
  }

  return items.sort((a, b) => b.at - a.at);
}

/** What one device remembers about the bell. */
export interface NotificationReadState {
  /** "Mark all read" moves this; opening the bell does not, so "New" stays new until the owner says so. */
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

/** The feed as a device sees it: dismissed rows gone, unread decided. */
export function applyReadState(items: NotificationItem[], state: NotificationReadState): NotificationRow[] {
  const read = new Set(state.read);
  const gone = new Set(state.dismissed);
  return items.filter((i) => !gone.has(i.key)).map((i) => ({ ...i, unread: i.at > state.seenAt && !read.has(i.key) }));
}

/**
 * The number on the bell's badge.
 *
 * Lives here because two surfaces say it: the badge itself, and Today's
 * "While you were away" head. They were two spellings of one fact and read
 * 4 and 0 on the same screen.
 */
export function unreadCount(rows: readonly { unread: boolean }[]): number {
  return rows.filter((r) => r.unread).length;
}

/** "now", "5m", "2h", "3d" — the bell's clock (the Inbox has its own `ago`). */
/** The bell's time: one family with every other surface (time.ts). */
export function agoLabel(atMs: number, now: number): string {
  return spanAgo(atMs, now);
}

/** The kinds a device is woken for; an invitation can wait for the bell. */
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
 * reads is SERVER_LOOK's, and how it groups is today-away.ts AWAY_NOUN's.
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

/* ------------------------------------------------- a job's news, in an owner's words */

/** How a background job ended, when it ended badly: it threw, it never came back, or nothing knew how to run it. */
export type JobEnd = "failed" | "unfinished" | "unknown_kind";

/**
 * What each kind of job was doing, said as the owner's work, and the page that work lives on.
 *
 * The runner used to title every one `A lead_collect job failed`, open its body with the job's id, and send it to
 * the Inbox. On the salon's phone the bell's first screen was eight of those: an internal name, a uuid, and a door
 * to a page that had nothing to do with a search.
 */
const JOB_WORK: Record<JobKind, { stopped: string; to: string }> = {
  outbound_send: { stopped: "A message may not have been sent", to: "inbox" },
  broadcast_send: { stopped: "A broadcast stopped partway", to: "campaigns/sequences" },
  line_provision: { stopped: "Setting up a phone line stopped", to: "admin/integrations" },
  email_ingest: { stopped: "An email could not be taken in", to: "inbox" },
  lead_round_start: { stopped: "A search could not start", to: "clients/leads" },
  lead_collect: { stopped: "A search stopped partway", to: "clients/leads" },
  lead_check: { stopped: "Checking a search's emails stopped", to: "clients/leads" },
  push_send: { stopped: "An alert to your phone was not sent", to: "admin/notifications" },
  push_receipts: { stopped: "Checking that your phone was told did not finish", to: "admin/notifications" },
  // Read, applied or told: the job's last try did not finish one of them, and the thread is where the reply is.
  reply_read: { stopped: "A reply to your reach-out could not be read or told", to: "inbox" },
  // A booking tool's email about a visit (docs/plans/2026-10-07-bookings-arrive-by-email.md): the board is where the
  // visit would be, and Settings › Business where the notices are counted.
  booking_read: { stopped: "A booking emailed by your booking tool could not be read", to: "calendar" },
  // A fact's delivery to a subscriber (00334). Not sent (packages/jobs TOLD_ELSEWHERE): a subscriber that fails is the
  // platform's fault, nothing an owner can act on, and the operator is paged instead (PAGES_THE_PLATFORM); these are
  // the words should it ever be, and its door opens Activity, where the fact is.
  event_deliver: { stopped: "A change could not be passed on to what reads it", to: "admin/activity" },
  // A text the door kept and the receptionist could not answer. Not sent (packages/jobs TOLD_ELSEWHERE): the deadman
  // sweep flags the thread and tells the owner with the customer's words, so these are the words should it ever be.
  inbound_answer: { stopped: "A text could not be answered", to: "inbox" },
};

/** A job this runner has no words for: said as what it is, on the page that says what happened today. */
const JOB_WORK_OTHER = { stopped: "Something in the background did not finish", to: "today" };

/**
 * A job's news: its title, the one line under it, and its door. The job's id and kind are for whoever reads the
 * email to the end, so the runner keeps them as the body's last line, never its first (the bell shows the first).
 *
 * The line is worded from how the job was SETTLED, not from the fact that it ended (`how.resumed`: the ledger handed what
 * it left to a fresh run, or one is already coming, jobs settle.ts and tick.ts conclude). A broadcast that stopped partway
 * is carried on that way up to MAX_RESUMES times, and its alert said "will not start again on its own" each of them, the
 * opposite of what happened, in the only line the bell and the phone show: an owner who believed it and sent again reached
 * the whole audience twice. Only a job nothing carries on says it will not start again. `resumed` is null where settling
 * threw, so nobody knows whether anything carries on: the line then says neither (its body says what could not be checked).
 */
export function jobNewsWords(
  jobKind: string,
  end: JobEnd,
  how: { attempts: number; resumed: boolean | null },
): { title: string; lead: string; to: string } {
  const w = (JOB_WORK as Record<string, typeof JOB_WORK_OTHER>)[jobKind] ?? JOB_WORK_OTHER;
  const { attempts, resumed } = how;
  const tries = attempts > 1 ? ` after ${attempts} tries` : "";
  const lead =
    end === "unfinished"
      ? jobKind === "outbound_send"
        ? "It started and never reported back, so it may or may not have reached the customer. Check the conversation before sending it again."
        : `It started and never reported back, so how it ended is unknown${resumed ? ", and the rest carries on in a fresh run" : ""}.`
      : end === "unknown_kind"
        ? "Nothing ran: this is work the app does not know how to do."
        : resumed === null
          ? `It stopped${tries}, and whether it carries on in a fresh run could not be checked.`
          : `It stopped${tries} and ${resumed ? "carries on in a fresh run" : "will not start again on its own"}.`;
  return { title: w.stopped, lead, to: w.to };
}

/**
 * A row the runner wrote before it had these words: `A lead_collect job failed`, over `Job 3f2e… (lead_collect)
 * failed and will not retry on its own.` Kept rows are a month deep, so the bell says them in the new words rather
 * than waiting for them to age out. Only a job_failed row whose title is exactly that sentence is touched.
 */
const OLD_JOB_TITLE = /^A ([a-z_]+) job (failed|did not finish|could not run)$/;
const OLD_JOB_END: Record<string, JobEnd> = {
  failed: "failed",
  "did not finish": "unfinished",
  "could not run": "unknown_kind",
};

function jobRowWords(n: NotificationDto): { title: string; message: string; route: string } | null {
  if (n.kind !== "job_failed") return null;
  const m = OLD_JOB_TITLE.exec(n.title.trim());
  if (!m) return null;
  const tries = /after (\d+) tries/.exec(n.body);
  // A row from before these words was never worded from how it was settled: it said it would not start again.
  const w = jobNewsWords(m[1], OLD_JOB_END[m[2]], { attempts: tries ? Number(tries[1]) : 1, resumed: false });
  // The old rows all said "inbox", whatever the job was; a row that named another page keeps it.
  return { title: w.title, message: w.lead, route: n.route && n.route !== "inbox" ? n.route : w.to };
}

/**
 * Where the day's reach-out numbers open (spec 2026-10-09 §4.6): Campaigns narrowed to its Reach-outs, the chains the
 * numbers are about. The edge writes it on the row; a row kept before then says `outbound`, and opens here too.
 */
export const REACH_OUT_DAY_ROUTE = "campaigns/in:reach_out";

/**
 * How a kept kind reads. `own` keeps the kind's verb over the route's: a question asks for an answer, and "Open
 * Leads" would say where it is without saying what it wants. A kind with none reads as a plain alert, as the edge keeps it.
 */
type ServerLook = { icon: string; tone: "" | "ok" | "warn"; action: string; to: string; own?: true };
const ALERT_LOOK: ServerLook = { icon: "bell", tone: "", action: "Open Today", to: "today" };
const SERVER_LOOK: Record<string, ServerLook> = {
  handoff: { icon: "alert", tone: "warn", action: "Open the Inbox", to: "inbox" },
  deadman: { icon: "alert", tone: "warn", action: "Open the Inbox", to: "inbox" },
  call: { icon: "phone", tone: "", action: "Open the calls", to: "conversations/phone" },
  /** The NUMBER's own health: a rating flagged, a limit lowered, the account restricted. */
  number: { icon: "shield", tone: "warn", action: "Open Connections", to: "admin/integrations" },
  /**
   * A template's news is not the number's news. Both arrive on the same
   * webhook, and for a while both were kind "number" — so "Template … approved"
   * was drawn with a shield, in warn amber, over a door to Connections: good
   * news wearing a warning's colour and pointing at the wrong page. Since Today
   * sorts warnings above everything else, it also outranked real news.
   *
   * Two kinds rather than one kind and a tone column, because which of the two
   * a change is belongs to the change (waba-events.ts describeWabaChange), and
   * how it should read belongs here. Never inferred from the title.
   */
  template_ready: { icon: "check", tone: "ok", action: "Open Messages", to: "messages" },
  template_blocked: { icon: "alert", tone: "warn", action: "Open Messages", to: "messages" },
  sweep: { icon: "alert", tone: "warn", action: "Open Connections", to: "admin/integrations" },
  /** A JOB that did not finish, and nothing else. See JobNewsKind. */
  job_failed: { icon: "alert", tone: "warn", action: "Open the Inbox", to: "inbox" },
  /** A broadcast that ran to completion: good news, on the page it happened on. */
  broadcast_sent: { icon: "check", tone: "ok", action: "Open Sequences", to: "campaigns/sequences" },
  /** A broadcast that did not go out, or stopped partway. */
  broadcast_stopped: { icon: "alert", tone: "warn", action: "Open Sequences", to: "campaigns/sequences" },
  /**
   * A run waits for the owner's word, or a reach-out holds an email for their call: a decision, so a warning, as the topic
   * says it ("needs you", ALERT_TOPICS playbook), never good news sorted below the warnings. Once the run is settled the
   * row reads as read and loses the warning (notice-closes.ts).
   */
  playbook: { icon: "bolt", tone: "warn", action: "Open Campaigns", to: "outbound" },
  calendar_people: { icon: "users", tone: "ok", action: "Open People", to: "clients" },
  /** A booking tool's email that could not be read as a booking (00345): a person looks, under Settings › Hours & booking. */
  booking_notice: { icon: "calendar", tone: "warn", action: "Open Settings", to: "admin/workspace" },
  /** A search that finished: good news, on the page the leads are on. */
  leads_ready: { icon: "users", tone: "ok", action: "Open Leads", to: "clients/leads" },
  /** A round that stopped to ask. It waits a day and then ends, so it is a warning. */
  leads_question: { icon: "alert", tone: "warn", action: "Answer it", to: "clients/leads", own: true },
  /** A review on Google: good news, on the Reviews lens, where it is read. A row kept before then says `reports`, and keeps it. */
  review: { icon: "star", tone: "ok", action: "Open Reports", to: lensRoute("reviews") },
  /** The subscription: a trial starting or ending, a card declined, the receptionist paused or back. */
  billing: { icon: "money", tone: "warn", action: "Open Billing", to: "admin/billing" },
  /** A note a teammate left for you on a person (0007): its row names them and opens their page, where the note is. */
  note_for_you: { icon: "edit", tone: "", action: "Open their page", to: "clients" },
  /** A business wrote back to a reach-out: its row names the thread, where the reply and what was read are. */
  reach_out_replied: { icon: "mail", tone: "", action: "Open the thread", to: "inbox", own: true },
  /** The day's reach-out numbers (H12): what they wrote and what came back, with the chains on Campaigns, at its Reach-outs. */
  reach_out_day: { icon: "mail", tone: "", action: "Open Campaigns", to: REACH_OUT_DAY_ROUTE },
  /** A customer asked to stop: news, not a warning (STOP_WORDS.tone is plain), on their page, where the answer is kept. */
  opted_out: { icon: "shield", tone: "", action: "Open their page", to: "clients" },
  /** A booking arrived: good news, on the Calendar at the visit (its row names the address; the day alone is the list door). */
  booking: { icon: "calendar", tone: "ok", action: "Open Calendar", to: "calendar" },
  /** A teammate joined: good news, on the Team pane, where the seat's role is looked after. */
  member_joined: { icon: "users", tone: "ok", action: "Open Team", to: "admin/team" },
  /** A teammate left: news, neither good nor a warning, on the Team pane, where the seats are. */
  member_left: { icon: "users", tone: "", action: "Open Team", to: "admin/team" },
  /** A note from a correction waits: news, on the Autonomy pane, where it is kept or dismissed. */
  note_to_keep: { icon: "edit", tone: "", action: "Open Autonomy", to: "admin/autonomy" },
  alert: ALERT_LOOK,
};

/** The look a kind is kept with, its own and never one an object inherits; null for a kind the bell keeps none for. */
function lookOf(kind: string | null | undefined): ServerLook | null {
  return kind && Object.hasOwn(SERVER_LOOK, kind) ? (SERVER_LOOK[kind] ?? null) : null;
}

/**
 * The page that holds all the rows of a kind, and the verb that says so: where a group of rows that point at different records
 * opens (Today's While you were away, todayAwayGrouped), since the newest row's own record is one of several. Null for a kind the
 * bell does not keep a look for.
 */
export function kindListDoor(kind: string): { to: string; action: string } | null {
  const look = lookOf(kind);
  if (!look) return null;
  return { to: look.to, action: look.own ? look.action : (verbForRoute(look.to) ?? look.action) };
}

/**
 * Where a kept notice opens, on whichever channel reaches you: the route its row was kept with, else its kind's list door,
 * else Today for a kind the bell keeps no look for (the kind is then a plain alert, as the edge keeps it). The bell opens
 * it, the phone carries it (`pushFor`'s data.route) and the mail links it (the edge's notify), all from here, so the three
 * cannot send one alert to three places (task 1.7 of the wiring plan; findings A2a and NS-4).
 */
export function noticeRoute(kind: string | null | undefined, route: string | null | undefined): string {
  return route || (lookOf(kind) ?? ALERT_LOOK).to;
}

/** The verb for a row that names its own route; the kind's verb otherwise. */
const ROUTE_VERBS: Array<[RegExp, string]> = [
  // Setup is the first run now (#/start); a row written before then still says admin/setup, and lands there too.
  [/^admin\/setup/, FINISH_SETTING_UP],
  [/^start/, FINISH_SETTING_UP],
  [/^admin\/integrations/, "Open Connections"],
  [/^admin\/workspace/, "Open Business"],
  [/^admin\/notifications/, "Open Notifications"],
  [/^admin\/activity/, "Open Activity"],
  [/^admin\/team/, "Open Team"],
  [/^admin\/billing/, "Open Billing"],
  [/^inbox/, "Open the Inbox"],
  [/^conversations\/phone/, "Open the calls"],
  [/^live/, "Open Live"],
  // The old Playbooks list (`outbound`) lands on Sequences, which is Campaigns now (decision 0060): the door says the name.
  [/^outbound/, "Open Campaigns"],
  // A message open in its own drawer over Campaigns (a template's notice: refused, paused, approved): the door says what it opens.
  [/^campaigns\/message:/, "Open the message"],
  [/^campaigns/, "Open Campaigns"],
  // A row about one run opens that run (a playbook's waiting or about to go, a reach-out's held sends), and says so.
  [/^broadcasts\/run:/, RUN_OPEN_WORDS],
  // Every email handed to its owner, from each reach-out they send themselves (00429): one list.
  [/^broadcasts\/to-send$/, "Open To send"],
  [/^broadcasts\/get-yes/, "Open Get their yes"],
  // Sent's list went to each sequence's History (decision 0060, D3): its address, and a row kept before, land on Sequences.
  [/^broadcasts/, "Open Sequences"],
  // The route is still `messages`; the page is Messages (a room of Campaigns), and the door says the page's name.
  [/^messages/, "Open Messages"],
  [/^calendar/, "Open Calendar"],
  // One person's page, by their id: the row is about them, so its door says so.
  [/^clients\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, "Open their page"],
  // Leads is a scope of People, and its rows name it: a finished search said "Open People" over a door to Leads.
  [/^clients\/leads/, "Open Leads"],
  [/^clients/, "Open People"],
  [/^reports/, "Open Reports"],
  [/^today/, "Open Today"],
];

export function verbForRoute(route: string | null | undefined): string | null {
  if (!route) return null;
  const hit = ROUTE_VERBS.find(([re]) => re.test(route));
  return hit ? hit[1] : null;
}

/** A kept row's key on the bell, so the bridge can tell it from a derived one. */
export const SERVER_KEY_PREFIX = "n:";

/** A DERIVED missed-call row's key: this prefix plus the call's own row id (calls.id), as Live carries it. */
const MISSED_KEY_PREFIX = "call:";

/**
 * A DERIVED "needs you" row's key: this prefix plus the thread's own id, which
 * for a real workspace is "th-" plus the conversation's. So the conversation a
 * derived row is about is its key with this prefix taken off — the only handle
 * such a row has, because it carries no `about` (nothing wrote it down; it is
 * computed from the Inbox the browser is already holding).
 */
const NEEDS_KEY_PREFIX = "needs:th-";

/** The conversation a derived "needs you" row stands for, or null. */
export function conversationOfNeedsKey(key: string): string | null {
  return key.startsWith(NEEDS_KEY_PREFIX) ? key.slice(NEEDS_KEY_PREFIX.length) : null;
}

/** Who a bell row is about, where it is one person: their conversation, or the person themselves. */
interface NoteWhose {
  conversationId?: string;
  personId?: string;
}

const THREAD_DOOR = /^inbox\/th-([0-9a-f-]{36})$/;
const PERSON_DOOR = /^clients\/([0-9a-f-]{36})$/;

/**
 * Who a bell row is about, where it is one person: what the edge wrote down (a kept row's subject), else where its
 * door opens, a thread in the Inbox or a person's page. A derived row carries no subject (nothing wrote it down), and
 * its door is the thread it was made from. The lists read it so a person with a note still unread says so on their
 * row, as the bell does, and opening them reads the note (surfaces/seen.ts). Null for a row about anything else: a
 * broadcast, a search, the workspace.
 */
export function noteWhose(row: { about?: { type: string; id: string } | null; to: string }): NoteWhose | null {
  if (row.about?.type === "conversation") return { conversationId: row.about.id };
  if (row.about?.type === "contact") return { personId: row.about.id };
  const thread = THREAD_DOOR.exec(row.to);
  if (thread?.[1]) return { conversationId: thread[1] };
  const person = PERSON_DOOR.exec(row.to);
  return person?.[1] ? { personId: person[1] } : null;
}

/** A derived missed-call row's key: this prefix plus the call's id (buildNotificationFeed). */
const CALL_KEY_PREFIX = "call:";

/** The call a derived missed-call row stands for, or null. */
export function callOfKey(key: string): string | null {
  return key.startsWith(CALL_KEY_PREFIX) ? key.slice(CALL_KEY_PREFIX.length) : null;
}

/**
 * The kept rows as the bell shows them: dismissed ones gone, unread decided
 * by the person's seen moment and their own read mark — the same on every
 * device, because both live on the server.
 */
export function serverNotificationRows(dto: NotificationsDto | null | undefined): NotificationRow[] {
  if (!dto) return [];
  const seen = dto.seen_at ? Date.parse(dto.seen_at) : 0;
  return dto.notifications
    .filter((n) => !n.dismissed)
    .map((n) => {
      const look = lookOf(n.kind) ?? ALERT_LOOK;
      // Good news under a kind that carries warnings too, or a warning kept as a plain alert (waits/notice-tones.ts).
      const tone = noticeTone(n.kind, n.title);
      const at = Date.parse(n.created_at);
      const job = jobRowWords(n);
      // The day's reach-out numbers open the Reach-outs, whatever route their row was kept with.
      const route = job ? job.route : n.kind === "reach_out_day" ? REACH_OUT_DAY_ROUTE : n.route;
      const row: NotificationRow = {
        key: `${SERVER_KEY_PREFIX}${n.id}`,
        kind: (SERVER_NOTIFICATION_KINDS as readonly string[]).includes(n.kind)
          ? (n.kind as NotificationKind)
          : "alert",
        at,
        title: job ? job.title : n.title,
        message: job ? job.message : firstLine(n.body),
        to: noticeRoute(n.kind, route),
        icon: tone === "ok" ? "check" : look.icon,
        tone: tone ?? look.tone,
        action: look.own ? look.action : (verbForRoute(route) ?? look.action),
        unread: at > seen && !n.read,
        about: n.subject_type && n.subject_id ? { type: n.subject_type, id: n.subject_id } : null,
      };
      // What the row asked for ended for good, for everyone (00421): read, and no warning.
      return n.closed_at ? settledRow(row) : row;
    });
}

/**
 * One row per thing. A derived "needs you" row and the kept handoff (or
 * call-back) row for the same conversation said the same thing twice, in two
 * voices. While the derived row stands, the kept one about that conversation
 * is not shown; once the thread is answered the derived row goes and the kept
 * row remains as the record.
 */
export function dedupeFeed(rows: NotificationRow[]): NotificationRow[] {
  const covered = new Set(
    rows
      .flatMap((r) => (r.kind === "needs_you" ? [conversationOfNeedsKey(r.key)] : []))
      .filter((id): id is string => !!id),
  );
  // A customer's call that never connected is kept on the server as well (the edge's missedCallNotice, the wiring's
  // second audit, R11 S6-8): the kept row is the record, read or not, so the row derived from the calls this browser
  // holds stands only where none was kept.
  const keptCalls = new Set(
    rows.flatMap((r) => (r.key.startsWith(SERVER_KEY_PREFIX) && r.about?.type === "call" ? [r.about.id] : [])),
  );
  return rows.filter(
    (r) =>
      !(r.key.startsWith(SERVER_KEY_PREFIX) && r.about?.type === "conversation" && covered.has(r.about.id)) &&
      !(r.kind === "missed_call" && keptCalls.has(r.key.slice(MISSED_KEY_PREFIX.length))),
  );
}

/**
 * A phone number inside a line of words: what the edge writes when it knew no name. Its three spellings and nothing
 * after them: `+19175550101`, `+1 (917) 555-0101`, `+1 917 555 0101`. A looser pattern ran on into the words after
 * the number, and "Voice call: +15550100101 (12s, Neutral)" read "Voice call: Dana Ortizs, Neutral)" (25 Sep).
 */
const NUMBER_IN_WORDS =
  /\+\d{8,15}\b|(?:\+\d{1,3}\s?)?\(\d{3}\)\s?\d{3}[-.\s]\d{4}\b|(?:\+\d{1,3}\s)?\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/;

/**
 * A kept row names its customer by number when the edge knew no name ("WhatsApp handoff needed: +1917…"), and the
 * Inbox or the calls this browser holds may know them by name since. A row that says what it is about takes that
 * name in place of the number; a name that is itself a number, or a row about nothing, is left as the edge wrote it.
 */
export function nameKnownCustomers<T extends NotificationRow>(
  rows: readonly T[],
  threads: readonly FeedThread[] | null | undefined,
  calls: readonly FeedCall[] | null | undefined,
): T[] {
  const named = (who: string | undefined) => (who && !/\d{4}/.test(who) ? who.trim() : null);
  const byConversation = new Map<string, string>();
  for (const t of threads ?? []) {
    const who = named(t.who);
    if (who && t.id.startsWith("th-")) byConversation.set(t.id.slice(3), who);
  }
  const byCall = new Map<string, string>();
  for (const c of calls ?? []) {
    const who = named(c.who);
    if (who) byCall.set(c.callId, who);
  }
  return rows.map((r) => {
    if (!r.about || !NUMBER_IN_WORDS.test(r.title)) return r;
    const who =
      r.about.type === "conversation"
        ? byConversation.get(r.about.id)
        : r.about.type === "call"
          ? byCall.get(r.about.id)
          : undefined;
    return who ? { ...r, title: r.title.replace(NUMBER_IN_WORDS, who) } : r;
  });
}
