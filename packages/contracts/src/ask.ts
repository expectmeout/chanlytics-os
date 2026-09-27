/**
 * Ask: the workspace assistant, as a contract.
 *
 * What lives here is everything about Ask that is pure and shared: its limits,
 * the rule that keeps a citation honest and where a row opens, the
 * cards (what each kind does is its spec, ask-proposals.ts), the Line's jump index and suggestions, and the three
 * questions answered without a model. The answer itself -- its shape, the
 * format the model writes it in and how it is read back -- is ask-answer.ts's.
 * The route that runs the model lives in the dashboard; the Line that shows
 * the answer lives in the legacy pages; both read from here.
 */
import type { SchemaSet } from "./schema-sets";
import { z } from "zod";
import type { AskAnswer } from "./ask-answer";
import { dayPlusInZone } from "./availability";
import { parseLeadsRoute } from "./lead-plan";
import { parsePipelineRoute } from "./pipeline";

/* ------------------------------------------------------------------ limits */

/** One question, in characters. Longer than this is a document, not a question. */
export const ASK_MAX_CHARS = 1000;
/** Tool rounds per turn: reads, then the answer. The last round is forced to finish. */
export const ASK_MAX_ROUNDS = 4;
/** End to end, under the route's sixty-second ceiling. */
export const ASK_TURN_BUDGET_MS = 45_000;
/**
 * The most one round may write: its thinking, its tool calls and its answer
 * together. One number, read by the loop's request and by the edge's clamp on
 * Ask, so the two cannot drift again: the loop asked for 2400 while the edge
 * clamped every request to 2000, so 2000 was the ceiling a round really had.
 * Raised only when an eval case stops at it (the Line's spec, 7.8).
 */
export const ASK_MAX_TOKENS = 2000;
/**
 * Ask's own daily token budget per workspace, apart from the receptionist's.
 * Counted on uncached input plus output. With the page's context riding into
 * every round behind its own cache breakpoint (a cache read is not counted),
 * a turn costs two to eight thousand such tokens; a busy owner
 * asking sixty questions stays well under this, and an eval run of the whole
 * case set fits several times over. The first cap (400k) was spent by a day
 * of eval runs and refused the palette until the window rolled.
 */
export const ASK_TOKENS_DAY = 1_500_000;
/** Ask threads are purged after this many days; they quote customers. */
export const ASK_RETENTION_DAYS = 90;
/** How much of the workspace one read may return. The words stay the pages' words. */
export const ASK_CAPS = {
  threads: 20,
  messages: 30,
  messagesMore: 80,
  calls: 20,
  transcript: 40,
  people: 12,
  citations: 6,
  followups: 3,
  needsRows: 10,
} as const;

/* ------------------------------------------------------------- the answer */

export const ASK_CITATION_KINDS = ["thread", "conversation", "call", "person", "page"] as const;
export type AskCitationKind = (typeof ASK_CITATION_KINDS)[number];

export interface AskCitation {
  kind: AskCitationKind;
  /** A conversation, call or contact id; for a page, its route. */
  id: string;
  label: string;
}

export const ASK_LANGUAGES = ["en", "es", "other"] as const;
export type AskLanguage = (typeof ASK_LANGUAGES)[number];

/**
 * Tag-shaped junk out of an answer.
 *
 * Once in thirty turns the model wrote the finish call's next field inside
 * the answer string: "…mid-call.</answer>\n<parameter name=\"citations\">[…]".
 * The person saw a closing tag and a raw id. The answer ends where such a
 * tag begins; a leading <answer> is dropped; stray tags in the middle go.
 */
const TAG_CUT = /<\/answer>|<\/?parameter\b|<\/?invoke\b|<\/?function_calls\b|<\/?tool_call\b/i;
export function cleanAnswer(raw: string): string {
  let s = raw.replace(/^\s*<answer>\s*/i, "");
  const cut = s.search(TAG_CUT);
  if (cut >= 0) s = s.slice(0, cut);
  return s
    .replace(/<\/?[a-z_]+(\s[^>]*)?>/gi, "")
    .replace(/\s+$/g, "")
    .trim();
}

/* --------------------------------------------------------------- grounding */

/** What the tools returned this turn, by kind: the only rows a citation may name. */
export type AskReadSet = Record<Exclude<AskCitationKind, "page">, Set<string>>;

export function emptyReadSet(): AskReadSet {
  return { thread: new Set(), conversation: new Set(), call: new Set(), person: new Set() };
}

