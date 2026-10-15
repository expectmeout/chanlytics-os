import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { requestIdOf, withRequestId } from "@chanlytics/channels";
import {
  AppError,
  ASK_MAX_CHARS,
  ASK_SPOKEN_TURN_BUDGET_MS,
  ASK_VOICE_FIRST_WORDS_MS,
  ASK_VOICE_PULSE_MS,
  type AskLanguage,
} from "@chanlytics/contracts";
import type { Database, VoiceSessionRow } from "@chanlytics/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/server/env";
import { log } from "@/server/log";
import { isRetryableAuthError } from "../auth-errors";
import { verifyBearer } from "../bearer";
import { takeRate } from "../rate-limit";
import type { Member } from "../route";
import { serviceDb } from "../service-db";
import { memberContext, type RouteContext } from "../with-route";
import { titleFromQuestion } from "./prompt";
import { readThread, touchThread } from "./store";
import { askTurn, type AskTurnLine } from "./turn";
import {
  claimTurn,
  contextOf,
  endVoiceSession,
  openToken,
  readVoiceSession,
  scopeOf,
  sessionHashOf,
  SESSION_ID,
  turnKeyOf,
  VOICE_THREAD_TITLE,
} from "./voice-session";

/**
 * The brain door: the custom LLM endpoint the ElevenLabs agent calls, one request per spoken turn
 * (docs/superpowers/specs/2026-10-03-ask-spoken-design.md, §3.3; docs/decisions/0026). The vendor sends the agent's
 * whole history in the chat-completions shape and reads back a chat-completions event stream; the door takes only the
 * last thing the person said, runs one Ask turn as them (server/ask/turn.ts, the same two halves the typed route
 * runs) and streams the Say as it is written, word by word, for the agent's voice to speak.
 *
 * Who is knocking is proved twice before a byte of the body is read: the agent's static secret in its own header,
 * compared in constant time (401 without it), and then the session's id the browser gave the vendor at the start,
 * found as a row of ask_voice_sessions on the service role (403 without one; the member is known only once the row
 * is read). The row carries the member's access token sealed; opened and verified exactly as a bearer request is
 * (verifyBearer), it gives a session client that runs the turn under RLS, as the member, with the thread, page and
 * scope the row holds. `user_id` in the vendor's request is a label and is never read.
 *
 * From the row on, every answer is spoken: the vendor retries an empty or failed stream and ends the conversation
 * after three, so a refusal is a short line in the person's language (VOICE_LINES), never a status. Two clocks are
 * kept (the spike note, runs B3 to B9): the vendor cuts a stream that goes 15 s without speakable text, so the door
 * sends its own buffer words whenever ASK_VOICE_PULSE_MS pass with none; and the vendor may send the same turn
 * twice, so the turn is claimed by its key (the words and their place) and a second request follows the thread for
 * the first's answer instead of running it again.
 */

/** What a test hands in instead of the service role, the Auth server, the clock and the two timers. */
interface VoiceDoorDeps {
  service?: SupabaseClient<Database>;
  verify?: typeof verifyBearer;
  now?: () => number;
  /** The longest the stream goes without speakable text before the buffer words go out. */
  pulseMs?: number;
  /** How often a follower reads the thread for the owner's answer. */
  pollMs?: number;
  /** How long the door waits for the model's first speakable words before it says "One moment… " itself. */
  firstWordsMs?: number;
}

/** The vendor's own buffer words: a pause in the voice, nothing in the chat, and what restarts its clock (runs B8, B9). */
const BUFFER_WORDS = "... ";
const POLL_MS = 300;
/** A follower takes an answer stored from this long before its own claim: the owner's clock may run a little ahead. */
const CLAIM_SKEW_MS = 2_000;

