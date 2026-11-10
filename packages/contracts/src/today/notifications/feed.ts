/** Notifications: feed. */

import { MIN_MS } from "../../shared/time";
import { callAttemptWords } from "../../conversations/call-dto";
import { replyWaitsOnYou } from "../../conversations/standing";
import { missedCallIsNews } from "../../voice/live";
import { FINISH_SETTING_UP } from "../../setup/first-run-route";
import { lensRoute } from "../../reports/lenses";
import { firstLine } from "../push";
import type { JobKind } from "../../shared/enums";
import { RUN_OPEN_WORDS } from "../../shell/campaign-rooms";
import { invitationExpired } from "../../shell/identity";
import { noticeTone } from "../../waits/notice-tones";
import { SEQUENCES_ROUTE } from "../../campaigns/sequences/address";
import { MESSAGES_ROUTE } from "../../shell/address";
import {
  SERVER_NOTIFICATION_KINDS,
  settledRow,
  type FeedCall,
  type FeedInput,
  type FeedThread,
  type NotificationDto,
  type NotificationItem,
  type NotificationRow,
  type NotificationsDto,
} from "./feed-input";
import { entryOf, isOneOf } from "../../shared/unknown";

/** Everything that needs the owner right now, newest first. */
export function buildNotificationFeed(input: FeedInput): NotificationItem[] {
  const { now } = input;
  const items: NotificationItem[] = [];

  for (const item of input.threads ?? []) {
    if (!item.real) continue;
    if (item.needsYou) {
      // An absolute moment, never "minutes ago" from the clock: a time derived
      // from `now` drifts forward on every read and undoes Mark all read.
      const at =
        item.escalatedAtMs ??
        (typeof item.waitingMin === "number" ? now - item.waitingMin * MIN_MS : (item.lastAtMs ?? now));
      items.push({
        key: `needs:${item.id}`,
        kind: "needs_you",
        at,
        title: `${item.who} needs you`,
        // The customer's own words (the thread's `ask`), never the thread's last message: that was the
        // receptionist's holding reply on every handoff, quoted as if the customer had written it.
        message: item.ask
          ? `${item.ask.label}: ${item.ask.quoted ? `“${item.ask.text}”` : item.ask.text}`
          : "Flagged for a person.",
        to: `inbox/${item.id}`,
        icon: "inbox",
        tone: "warn",
        action: "Open in Inbox",
      });
    }
    // A reply counting down to send waits on you while it can still be stopped: the Inbox's own rule (replyWaitsOnYou).
    if (item.veto && replyWaitsOnYou({ endsAtMs: item.veto.endsAtMs }, now)) {
      const held =
        item.veto.why?.heldFor === "low_confidence" ? "Not sure enough to send alone" : "Waiting in the hold window";
      items.push({
        key: `draft:${item.veto.messageId}`,
        kind: "held_draft",
        at: item.veto.endsAtMs - item.veto.window * 1000,
        title: `A reply to ${item.who} is waiting for you`,
        message: `${held} · “${item.veto.draft.slice(0, 90)}${item.veto.draft.length > 90 ? "…" : ""}”`,
        to: `inbox/${item.id}`,
        icon: "clock",
        tone: "",
        action: "Review",
      });
    }
  }

  for (const item of input.calls ?? []) {
    if (!missedCallIsNews(item, now)) continue;
    items.push({
      key: `${MISSED_KEY_PREFIX}${item.callId}`,
      kind: "missed_call",
      at: item.startedAtMs,
      title: `${callAttemptWords(item.direction)} · ${item.who}`,
      message: item.number ? `${item.number} — the call never connected.` : "The call never connected.",
      to: `conversations/${item.cvId}`,
      icon: "phone",
      tone: "warn",
      action: "See the call",
    });
  }

  for (const row of input.invites ?? []) {
    const at = Date.parse(row.created_at);
    // Team marks an invitation that has run out its days Expired (invitationExpired); the bell says the same, not "pending".
    const expired = invitationExpired({ expiresAt: row.expires_at }, now);
    items.push({
      key: `invite:${row.id}`,
      kind: "invite",
      at: Number.isNaN(at) ? now : at,
      title: `${expired ? "Invitation expired" : "Invitation pending"} · ${row.email}`,
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

/* ------------------------------------------------- a job's news, in an owner's words */

/** How a background job ended, when it ended badly: it threw, it never came back, or nothing knew how to run it. */
export type JobEnd = "failed" | "unfinished" | "unknown_kind";

/**
 * What each kind of job was doing, said as the owner's work, and the page that work lives on. The runner used to title
 * every one `A lead_collect job failed`, open its body with the job's id, and send it to the Inbox. On the salon's
 * phone the bell's first screen was eight of those: an internal name, a uuid, and a door to a page that had nothing to
 * do with a search.
 */
const JOB_WORK: Record<JobKind, { stopped: string; to: string }> = {
  outbound_send: { stopped: "A message may not have been sent", to: "inbox" },
  broadcast_send: { stopped: "A run stopped partway", to: "campaigns/sequences" },
  line_provision: { stopped: "Setting up a phone line stopped", to: "admin/integrations" },
  email_ingest: { stopped: "An email could not be taken in", to: "inbox" },
  lead_round_start: { stopped: "A search could not start", to: "clients/leads" },
  lead_collect: { stopped: "A search stopped partway", to: "clients/leads" }, // not sent: jobs TOLD_ELSEWHERE (00491)
  lead_check: { stopped: "Checking a search's emails stopped", to: "clients/leads" },
  push_send: { stopped: "An alert to your phone was not sent", to: "admin/notifications" },
  push_receipts: { stopped: "Checking that your phone was told did not finish", to: "admin/notifications" },
  // Read, applied or told: the job's last try did not finish one of them, and the thread is where the reply is.
  reply_read: { stopped: "A reply from a lead could not be read or told", to: "inbox" },
  // A thread's draft. Not sent (packages/jobs TOLD_ELSEWHERE): its row says it could not be written, on the thread itself.
  reply_draft: { stopped: "A reply could not be drafted", to: "inbox" },
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
  history_import: { stopped: "Bringing your history in stopped partway", to: "admin/integrations" },
  website_read: { stopped: "Your website could not be read", to: "admin/receptionist" },
  preview_build: { stopped: "A lead's preview could not be made", to: "clients/leads" },
  erasure_finish: { stopped: "Erasing a person stopped partway: delete them again", to: "clients" },
  // A file's look. Not sent (packages/jobs TOLD_ELSEWHERE): its row says it could not be read, on the page that holds it.
  file_look: { stopped: "A photo could not be looked at", to: "admin/files" },
  // Not sent: Inbox simply holds what came, and nothing an owner did is waiting on it.
  file_fetch: { stopped: "Photos from your website could not all be brought in", to: "admin/files" },
  // Not sent: a removed file already looks gone, and nothing is the owner's to do. Health counts it.
  file_purge: { stopped: "A removed photo could not be let go", to: "admin/files" },
  // A video's digest. Not sent (packages/jobs TOLD_ELSEWHERE): its tile says what it has, and the sweep tries the step again.
  video_digest: { stopped: "A video could not be made ready", to: "admin/files" },
  // A workspace's hourly work (00569). Not sent (kinds.ts: the platform's to mend), and the next hour tries again.
  campaign_moments: { stopped: "A campaign could not run this hour", to: "today" },
  reach_out_steps: { stopped: "A reach-out could not run this hour", to: "today" },
  calendar_read: { stopped: "Your calendar could not be read this hour", to: "today" },
  google_read: { stopped: "Your Google listing could not be read this hour", to: "today" },
  // A workspace's occasions (00597). Not sent (kinds.ts: the platform's to mend), and the next minute tries again.
  sequence_occasions: { stopped: "A message due to one person could not be made", to: "today" },
  canary: { stopped: "The background work's own check did not finish", to: "today" },
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
  const item = entryOf(JOB_WORK, jobKind) ?? JOB_WORK_OTHER;
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
  return { title: item.stopped, lead, to: item.to };
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
  const w = jobNewsWords(m[1] ?? "", OLD_JOB_END[m[2] ?? ""] ?? "failed", {
    attempts: tries ? Number(tries[1]) : 1,
    resumed: false,
  });
  // The old rows all said "inbox", whatever the job was; a row that named another page keeps it.
  return { title: w.title, message: w.lead, route: n.route && n.route !== "inbox" ? n.route : w.to };
}

/**
 * Where the day's reach-out numbers open (spec 2026-10-09 §4.6): Sequences, where the sequences to leads the numbers are
 * about are listed (decision 0060; Campaigns' Reach-outs group, `campaigns/in:reach_out`, retired with its home). The edge
 * writes it on the row; a row kept before then says `outbound` or the group, and opens here too (retiredRouteOf).
 */
export const REACH_OUT_DAY_ROUTE = SEQUENCES_ROUTE;

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
  template_ready: { icon: "check", tone: "ok", action: "Open Messages", to: MESSAGES_ROUTE },
  template_blocked: { icon: "alert", tone: "warn", action: "Open Messages", to: MESSAGES_ROUTE },
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
  playbook: { icon: "bolt", tone: "warn", action: "Open Campaigns", to: SEQUENCES_ROUTE },
  /** A reply counting down to go in the owner's name (decision 0064): a decision with a deadline, so a warning. */
  reply_held: { icon: "clock", tone: "warn", action: "Open the Inbox", to: "inbox" },
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
  ask_cards: { icon: "sparkle", tone: "", action: "Open Today", to: "today" },
  files_waiting: { icon: "image", tone: "", action: "Open Files", to: "admin/files" },
  website_form: { icon: "users", tone: "ok", action: "Open their page", to: "clients" },
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
  [/^inbox\/to-send$/, "Open To send"],
  [/^inbox/, "Open the Inbox"],
  [/^conversations\/phone/, "Open the calls"],
  [/^live/, "Open Live"],
  // The old Playbooks list (`outbound`) lands on Sequences, which is Campaigns now (decision 0060): the door says the name.
  [/^outbound/, "Open Campaigns"],
  // A message open in its own drawer over Campaigns (a template's notice: refused, paused, approved): the door says what it opens.
  [/^campaigns\/(message:|messages\/[^/]+)/, "Open the message"],
  // Messages, Campaigns' other view (19 Oct 2026): the door says the page's name.
  [/^campaigns\/messages(\/|$)/, "Open Messages"],
  // A run at its home under its sequence (the Campaigns wiring review's lane 2): the door says it opens the run.
  [/^campaigns\/sequences\/[^/]+\/runs\/[^/]+/, RUN_OPEN_WORDS],
  [/^campaigns/, "Open Campaigns"],
  // A row about one run opens that run (a playbook's waiting or about to go, a reach-out's held sends), and says so.
  [/^broadcasts\/run:/, RUN_OPEN_WORDS],
  // Sent's To send and Get their yes, in a row kept from before: the Inbox's and People's now, under the same words.
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
  [/^clients\/get-yes$/, "Open Get their yes"],
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
    .map((otherRow) => {
      const look = lookOf(otherRow.kind) ?? ALERT_LOOK;
      // Good news under a kind that carries warnings too, or a warning kept as a plain alert (waits/notice-tones.ts).
      const tone = noticeTone(otherRow.kind, otherRow.title);
      const at = Date.parse(otherRow.created_at);
      const job = jobRowWords(otherRow);
      // The day's reach-out numbers open the Reach-outs, whatever route their row was kept with.
      const route = job ? job.route : otherRow.kind === "reach_out_day" ? REACH_OUT_DAY_ROUTE : otherRow.route;
      const row: NotificationRow = {
        key: `${SERVER_KEY_PREFIX}${otherRow.id}`,
        kind: isOneOf(SERVER_NOTIFICATION_KINDS, otherRow.kind) ? otherRow.kind : "alert",
        at,
        title: job ? job.title : otherRow.title,
        message: job ? job.message : firstLine(otherRow.body),
        to: noticeRoute(otherRow.kind, route),
        icon: tone === "ok" ? "check" : look.icon,
        tone: tone ?? look.tone,
        action: look.own ? look.action : (verbForRoute(route) ?? look.action),
        unread: at > seen && !otherRow.read,
        about:
          otherRow.subject_type && otherRow.subject_id
            ? { type: otherRow.subject_type, id: otherRow.subject_id }
            : null,
      };
      // What the row asked for ended for good, for everyone (00421): read, and no warning.
      return otherRow.closed_at ? settledRow(row) : row;
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
  const named = (personName: string | undefined) =>
    personName && !/\d{4}/.test(personName) ? personName.trim() : null;
  const byConversation = new Map<string, string>();
  for (const t of threads ?? []) {
    const personName = named(t.who);
    if (personName && t.id.startsWith("th-")) byConversation.set(t.id.slice(3), personName);
  }
  const byCall = new Map<string, string>();
  for (const c of calls ?? []) {
    const personName = named(c.who);
    if (personName) byCall.set(c.callId, personName);
  }
  return rows.map((r) => {
    if (!r.about || !NUMBER_IN_WORDS.test(r.title)) return r;
    const person =
      r.about.type === "conversation"
        ? byConversation.get(r.about.id)
        : r.about.type === "call"
          ? byCall.get(r.about.id)
          : undefined;
    return person ? { ...r, title: r.title.replace(NUMBER_IN_WORDS, person) } : r;
  });
}