/** The pages a citation or a navigate target may point at without a read. */
export const ASK_PAGE_ROUTES = [
  "today",
  "inbox",
  "clients",
  "clients/leads",
  "segments",
  "conversations",
  "live",
  "calendar",
  "outbound",
  "broadcasts",
  "messages",
  "reports",
  "start",
  "admin/workspace",
  "admin/team",
  "admin/autonomy",
  "admin/notifications",
  "admin/integrations",
  "admin/billing",
  "admin/activity",
  "admin/profile",
] as const;

const PAGE_PREFIX =
  /^(today|inbox|clients|segments|conversations|live|calendar|outbound|broadcasts|messages|reports|start|admin)(\/[A-Za-z0-9:_-]+)?$/;

/**
 * Drop every citation that names a row the tools did not return this turn.
 * A model that read nothing cannot cite anything; a model that read the
 * Inbox can cite only the threads it saw. Pages are always allowed, because
 * a page is not a claim.
 */
export function groundCitations(citations: AskCitation[], read: AskReadSet): { kept: AskCitation[]; dropped: number } {
  const kept: AskCitation[] = [];
  let dropped = 0;
  const seen = new Set<string>();
  for (const c of citations) {
    const ok = c.kind === "page" ? PAGE_PREFIX.test(c.id) : read[c.kind].has(c.id);
    const key = `${c.kind}:${c.id}`;
    if (!ok || seen.has(key)) {
      dropped++;
      continue;
    }
    seen.add(key);
    kept.push(c);
  }
  return { kept, dropped };
}

/** Where a citation opens. The same routes the pages use for the same rows. */
export function citationRoute(c: AskCitation): string {
  switch (c.kind) {
    case "thread":
      return `inbox/th-${c.id}`;
    case "conversation":
      return `conversations/${c.id}`;
    case "call":
      return `conversations/cv-${c.id}`;
    case "person":
      return `clients/${c.id}`;
    default:
      return c.id;
  }
}

/**
 * An answer that states a figure without having read anything is not from
 * the workspace. Times, counts and money all carry digits; a turn with no
 * read tool behind such an answer is marked so the palette can say so.
 */
export function isUngrounded(answer: string, reads: number): boolean {
  return reads === 0 && /\d/.test(answer);
}

/* ------------------------------------------------------------ the message */

export type AskRole = SchemaSet<"ask_messages.role">;

/**
 * The Inbox verbs the assistant may propose on a thread. One list, read by
 * the proposer on the server and the committer in the browser, so a verb
 * cannot be proposable in one and unknown to the other.
 */
export const ASK_THREAD_VERBS = ["take_over", "hand_back", "snooze", "wake", "archive", "resolve"] as const;
export type AskThreadVerb = (typeof ASK_THREAD_VERBS)[number];

/** A proposal the model made; a card the person may approve. Executed by the client through the verbs. */
export interface AskProposal {
  id: string;
  kind:
    | "reply"
    | "steer"
    | "thread_verb"
    | "person_mode"
    | "policy"
    | "settings"
    | "whisper"
    | "invite"
    | "broadcast"
    | "playbook"
    | "lead_search"
    | "deal";
  /** The lowest role that may commit it, its spec's (ask-proposals.ts); the route re-checks on Approve. */
  needs: "operator" | "partner" | "owner";
  title: string;
  /** The exact change, in the person's words. */
  summary: string;
  payload: Record<string, unknown>;
  /** What undo looks like, when the verb has one. */
  undo: string | null;
  /**
   * What a deal's card writes after the deal (0007, amended): its next step, a note of the team's with its day.
   * Beside the payload, never in it: a tab from before the step hands its payload to the deal route whole, and the
   * route refuses a key it does not know, so such a tab records the deal and leaves the step.
   */
  step?: { body: string; due_on: string } | null;
  /** Set once the person acted on the card. */
  outcome?: AskProposalOutcome | null;
}

/** What became of a card, kept with the turn that proposed it. */
export interface AskProposalOutcome {
  state: "done" | "dismissed" | "failed" | "undone";
  /** One line: "Sent to Rosa", "Closed on Friday". */
  receipt: string;
  atMs: number;
  /** What Undo needs, when the verb has one: an id, a previous value. */
  undo?: Record<string, unknown> | null;
}

/**
 * How long a committed card's undo stays open, for every verb whose route sets no window of its own. What each kind
 * does -- its route, its receipt, its undo and the gate before Approve (PROPOSAL_GATE, askUndoOpen) -- is its spec's,
 * ask-proposals.ts.
 */
export const ASK_UNDO_MS = 10 * 60_000;

export const AskProposalOutcomeSchema = z.object({
  state: z.enum(["done", "dismissed", "failed", "undone"]),
  receipt: z.string().max(300).catch(""),
  atMs: z.number().catch(0),
  undo: z.record(z.string(), z.unknown()).nullable().optional(),
});