/** What the door says for itself, in the person's language; every other word is Ask's. */
const VOICE_LINES = {
  reconnect: { en: "Let me reconnect.", es: "Déjame reconectar." },
  gone: {
    en: "I lost track of this conversation. Please start it again.",
    es: "Perdí el hilo de esta conversación. Empieza de nuevo, por favor.",
  },
  missed: { en: "I did not catch that. Say it again?", es: "No te escuché bien. ¿Lo repites?" },
  busy: { en: "Give me a moment before the next question.", es: "Dame un momento antes de la siguiente pregunta." },
  failed: {
    en: "Something went wrong on my side. Try again in a moment.",
    es: "Algo falló de mi lado. Inténtalo de nuevo en un momento.",
  },
  /** More words than a turn takes (ASK_MAX_CHARS): the typed Line's 400, spoken. */
  long: {
    en: "That is more than I can take in one go. Ask it in two.",
    es: "Eso es más de lo que puedo tomar de una vez. Pregúntalo en dos.",
  },
  /** The door's first words when the model is slow, spoken as a read's label is, so the chat draws them as a trace. */
  moment: { en: "One moment", es: "Un momento" },
} as const;
type Line = keyof typeof VOICE_LINES;
const lineOf = (line: Line, language: AskLanguage): string => VOICE_LINES[line][language === "es" ? "es" : "en"];

const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-store",
  "x-accel-buffering": "no",
};
const DONE = "data: [DONE]\n\n";

/** One SSE frame in the chat-completions chunk shape (sources §1); `done` closes with finish_reason "stop". */
function chunk(content: string, done = false): string {
  const body = {
    id: "chatcmpl-ask",
    object: "chat.completion.chunk",
    created: Math.floor(Date.now() / 1000),
    model: "ask",
    choices: [{ index: 0, delta: done ? {} : { content }, finish_reason: done ? "stop" : null }],
  };
  return `data: ${JSON.stringify(body)}\n\n`;
}

/** One line, whole, then the end: what the door says for itself. */
const spoken = (text: string): Response =>
  new Response(chunk(text) + chunk("", true) + DONE, { status: 200, headers: SSE_HEADERS });

const sha = (s: string) => createHash("sha256").update(s).digest();
/** The agent's secret, compared in constant time; an unset secret matches nothing. */
const sameSecret = (presented: string | null, secret: string | undefined): boolean =>
  !!presented && !!secret && timingSafeEqual(sha(presented), sha(secret));

/** The words of one message: a string, or the text parts of a list. */
function messageWords(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((p) =>
      p && typeof p === "object" && typeof (p as { text?: unknown }).text === "string"
        ? (p as { text: string }).text
        : "",
    )
    .join(" ");
}

/** The transcript of what was just said: the last `user` message of the agent's history, or null. */
function lastUserText(messages: unknown): string | null {
  if (!Array.isArray(messages)) return null;
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i] as { role?: unknown; content?: unknown };
    if (m?.role !== "user") continue;
    return messageWords(m.content).replace(/\s+/g, " ").trim() || null;
  }
  return null;
}

/** How many times the person has spoken in this conversation: a turn's place (turnKeyOf). */
const userTurns = (messages: unknown): number =>
  Array.isArray(messages) ? messages.filter((m) => (m as { role?: unknown })?.role === "user").length : 0;

type Db = SupabaseClient<Database>;

interface Admitted {
  row: VoiceSessionRow;
  ctx: RouteContext;
  member: Member;
  language: AskLanguage;
  service: Db;
}
type Knock = { kind: "answered"; response: Response } | ({ kind: "admitted" } & Admitted);

const knockAnswered = (response: Response): Knock => ({ kind: "answered", response });

