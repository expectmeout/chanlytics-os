import { agoShort as spanAgo, MIN_MS } from "../shared/time.js";
import { callAttemptWords } from "../conversations/call-dto.js";
import { replyWaitsOnYou } from "../conversations/standing.js";
import { missedCallIsNews } from "../voice/live.js";
import { FINISH_SETTING_UP } from "../setup/first-run-route.js";
import { lensRoute } from "../reports/lenses.js";
import { firstLine } from "./push.js";
import { RUN_OPEN_WORDS } from "../shell/campaign-rooms.js";
import { invitationExpired } from "../shell/identity.js";
import { noticeTone } from "../waits/notice-tones.js";
import { SEQUENCES_ROUTE } from "../sequences/sequence-address.js";
import { MESSAGES_ROUTE } from "../shell/address.js";
export function bellCalls(live) {
  const seen = /* @__PURE__ */ new Set();
  const out = [];
  for (const c of [...live?.now ?? [], ...live?.missedCalls ?? [], ...live?.recent ?? []]) {
    if (seen.has(c.callId)) continue;
    seen.add(c.callId);
    out.push(c);
  }
  return out;
}
export function buildNotificationFeed(input) {
  const { now } = input;
  const items = [];
  for (const t of input.threads ?? []) {
    if (!t.real) continue;
    if (t.needsYou) {
      const at = t.escalatedAtMs ?? (typeof t.waitingMin === "number" ? now - t.waitingMin * MIN_MS : t.lastAtMs ?? now);
      items.push({
        key: `needs:${t.id}`,
        kind: "needs_you",
        at,
        title: `${t.who} needs you`,
        // The customer's own words (the thread's `ask`), never the thread's last message: that was the
        // receptionist's holding reply on every handoff, quoted as if the customer had written it.
        message: t.ask ? `${t.ask.label}: ${t.ask.quoted ? `\u201C${t.ask.text}\u201D` : t.ask.text}` : "Flagged for a person.",
        to: `inbox/${t.id}`,
        icon: "inbox",
        tone: "warn",
        action: "Open in Inbox"
      });
    }
    if (t.veto && replyWaitsOnYou({ endsAtMs: t.veto.endsAtMs }, now)) {
      const held = t.veto.why?.heldFor === "low_confidence" ? "Not sure enough to send alone" : "Waiting in the hold window";
      items.push({
        key: `draft:${t.veto.messageId}`,
        kind: "held_draft",
        at: t.veto.endsAtMs - t.veto.window * 1e3,
        title: `A reply to ${t.who} is waiting for you`,
        message: `${held} \xB7 \u201C${t.veto.draft.slice(0, 90)}${t.veto.draft.length > 90 ? "\u2026" : ""}\u201D`,
        to: `inbox/${t.id}`,
        icon: "clock",
        tone: "",
        action: "Review"
      });
    }
  }
  for (const c of input.calls ?? []) {
    if (!missedCallIsNews(c, now)) continue;
    items.push({
      key: `${MISSED_KEY_PREFIX}${c.callId}`,
      kind: "missed_call",
      at: c.startedAtMs,
      title: `${callAttemptWords(c.direction)} \xB7 ${c.who}`,
      message: c.number ? `${c.number} \u2014 the call never connected.` : "The call never connected.",
      to: `conversations/${c.cvId}`,
      icon: "phone",
      tone: "warn",
      action: "See the call"
    });
  }
  for (const i of input.invites ?? []) {
    const at = Date.parse(i.created_at);
    const expired = invitationExpired({ expiresAt: i.expires_at }, now);
    items.push({
      key: `invite:${i.id}`,
      kind: "invite",
      at: Number.isNaN(at) ? now : at,
      title: `${expired ? "Invitation expired" : "Invitation pending"} \xB7 ${i.email}`,
      message: expired ? "They did not accept in time. Send it again from Team." : "They have not accepted yet.",
      // Invitations live on the Team pane since Team split from Workspace;
      // the row's own button says "Team", so its door must open Team.
      to: "admin/team",
      icon: "users",
      tone: "",
      action: "Team"
    });
  }
  return items.sort((a, b) => b.at - a.at);
}
export const EMPTY_READ_STATE = { seenAt: 0, read: [], dismissed: [], alerts: false };
export function applyReadState(items, state) {
  const read = new Set(state.read);
  const gone = new Set(state.dismissed);
  return items.filter((i) => !gone.has(i.key)).map((i) => ({ ...i, unread: i.at > state.seenAt && !read.has(i.key) }));
}
export function unreadCount(rows) {
  return rows.filter((r) => r.unread).length;
}
export const agoLabel = (atMs, now) => spanAgo(atMs, now);
export const ALERT_KINDS = ["needs_you", "held_draft", "missed_call", "leads_question"];
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
  "ask_cards"
];
export function settledRow(row) {
  return { ...row, unread: false, tone: row.tone === "warn" ? "" : row.tone };
}
const JOB_WORK = {
  outbound_send: { stopped: "A message may not have been sent", to: "inbox" },
  broadcast_send: { stopped: "A run stopped partway", to: "campaigns/sequences" },
  line_provision: { stopped: "Setting up a phone line stopped", to: "admin/integrations" },
  email_ingest: { stopped: "An email could not be taken in", to: "inbox" },
  lead_round_start: { stopped: "A search could not start", to: "clients/leads" },
  lead_collect: { stopped: "A search stopped partway", to: "clients/leads" },
  lead_check: { stopped: "Checking a search's emails stopped", to: "clients/leads" },
  push_send: { stopped: "An alert to your phone was not sent", to: "admin/notifications" },
  push_receipts: { stopped: "Checking that your phone was told did not finish", to: "admin/notifications" },
  // Read, applied or told: the job's last try did not finish one of them, and the thread is where the reply is.
  reply_read: { stopped: "A reply from a lead could not be read or told", to: "inbox" },
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
  website_read: { stopped: "Your website could not be read", to: "admin/receptionist" }
};
const JOB_WORK_OTHER = { stopped: "Something in the background did not finish", to: "today" };
export function jobNewsWords(jobKind, end, how) {
  const w = JOB_WORK[jobKind] ?? JOB_WORK_OTHER;
  const { attempts, resumed } = how;
  const tries = attempts > 1 ? ` after ${attempts} tries` : "";
  const lead = end === "unfinished" ? jobKind === "outbound_send" ? "It started and never reported back, so it may or may not have reached the customer. Check the conversation before sending it again." : `It started and never reported back, so how it ended is unknown${resumed ? ", and the rest carries on in a fresh run" : ""}.` : end === "unknown_kind" ? "Nothing ran: this is work the app does not know how to do." : resumed === null ? `It stopped${tries}, and whether it carries on in a fresh run could not be checked.` : `It stopped${tries} and ${resumed ? "carries on in a fresh run" : "will not start again on its own"}.`;
  return { title: w.stopped, lead, to: w.to };
}
const OLD_JOB_TITLE = /^A ([a-z_]+) job (failed|did not finish|could not run)$/;
const OLD_JOB_END = {
  failed: "failed",
  "did not finish": "unfinished",
  "could not run": "unknown_kind"
};
function jobRowWords(n) {
  if (n.kind !== "job_failed") return null;
  const m = OLD_JOB_TITLE.exec(n.title.trim());
  if (!m) return null;
  const tries = /after (\d+) tries/.exec(n.body);
  const w = jobNewsWords(m[1], OLD_JOB_END[m[2]], { attempts: tries ? Number(tries[1]) : 1, resumed: false });
  return { title: w.title, message: w.lead, route: n.route && n.route !== "inbox" ? n.route : w.to };
}
export const REACH_OUT_DAY_ROUTE = SEQUENCES_ROUTE;
const ALERT_LOOK = { icon: "bell", tone: "", action: "Open Today", to: "today" };
const SERVER_LOOK = {
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
  alert: ALERT_LOOK
};
function lookOf(kind) {
  return kind && Object.hasOwn(SERVER_LOOK, kind) ? SERVER_LOOK[kind] ?? null : null;
}
export function kindListDoor(kind) {
  const look = lookOf(kind);
  if (!look) return null;
  return { to: look.to, action: look.own ? look.action : verbForRoute(look.to) ?? look.action };
}
export function noticeRoute(kind, route) {
  return route || (lookOf(kind) ?? ALERT_LOOK).to;
}
const ROUTE_VERBS = [
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
  [/^today/, "Open Today"]
];
export function verbForRoute(route) {
  if (!route) return null;
  const hit = ROUTE_VERBS.find(([re]) => re.test(route));
  return hit ? hit[1] : null;
}
export const SERVER_KEY_PREFIX = "n:";
const MISSED_KEY_PREFIX = "call:";
const NEEDS_KEY_PREFIX = "needs:th-";
export function conversationOfNeedsKey(key) {
  return key.startsWith(NEEDS_KEY_PREFIX) ? key.slice(NEEDS_KEY_PREFIX.length) : null;
}
const THREAD_DOOR = /^inbox\/th-([0-9a-f-]{36})$/;
const PERSON_DOOR = /^clients\/([0-9a-f-]{36})$/;
export function noteWhose(row) {
  if (row.about?.type === "conversation") return { conversationId: row.about.id };
  if (row.about?.type === "contact") return { personId: row.about.id };
  const thread = THREAD_DOOR.exec(row.to);
  if (thread?.[1]) return { conversationId: thread[1] };
  const person = PERSON_DOOR.exec(row.to);
  return person?.[1] ? { personId: person[1] } : null;
}
const CALL_KEY_PREFIX = "call:";
export function callOfKey(key) {
  return key.startsWith(CALL_KEY_PREFIX) ? key.slice(CALL_KEY_PREFIX.length) : null;
}
export function serverNotificationRows(dto) {
  if (!dto) return [];
  const seen = dto.seen_at ? Date.parse(dto.seen_at) : 0;
  return dto.notifications.filter((n) => !n.dismissed).map((n) => {
    const look = lookOf(n.kind) ?? ALERT_LOOK;
    const tone = noticeTone(n.kind, n.title);
    const at = Date.parse(n.created_at);
    const job = jobRowWords(n);
    const route = job ? job.route : n.kind === "reach_out_day" ? REACH_OUT_DAY_ROUTE : n.route;
    const row = {
      key: `${SERVER_KEY_PREFIX}${n.id}`,
      kind: SERVER_NOTIFICATION_KINDS.includes(n.kind) ? n.kind : "alert",
      at,
      title: job ? job.title : n.title,
      message: job ? job.message : firstLine(n.body),
      to: noticeRoute(n.kind, route),
      icon: tone === "ok" ? "check" : look.icon,
      tone: tone ?? look.tone,
      action: look.own ? look.action : verbForRoute(route) ?? look.action,
      unread: at > seen && !n.read,
      about: n.subject_type && n.subject_id ? { type: n.subject_type, id: n.subject_id } : null
    };
    return n.closed_at ? settledRow(row) : row;
  });
}
export function dedupeFeed(rows) {
  const covered = new Set(
    rows.flatMap((r) => r.kind === "needs_you" ? [conversationOfNeedsKey(r.key)] : []).filter((id) => !!id)
  );
  const keptCalls = new Set(
    rows.flatMap((r) => r.key.startsWith(SERVER_KEY_PREFIX) && r.about?.type === "call" ? [r.about.id] : [])
  );
  return rows.filter(
    (r) => !(r.key.startsWith(SERVER_KEY_PREFIX) && r.about?.type === "conversation" && covered.has(r.about.id)) && !(r.kind === "missed_call" && keptCalls.has(r.key.slice(MISSED_KEY_PREFIX.length)))
  );
}
const NUMBER_IN_WORDS = /\+\d{8,15}\b|(?:\+\d{1,3}\s?)?\(\d{3}\)\s?\d{3}[-.\s]\d{4}\b|(?:\+\d{1,3}\s)?\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/;
export function nameKnownCustomers(rows, threads, calls) {
  const named = (who) => who && !/\d{4}/.test(who) ? who.trim() : null;
  const byConversation = /* @__PURE__ */ new Map();
  for (const t of threads ?? []) {
    const who = named(t.who);
    if (who && t.id.startsWith("th-")) byConversation.set(t.id.slice(3), who);
  }
  const byCall = /* @__PURE__ */ new Map();
  for (const c of calls ?? []) {
    const who = named(c.who);
    if (who) byCall.set(c.callId, who);
  }
  return rows.map((r) => {
    if (!r.about || !NUMBER_IN_WORDS.test(r.title)) return r;
    const who = r.about.type === "conversation" ? byConversation.get(r.about.id) : r.about.type === "call" ? byCall.get(r.about.id) : void 0;
    return who ? { ...r, title: r.title.replace(NUMBER_IN_WORDS, who) } : r;
  });
}