export interface AskMessageVM {
  id: string;
  role: AskRole;
  text: string;
  at: string;
  atMs: number;
  citations: Array<AskCitation & { to: string }>;
  followups: string[];
  navigate: { to: string; label: string; now?: boolean } | null;
  proposals: AskProposal[];
  language: AskLanguage;
  /** A figure with no read behind it. */
  ungrounded: boolean;
  /** The tools this turn ran, in order. */
  tools: string[];
  latencyMs: number | null;
  /** Model rounds the turn took; one means the page's context was enough. */
  rounds?: number | null;
  /** Set on a turn that could not be answered; the text says why. */
  failed: boolean;
  /** The answer as the Line draws it: set by the server from plan 3; absent on every answer made before (answerFromV1). */
  answer?: AskAnswer | null;
}

export interface AskThreadVM {
  id: string;
  title: string;
  lastAtMs: number;
  scope: AskScope | null;
}

/**
 * The kinds a scope may have: the five a citation may name, and the rows a page opens that no citation names until
 * Phase 4 -- a lead or a search on Leads, a broadcast's run. A scope is what the person was looking at, a fact about
 * the turn; a citation is a claim about a row read, and its kinds build the answer's grammar (ask-answer.ts).
 */
export const ASK_SCOPE_KINDS = ["thread", "conversation", "call", "person", "page", "lead", "search", "run"] as const;
export type AskScopeKind = (typeof ASK_SCOPE_KINDS)[number];

/** What the person was looking at when they asked. Carried into the turn as a fact. */
export interface AskScope {
  kind: AskScopeKind;
  id: string;
  label: string;
}

const UUID = /^[0-9a-f-]{36}$/;

/**
 * The scope a route implies, when it names a row: every address a page opens a row at. Conversations writes
 * `<tab>:<id>` as a row opens (pages/conversations.jsx cvRoute), Live `live/<callId>`, a run `broadcasts/run:<id>`;
 * the Leads and Pipeline peeks are read by their own pages' parsers (lead-plan.ts, pipeline.ts), never a second one.
 */
export function scopeFromRoute(page: string, param: string | null | undefined, label?: string | null): AskScope | null {
  if (!param) return null;
  if (page === "inbox" && param.startsWith("th-"))
    return { kind: "thread", id: param.slice(3), label: label || "this thread" };
  if (page === "conversations") {
    // A row on its tab, or a row alone (on All): the row is after the tab's colon.
    const row = param.includes(":") ? param.slice(param.indexOf(":") + 1) : param;
    if (row.startsWith("cv-")) return { kind: "call", id: row.slice(3), label: label || "this call" };
    if (UUID.test(row)) return { kind: "conversation", id: row, label: label || "this conversation" };
    return null;
  }
  if (page === "live" && UUID.test(param)) return { kind: "call", id: param, label: label || "this call" };
  if (page === "broadcasts" && param.startsWith("run:") && UUID.test(param.slice(4)))
    return { kind: "run", id: param.slice(4), label: label || "this run" };
  if (page === "clients") {
    const leads = parseLeadsRoute(`clients/${param}`);
    if (leads) {
      if (leads.peek) return { kind: "lead", id: leads.peek, label: label || "this lead" };
      if (leads.searchId) return { kind: "search", id: leads.searchId, label: label || "this search" };
      return null;
    }
    const pipeline = parsePipelineRoute(`clients/${param}`);
    if (pipeline) return pipeline.peek ? { kind: "person", id: pipeline.peek, label: label || "this person" } : null;
    if (UUID.test(param)) return { kind: "person", id: param, label: label || "this person" };
  }
  return null;
}

/* ------------------------------------------------------------- language */

const ES_HINT =
  /[áéíóúñ¿¡]|\b(qué|que|quién|quien|cómo|como|cuándo|cuando|dónde|donde|hoy|mañana|hola|gracias|abierto|libre|cita|cliente|llam[oó]|llamaron|necesita|espera|por favor|el|la|los|las|una?|est[aá]n?)\b/i;
const EN_HINT =
  /\b(what|who|when|where|how|did|does|is|are|open|today|tomorrow|call|called|needs|waiting|the|a|an|please|tell)\b/i;

/** A light guess at the language of a question; the model settles it. */
export function detectLanguage(text: string): AskLanguage {
  const es = (text.match(ES_HINT) || []).length;
  const en = (text.match(EN_HINT) || []).length;
  if (!es && !en) return "other";
  return es > en ? "es" : "en";
}

/* ------------------------------------------------------------------- jump */

