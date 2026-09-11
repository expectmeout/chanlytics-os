/**
 * Ask: the workspace assistant, as a contract.
 *
 * What lives here is everything about Ask that is pure and shared: the shape
 * of a turn's final answer and how it is parsed, the rule that keeps a
 * citation honest, the palette's jump index and suggestions, the three
 * questions that are answered without a model, and the small partial-JSON
 * reader that lets the answer stream while the rest of the turn is still
 * being written. The route that runs the model lives in the dashboard; the
 * palette that shows the answer lives in the mockup; both read from here.
 */
import type { SchemaSet } from "./schema-sets";
import { z } from "zod";
import type { NotificationItem } from "./notifications";

/* ------------------------------------------------------------------ limits */

/** One question, in characters. Longer than this is a document, not a question. */
export const ASK_MAX_CHARS = 1000;
/** Tool rounds per turn: reads, then the answer. The last round is forced to finish. */
export const ASK_MAX_ROUNDS = 4;
/** End to end, under the route's sixty-second ceiling. */
export const ASK_TURN_BUDGET_MS = 45_000;
/**
 * Ask's own daily token budget per workspace, apart from the receptionist's.
 * Counted on uncached input plus output. With the day's snapshot riding into
 * every round, a turn costs two to eight thousand such tokens; a busy owner
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
 * The shape the model must answer in, as the `finish` tool's input. Every
 * property is required and nothing else is allowed, so the API can decode it
 * under constraint; "no navigation" is an empty route, never a missing key.
 */
export const ASK_FINISH_JSON_SCHEMA = {
  type: "object",
  properties: {
    answer: {
      type: "string",
      description:
        "The answer, in the person's language: two or three short sentences, under sixty words, unless they asked for detail (a transcript, a list). Plain text only: no markdown, no headings, and never a tag such as <answer> or <parameter> inside this string. More than two items go one per line, separated by newlines. Say what you found; if a read returned nothing, say so plainly.",
    },
    citations: {
      type: "array",
      description:
        "The rows the answer rests on, taken ONLY from what the tools returned this turn, at most four — the ones the answer names. Each needs the kind, the exact id the tool gave you, and a short label (a name, a day, a call time).",
      items: {
        type: "object",
        properties: {
          kind: { type: "string", enum: [...ASK_CITATION_KINDS] },
          id: { type: "string" },
          label: { type: "string" },
        },
        required: ["kind", "id", "label"],
        additionalProperties: false,
      },
    },
    followups: {
      type: "array",
      description: "Up to two short questions the person might ask next, in their language. Empty when nothing natural follows.",
      items: { type: "string" },
    },
    navigate: {
      type: "object",
      description:
        "When the best answer is a page, the route to open and a label. to: the exact `route` field a tool returned for a row (a call, a thread, a person), or a page route (today, inbox, clients, conversations, live, reports, admin/workspace). Empty strings when there is nothing to open. now: true when the person asked to open, show or see that thing; the app goes there as soon as the answer is read, so keep the answer to one line.",
      properties: { to: { type: "string" }, label: { type: "string" }, now: { type: "boolean" } },
      required: ["to", "label", "now"],
      additionalProperties: false,
    },
    language: { type: "string", enum: [...ASK_LANGUAGES] },
  },
  required: ["answer", "citations", "followups", "navigate", "language"],
  additionalProperties: false,
} as const;

const clip = (n: number) => (s: string) => s.trim().slice(0, n);

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
  return s.replace(/<\/?[a-z_]+(\s[^>]*)?>/gi, "").replace(/\s+$/g, "").trim();
}