/** The row, the member and the client the turn runs with, or the response that ends the knock. */
async function admit(body: Record<string, unknown> | null, deps: VoiceDoorDeps): Promise<Knock> {
  const now = deps.now ?? Date.now;
  const extra = body?.elevenlabs_extra_body;
  const plain =
    extra && typeof extra === "object" ? (extra as { chanlytics_session?: unknown }).chanlytics_session : null;
  if (typeof plain !== "string" || !SESSION_ID.test(plain)) {
    log.warn("ask_voice_door_refused", { why: "session" });
    return knockAnswered(new Response("forbidden", { status: 403 }));
  }
  const service = deps.service ?? serviceDb();
  const row = await readVoiceSession(service, sessionHashOf(plain));
  if (!row) {
    log.warn("ask_voice_door_refused", { why: "no_session" });
    return knockAnswered(new Response("forbidden", { status: 403 }));
  }
  const language: AskLanguage = row.language === "es" ? "es" : "en";
  // A row that cannot open the member any more is ended, and the person hears to start again.
  const over = async (why: string): Promise<Knock> => {
    log.warn("ask_voice_door_refused", { tenant_id: row.tenant_id, why });
    if (!row.ended_at) await endVoiceSession(service, row.id, { endedAt: new Date(now()).toISOString() });
    return knockAnswered(spoken(lineOf("reconnect", language)));
  };
  if (row.ended_at) {
    log.warn("ask_voice_door_refused", { tenant_id: row.tenant_id, why: "ended" });
    return knockAnswered(spoken(lineOf("gone", language)));
  }
  const secret = env.ASK_VOICE_SECRET;
  if (!secret || Date.parse(row.token_expires_at) <= now()) return over("expired");
  const token = openToken(row.token_cipher, secret);
  if (!token) return over("cipher");
  const v = await (deps.verify ?? verifyBearer)(token);
  if (!v.claims) {
    // The Auth server could not be asked (no answer, a 429, a 5xx): the row is kept and the person hears to wait,
    // never "start again" for a token that may be good (with-route.ts draws the same line for a typed request).
    if (isRetryableAuthError(v.error)) {
      log.warn("ask_voice_door_refused", { tenant_id: row.tenant_id, why: "auth_unavailable" });
      return knockAnswered(spoken(lineOf("busy", language)));
    }
    return over("token");
  }
  const userId = typeof v.claims.sub === "string" ? v.claims.sub : "";
  if (!userId || userId !== row.user_id) {
    log.warn("ask_voice_door_refused", { tenant_id: row.tenant_id, why: "member" });
    return knockAnswered(new Response("forbidden", { status: 403 }));
  }
  const ctx: RouteContext = {
    supabase: v.supabase,
    userId,
    email: typeof v.claims.email === "string" ? v.claims.email : undefined,
    metadata: {},
    ...(typeof v.claims.aal === "string" ? { aal: v.claims.aal } : {}),
  };
  try {
    const m = await memberContext(ctx, row.tenant_id);
    return { kind: "admitted", row, ctx, member: { tenantId: m.tenantId, role: m.role } as Member, language, service };
  } catch (e) {
    if (e instanceof AppError) return over(`member_${e.code}`);
    // The database could not be asked: the row is kept and the person hears to try again, never a status, which the
    // vendor would retry three times and then close the conversation on.
    log.error("ask_voice_door_failed", { tenant_id: row.tenant_id, error: e, why: "member_db" });
    return knockAnswered(spoken(lineOf("failed", language)));
  }
}

/**
 * What the person has heard of the Say so far: a preview's new suffix goes out, and a Say taken back (the turn's
 * empty `say`, when the model answered and then went to read instead) cannot be unspoken, so it is remembered: the
 * next headline is spoken whole, after a breath, unless it carries the retracted words on, when only the growth is.
 */
interface Said {
  headline: string;
  detail: string;
  retracted: string;
}
function grow(said: Said, headline: string, detail: string, speak: (s: string) => void): void {
  if (!headline && !detail) {
    if (said.headline) said.retracted = said.headline;
    said.headline = "";
    said.detail = "";
    return;
  }
  if (said.retracted) {
    if (headline.startsWith(said.retracted)) said.headline = said.retracted;
    else if (headline) speak(" ");
    said.retracted = "";
  }
  if (headline.startsWith(said.headline) && headline.length > said.headline.length) {
    speak(headline.slice(said.headline.length));
    said.headline = headline;
  }
  if (said.headline && detail.startsWith(said.detail) && detail.length > said.detail.length) {
    speak((said.detail ? "" : " ") + detail.slice(said.detail.length));
    said.detail = detail;
  }
}