export interface JumpEntry {
  label: string;
  to: string;
  kind: "page" | "person" | "thread" | "call";
  sub?: string;
  /**
   * Other words that find this page. A page is not always called what someone
   * types: Templates was "Messages" until the word came to mean three things,
   * and a person who learned it then still types it. Matched after the label,
   * so the name a page goes by always wins.
   */
  also?: readonly string[];
}

/**
 * The pages a real workspace has. Nothing here is seeded or demo-only. The list stopped at the pages that were real
 * before the Calendar, Lists, Campaigns, Setup, Billing and Activity shipped, so ⌘K "calendar" offered only to ask
 * about it (the wiring audit's N18).
 */
export const ASK_PAGES: JumpEntry[] = [
  { label: "Today", to: "today", kind: "page" },
  { label: "Inbox", to: "inbox", kind: "page" },
  { label: "People", to: "clients", kind: "page" },
  // Leads is the other scope of People, and it is its own place to an owner: the businesses
  // a search found, worked. `leads` was the mockup's page and is not offered.
  { label: "Leads", to: "clients/leads", kind: "page", sub: "businesses Claude found for you" },
  // The lists are a view of People (its rail); `segments/<id>` still names one and lands there.
  { label: "Lists", to: "clients", kind: "page", sub: "the people you keep together, on People", also: ["segments"] },
  { label: "Conversations", to: "conversations", kind: "page" },
  { label: "Calls", to: "live", kind: "page", sub: "live and recent" },
  { label: "Calendar", to: "calendar", kind: "page", sub: "taken, open and closed times" },
  { label: "Playbooks", to: "outbound", kind: "page", sub: "campaigns that run on their own" },
  { label: "Broadcasts", to: "broadcasts", kind: "page", sub: "one message to the people who said yes" },
  {
    label: "Templates",
    to: "messages",
    kind: "page",
    sub: "the wording the receptionist and the campaigns send",
    also: ["messages", "wording"],
  },
  { label: "Reports", to: "reports", kind: "page" },
  { label: "Settings", to: "admin/workspace", kind: "page" },
  {
    label: "Setting up",
    to: "start",
    kind: "page",
    sub: "the four steps to a receptionist that answers",
    also: ["setup"],
  },
  { label: "Billing", to: "admin/billing", kind: "page" },
  { label: "Activity", to: "admin/activity", kind: "page", sub: "who did what, for owners" },
  { label: "Profile", to: "admin/profile", kind: "page", sub: "your name and how you sign in" },
  { label: "Autonomy", to: "admin/autonomy", kind: "page", sub: "what the receptionist may do alone" },
  { label: "Team", to: "admin/team", kind: "page", sub: "members and invitations" },
  { label: "Notifications", to: "admin/notifications", kind: "page" },
  { label: "Connections", to: "admin/integrations", kind: "page", sub: "WhatsApp, phone line, calendar" },
  // What the receptionist knows lives in Business details; the Memory pane says so and points here.
  {
    label: "Receptionist memory",
    to: "admin/workspace",
    kind: "page",
    sub: "hours, services and notes, in Business details",
  },
];

/**
 * Two words jump to a page, a person, a thread or a call from what the
 * browser already holds. A question mark or a long sentence is a question,
 * not a jump.
 */
export function askJump(query: string, index: JumpEntry[], limit = 6): JumpEntry[] {
  const s = query.trim().toLowerCase();
  if (s.length < 2 || s.split(/\s+/).length > 3 || /[?¿]$/.test(s)) return [];
  const out: JumpEntry[] = [];
  const seen = new Set<string>();
  const push = (e: JumpEntry) => {
    if (seen.has(e.to)) return;
    seen.add(e.to);
    out.push(e);
  };
  for (const p of index) if (p.kind === "page" && p.label.toLowerCase().startsWith(s)) push(p);
  for (const p of index) if (p.kind === "page" && p.label.toLowerCase().includes(s)) push(p);
  // Then the other words a page answers to, so a name it used to go by still finds it.
  for (const p of index) if (p.kind === "page" && (p.also ?? []).some((w) => w.toLowerCase().includes(s))) push(p);
  for (const p of index) if (p.kind !== "page" && p.label.toLowerCase().includes(s)) push(p);
  return out.slice(0, limit);
}

/* ------------------------------------------------------------ suggestions */

/**
 * The pages Ask knows it is on. The route accepts exactly these; the prompt names them. Thirteen (the Phase 2 plan,
 * D1): the Pipeline, the Calendar, the campaign pages (Playbooks, Broadcasts, Messages) and Start are pages of their
 * own, no longer People's or "other".
 */
