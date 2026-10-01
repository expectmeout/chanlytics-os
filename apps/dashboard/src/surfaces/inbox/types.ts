/**
 * What the Inbox and Conversations draw, typed (decision 0015, step 3).
 *
 * A thread is one of two things and the page always told them apart by `real`: a real one is contracts'
 * `InboxThreadVM` (a conversation and its escalation, mapped by the bridge), and a seeded one is the mockup's, which a
 * demo session draws with its approvals, verdicts and countdowns. The two are unions of one shape here, each naming the
 * other's fields as absent, so a field either draws is read off the thread as it always was, and the page narrows by
 * `t.real` where it must.
 */
import type { CallVM, InboxThreadVM, MediaVM, ReplyWhyVM } from "@chanlytics/contracts";

/** The states a seeded thread is in; a real thread is only ever escalated, snoozed or done. */
export type ThreadState = "needs" | "watching" | "drafts" | "escalated" | "snoozed" | "done";

/** The agent that answers: by name and glyph, and for a seeded thread what it may do and how it speaks. */
interface ThreadAgent {
  name: string;
  glyph: string;
  autonomy?: string;
  tone?: string;
}

/** One fact under a seeded thread's header; `to` makes it a door. */
export interface ContextFact {
  label: string;
  value: string;
  warn?: boolean;
  info?: boolean;
  to?: string;
}

export interface Evidence {
  kind: string;
  label: string;
  detail: string;
  to?: string;
}

export interface Alternative {
  label: string;
  why: string;
}

export interface NextStep {
  label: string;
  auto: boolean;
  hint?: string;
}

interface PlanParamOption {
  label: string;
  reply: string;
}

export interface Plan {
  label: string;
  oneLine: string;
  dollarDelta: number;
  ltv: number;
  confidence?: number;
  cta?: string;
  param?: { label: string; options: PlanParamOption[] };
}

/** A seeded approval card: the agent's plan, and why. */
export interface Approval {
  kind: string;
  policyClass?: string;
  summary: string;
  recommended: string;
  plan: Plan;
  fallback?: string;
  suggestedReply?: string;
  evidence?: Evidence[];
  alternatives?: Alternative[];
  nextSteps?: NextStep[];
}

export interface VerdictOption {
  verb: "deal" | "client" | "interested";
  label: string;
  sub: string;
  icon: string;
}

/** A seeded post-meeting verdict: the one human call, in a closed set. */
export interface Verdict {
  leadId: string;
  est: number;
  apptId?: string;
  options: VerdictOption[];
}

/** What a session decision left on a seeded thread. */
export interface Resolution {
  action: string;
  at: string;
  declined?: boolean;
  param?: string | null;
}

/** A draft counting down: a real thread's is the server's deadline, a seeded one's a window in seconds. */
export interface Veto {
  window: number;
  draft: string;
  endsAtMs?: number;
  messageId?: string;
  policyClass?: string;
  why?: ReplyWhyVM;
}

/** A message the thread draws: a real one may carry an attachment, its reasoning and what became of it. */
export interface MsgEntry {
  type: "msg";
  from: "client" | "agent";
  channel: string;
  at: string;
  body: string;
  subject?: string;
  quoted?: string;
  leftOut?: string;
  media?: MediaVM;
  why?: ReplyWhyVM;
  byYou?: boolean;
  byWords?: string;
  via?: { kind: "broadcast" | "playbook"; name: string };
  status?: string;
  statusLabel?: string;
  reachedCustomer?: boolean;
  messageId?: string;
  pending?: true;
  sendsAtMs?: number;
  agentName?: string;
  agentGlyph?: string;
}

/** Something that happened on the thread, not said in it. */
export interface EventEntry {
  type: "event";
  kind: string;
  at: string;
  body: string;
}

/** A seeded agent's reasoning, thinking or deciding. */
export interface AgentEntry {
  type: "agent-thinking" | "agent-decision";
  at: string;
  agent: string;
  body: string;
}

export type TimelineEntry = MsgEntry | EventEntry | AgentEntry;

/** The customer's own words beside a decision (contracts' `InboxThreadVM.ask`). */
export type ThreadAsk = NonNullable<InboxThreadVM["ask"]>;

/** What both kinds of thread carry, the fields the page reads off either. */
interface ThreadBase {
  id: string;
  who: string;
  whoMeta: string;
  avatar: string;
  clientId?: string | null;
  channels: string[];
  primaryChannel: string;
  subject: string;
  preview: string;
  summary: string;
  lastAt: string;
  lastAtFull: string;
  unread: boolean;
  pinned: boolean;
  value?: number;
  tags: string[];
  confidence?: number;
  priority: "P1" | "P2" | "P3";
  waitingMin?: number;
  waited?: string;
  wake?: string;
  timeline: TimelineEntry[];
  agent: ThreadAgent;
  resolution?: Resolution;
  takenOver?: boolean;
  veto?: Veto;
}

/** A thread of a real workspace: contracts' view model, with what the page adds over the seeded kind absent. */
export type RealThread = Omit<InboxThreadVM, keyof ThreadBase | "state"> &
  ThreadBase & {
    real: true;
    state: "escalated" | "snoozed" | "done";
    approval?: undefined;
    verdict?: undefined;
    contextStrip?: undefined;
    leadId?: undefined;
    hasHumanContact?: undefined;
  };

