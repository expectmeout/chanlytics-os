/**
 * The one writer of a reply for a person to send (decision 0093): the receptionist's brain in its draft voice, over the
 * workspace's whole runtime, so a draft knows what the receptionist knows. A held thread's job, a member's change at the
 * door and a reach-out's reading all come here; a call back's brief is the same knowledge, answered as JSON.
 *
 *   - The runtime is the workspace's, loaded by any channel it has (loadTenantRuntime reads everything by the tenant; a
 *     stand-in email channel binds no credentials), its mailbox first for an email. No wire is bound from it: a draft is
 *     text on a row, and nothing sends it but a person.
 *   - The gates (contracts draftRefusal), a receptionist that can speak, the day's tokens, the spend, ask differently by who
 *     is waiting. A held thread is written ahead for nobody, so it stops at the headroom (draftHeadroomSpent) and live
 *     replies keep the rest; a member waiting on their own change is held to the cap alone. Only a reach-out asks the reply
 *     policy: on a held thread a mode of ask or never is exactly when the owner answers themself.
 *   - The brain is told it is writing for the person who sends it (compose.ts's draft audience). `escalate` means nothing
 *     here: only a refusal, a failure or no words is not drafted, and its holding words are never a draft.
 *   - Checked in code before it is kept: a price (core layerTwo's rule) and money (namesMoney), and a promise of our own
 *     follow-up by a time (contracts promisesAFollowUpTime), which is asked for once more with the rule said again. A
 *     member's change is held to what they gave: the words they kept and the words they typed.
 *   - The subject of an email and what Why this? says are said by code, from what the prompt was handed, never by the model.
 *   - Its tokens are written through the one writer (recordTokens), so the day's budget counts them.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  describeNow,
  DRAFT_BRIEF_RULES,
  DRAFT_BRIEF_SCHEMA,
  DRAFT_MAX_TOKENS,
  DRAFT_USED_WORDS,
  draftBriefOf,
  draftHeadroomSpent,
  draftRefusal,
  replyOfferSteer,
  fenced,
  frameSteer,
  namesMoney,
  NO_FOLLOW_UP_TIME,
  priceAllowance,
  priceBreach,
  priceFigures,
  promisesAFollowUpTime,
  reasonLabelOf,
  replySubject,
  replyTextOf,
  resolveSystemPrompt,
  tokenBudgetSpent,
  tokenCapOf,
  type PromptWire,
  type ReplyDraftWhy,
  ANSWER_JSON_ONLY,
  type ChannelKind,
} from "@chanlytics/contracts";
import { describeLead, readLeadContext, readThreadState } from "@chanlytics/db/conversations";
import { listMailboxConnectionsOf, findMailboxOfTenant } from "@chanlytics/db/email";
import { findOldestActiveChannel, type RoutedChannel } from "@chanlytics/db/channels";
import { mayWorkspaceSpend } from "@chanlytics/db/campaigns";
import type { Database } from "@chanlytics/db/types";
import { layerTwo, type BriefWritten, type ReplyDraftAsk, type ReplyWritten } from "@chanlytics/core";
import type { ReplyDraftEdge } from "@chanlytics/jobs";
import { env } from "../shared/env.js";
import { errField, logger } from "../shared/log.js";
import { askJson, promptHashOf } from "../ai/model.js";
import { brainCallOf, generateReply } from "../ai/receptionist-brain.js";
import { recordTokens, getTokensLast24h } from "../ai/budget.js";
import { senderFactsReaderFor } from "../email/mailbox/reader.js";
import { loadTenantRuntime, type TenantRuntime } from "../shared/tenant-runtime.js";
import type { TenantId } from "@chanlytics/contracts";
import { logAndGoOn } from "@chanlytics/log";

type Db = SupabaseClient<Database>;

/** The thread's turns the brain is shown, as the receptionist reads them (readThreadState's own default). */
const DRAFT_HISTORY = 16;
/** The turns a brief is told of the thread, and each one's words cut to a line or two. */
const BRIEF_TURNS = 12;
const BRIEF_TURN_CHARS = 400;

/** The wires a person may be looked for by, for a workspace with no mailbox. */
const CHAT_WIRES = ["whatsapp", "sms", "instagram", "voice"] as const;

/** A stand-in channel: the runtime is read by the tenant, and an email kind binds no WhatsApp credentials. */
const standIn = (tenantId: TenantId, id: string, externalId: string): RoutedChannel => ({
  kind: "email",
  channelId: id,
  tenantId,
  externalId,
  numberE164: null,
  credentialsRef: null,
  config: {},
});

/**
 * The channel a draft's runtime is loaded by: for an email, the workspace's hosted mailbox, else the first it connected
 * (0056); for a chat, its oldest active channel of the wire; else whichever it has. Null with none at all.
 */