export const ASK_SURFACES = [
  "today",
  "inbox",
  "people",
  "leads",
  "conversations",
  "live",
  "reports",
  "settings",
  "pipeline",
  "calendar",
  "campaigns",
  "start",
  "other",
] as const;
export type AskSurface = (typeof ASK_SURFACES)[number];
/**
 * The surfaces that have no chips of their own yet, and whose they are offered (the Phase 2 plan, PR 2.1): the
 * Pipeline People's, as it was when it went by People's name; the rest other's.
 */
const CHIPS_OF: Partial<Record<AskSurface, AskSurface>> = {
  pipeline: "people",
  calendar: "other",
  campaigns: "other",
  start: "other",
};

export interface AskSuggestion {
  /** The words sent, or placed in the input when `compose` is set. */
  q: string;
  kind: "ask" | "act";
  icon: string;
  /** Answered without a model. */
  fast?: boolean;
  /** What the row shows when it differs from the words. */
  label?: string;
  /** Put the words in the input for the person to finish, rather than sending them. */
  compose?: boolean;
}

export interface SuggestionInput {
  surface: AskSurface;
  language: AskLanguage;
  needsYou: number;
  heldDrafts: number;
  missedToday: number;
  liveNow: number;
  hasCalendar: boolean;
  scope?: AskScope | null;
  /** Operators and owners may act; a viewer is never offered a card. */
  canAct?: boolean;
  /** Deals are a thing here (People's surface says so): the question about proposals is offered. */
  dealsOn?: boolean;
  /** On Leads: the first day's suggestion words (each a search to propose), and the latest searches' own words. */
  leadIdeas?: string[];
  leadSearches?: string[];
}

const T = {
  en: {
    needs: "Who needs me right now?",
    held: "What is the receptionist holding for me?",
    calls: "Did anyone call while I was busy?",
    live: "What is the call on the line about?",
    openSat: "What's open Saturday?",
    openTomorrow: "What's open tomorrow?",
    week: "How did the week go?",
    said: "What did the receptionist tell {name}?",
    why: "Why was this reply held?",
    who: "Who wrote today?",
    rules: "What can the receptionist do on its own?",
    hours: "What are our hours this week?",
    brief: "Brief me on today",
    proposals: "Who has a proposal out?",
    moreLike: "Find more like: {asked}",
    actLate: "Tell {name} we're running late",
    actLateQ: "Tell {name} we're running about 15 minutes late today",
    actDraft: "Draft a reply to {name}",
    actDraftQ: "Draft a reply to {name}: ",
    actRemember: "Remember something for the receptionist",
    actRememberQ: "Remember that ",
    actClose: "Close for a day",
    actCloseQ: "Close on ",
    actHours: "Change a day's hours",
    actHoursQ: "Change Saturday's hours to ",
    actInvite: "Invite a teammate",
    actInviteQ: "Invite ",
    actOffer: "Send an offer to a list",
    actOfferQ: "Send the ",
    actPlaybook: "Start a win-back playbook",
    actPlaybookQ: "Start a win-back playbook for the quiet clients",
    actHold: "Hold every reply for my review",
    actHoldQ: "Hold every reply for my review before it sends",
  },
  es: {
    needs: "¿Quién me necesita ahora?",
    held: "¿Qué tiene retenido la recepcionista para mí?",
    calls: "¿Llamó alguien mientras estaba ocupada?",
    live: "¿De qué trata la llamada en curso?",
    openSat: "¿Qué hay libre el sábado?",
    openTomorrow: "¿Qué hay libre mañana?",
    week: "¿Cómo fue la semana?",
    said: "¿Qué le dijo la recepcionista a {name}?",
    why: "¿Por qué se retuvo esta respuesta?",
    who: "¿Quién escribió hoy?",
    rules: "¿Qué puede hacer la recepcionista sola?",
    hours: "¿Cuál es nuestro horario esta semana?",
    brief: "Resúmeme el día",
    proposals: "¿Quién tiene una propuesta pendiente?",
    moreLike: "Encuentra más como: {asked}",
    actLate: "Dile a {name} que vamos con retraso",
    actLateQ: "Dile a {name} que vamos con unos 15 minutos de retraso hoy",
    actDraft: "Redacta una respuesta a {name}",
    actDraftQ: "Redacta una respuesta a {name}: ",
    actRemember: "Recuérdale algo a la recepcionista",
    actRememberQ: "Recuerda que ",
    actClose: "Cerrar el salón un día",
    actCloseQ: "Cierra el ",
    actHours: "Cambiar el horario de un día",
    actHoursQ: "Cambia el horario del sábado a ",
    actInvite: "Invitar a alguien del equipo",
    actInviteQ: "Invita a ",
    actOffer: "Enviar una oferta a una lista",
    actOfferQ: "Envía la ",
    actPlaybook: "Iniciar un playbook de recuperación",
    actPlaybookQ: "Inicia un playbook de recuperación para los clientes inactivos",
    actHold: "Retener cada respuesta para revisarla",
    actHoldQ: "Retén cada respuesta para mi revisión antes de enviarla",
  },
} as const;