/** Citations the model wrote into the wrong field, when the answer carried them as JSON. */
export function recoverCitations(raw: string): AskCitation[] {
  const at = raw.search(/name=["']citations["']/i);
  if (at < 0) return [];
  const start = raw.indexOf("[", at);
  if (start < 0) return [];
  let depth = 0;
  let end = -1;
  for (let i = start; i < raw.length; i++) {
    if (raw[i] === "[") depth++;
    else if (raw[i] === "]") { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) return [];
  try {
    const arr = JSON.parse(raw.slice(start, end + 1)) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((c): c is AskCitation => !!c && typeof c === "object" && typeof (c as AskCitation).id === "string" && typeof (c as AskCitation).label === "string")
      .map((c) => ({ kind: (ASK_CITATION_KINDS as readonly string[]).includes(String(c.kind)) ? (c.kind as AskCitationKind) : "page", id: c.id.slice(0, 200), label: c.label.slice(0, 80) }))
      .slice(0, ASK_CAPS.citations);
  } catch {
    return [];
  }
}

export const AskFinishSchema = z.object({
  answer: z.string().catch("").transform((s) => clip(1500)(cleanAnswer(s))),
  citations: z
    .array(
      z.object({
        kind: z.enum(ASK_CITATION_KINDS).catch("page"),
        id: z.string().catch("").transform(clip(200)),
        label: z.string().catch("").transform(clip(80)),
      }),
    )
    .catch([])
    .transform((a) => a.filter((c) => c.id && c.label).slice(0, ASK_CAPS.citations)),
  followups: z
    .array(z.string())
    .catch([])
    .transform((a) => a.map((s) => s.trim()).filter(Boolean).slice(0, ASK_CAPS.followups).map((s) => s.slice(0, 90))),
  navigate: z
    .object({ to: z.string().catch(""), label: z.string().catch(""), now: z.boolean().catch(false) })
    .catch({ to: "", label: "", now: false })
    .transform((n) => (n.to.trim() ? { to: n.to.trim().replace(/^#?\/+/, "").slice(0, 200), label: n.label.trim().slice(0, 60) || "Open", now: n.now === true } : null)),
  language: z.enum(ASK_LANGUAGES).catch("other"),
});
export type AskFinish = z.infer<typeof AskFinishSchema>;

export function parseAskFinish(raw: unknown): { ok: true; value: AskFinish } | { ok: false; error: string } {
  let json: unknown = raw;
  if (typeof raw === "string") {
    try {
      json = JSON.parse(raw);
    } catch (e) {
      return { ok: false, error: `not JSON: ${e instanceof Error ? e.message : String(e)}` };
    }
  }
  const r = AskFinishSchema.safeParse(json);
  if (!r.success) return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
  if (!r.data.answer) return { ok: false, error: "empty answer" };
  // Citations that leaked into the answer field are still citations.
  if (!r.data.citations.length && json && typeof json === "object" && typeof (json as { answer?: unknown }).answer === "string") {
    const leaked = recoverCitations((json as { answer: string }).answer);
    if (leaked.length) return { ok: true, value: { ...r.data, citations: leaked } };
  }
  return { ok: true, value: r.data };
}

/* --------------------------------------------------------------- grounding */

/** What the tools returned this turn, by kind: the only rows a citation may name. */
export type AskReadSet = Record<Exclude<AskCitationKind, "page">, Set<string>>;

export function emptyReadSet(): AskReadSet {
  return { thread: new Set(), conversation: new Set(), call: new Set(), person: new Set() };
}

/** The pages a citation or a navigate target may point at without a read. */
export const ASK_PAGE_ROUTES = [
  "today", "inbox", "clients", "conversations", "live", "reports",
  "admin/workspace", "admin/team", "admin/autonomy", "admin/notifications", "admin/integrations",
] as const;

const PAGE_PREFIX = /^(today|inbox|clients|conversations|live|reports|admin)(\/[A-Za-z0-9:_-]+)?$/;

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
    case "thread": return `inbox/th-${c.id}`;
    case "conversation": return `conversations/${c.id}`;
    case "call": return `conversations/cv-${c.id}`;
    case "person": return `clients/${c.id}`;
    default: return c.id;
  }
}

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/**
 * The route the app knows for what the model meant.
 *
 * The model writes routes as it understands them: "conversations/cv-<id>"
 * when a tool said so, but also "calls/<id>", "people/<id>", "inbox/<id>",
 * or a bare id. Any spelling that names a row the tools returned this turn
 * becomes that row's canonical route; a page route passes as is; anything
 * else is nothing. Dropping a real row over its spelling left "Opening the
 * call…" opening nothing.
 */
export function normalizeNavigate(to: string, read: AskReadSet): string | null {
  const s = (to ?? "").trim().replace(/^#?\/+/, "");
  if (!s) return null;
  const id = (UUID_RE.exec(s) ?? [])[0]?.toLowerCase();
  if (id) {
    const head = s.toLowerCase();
    const isCall = /call|cv-|live/.test(head);
    const isPerson = /client|people|person|contact|profile/.test(head);
    const isThread = /inbox|thread|th-|conversation/.test(head);
    if (isCall && read.call.has(id)) return `conversations/cv-${id}`;
    if (isPerson && read.person.has(id)) return `clients/${id}`;
    if (isThread && (read.thread.has(id) || read.conversation.has(id))) return `inbox/th-${id}`;
    // No kind in the spelling: whichever set holds the id.
    if (read.call.has(id)) return `conversations/cv-${id}`;
    if (read.thread.has(id) || read.conversation.has(id)) return `inbox/th-${id}`;
    if (read.person.has(id)) return `clients/${id}`;
    return null;
  }
  return PAGE_PREFIX.test(s) ? s : null;
}

/** A navigate target is safe when it is a page or a row route the tools could have produced. */
export function safeNavigate(to: string, read: AskReadSet): boolean {
  if (!to) return false;
  if (PAGE_PREFIX.test(to)) {
    const m = /^inbox\/th-(.+)$/.exec(to);
    if (m) return read.thread.has(m[1]) || read.conversation.has(m[1]);
    const cv = /^conversations\/cv-(.+)$/.exec(to);
    if (cv) return read.call.has(cv[1]);
    const conv = /^conversations\/([0-9a-f-]{36})$/.exec(to);
    if (conv) return read.conversation.has(conv[1]);
    const person = /^clients\/([0-9a-f-]{36})$/.exec(to);
    if (person) return read.person.has(person[1]);
    return true;
  }
  return false;
}

/**
 * An answer that states a figure without having read anything is not from
 * the workspace. Times, counts and money all carry digits; a turn with no
 * read tool behind such an answer is marked so the palette can say so.
 */
export function isUngrounded(answer: string, reads: number): boolean {
  return reads === 0 && /\d/.test(answer);
}

/* --------------------------------------------------------- partial answers */

/**
 * The `answer` string out of a JSON prefix that is still arriving.
 *
 * The finish tool's input streams as partial JSON; the palette wants the
 * words as they come. This reads `"answer": "` and then the string up to the
 * first unescaped quote, decoding the escapes it has seen so far. Anything
 * before the key, or a key that has not arrived, is an empty string.
 */
export function partialAnswer(prefix: string): string {
  const key = prefix.indexOf('"answer"');
  if (key < 0) return "";
  const raw = partialString(prefix, key);
  const cut = raw.search(TAG_CUT);
  return (cut >= 0 ? raw.slice(0, cut) : raw).replace(/^\s*<answer>\s*/i, "");
}

function partialString(prefix: string, key: number): string {
  let i = prefix.indexOf('"', prefix.indexOf(":", key) + 1);
  if (i < 0) return "";
  i++;
  let out = "";
  while (i < prefix.length) {
    const c = prefix[i];
    if (c === '"') break;
    if (c === "\\") {
      const n = prefix[i + 1];
      if (n === undefined) break;
      if (n === "n") out += "\n";
      else if (n === "t") out += "\t";
      else if (n === "u") {
        const hex = prefix.slice(i + 2, i + 6);
        if (hex.length < 4) break;
        out += String.fromCharCode(parseInt(hex, 16) || 0x20);
        i += 4;
      } else out += n;
      i += 2;
      continue;
    }
    out += c;
    i++;
  }
  return out;
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
  kind: "reply" | "steer" | "thread_verb" | "person_mode" | "policy" | "settings" | "whisper" | "invite" | "broadcast" | "playbook";
  /** The lowest role that may commit it; the route re-checks on Approve. */
  needs: "operator" | "owner";
  title: string;
  /** The exact change, in the person's words. */
  summary: string;
  payload: Record<string, unknown>;
  /** What undo looks like, when the verb has one. */
  undo: string | null;
  /** Set once the person acted on the card. */
  outcome?: AskProposalOutcome | null;
}

/** The client gate (data-bits `gate`) a card of this kind checks before Approve; the route re-checks the role. */
export const PROPOSAL_GATE: Record<AskProposal["kind"], "approve" | "autonomy" | "settings" | "team"> = {
  reply: "approve",
  steer: "approve",
  thread_verb: "approve",
  whisper: "approve",
  policy: "autonomy",
  person_mode: "settings",
  settings: "settings",
  invite: "team",
  broadcast: "approve",
  playbook: "approve",
};

/** What became of a card, kept with the turn that proposed it. */
export interface AskProposalOutcome {
  state: "done" | "dismissed" | "failed" | "undone";
  /** One line: "Sent to Rosa", "Closed on Friday". */
  receipt: string;
  atMs: number;
  /** What Undo needs, when the verb has one: an id, a previous value. */
  undo?: Record<string, unknown> | null;
}

export const AskProposalOutcomeSchema = z.object({
  state: z.enum(["done", "dismissed", "failed", "undone"]),
  receipt: z.string().max(300).catch(""),
  atMs: z.number().catch(0),
  undo: z.record(z.unknown()).nullable().optional(),
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
  /** Model rounds the turn took; one means the snapshot was enough. */
  rounds?: number | null;
  /** Set on a turn that could not be answered; the text says why. */
  failed: boolean;
}

export interface AskThreadVM {
  id: string;
  title: string;
  lastAtMs: number;
  scope: AskScope | null;
}

/** What the person was looking at when they asked. Carried into the turn as a fact. */
export interface AskScope {
  kind: "thread" | "conversation" | "call" | "person" | "page";
  id: string;
  label: string;
}

/** The scope a route implies, when it names a row. */
export function scopeFromRoute(page: string, param: string | null | undefined, label?: string | null): AskScope | null {
  if (!param) return null;
  if (page === "inbox" && param.startsWith("th-")) return { kind: "thread", id: param.slice(3), label: label || "this thread" };
  if (page === "conversations" && param.startsWith("cv-")) return { kind: "call", id: param.slice(3), label: label || "this call" };
  if (page === "conversations" && /^[0-9a-f-]{36}$/.test(param)) return { kind: "conversation", id: param, label: label || "this conversation" };
  if (page === "clients" && /^[0-9a-f-]{36}$/.test(param)) return { kind: "person", id: param, label: label || "this person" };
  return null;
}

/* ------------------------------------------------------------- language */

const ES_HINT = /[áéíóúñ¿¡]|\b(qué|que|quién|quien|cómo|como|cuándo|cuando|dónde|donde|hoy|mañana|hola|gracias|abierto|libre|cita|cliente|llam[oó]|llamaron|necesita|espera|por favor|el|la|los|las|una?|est[aá]n?)\b/i;
const EN_HINT = /\b(what|who|when|where|how|did|does|is|are|open|today|tomorrow|call|called|needs|waiting|the|a|an|please|tell)\b/i;

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
}

/** The pages a real workspace has. Nothing here is seeded or demo-only. */
export const ASK_PAGES: JumpEntry[] = [
  { label: "Today", to: "today", kind: "page" },
  { label: "Inbox", to: "inbox", kind: "page" },
  { label: "People", to: "clients", kind: "page" },
  { label: "Conversations", to: "conversations", kind: "page" },
  { label: "Calls", to: "live", kind: "page", sub: "live and recent" },
  { label: "Reports", to: "reports", kind: "page" },
  { label: "Settings", to: "admin/workspace", kind: "page" },
  { label: "Autonomy", to: "admin/autonomy", kind: "page", sub: "what the receptionist may do alone" },
  { label: "Team", to: "admin/team", kind: "page", sub: "members and invitations" },
  { label: "Notifications", to: "admin/notifications", kind: "page" },
  { label: "Connections", to: "admin/integrations", kind: "page", sub: "WhatsApp, phone line, calendar" },
  // What the receptionist knows lives in Business details; the Memory pane says so and points here.
  { label: "Receptionist memory", to: "admin/workspace", kind: "page", sub: "hours, services and notes, in Business details" },
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
  for (const p of index) if (p.kind !== "page" && p.label.toLowerCase().includes(s)) push(p);
  return out.slice(0, limit);
}

/* ------------------------------------------------------------ suggestions */

export type AskSurface = "today" | "inbox" | "people" | "conversations" | "live" | "reports" | "settings" | "other";

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
export function buildAskSuggestions(input: SuggestionInput): AskSuggestion[] {
  const t = T[input.language === "es" ? "es" : "en"];
  const out: AskSuggestion[] = [];
  const add = (q: string, kind: AskSuggestion["kind"], icon: string, fast = false) => {
    if (!out.some((s) => s.q === q)) out.push({ q, kind, icon, fast });
  };
  const s = input.scope;
  if (s && (s.kind === "thread" || s.kind === "conversation" || s.kind === "person")) {
    add(t.said.replace("{name}", s.label), "ask", "chat");
    if (s.kind === "thread") add(t.why, "ask", "sparkle");
  }
  if (s && s.kind === "call") add(t.live, "ask", "phone");
  if (input.needsYou > 0) add(t.needs, "ask", "inbox", true);
  if (input.heldDrafts > 0) add(t.held, "ask", "clock");
  if (input.liveNow > 0) add(t.live, "ask", "phone");
  if (input.missedToday > 0) add(t.calls, "ask", "phone", true);
  if (input.hasCalendar) add(input.surface === "today" ? t.openTomorrow : t.openSat, "ask", "calendar", true);
  switch (input.surface) {
    case "today": add(t.brief, "ask", "sparkle"); add(t.who, "ask", "users"); break;
    case "inbox": add(t.who, "ask", "users"); add(t.rules, "ask", "shield"); break;
    case "people": add(t.who, "ask", "users"); break;
    case "reports": add(t.week, "ask", "trending-up"); break;
    case "settings": add(t.rules, "ask", "shield"); add(t.hours, "ask", "clock"); break;
    case "live": case "conversations": add(t.calls, "ask", "phone", input.missedToday > 0); break;
    default: break;
  }
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
  if (input.surface === "people" || input.surface === "other") act(t.actOffer, t.actOfferQ, "wave", true);
  if (input.surface === "people" || input.surface === "other") act(t.actPlaybook, t.actPlaybookQ, "bolt");
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

export interface FastContext {
  feed: NotificationItem[];
  calls: FastCall[];
  now: number;
  language: AskLanguage;
  timezone?: string | null;
}

export type FastPath =
  | { kind: "needs"; answer: string; links: Array<{ label: string; to: string }> }
  | { kind: "calls"; answer: string; links: Array<{ label: string; to: string }> }
  | { kind: "openings"; day: string | null; service: string }
  | null;

const NEEDS_RE = /\b(who needs me|who needs my|needs? (my|me)\b|what('s| is| do i have)? waiting|waiting (on|for) me|anyone waiting|qui[eé]n me necesita|qu[eé] (me )?espera|qu[eé] (hay )?pendiente|pendientes?)\b/i;
const CALLS_RE = /\b((did|has|have) (anyone|someone|anybody|somebody) (call|called|rang|phoned)|missed calls?|who called|any calls?|llam[oó] alguien|llamaron|llamadas? perdidas?|qui[eé]n llam[oó]|alguna llamada)\b/i;
const OPEN_RE = /\b(what('s| is) open|what('s| is) free|openings?|availab|free (slot|slots|time)|any (slots?|room|space|time)|qu[eé] (hay|tengo) (libre|disponible)|disponibilidad|disponibles?|huecos?|espacios? libres?|cu[aá]ndo (hay|tienen) (libre|espacio))\b/i;

const DAY_WORDS: Array<[RegExp, string]> = [
  [/\b(mon|monday|lunes)\b/i, "mon"], [/\b(tue|tues|tuesday|martes)\b/i, "tue"], [/\b(wed|wednesday|mi[eé]rcoles)\b/i, "wed"],
  [/\b(thu|thur|thursday|jueves)\b/i, "thu"], [/\b(fri|friday|viernes)\b/i, "fri"], [/\b(sat|saturday|s[aá]bado)\b/i, "sat"], [/\b(sun|sunday|domingo)\b/i, "sun"],
];

function dayKey(atMs: number, tz: string | null | undefined): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz || undefined, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(atMs));
  } catch {
    return new Date(atMs).toISOString().slice(0, 10);
  }
}

/** The day a question names: a weekday key, "today"/"tomorrow" as a date, or nothing. */
export function dayFromQuestion(q: string, now: number, tz?: string | null): string | null {
  if (/\b(tomorrow|mañana)\b/i.test(q)) return dayKey(now + 86_400_000, tz);
  if (/\b(today|hoy)\b/i.test(q)) return dayKey(now, tz);
  for (const [re, key] of DAY_WORDS) if (re.test(q)) return key;
  return null;
}

/**
 * The three questions an owner asks most, answered without a model: who
 * needs me, did anyone call, what is open. The first two come from what the
 * page already holds; the third names the day and the service so the palette
 * can ask the availability engine directly. Everything else is the model's.
 */
export function fastPath(question: string, ctx: FastContext): FastPath {
  const q = question.trim();
  if (!q || q.length > 160) return null;
  const es = ctx.language === "es";
  if (NEEDS_RE.test(q)) {
    const rows = ctx.feed.filter((i) => i.kind === "needs_you" || i.kind === "held_draft");
    if (!rows.length) {
      return {
        kind: "needs",
        answer: es ? "Nadie te espera ahora mismo. La recepcionista está respondiendo sola." : "Nobody is waiting on you right now. The receptionist is answering on its own.",
        links: [{ label: es ? "Abrir Inbox" : "Open Inbox", to: "inbox" }],
      };
    }
    const names = rows.slice(0, 4).map((r) => r.title.replace(/ needs you$/, "").replace(/ is waiting for you$/, ""));
    const more = rows.length - names.length;
    const answer = es
      ? `${rows.length === 1 ? "Una persona" : `${rows.length} personas`} te esperan: ${names.join(", ")}${more > 0 ? ` y ${more} más` : ""}.`
      : `${rows.length === 1 ? "One person needs" : `${rows.length} people need`} you: ${names.join(", ")}${more > 0 ? ` and ${more} more` : ""}.`;
    return { kind: "needs", answer, links: rows.slice(0, 4).map((r) => ({ label: r.title, to: r.to })) };
  }
  if (CALLS_RE.test(q)) {
    const today = dayKey(ctx.now, ctx.timezone);
    const missed = ctx.calls.filter((c) => c.missed && c.startedAtMs && dayKey(c.startedAtMs, ctx.timezone) === today);
    const live = ctx.calls.filter((c) => c.live);
    if (!missed.length) {
      const answer = live.length
        ? es ? `Ninguna llamada perdida hoy. Hay ${live.length === 1 ? "una llamada" : `${live.length} llamadas`} en curso.` : `No missed calls today. ${live.length === 1 ? "One call is" : `${live.length} calls are`} on the line now.`
        : es ? "Ninguna llamada perdida hoy." : "No missed calls today.";
      return { kind: "calls", answer, links: [{ label: es ? "Ver llamadas" : "See calls", to: "live" }] };
    }
    const names = missed.slice(0, 4).map((c) => c.who);
    const answer = es
      ? `${missed.length === 1 ? "Una llamada perdida" : `${missed.length} llamadas perdidas`} hoy: ${names.join(", ")}.`
      : `${missed.length === 1 ? "One missed call" : `${missed.length} missed calls`} today: ${names.join(", ")}.`;
    return { kind: "calls", answer, links: missed.slice(0, 4).map((c) => ({ label: c.who, to: `conversations/cv-${c.callId}` })) };
  }
  if (OPEN_RE.test(q)) {
    return { kind: "openings", day: dayFromQuestion(q, ctx.now, ctx.timezone), service: q };
  }
  return null;
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
  z.object({ op: z.literal("add_closure"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), note: z.string().max(200).optional() }),
  z.object({ op: z.literal("set_hours"), day: z.enum(["mon", "tue", "wed", "thu", "fri", "sat", "sun"]), open: z.string().regex(/^\d{2}:\d{2}$/).nullable(), close: z.string().regex(/^\d{2}:\d{2}$/).nullable() }),
  z.object({ op: z.literal("add_note"), title: z.string().min(1).max(80), text: z.string().min(1).max(1200) }),
  z.object({ op: z.literal("add_service"), name: z.string().min(1).max(80), duration_min: z.number().int().min(1).max(1440).optional() }),
]);

type Cfg = { brain?: { profile?: Record<string, unknown> } & Record<string, unknown> } & Record<string, unknown>;

export function applySettingsChange<C extends Cfg>(config: C, change: AskSettingsChange): C {
  const brain = { ...(config.brain ?? {}) } as NonNullable<C["brain"]>;
  const profile = { ...((brain.profile ?? {}) as Record<string, unknown>) };
  switch (change.op) {
    case "add_closure": {
      const closures = [...((profile.closures as unknown[]) ?? [])];
      closures.push({ date: change.date, ...(change.until ? { until: change.until } : {}), ...(change.note ? { note: change.note } : {}) });
      profile.closures = closures;
      break;
    }
    case "set_hours": {
      const hours = { ...((profile.hours as Record<string, unknown>) ?? {}) };
      hours[change.day] = change.open && change.close ? { open: change.open, close: change.close } : { open: null, close: null };
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
    case "add_closure": return change.until ? `Closed ${change.date} to ${change.until}${change.note ? ` (${change.note})` : ""}` : `Closed on ${change.date}${change.note ? ` (${change.note})` : ""}`;
    case "set_hours": return change.open && change.close ? `${change.day}: ${change.open}–${change.close}` : `${change.day}: closed`;
    case "add_note": return `Note for the receptionist: “${change.title}”`;
    case "add_service": return `New service: ${change.name}${change.duration_min ? ` (${change.duration_min} min)` : ""}`;
  }
}

/* ---------------------------------------------------- what an answer shows */

/** Two questions are the same thread when they differ only in case, spacing and punctuation. */
export function sameQuestion(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, "").replace(/\s+/g, " ").trim();
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

/** The source chips, minus the one the Open button already is, minus repeats of a place. */
export function citationsToShow<C extends { to: string }>(citations: C[], nav: { to: string } | null): C[] {
  const seen = new Set<string>(nav && nav.to ? [nav.to] : []);
  return citations.filter((c) => {
    if (!c || !c.to || seen.has(c.to)) return false;
    seen.add(c.to);
    return true;
  });
}

const FOLLOWUP_ECHO: Array<[RegExp, RegExp]> = [
  [/profile|perfil/i, /^clients\//],
  [/transcript|recording|grabaci|transcripci|the call|la llamada/i, /^conversations\/cv-/],
  [/thread|hilo|conversation/i, /^inbox\/th-/],
];

/**
 * Follow-ups worth a chip: not one that echoes a place the answer already
 * offers to open. "Show this caller's profile" beside an Open the profile
 * button is the same thing twice.
 */
export function followupsToShow(followups: string[], citations: Array<{ to: string }>, nav: { to: string } | null): string[] {
  const places = [...citations.map((c) => c.to), ...(nav && nav.to ? [nav.to] : [])];
  return followups.filter((f) => !FOLLOWUP_ECHO.some(([words, route]) => words.test(f) && places.some((p) => route.test(p)))).slice(0, ASK_CAPS.followups);
}