async function channelFor(db: Db, tenantId: TenantId, wire: ChannelKind): Promise<RoutedChannel | null> {
  const mailbox = async (): Promise<RoutedChannel | null> => {
    const hosted = await findMailboxOfTenant(db, tenantId);
    if (hosted) return standIn(tenantId, hosted.id, hosted.local_part);
    const [own] = await listMailboxConnectionsOf(db, tenantId);
    return own ? standIn(tenantId, own.id, own.address) : null;
  };
  if (wire === "email") {
    const found = await mailbox();
    if (found) return found;
  } else {
    const same = await findOldestActiveChannel(db, tenantId, wire).catch(logAndGoOn("findOldestActiveChannel", null));
    if (same) return same;
  }
  for (const kind of CHAT_WIRES) {
    const any = await findOldestActiveChannel(db, tenantId, kind).catch(logAndGoOn("findOldestActiveChannel", null));
    if (any) return any;
  }
  return mailbox();
}

/** Which day's gate holds a draft, by who is waiting on it. */
async function gateOf(db: Db, tenantId: TenantId, rt: TenantRuntime, source: ReplyDraftAsk["source"]) {
  const limits = rt.policy["reply"]?.limits ?? {};
  const cap = tokenCapOf(limits);
  const used = cap > 0 ? await getTokensLast24h(db, tenantId, cap) : 0;
  return draftRefusal({
    receptionist: !!rt.brain && !rt.configBroken && !rt.loadFailed && !!env.ANTHROPIC_API_KEY,
    // Only a reach-out's is the reply policy's (see the header).
    mode: source === "reach_out" ? (rt.policy["reply"]?.mode ?? "ask") : "ask",
    budgetSpent: cap > 0 && (source === "hold" ? draftHeadroomSpent(cap, used) : tokenBudgetSpent(limits, used)),
    maySpend: await mayWorkspaceSpend(db, tenantId),
  });
}

/** Who they are, as the receptionist reads them, and why it waits on the owner. Nothing when they cannot be read. */
async function noteOf(
  db: Db,
  tenantId: TenantId,
  rt: TenantRuntime,
  ask: Pick<ReplyDraftAsk, "contactId" | "forMessageId" | "holdReason" | "wire">,
): Promise<{ note: string | undefined; notes: boolean }> {
  const reason = ask.holdReason
    ? `Why it waits on the person you are writing for: ${reasonLabelOf(ask.holdReason)}.`
    : "";
  if (!ask.contactId) return { note: reason || undefined, notes: false };
  try {
    const lead = await readLeadContext(db, tenantId, { contactId: ask.contactId }, 1, ask.forMessageId ?? undefined);
    // An email is no wire the offers' ask is read for; describeLead asks of the chat wires alone.
    const wire = ask.wire === "email" ? undefined : ask.wire;
    const about = describeLead(lead, undefined, rt.timezone ?? "UTC", wire);
    return { note: [about, reason].filter(Boolean).join("\n"), notes: !!lead.notes?.trim() };
  } catch (e) {
    logger({ tenant_id: tenantId }).warn("reply_draft_lead_unavailable", { error: errField(e) });
    return { note: reason || undefined, notes: false };
  }
}

/** A member's change: the words they keep, as data, and what they asked. Told to the brain as a steer is. */
const changeOf = (given: string | null, instruction: string): string =>
  [given ? `Your last draft said:\n${fenced("reply", given)}` : null, frameSteer(instruction)]
    .filter(Boolean)
    .join("\n\n");

/** What the prompt was handed of the workspace and the thread, as Why this? says it. */
function usedOf(rt: TenantRuntime, wire: string, turns: number, notes: boolean): string[] {
  const profile = rt.brain?.profile;
  return [
    wire === "email" ? DRAFT_USED_WORDS.email : DRAFT_USED_WORDS.message,
    ...(profile?.services?.length ? [DRAFT_USED_WORDS.facts] : []),
    ...(profile?.hours ? [DRAFT_USED_WORDS.hours] : []),
    ...(rt.brain?.booking_link?.trim() ? [DRAFT_USED_WORDS.link] : []),
    ...(turns > 1 ? [DRAFT_USED_WORDS.thread] : []),
    ...(notes ? [DRAFT_USED_WORDS.notes] : []),
  ];
}