/**
 * Questions the workspace can answer today, for where the person is. Built
 * from the data, in the person's language, never from a seed; a workspace
 * with no missed call is not offered a question about missed calls.
 */
/** Words cut to fit a chip: whole up to the cap, else the first letters and an ellipsis. */
function clipWords(s: string, cap: number): string {
  const w = s.replace(/\s+/g, " ").trim();
  return w.length > cap ? `${w.slice(0, cap - 1).trimEnd()}…` : w;
}

export function buildAskSuggestions(input: SuggestionInput): AskSuggestion[] {
  const t = T[input.language === "es" ? "es" : "en"];
  // A page with no chips of its own yet is offered those it was offered before it had a name.
  const at: AskSurface = CHIPS_OF[input.surface] ?? input.surface;
  const out: AskSuggestion[] = [];
  const add = (q: string, kind: AskSuggestion["kind"], icon: string, fast = false, label?: string) => {
    if (!out.some((s) => s.q === q)) out.push({ q, kind, icon, fast, ...(label ? { label } : {}) });
  };
  const s = input.scope;
  if (s && (s.kind === "thread" || s.kind === "conversation" || s.kind === "person")) {
    add(t.said.replace("{name}", s.label), "ask", "chat");
    if (s.kind === "thread") add(t.why, "ask", "sparkle");
  }
  if (s && s.kind === "call") add(t.live, "ask", "phone");
  // On Leads the page's own chips come first: the first day's ideas, each a search to propose, or the latest
  // searches' own words to find more. The section under the field keeps three, and they must be these.
  if (input.surface === "leads") {
    const ideas = (input.leadIdeas ?? []).filter(Boolean).slice(0, 3);
    for (const w of ideas) add(w, "ask", "search");
    // A search's own words can run long; the chip shows them clipped, the question sent keeps them whole.
    if (!ideas.length)
      for (const a of (input.leadSearches ?? []).filter(Boolean).slice(0, 2))
        add(t.moreLike.replace("{asked}", a), "ask", "search", false, t.moreLike.replace("{asked}", clipWords(a, 40)));
  }
  if (input.needsYou > 0) add(t.needs, "ask", "inbox", true);
  if (input.heldDrafts > 0) add(t.held, "ask", "clock");
  if (input.liveNow > 0) add(t.live, "ask", "phone");
  if (input.missedToday > 0) add(t.calls, "ask", "phone", true);
  if (input.hasCalendar) add(input.surface === "today" ? t.openTomorrow : t.openSat, "ask", "calendar", true);
  switch (at) {
    case "today":
      add(t.brief, "ask", "sparkle");
      add(t.who, "ask", "users");
      break;
    case "inbox":
      add(t.who, "ask", "users");
      add(t.rules, "ask", "shield");
      break;
    case "people":
      add(t.who, "ask", "users");
      break;
    case "leads":
      // Its chips are above: nothing of the other pages' is added here.
      break;
    case "reports":
      add(t.week, "ask", "trending-up");
      break;
    case "settings":
      add(t.rules, "ask", "shield");
      add(t.hours, "ask", "clock");
      break;
    case "live":
    case "conversations":
      add(t.calls, "ask", "phone", input.missedToday > 0);
      break;
    default:
      break;
  }
  // Deals are a thing here (0004): who has a proposal out, where people are looked at.
  if (input.dealsOn && (at === "people" || at === "other")) add(t.proposals, "ask", "trending-up");
  if (input.needsYou === 0) add(t.needs, "ask", "inbox", true);
  add(t.week, "ask", "trending-up");
  add(t.rules, "ask", "shield");
  const asks = out.slice(0, 7);
  if (!input.canAct) return asks;
  // The Act group: each becomes a card, never an action. A scoped person gets
  // the two that name them; the rest are the settings an owner changes from
  // the floor, left for the person to finish in the input.
  const acts: AskSuggestion[] = [];
  const act = (label: string, q: string, icon: string, compose = false) => {
    if (!acts.some((a) => a.q === q)) acts.push({ q, kind: "act", icon, label, compose });
  };
  if (s && (s.kind === "thread" || s.kind === "conversation" || s.kind === "person")) {
    act(t.actLate.replace("{name}", s.label), t.actLateQ.replace("{name}", s.label), "chat");
    act(t.actDraft.replace("{name}", s.label), t.actDraftQ.replace("{name}", s.label), "edit", true);
  }
  act(t.actRemember, t.actRememberQ, "sparkle", true);
  if (input.surface === "settings" || input.surface === "today") act(t.actClose, t.actCloseQ, "calendar", true);
  if (input.surface === "settings") act(t.actHours, t.actHoursQ, "clock", true);
  if (input.surface === "settings") act(t.actInvite, t.actInviteQ, "users", true);
  if (input.surface === "inbox" || input.heldDrafts > 0) act(t.actHold, t.actHoldQ, "shield");
  if (at === "people" || at === "other") act(t.actOffer, t.actOfferQ, "wave", true);
  if (at === "people" || at === "other") act(t.actPlaybook, t.actPlaybookQ, "bolt");
  return [...asks, ...acts.slice(0, 4)];
}

