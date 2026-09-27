import { agoShort as spanAgo, DAY_MS } from "../shared/time";
import { FINISH_SETTING_UP } from "../setup/first-run";
import { firstLine } from "./push";
import type { JobKind } from "../shared/enums";
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

/** The slice of the Live call view-model the feed reads. */
export interface FeedCall {
  callId: string;
  cvId: string;
  who: string;
  number?: string | null;
  missed: boolean;
  live: boolean;
  startedAtMs: number | null;
}

export interface FeedInvite {
  id: string;
  email: string;
  created_at: string;
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
        t.escalatedAtMs ?? (typeof t.waitingMin === "number" ? now - t.waitingMin * 60_000 : (t.lastAtMs ?? now));
      items.push({
        key: `needs:${t.id}`,
        kind: "needs_you",
        at,
        title: `${t.who} needs you`,
        message: t.preview ? `They wrote: “${t.preview}”` : "Flagged for a person.",
        to: `inbox/${t.id}`,
        icon: "inbox",
        tone: "warn",
        action: "Open in Inbox",
      });
    }
    if (t.veto && t.veto.endsAtMs > now) {
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
    if (!c.missed || c.live || typeof c.startedAtMs !== "number") continue;
    if (now - c.startedAtMs > DAY_MS) continue;
    items.push({
      key: `call:${c.callId}`,
      kind: "missed_call",
      at: c.startedAtMs,
      title: `Missed call · ${c.who}`,
      message: c.number ? `${c.number} — the call never connected.` : "The call never connected.",
      to: `conversations/${c.cvId}`,
      icon: "phone",
      tone: "warn",
      action: "See the call",
    });
  }

  for (const i of input.invites ?? []) {
    const at = Date.parse(i.created_at);
    items.push({
      key: `invite:${i.id}`,
      kind: "invite",
      at: Number.isNaN(at) ? now : at,
      title: `Invitation pending · ${i.email}`,
      message: "They have not accepted yet.",
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
  "job_failed" | "broadcast_sent" | "broadcast_stopped" | "handoff"
>;

/**
 * One alert from a job: what it IS, where its button goes, and the words.
 * The verb that raises it decides `kind` and `route`; the sender never
 * re-derives either (the rule waba-events.ts already follows). How it then
 * reads is SERVER_LOOK's, and how it groups is today.ts AWAY_NOUN's.
 */
export interface JobNews {
  kind: JobNewsKind;
  /** A hash route without the leading "#/". */
  route: string;
  subject: string;
  body: string;
  /** What it is about, when it is one thing. */
  about?: { type: string; id: string } | null;
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
}

/** What `GET /api/v1/notifications` returns: the month's rows and this person's "seen everything" moment. */
export interface NotificationsDto {
  notifications: NotificationDto[];
  seen_at: string | null;
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
  broadcast_send: { stopped: "A broadcast stopped partway", to: "broadcasts" },
  line_provision: { stopped: "Setting up a phone line stopped", to: "admin/integrations" },
  email_ingest: { stopped: "An email could not be taken in", to: "inbox" },
  lead_round_start: { stopped: "A search could not start", to: "clients/leads" },
  lead_collect: { stopped: "A search stopped partway", to: "clients/leads" },
  lead_check: { stopped: "Checking a search's emails stopped", to: "clients/leads" },
  push_send: { stopped: "An alert to your phone was not sent", to: "admin/notifications" },
  push_receipts: { stopped: "Checking that your phone was told did not finish", to: "admin/notifications" },
};

/** A job this runner has no words for: said as what it is, on the page that says what happened today. */
const JOB_WORK_OTHER = { stopped: "Something in the background did not finish", to: "today" };

/**
 * A job's news: its title, the one line under it, and its door. The job's id and kind are for whoever reads the
 * email to the end, so the runner keeps them as the body's last line, never its first (the bell shows the first).
 */
export function jobNewsWords(jobKind: string, end: JobEnd, attempts = 1): { title: string; lead: string; to: string } {
  const w = (JOB_WORK as Record<string, typeof JOB_WORK_OTHER>)[jobKind] ?? JOB_WORK_OTHER;
  const lead =
    end === "unfinished"
      ? jobKind === "outbound_send"
        ? "It started and never reported back, so it may or may not have reached the customer. Check the conversation before sending it again."
        : "It started and never reported back, so how it ended is unknown."
      : end === "unknown_kind"
        ? "Nothing ran: this is work the app does not know how to do."
        : `It stopped${attempts > 1 ? ` after ${attempts} tries` : ""} and will not start again on its own.`;
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
  const w = jobNewsWords(m[1], OLD_JOB_END[m[2]], tries ? Number(tries[1]) : 1);
  // The old rows all said "inbox", whatever the job was; a row that named another page keeps it.
  return { title: w.title, message: w.lead, route: n.route && n.route !== "inbox" ? n.route : w.to };
}

/**
 * How a kept kind reads. `own` keeps the kind's verb over the route's: a question asks for an answer, and "Open
 * Leads" would say where it is without saying what it wants.
 */
const SERVER_LOOK: Record<string, { icon: string; tone: "" | "ok" | "warn"; action: string; to: string; own?: true }> =
  {
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
    template_ready: { icon: "check", tone: "ok", action: "Open Templates", to: "messages" },
    template_blocked: { icon: "alert", tone: "warn", action: "Open Templates", to: "messages" },
    sweep: { icon: "alert", tone: "warn", action: "Open Connections", to: "admin/integrations" },
    /** A JOB that did not finish, and nothing else. See JobNewsKind. */
    job_failed: { icon: "alert", tone: "warn", action: "Open the Inbox", to: "inbox" },
    /** A broadcast that ran to completion: good news, on the page it happened on. */
    broadcast_sent: { icon: "check", tone: "ok", action: "Open Broadcasts", to: "broadcasts" },
    /** A broadcast that did not go out, or stopped partway. */
    broadcast_stopped: { icon: "alert", tone: "warn", action: "Open Broadcasts", to: "broadcasts" },
    playbook: { icon: "bolt", tone: "ok", action: "Open Playbooks", to: "outbound" },
    calendar_people: { icon: "users", tone: "ok", action: "Open People", to: "clients" },
    /** A search that finished: good news, on the page the leads are on. */
    leads_ready: { icon: "users", tone: "ok", action: "Open Leads", to: "clients/leads" },
    /** A round that stopped to ask. It waits a day and then ends, so it is a warning. */
    leads_question: { icon: "alert", tone: "warn", action: "Answer it", to: "clients/leads", own: true },
    /** A review on Google: good news with somewhere to read it. */
    review: { icon: "star", tone: "ok", action: "Open Reports", to: "reports" },
    /** The subscription: a trial starting or ending, a card declined, the receptionist paused or back. */
    billing: { icon: "money", tone: "warn", action: "Open Billing", to: "admin/billing" },
    /** A note a teammate left for you on a person (0007): its row names them and opens their page, where the note is. */
    note_for_you: { icon: "edit", tone: "", action: "Open their page", to: "clients" },
    alert: { icon: "bell", tone: "", action: "Open Today", to: "today" },
  };

/** The verb for a row that names its own route; the kind's verb otherwise. */
const ROUTE_VERBS: Array<[RegExp, string]> = [
  // Setup is the first run now (#/start); a row written before then still says admin/setup, and lands there too.
  [/^admin\/setup/, FINISH_SETTING_UP],
  [/^start/, FINISH_SETTING_UP],
  [/^admin\/integrations/, "Open Connections"],
  [/^admin\/workspace/, "Open Business"],
  [/^admin\/notifications/, "Open Notifications"],
  [/^admin\/billing/, "Open Billing"],
  [/^inbox/, "Open the Inbox"],
  [/^conversations\/phone/, "Open the calls"],
  [/^live/, "Open Live"],
  [/^outbound/, "Open Playbooks"],
  [/^broadcasts/, "Open Broadcasts"],
  // The route is still `messages`; the page is Templates (#658), and the door says the page's name.
  [/^messages/, "Open Templates"],
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

/**
 * A DERIVED "needs you" row's key: this prefix plus the thread's own id, which
 * for a real workspace is "th-" plus the conversation's. So the conversation a
 * derived row is about is its key with this prefix taken off — the only handle
 * such a row has, because it carries no `about` (nothing wrote it down; it is
 * computed from the Inbox the browser is already holding).
 */
export const NEEDS_KEY_PREFIX = "needs:th-";

/** The conversation a derived "needs you" row stands for, or null. */
export function conversationOfNeedsKey(key: string): string | null {
  return key.startsWith(NEEDS_KEY_PREFIX) ? key.slice(NEEDS_KEY_PREFIX.length) : null;
}

/** A derived missed-call row's key: this prefix plus the call's id (buildNotificationFeed). */
export const CALL_KEY_PREFIX = "call:";

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
      const look = SERVER_LOOK[n.kind] ?? SERVER_LOOK.alert;
      const at = Date.parse(n.created_at);
      const job = jobRowWords(n);
      const route = job ? job.route : n.route;
      return {
        key: `${SERVER_KEY_PREFIX}${n.id}`,
        kind: (SERVER_NOTIFICATION_KINDS as readonly string[]).includes(n.kind)
          ? (n.kind as NotificationKind)
          : "alert",
        at,
        title: job ? job.title : n.title,
        message: job ? job.message : firstLine(n.body),
        to: route ?? look.to,
        icon: look.icon,
        tone: look.tone,
        action: look.own ? look.action : (verbForRoute(route) ?? look.action),
        unread: at > seen && !n.read,
        about: n.subject_type && n.subject_id ? { type: n.subject_type, id: n.subject_id } : null,
      };
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
  return rows.filter(
    (r) => !(r.key.startsWith(SERVER_KEY_PREFIX) && r.about?.type === "conversation" && covered.has(r.about.id)),
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