/** Whether the words may not be kept: a price or money the owner did not give. */
function moneyRefused(
  text: string,
  input: { rt: TenantRuntime; brain: NonNullable<TenantRuntime["brain"]>; at: Date },
  given: string | null,
): boolean {
  const { rt, brain, at } = input;
  if (given === null) {
    // Nothing given: the receptionist's own price rule, and no money at all (the money charter, as Ask's reply card keeps it).
    const two = layerTwo({
      replyText: text,
      escalate: false,
      escalationReason: "",
      brainCfg: brain,
      policy: null,
      intent: null,
      known: rt.known,
      tz: rt.timezone,
      now: at,
    });
    return two.priceBlocked || namesMoney(text);
  }
  const listed = priceAllowance(brain, rt.timezone, at);
  const typed = priceFigures(given);
  const allowed = listed || typed.length ? new Set([...(listed ?? []), ...typed]) : null;
  return priceBreach(text, allowed) || (namesMoney(text) && !namesMoney(given));
}

/** One answer of the brain, inside the job's deadline. */
function inTime<T>(ran: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    ran,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("reply_draft: the writer ran past its deadline")), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** What a draft is written with: the database, and the brain and clock the tests give their own of. */
interface Writing {
  db: Db;
  brain: typeof generateReply;
  now: () => number;
}

/** The runtime and whether it may write, or the word that says why not. */
async function readied(
  { db }: Writing,
  tenantId: TenantId,
  ask: ReplyDraftAsk,
): Promise<{ rt: TenantRuntime; brainConfig: NonNullable<TenantRuntime["brain"]> } | { why: ReplyDraftWhy }> {
  const routed = await channelFor(db, tenantId, ask.wire);
  if (!routed) return { why: "no_receptionist" };
  const rt = await loadTenantRuntime(db, routed);
  const refused = await gateOf(db, tenantId, rt, ask.source);
  if (refused || !rt.brain) return { why: refused ?? "no_receptionist" };
  return { rt, brainConfig: rt.brain };
}

/** Whether the brain gave no words a person could use. `escalate` is not asked: who it hands them to is who this is for. */
const noWords = (r: { reason?: string; text: string }): boolean =>
  r.reason === "refusal" || r.reason === "brain_error" || !r.text.trim();

/** What the brain is told to change: a member's words; for an answer to a lead, what How it reaches out says it offers. */
const instructionOf = (ask: ReplyDraftAsk, rt: TenantRuntime): string | null =>
  ask.answersLead ? replyOfferSteer(rt.replyOffer) : ask.instruction;

async function writeReply(writing: Writing, tenantId: TenantId, ask: ReplyDraftAsk): Promise<ReplyWritten> {
  const { db, brain, now } = writing;
  const log = logger({ tenant_id: tenantId });
  const said = (reason: ReplyDraftWhy): ReplyWritten => {
    log.info("reply_draft", { conversation: ask.conversationId, source: ask.source, drafted: false, why: reason });
    return { why: reason };
  };
  const gate = await readied(writing, tenantId, ask);
  if ("why" in gate) return said(gate.why);
  const { rt, brainConfig } = gate;
  const thread = await readThreadState(db, tenantId, ask.conversationId, null, DRAFT_HISTORY);
  const lastUser = [...thread.history].reverse().find((t) => t.role === "user");
  const theirs = ask.theirWords ? replyTextOf(ask.theirWords) : (lastUser?.content ?? "");
  if (!theirs.trim()) return said("not_drafted");
  const { note, notes } = ask.note ? { note: ask.note, notes: false } : await noteOf(db, tenantId, rt, ask);
  const at = new Date(now());
  const wire: PromptWire = ask.wire;
  const system = resolveSystemPrompt(brainConfig, wire, rt.timezone, at, rt.policy, rt.known, "draft");
  const instruction = instructionOf(ask, rt);
  const change = instruction ? changeOf(ask.given, instruction) : undefined;
  const given = instruction ? [instruction, ask.given ?? ""].join("\n") : null;
  const askBrain = async (steer: string | undefined) => {
    const ms = ask.deadline - now();
    if (ms <= 0) throw new Error("reply_draft: no time left for the receptionist");
    const timed = await inTime(
      brain({
        history: thread.history,
        userText: theirs,
        systemPrompt: system,
        // No holding words: an answer the brain could not give is not drafted, never drafted as the fallback.
        fallbackText: "",
        leadNote: note,
        nowNote: describeNow(rt.timezone, at, brainConfig.profile?.closures),
        steer,
        // The usage ledger's row: a draft's spend told apart from the receptionist's answers.
        call: brainCallOf(tenantId, rt, { subjectId: ask.conversationId, purpose: "reply_draft" }),
      }),
      ms,
    );
    if (timed.usage) {
      const usage = {
        ...timed.usage,
        source: ask.source === "reach_out" ? "reach_out_reply_draft" : "reply_draft",
        escalate: timed.escalate,
        reason: timed.reason ?? null,
      };
      await recordTokens(db, tenantId, ask.conversationId, usage).catch((e: unknown) =>
        log.error("reply_draft_usage_failed", { conversation: ask.conversationId, error: errField(e) }),
      );
    }
    return timed;
  };
  let result = await askBrain(change);
  if (noWords(result)) return said("not_drafted");
  if (promisesAFollowUpTime(result.text, given ?? "")) {
    result = await askBrain([change, NO_FOLLOW_UP_TIME].filter(Boolean).join("\n\n"));
    if (noWords(result) || promisesAFollowUpTime(result.text, given ?? "")) return said("not_drafted");
  }
  if (moneyRefused(result.text, { rt, brain: brainConfig, at }, given)) {
    log.warn("policy_block_price", { conversation: ask.conversationId });
    return said("named_money");
  }
  log.info("reply_draft", {
    conversation: ask.conversationId,
    source: ask.source,
    drafted: true,
    chars: result.text.length,
  });
  return {
    text: result.text,
    subject: ask.wire === "email" ? replySubject(ask.theirSubject) : "",
    used: usedOf(rt, ask.wire, thread.history.length, notes),
  };
}