/** A thread of the mockup's: what a demo session draws, and the standalone harness's seeds. */
export interface SeededThread extends ThreadBase {
  real?: false;
  state: ThreadState;
  leadId?: string;
  hasHumanContact?: boolean;
  approval?: Approval;
  verdict?: Verdict;
  contextStrip?: ContextFact[];
  /** Fields only a real thread carries, absent on this kind. */
  conversationId?: undefined;
  escalationId?: undefined;
  windowOpen?: undefined;
  optedOut?: undefined;
  offersOk?: undefined;
  proposalUrl?: undefined;
  claimedByOther?: undefined;
  assigneeUserId?: undefined;
  ask?: undefined;
  archived?: undefined;
  lastWord?: undefined;
  needsYou?: undefined;
  heldDraft?: undefined;
  hasChat?: undefined;
  phone?: undefined;
  phoneDisplay?: undefined;
  replyVia?: undefined;
  lastAtMs?: undefined;
  escalatedAtMs?: undefined;
}

export type Thread = RealThread | SeededThread;

/** A bucket the list shows: the chips over the rows. */
export interface InboxBucket {
  id: string;
  label: string;
  hint: string;
  icon: string;
  accent?: boolean;
  count?: number;
}

/** A saved view, a real predicate over the threads. */
export interface InboxView {
  id: string;
  label: string;
  icon: string;
  count: number;
}

/** One approved template, as the composer needs to know it (the templates route's row). */
export interface ApprovedTemplate {
  id: string;
  channel: string;
  name: string;
  language: string;
  body_preview: string | null;
  variables: unknown;
  /** The line under the words, as Meta holds it; null when the template has none. */
  footer?: string | null;
  /** A text heading above the words; null when there is none, or it is a picture. */
  header?: string | null;
  /** The buttons under the message, as the customer sees them. */
  buttons?: { text: string; kind: "url" | "reply" | "call" }[];
  /** Why this product cannot send it, in the owner's words; null when it can. */
  blocked?: string | null;
}

/** Every template with its status, for Settings; the composer keeps ApprovedTemplate. */
export interface TemplateDto extends ApprovedTemplate {
  category: string | null;
  meta_status: string;
  quality: string | null;
  rejected_reason: string | null;
  synced_at: string | null;
  /** meta: written in WhatsApp Manager. chanlytics: written here. */
  source?: string | null;
  /** Hidden from the composers by the workspace; Settings still lists it. */
  hidden_at?: string | null;
  /** The workspace's own words for it; null means its name, made words. */
  title?: string | null;
}

/** What the Inbox surface publishes: the seam's value for `inbox` (`INBOX_DATA` to the pages that have not moved). */
export interface InboxSurface {
  INBOX_BUCKETS: InboxBucket[];
  INBOX_VIEWS: InboxView[];
  THREADS: Thread[];
  CHANNEL_LABELS: Record<string, string>;
  INBOX_BASELINE: { doneThisWeek: number };
  /** Escalated threads that could not be read: the list says how many rather than list fewer. */
  UNREAD_ESCALATED?: number;
  /** The workspace's approved WhatsApp templates; null when the read failed, absent while it is still being read. */
  templates?: ApprovedTemplate[] | null;
}

/** One line a call's transcript says, and where it starts in the recording. */
export interface CallLine {
  t?: string;
  speaker: string;
  text: string;
  start?: number | null;
  end?: number | null;
}

/** A row of Conversations: a real chat or call (contracts' view models), or the mockup's. */
export interface ConversationRow {
  id: string;
  who: string;
  initials: string;
  clientId: string | null;
  channel: string;
  agent: { glyph: string; name: string };
  at: string;
  outcome: string;
  snippet: string;
  threadId?: string;
  duration?: string;
  summary?: { headline: string; bullets: string[]; value?: number };
  transcript?: CallLine[];
  messages?: Array<{ from: string; at: string; text: string }>;
  live?: boolean;
  approval?: boolean;
  policyClass?: string;
  ts?: number;
  real?: boolean;
  callId?: string;
  messageId?: string;
  whoShort?: string;
  answeredBy?: string | null;
  hasChat?: boolean;
  durationSec?: number | null;
  recordingState?: CallVM["recordingState"];
  direction?: "inbound" | "outbound";
  missed?: boolean;
  about?: string | null;
  facts?: string[];
}

/** A tab of the Conversations strip. */
export interface ConversationTab {
  id: string;
  label: string;
}

/** What the Conversations surface publishes: the seam's value for `conversations` (`CONVERSATIONS_DATA` to the pages that have not moved). */
export interface ConversationsSurface {
  CONVERSATIONS: ConversationRow[];
  CV_CHANNELS: ConversationTab[];
  /** False when the calls read failed: the page says so instead of listing no calls. */
  CALLS_READ?: boolean;
}

// What the view models give the rows above, said once so a change to either fails here, not in a page.
export type { CallVM, InboxThreadVM };