/** The turn, run as the member and spoken as it is written: each read's label, then the Say, then what the final holds that the previews did not. */
async function runOwn(a: Admitted, text: string, speak: (s: string) => void): Promise<void> {
  const said: Said = { headline: "", detail: "", retracted: "" };
  const emit = (ev: AskTurnLine) => {
    if (ev.t === "trace" && ev.text) speak(`${ev.text}… `);
    else if (ev.t === "say") grow(said, ev.headline ?? "", ev.detail ?? "", speak);
    else if (ev.t === "final" && ev.message) {
      const say = ev.message.answer?.say;
      if (say) grow(said, say.headline, say.detail, speak);
      if (!said.headline) speak(ev.message.text || lineOf("failed", a.language));
    }
  };
  const done = await askTurn(
    a.ctx,
    a.member,
    {
      text,
      threadId: a.row.thread_id,
      scope: scopeOf(a.row) ?? undefined,
      surface: a.row.surface,
      context: contextOf(a.row),
      openedMs: null,
      answering: null,
      spoken: true,
    },
    emit,
  );
  // A voice thread is made before its first question (the voice route); the first question titles it, as a typed one's does.
  if (done.thread.title === VOICE_THREAD_TITLE)
    await touchThread(a.ctx, done.thread.id, undefined, titleFromQuestion(text));
}

const pollPause = (ms: number) => new Promise((r) => setTimeout(r, ms));

type ThreadMessages = NonNullable<Awaited<ReturnType<typeof readThread>>>["messages"];
const sameWords = (s: string): string => s.replace(/\s+/g, " ").trim();

/**
 * The answer to these words in this turn: the assistant message right after the newest user message with the same
 * words, stored since the owner claimed the turn. An earlier turn's answer, however recent, is never this one's (the
 * review's case: the second question asked twice at once spoke the first question's answer).
 */
function answerTo(messages: ThreadMessages, asked: string, since: number): ThreadMessages[number] | null {
  for (let i = messages.length - 1; i > 0; i--) {
    const m = messages[i];
    const q = messages[i - 1];
    if (m.role !== "assistant" || q.role !== "user") continue;
    if (q.atMs < since) return null;
    if (sameWords(q.text) === asked) return m;
  }
  return null;
}

/** The same turn asked again (the vendor's duplicate): the owner's answer, read off the thread when it lands. */
async function follow(
  a: Admitted,
  text: string,
  claimedAt: number,
  speak: (s: string) => void,
  deps: VoiceDoorDeps,
): Promise<void> {
  const now = deps.now ?? Date.now;
  // The owner's clock is on the row as the owner left it, not on the row the door read before the claim.
  const owner = await readVoiceSession(a.service, a.row.id);
  const since = (Date.parse(owner?.turn_started_at ?? "") || claimedAt) - CLAIM_SKEW_MS;
  const until = claimedAt + ASK_SPOKEN_TURN_BUDGET_MS;
  const asked = sameWords(text);
  while (now() < until) {
    const thread = await readThread(a.ctx, a.row.thread_id);
    const answer = answerTo(thread?.messages ?? [], asked, since);
    if (answer) {
      const say = answer.answer?.say;
      speak(say ? [say.headline, say.detail].filter(Boolean).join(" ") : answer.text);
      return;
    }
    await pollPause(deps.pollMs ?? POLL_MS);
  }
  speak(lineOf("failed", a.language));
}

/** The turn's stream: the claim, the run or the follow, the buffer words whenever the model is quiet, the end. */
function speakTurn(a: Admitted, text: string, position: number, deps: VoiceDoorDeps, t0: number): Response {
  const now = deps.now ?? Date.now;
  const pulseMs = deps.pulseMs ?? ASK_VOICE_PULSE_MS;
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (s: string) => {
        try {
          controller.enqueue(encoder.encode(s));
        } catch {
          /* the reader went away */
        }
      };
      const startedAt = now();
      let lastSpeakableAt = startedAt;
      let pulses = 0;
      let chars = 0;
      const speak = (s: string) => {
        if (!s) return;
        send(chunk(s));
        lastSpeakableAt = now();
        chars += s.length;
      };
      const firstWordsMs = deps.firstWordsMs ?? ASK_VOICE_FIRST_WORDS_MS;
      const tick = Math.max(5, Math.min(1_000, Math.floor(Math.min(pulseMs, firstWordsMs) / 4)));
      const pulse = setInterval(() => {
        // The model slow to its first words: the door says "One moment… " itself, once, as a read's label is said.
        if (!chars && now() - startedAt >= firstWordsMs) speak(`${lineOf("moment", a.language)}… `);
        if (now() - lastSpeakableAt >= pulseMs) {
          send(chunk(BUFFER_WORDS));
          lastSpeakableAt = now();
          pulses++;
        }
      }, tick);
      let followed = false;
      let failed = false;
      try {
        const claimedAt = now();
        const owner = await claimTurn(a.service, a.row.id, turnKeyOf(position, text), new Date(claimedAt));
        if (owner) await runOwn(a, text, speak);
        else {
          followed = true;
          await follow(a, text, claimedAt, speak, deps);
        }
      } catch (e) {
        failed = true;
        log.error("ask_voice_door_failed", { tenant_id: a.row.tenant_id, error: e });
        speak(lineOf("failed", a.language));
      } finally {
        clearInterval(pulse);
      }
      send(chunk("", true));
      send(DONE);
      log.info("ask_voice_turn", {
        tenant_id: a.row.tenant_id,
        thread: a.row.thread_id,
        ms: now() - t0,
        chars,
        pulses,
        followed,
        failed,
        position,
      });
      try {
        controller.close();
      } catch {
        /* already closed */
      }
    },
  });
  return new Response(stream, { status: 200, headers: SSE_HEADERS });
}