async function writeBrief(writing: Writing, tenantId: TenantId, ask: ReplyDraftAsk): Promise<BriefWritten> {
  const { db, now } = writing;
  const log = logger({ tenant_id: tenantId });
  const said = (reason: ReplyDraftWhy): BriefWritten => {
    log.info("reply_draft", {
      conversation: ask.conversationId,
      source: ask.source,
      drafted: false,
      why: reason,
      kind: "brief",
    });
    return { why: reason };
  };
  const gate = await readied(writing, tenantId, ask);
  if ("why" in gate) return said(gate.why);
  const { rt, brainConfig } = gate;
  const ms = ask.deadline - now();
  if (ms <= 0) throw new Error("reply_draft: no time left for the brief");
  const thread = await readThreadState(db, tenantId, ask.conversationId, null, BRIEF_TURNS);
  const { note, notes } = await noteOf(db, tenantId, rt, ask);
  const at = new Date(now());
  const system = [
    resolveSystemPrompt(brainConfig, "voice", rt.timezone, at, rt.policy, rt.known, "draft"),
    ...DRAFT_BRIEF_RULES,
  ].join("\n");
  const turns = thread.history
    .map((t) => `${t.role === "user" ? "They said" : "We said"}: ${t.content.slice(0, BRIEF_TURN_CHARS)}`)
    .join("\n");
  const answered = await askJson({
    purpose: "reply_draft",
    system,
    user: [
      describeNow(rt.timezone, at, brainConfig.profile?.closures),
      note ?? null,
      ask.holdDetails ? `What the receptionist left for the call:\n${fenced("record", ask.holdDetails)}` : null,
      turns ? `What has been said:\n${fenced("record", turns)}` : null,
      ask.instruction ? frameSteer(ask.instruction) : null,
    ]
      .filter(Boolean)
      .join("\n\n"),
    schema: DRAFT_BRIEF_SCHEMA,
    maxTokens: DRAFT_MAX_TOKENS,
    plainJsonHint: ANSWER_JSON_ONLY,
    timeoutMs: ms,
    signal: AbortSignal.timeout(ms),
    for: { tenantId, subjectId: ask.conversationId, promptHash: promptHashOf(system) },
  });
  const brief = draftBriefOf(answered?.answer);
  if (!brief) return said("not_drafted");
  const words = [brief.opening, ...brief.points, brief.ask].join("\n");
  if (moneyRefused(words, { rt, brain: brainConfig, at }, ask.instruction ?? null)) {
    log.warn("policy_block_price", { conversation: ask.conversationId });
    return said("named_money");
  }
  log.info("reply_draft", { conversation: ask.conversationId, source: ask.source, drafted: true, kind: "brief" });
  return { brief, used: usedOf(rt, "voice", thread.history.length, notes) };
}

/** The writer over this database. The tests give their own brain and clock. */
export function draftWriter(
  db: Db,
  over: { brain?: typeof generateReply; now?: () => number } = {},
): ReplyDraftEdge["write"] {
  const w: Writing = { db, brain: over.brain ?? generateReply, now: over.now ?? Date.now };
  return {
    reply: (tenantId, ask) => writeReply(w, tenantId, ask),
    brief: (tenantId, ask) => writeBrief(w, tenantId, ask),
  };
}

/** What a thread's draft needs of the edge (jobs ReplyDraftEdge), for the tick, the door and the sweep. */
export function draftEdge(db: Db): ReplyDraftEdge {
  return {
    write: draftWriter(db),
    readSender: (tenantId, email, until) => {
      const read = senderFactsReaderFor(db, tenantId, logger({ tenant_id: tenantId }));
      return read(
        {
          from: { address: email.from, name: email.name },
          replyTo: null,
          subject: email.subject,
          words: email.words,
          service: false,
          tab: null,
          answers: !!email.answers,
        },
        until,
      );
    },
  };
}