/* -------------------------------------------------------------- fast paths */

export interface FastCall {
  callId: string;
  who: string;
  missed: boolean;
  live: boolean;
  startedAtMs: number | null;
}

const NEEDS_RE =
  /\b(who needs me|who needs my|needs? (my|me)\b|what('s| is| do i have)? waiting|waiting (on|for) me|anyone waiting|qui[eé]n me necesita|qu[eé] (me )?espera|qu[eé] (hay )?pendiente|pendientes?)\b/i;
const CALLS_RE =
  /\b((did|has|have) (anyone|someone|anybody|somebody) (call|called|rang|phoned)|missed calls?|who called|any calls?|llam[oó] alguien|llamaron|llamadas? perdidas?|qui[eé]n llam[oó]|alguna llamada)\b/i;
const OPEN_RE =
  /\b(what('s| is) open|what('s| is) free|openings?|availab|free (slot|slots|time)|any (slots?|room|space|time)|qu[eé] (hay|tengo) (libre|disponible)|disponibilidad|disponibles?|huecos?|espacios? libres?|cu[aá]ndo (hay|tienen) (libre|espacio))\b/i;

const DAY_WORDS: Array<[RegExp, string]> = [
  [/\b(mon|monday|lunes)\b/i, "mon"],
  [/\b(tue|tues|tuesday|martes)\b/i, "tue"],
  [/\b(wed|wednesday|mi[eé]rcoles)\b/i, "wed"],
  [/\b(thu|thur|thursday|jueves)\b/i, "thu"],
  [/\b(fri|friday|viernes)\b/i, "fri"],
  [/\b(sat|saturday|s[aá]bado)\b/i, "sat"],
  [/\b(sun|sunday|domingo)\b/i, "sun"],
];

function dayKey(atMs: number, tz: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz || undefined,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(atMs));
  } catch {
    return new Date(atMs).toISOString().slice(0, 10);
  }
}

/** The day a question names: a weekday key, "today"/"tomorrow" as a date, or nothing. */
export function dayFromQuestion(q: string, now: number, tz?: string | null): string | null {
  // Tomorrow is the next DAY, which is not "now plus 24 hours" on the two
  // days a year the clock moves (availability dayPlusInZone). A zone we
  // cannot use falls back the way dayKey does.
  if (/\b(tomorrow|mañana)\b/i.test(q)) {
    try {
      if (tz) return dayPlusInZone(tz, now, 1).key;
    } catch {
      /* an unusable zone falls through */
    }
    return dayKey(now + 86_400_000, tz);
  }
  if (/\b(today|hoy)\b/i.test(q)) return dayKey(now, tz);
  for (const [re, key] of DAY_WORDS) if (re.test(q)) return key;
  return null;
}

/** What a quick question asks for, answered without a model; ask-answer.ts words the answer. */
export type AskIntent =
  { kind: "needs" } | { kind: "calls" } | { kind: "openings"; day: string | null; service: string } | null;

/**
 * The three questions an owner asks most, answered without a model: who
 * needs me, did anyone call, what is open. This only says which one a
 * question is; the bridge reads Today's queue, the calls or the openings
 * route, and ask-answer.ts says the answer. Everything else is the model's.
 */
export function askIntent(question: string, now: number, tz?: string | null): AskIntent {
  const q = question.trim();
  if (!q || q.length > 160) return null;
  if (NEEDS_RE.test(q)) return { kind: "needs" };
  if (CALLS_RE.test(q)) return { kind: "calls" };
  if (OPEN_RE.test(q)) return { kind: "openings", day: dayFromQuestion(q, now, tz), service: q };
  return null;
}

/** Today's missed calls by the business's clock, and the calls on the line now. */
export function callsToday(
  calls: FastCall[],
  now: number,
  tz?: string | null,
): { missed: FastCall[]; live: FastCall[] } {
  const today = dayKey(now, tz);
  return {
    missed: calls.filter((c) => c.missed && c.startedAtMs && dayKey(c.startedAtMs, tz) === today),
    live: calls.filter((c) => c.live),
  };
}