async function answerAgent(req: Request, deps: VoiceDoorDeps): Promise<Response> {
  const now = deps.now ?? Date.now;
  const t0 = now();
  if (!sameSecret(req.headers.get("x-chanlytics-agent"), env.ELEVENLABS_LLM_SECRET)) {
    log.warn("ask_voice_door_refused", { why: "secret" });
    return new Response("unauthorized", { status: 401 });
  }
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const knock = await admit(body, deps);
  if (knock.kind === "answered") return knock.response;
  const text = lastUserText(body?.messages);
  // Every canned line is logged (4 Oct 2026): the doctor could not tell a conversation the agent nagged through its
  // silence from one that spoke, since "I'm here." left no line.
  if (!text) {
    log.info("ask_voice_door_refused", { tenant_id: knock.row.tenant_id, why: "missed" });
    return spoken(lineOf("missed", knock.language));
  }
  // Silence: after turn_timeout the vendor asks the model with "..." (seen 3 Oct, Chrome), and a transcript with no
  // word in it is the same. The session's microphone is muted (the hold is the one mic, 4 Oct evening), so this is
  // the vendor's own re-engage and not a person: the door answers with the buffer words, which the vendor voices as
  // nothing and the Line draws as nothing; no turn is run and nothing is stored. ("I'm here." was the answer while
  // the mic was open; with it muted it was "Are you still there?" every turn timeout, measured 4 Oct.)
  if (!/[\p{L}\p{N}]/u.test(text)) {
    log.info("ask_voice_door_refused", { tenant_id: knock.row.tenant_id, why: "silence" });
    return spoken(BUFFER_WORDS);
  }
  // A voice turn is a turn: counted as the typed ones are, and a spent count is a line, not a 429. Counted here,
  // after the two answers above: the vendor's own re-engage comes every turn timeout for as long as a session waits,
  // and nobody asked it, so it takes nothing of the person's count and a spent count never speaks into the silence.
  try {
    await takeRate(knock.ctx.userId, "ask", now());
  } catch (e) {
    if (e instanceof AppError && e.code === "rate_limited") {
      log.warn("ask_voice_door_refused", { tenant_id: knock.row.tenant_id, why: "rate" });
      return spoken(lineOf("busy", knock.language));
    }
    throw e;
  }
  // More than a turn takes: the typed route's 400 (ASK_MAX_CHARS), spoken; the vendor retries an empty stream.
  if (text.length > ASK_MAX_CHARS) {
    log.warn("ask_voice_door_refused", { tenant_id: knock.row.tenant_id, why: "long" });
    return spoken(lineOf("long", knock.language));
  }
  return speakTurn(knock, text, userTurns(body?.messages), deps, t0);
}

/** The door, under the request's name (the vendor sends none the log would trust; one is minted). */
export function voiceDoor(req: Request, deps: VoiceDoorDeps = {}): Promise<Response> {
  return withRequestId(requestIdOf(req.headers, { trustCaller: false }), () => answerAgent(req, deps));
}