/* ------------------------------------------------------- settings changes */

/**
 * The few settings an owner changes from the floor, as a change the model
 * may propose and a card may apply: a closure, a day's hours, a note the
 * receptionist will read, a service. Applied to a parsed config, never to
 * the row, so the settings route's own validation still decides.
 */
export type AskSettingsChange =
  | { op: "add_closure"; date: string; until?: string; note?: string }
  | { op: "set_hours"; day: string; open: string | null; close: string | null }
  | { op: "add_note"; title: string; text: string }
  | { op: "add_service"; name: string; duration_min?: number };

export const AskSettingsChangeSchema = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("add_closure"),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    until: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    note: z.string().max(200).optional(),
  }),
  z.object({
    op: z.literal("set_hours"),
    day: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]),
    open: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable(),
    close: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .nullable(),
  }),
  z.object({ op: z.literal("add_note"), title: z.string().min(1).max(80), text: z.string().min(1).max(1200) }),
  z.object({
    op: z.literal("add_service"),
    name: z.string().min(1).max(80),
    duration_min: z.number().int().min(1).max(1440).optional(),
  }),
]);

type Cfg = { brain?: { profile?: Record<string, unknown> } & Record<string, unknown> } & Record<string, unknown>;

export function applySettingsChange<C extends Cfg>(config: C, change: AskSettingsChange): C {
  const brain = { ...(config.brain ?? {}) } as NonNullable<C["brain"]>;
  const profile = { ...((brain.profile ?? {}) as Record<string, unknown>) };
  switch (change.op) {
    case "add_closure": {
      const closures = [...((profile.closures as unknown[]) ?? [])];
      closures.push({
        date: change.date,
        ...(change.until ? { until: change.until } : {}),
        ...(change.note ? { note: change.note } : {}),
      });
      profile.closures = closures;
      break;
    }
    case "set_hours": {
      const hours = { ...((profile.hours as Record<string, unknown>) ?? {}) };
      hours[change.day] =
        change.open && change.close ? { open: change.open, close: change.close } : { open: null, close: null };
      profile.hours = hours;
      break;
    }
    case "add_note": {
      const notes = [...((profile.notes as unknown[]) ?? [])];
      notes.push({ title: change.title, text: change.text });
      profile.notes = notes;
      break;
    }
    case "add_service": {
      const services = [...((profile.services as unknown[]) ?? [])];
      services.push({ name: change.name, ...(change.duration_min ? { duration_min: change.duration_min } : {}) });
      profile.services = services;
      break;
    }
  }
  brain.profile = profile;
  return { ...config, brain };
}

/** One line for a card: what the change does, in the person's words. */
export function describeSettingsChange(change: AskSettingsChange): string {
  switch (change.op) {
    case "add_closure":
      return change.until
        ? `Closed ${change.date} to ${change.until}${change.note ? ` (${change.note})` : ""}`
        : `Closed on ${change.date}${change.note ? ` (${change.note})` : ""}`;
    case "set_hours":
      return change.open && change.close ? `${change.day}: ${change.open}–${change.close}` : `${change.day}: closed`;
    case "add_note":
      return `Note for the receptionist: “${change.title}”`;
    case "add_service":
      return `New service: ${change.name}${change.duration_min ? ` (${change.duration_min} min)` : ""}`;
  }
}

/* ---------------------------------------------------- what an answer shows */

/** Two questions are the same thread when they differ only in case, spacing and punctuation. */
export function sameQuestion(a: string, b: string): boolean {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, "")
      .replace(/\s+/g, " ")
      .trim();
  const x = norm(a);
  return x.length > 0 && x === norm(b);
}

/** The Open button's words, by where it goes; the model's label only for a page. */
export function navigateLabel(nav: { to: string; label: string } | null, language: AskLanguage): string | null {
  if (!nav || !nav.to) return null;
  const es = language === "es";
  if (/^conversations\/cv-/.test(nav.to)) return es ? "Abrir la llamada" : "Open the call";
  if (/^inbox\/th-/.test(nav.to)) return es ? "Abrir el hilo" : "Open the thread";
  if (/^clients\/[0-9a-f-]{36}$/.test(nav.to)) return es ? "Abrir el perfil" : "Open the profile";
  return nav.label || (es ? "Abrir" : "Open");
}

/** A next question that points at a place already offered: its words, and the route it echoes. */
export const FOLLOWUP_ECHO: Array<[RegExp, RegExp]> = [
  [/profile|perfil/i, /^clients\//],
  [/transcript|recording|grabaci|transcripci|the call|la llamada/i, /^conversations\/cv-/],
  [/thread|hilo|conversation/i, /^inbox\/th-/],
];
