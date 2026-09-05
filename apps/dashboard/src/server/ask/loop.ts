import "server-only";
import {
  ASK_MAX_ROUNDS,
  ASK_TURN_BUDGET_MS,
  citationRoute,
  groundCitations,
  isUngrounded,
  normalizeNavigate,
  parseAskFinish,
  partialAnswer,
  type AskFinish,
  type AskLanguage,
  type AskMessageVM,
  type AskProposal,
  type AskScope,
} from "@chanlytics/contracts";
import type { RouteContext } from "../with-route";
import { GatewayRefused, featureRejected, streamModel, type GatewayEvent } from "./gateway";
import { FINISH_TOOL, READ_TOOLS, newToolContext, runTool, toolLabel, type ToolContext } from "./tools";
import { ACT_TOOLS, ACT_TOOL_NAMES, buildProposal, proposalLabel } from "./proposals";
import { stableSystem, turnSystem, type WorkspaceFacts } from "./prompt";
import { buildSnapshot, snapshotBlock } from "./snapshot";

/**
 * One turn of the assistant: reads, then the answer.
 *
 * The model is asked with the read tools, the act tools and the finish tool
 * and must call one or more of them each round. Reads run as the person, in
 * parallel when several were asked for, and their results go back as one
 * message. An act tool never acts: it checks what was asked against the
 * workspace and returns a proposal, which becomes a card on the answer. The
 * finish call is the answer: its input streams as partial JSON, and the
 * answer field is forwarded to the palette as it grows. The last allowed
 * round forces finish, so a turn always ends in an answer or a stated
 * failure, never in silence.
 */

export const ASK_MODEL = "claude-opus-5";
const MAX_TOKENS = 1200;
/**
 * Choosing a tool is not writing an answer. The rounds run at low effort:
 * the receptionist's replies run there too and hold on the eval set, and a
 * round is three and a half seconds of a turn. The eval set decides if this
 * stays.
 */
const EFFORT: "low" | "medium" = "low";

export interface TurnEvent {
  t: "trace" | "delta" | "final" | "error";
  text?: string;
  message?: AskMessageVM;
}

export interface TurnInput {
  ctx: RouteContext;
  tenantId: string;
  role: "owner" | "operator" | "viewer";
  facts: WorkspaceFacts;
  timezone: string;
  personLabel: string;
  language: AskLanguage;
  scope: AskScope | null;
  surface: string | null;
  /** Prior turns of this thread, oldest first, as plain text. */
  history: Array<{ role: "user" | "assistant"; text: string }>;
  text: string;
  emit: (ev: TurnEvent) => void;
  now?: Date;
}

export interface TurnResult {
  finish: AskFinish | null;
  answer: string;
  citations: AskMessageVM["citations"];
  navigate: AskMessageVM["navigate"];
  followups: string[];
  language: AskLanguage;
  ungrounded: boolean;
  tools: string[];
  proposals: AskProposal[];
  latencyMs: number;
  failed: boolean;
  /** Why it failed, for the log; the answer text already says it to the person. */
  failure: string | null;
  rounds: number;
}

interface Block {
  type: "text" | "tool_use";
  id: string;
  name: string;
  text: string;
  json: string;
}

type Msg = { role: "user" | "assistant"; content: unknown };

const MAX_HISTORY = 12;
const HISTORY_CHARS = 1200;

function refusalText(r: GatewayRefused["refusal"], es: boolean): string {
  switch (r.kind) {
    case "preview": return es ? "Ask solo responde en el panel de producción." : "Ask only answers on the production dashboard.";
    case "budget": return es ? "Ask usó su presupuesto diario. Vuelve mañana; las páginas siguen funcionando." : "Ask has used its daily budget. Try again tomorrow; the pages still work.";
    case "no_key": return es ? "Ask no está conectado a un modelo todavía." : "Ask is not connected to a model yet.";
    case "unreachable": return es ? "No pude llegar al modelo. Inténtalo de nuevo en un momento." : "I could not reach the model. Try again in a moment.";
    default: return es ? "El modelo rechazó la pregunta. Inténtalo de otra forma." : "The model refused the question. Try it another way.";
  }
}

export async function runAskTurn(input: TurnInput): Promise<TurnResult> {
  const t0 = Date.now();
  const now = input.now ?? new Date();
  const es = input.language === "es";
  const tc: ToolContext = newToolContext(input.ctx, input.tenantId, input.role, now);
  const toolsUsed: string[] = [];
  const proposals: AskProposal[] = [];
  let reads = 0;

  // The day, before the model is asked: one parallel set of small queries.
  // Its rows enter the read set, so the answer can cite them; a failure
  // here costs the snapshot, never the turn.
  let snapshot = "";
  const tSnap = Date.now();
  try {
    snapshot = snapshotBlock(await buildSnapshot(tc, input.timezone, input.scope));
    reads++;
  } catch (e) {
    console.error("ask_snapshot_failed", JSON.stringify({ error: e instanceof Error ? e.message : String(e), tenant: input.tenantId }));
  }
  const snapshotMs = Date.now() - tSnap;

  // Two cache breakpoints: the stable block (rules, definitions, the business
  // facts) for every turn in the workspace, and the snapshot for this turn's
  // later rounds and a quick follow-up. The clock sits between them, so it
  // is rewritten each turn without touching either cache. The turn block
  // holds the minute, so a follow-up within the same minute hits the second
  // breakpoint; a later one pays for the snapshot once more, not the rules.
  const system = [
    { type: "text", text: stableSystem(input.facts), cache_control: { type: "ephemeral" } },
    { type: "text", text: turnSystem({ role: input.role, personLabel: input.personLabel, scope: input.scope, surface: input.surface, language: input.language, timezone: input.timezone, closures: input.facts.closures, now }) },
    ...(snapshot ? [{ type: "text", text: snapshot, cache_control: { type: "ephemeral" } }] : []),
  ];
  const messages: Msg[] = [
    ...input.history.slice(-MAX_HISTORY).map((h) => ({ role: h.role, content: h.text.slice(0, HISTORY_CHARS) })),
    { role: "user", content: input.text },
  ];
  // Two consecutive turns of one role are not allowed; a stored history that
  // ends in a user turn (a failed round) is folded into this question.
  for (let i = messages.length - 2; i >= 0; i--) {
    if (messages[i].role === messages[i + 1].role) {
      messages[i] = { role: messages[i].role, content: `${messages[i].content}\n${messages[i + 1].content}` };
      messages.splice(i + 1, 1);
    }
  }
  if (messages[0]?.role !== "user") messages.shift();

  const baseTools = [...READ_TOOLS, ...(input.role === "viewer" ? [] : ACT_TOOLS), FINISH_TOOL];
  let strict = true;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ASK_TURN_BUDGET_MS);

  const done = (partial: Partial<TurnResult> & { answer: string; failed: boolean; failure: string | null; rounds: number }): TurnResult => {
    clearTimeout(timer);
    console.log(JSON.stringify({ level: "info", event: "ask_turn_shape", tenant: input.tenantId, snapshot_ms: snapshotMs, snapshot: !!snapshot, rounds: partial.rounds, tools: toolsUsed }));
    return {
      finish: null,
      citations: [],
      navigate: null,
      followups: [],
      language: input.language,
      ungrounded: false,
      tools: toolsUsed,
      proposals,
      latencyMs: Date.now() - t0,
      ...partial,
    };
  };

  try {
    for (let round = 1; round <= ASK_MAX_ROUNDS; round++) {
      const last = round === ASK_MAX_ROUNDS;
      const tools = baseTools.map((d) => ({ name: d.name, description: d.description, input_schema: d.input_schema, ...(d.strict && strict ? { strict: true } : {}) }));
      const request = {
        model: ASK_MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages,
        tools,
        tool_choice: last ? { type: "tool", name: "finish" } : { type: "any" },
        output_config: { effort: EFFORT },
      };

      const blocks = new Map<number, Block>();
      let stopReason: string | null = null;
      let streamError: string | null = null;
      let answerSoFar = "";
      let finishIndex = -1;

      let events: AsyncGenerator<GatewayEvent>;
      try {
        events = streamModel({ tenantId: input.tenantId, userId: input.ctx.userId, request, signal: controller.signal });
        // The generator opens the connection on its first pull.
        for await (const ev of events) {
          switch (ev.type) {
            case "block_start":
              blocks.set(ev.index, { type: ev.block.type, id: ev.block.type === "tool_use" ? ev.block.id : "", name: ev.block.type === "tool_use" ? ev.block.name : "", text: "", json: "" });
              if (ev.block.type === "tool_use" && ev.block.name === "finish") finishIndex = ev.index;
              break;
            case "text": {
              const b = blocks.get(ev.index);
              if (b) b.text += ev.text;
              break;
            }
            case "input_json": {
              const b = blocks.get(ev.index);
              if (!b) break;
              b.json += ev.partial;
              if (ev.index === finishIndex) {
                const a = partialAnswer(b.json);
                if (a.length > answerSoFar.length) {
                  input.emit({ t: "delta", text: a.slice(answerSoFar.length) });
                  answerSoFar = a;
                }
              }
              break;
            }
            case "stop": stopReason = ev.stopReason; break;
            case "error": streamError = ev.message; break;
            default: break;
          }
        }
      } catch (e) {
        if (e instanceof GatewayRefused) {
          if (e.refusal.kind === "bad_request" && strict && featureRejected(e.refusal.message)) {
            console.error("ask_strict_rejected", JSON.stringify({ error: e.refusal.message.slice(0, 200) }));
            strict = false;
            round--;
            continue;
          }
          console.error("ask_gateway_refused", JSON.stringify({ kind: e.refusal.kind, tenant: input.tenantId }));
          return done({ answer: refusalText(e.refusal, es), failed: true, failure: e.refusal.kind, rounds: round });
        }
        if (controller.signal.aborted) {
          return done({ answer: es ? "Tardé demasiado en leer. Pregunta algo más concreto." : "That took too long to read. Ask something more specific.", failed: true, failure: "timeout", rounds: round });
        }
        throw e;
      }

      if (streamError && !blocks.size) {
        return done({ answer: es ? "Se cortó la conexión con el modelo. Inténtalo de nuevo." : "The connection to the model dropped. Try again.", failed: true, failure: streamError, rounds: round });
      }
      if (stopReason === "refusal") {
        return done({ answer: es ? "No puedo responder a eso aquí." : "I can't answer that here.", failed: true, failure: "refusal", rounds: round });
      }

      const ordered = [...blocks.entries()].sort((a, b) => a[0] - b[0]).map(([, b]) => b);
      const finish = ordered.find((b) => b.type === "tool_use" && b.name === "finish");
      const readCalls = ordered.filter((b) => b.type === "tool_use" && b.name !== "finish");

      if (finish) {
        const parsed = parseAskFinish(finish.json || "{}");
        if (!parsed.ok) {
          const text = ordered.filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
          console.error("ask_finish_unparsed", JSON.stringify({ error: parsed.error, tenant: input.tenantId }));
          return done({
            answer: text || (es ? "No pude dar forma a la respuesta. Pregunta de nuevo." : "I could not shape the answer. Ask again."),
            failed: !text,
            failure: `finish: ${parsed.error}`,
            rounds: round,
          });
        }
        const f = parsed.value;
        const { kept, dropped } = groundCitations(f.citations, tc.read);
        if (dropped) console.warn("ask_citations_dropped", JSON.stringify({ dropped, tenant: input.tenantId }));
        const navTo = f.navigate ? normalizeNavigate(f.navigate.to, tc.read) : null;
        if (f.navigate && !navTo) console.warn("ask_navigate_dropped", JSON.stringify({ to: f.navigate.to.slice(0, 120), tenant: input.tenantId }));
        const navigate = f.navigate && navTo ? { ...f.navigate, to: navTo } : null;
        return done({
          finish: f,
          answer: f.answer,
          citations: kept.map((c) => ({ ...c, to: citationRoute(c) })),
          navigate,
          followups: f.followups,
          language: f.language === "other" ? input.language : f.language,
          // A card's figures are the person's own request, checked against the workspace;
          // an answer that restates them is not an invention.
          ungrounded: isUngrounded(f.answer, reads + proposals.length),
          failed: false,
          failure: null,
          rounds: round,
        });
      }

      if (!readCalls.length) {
        // The model wrote prose instead of calling a tool (tool_choice any
        // should prevent it). Take the prose as the answer, unverified.
        const text = ordered.filter((b) => b.type === "text").map((b) => b.text).join(" ").trim();
        return done({
          answer: text || (es ? "No encontré nada que leer para esa pregunta." : "I found nothing to read for that question."),
          ungrounded: isUngrounded(text, reads + proposals.length),
          failed: !text,
          failure: text ? null : "no_tool_no_text",
          rounds: round,
        });
      }

      // Run the reads, in parallel, and hand every result back at once.
      for (const b of readCalls) input.emit({ t: "trace", text: ACT_TOOL_NAMES.has(b.name) ? proposalLabel(b.name) : toolLabel(b.name) });
      const outcomes = await Promise.all(
        readCalls.map(async (b) => {
          let parsedInput: Record<string, unknown> = {};
          try { parsedInput = b.json ? (JSON.parse(b.json) as Record<string, unknown>) : {}; } catch { /* an empty input */ }
          toolsUsed.push(b.name);
          if (ACT_TOOL_NAMES.has(b.name)) {
            const p = await buildProposal(tc, b.name, parsedInput);
            if (p.proposal) proposals.push(p.proposal);
            return { block: b, out: { result: p.result, isError: p.isError, label: proposalLabel(b.name) } };
          }
          const out = await runTool(tc, { name: b.name, input: parsedInput });
          if (!out.isError) reads++;
          return { block: b, out };
        }),
      );
      messages.push({
        role: "assistant",
        content: ordered.map((b) => b.type === "text"
          ? { type: "text", text: b.text || " " }
          : { type: "tool_use", id: b.id, name: b.name, input: safeJson(b.json) }),
      });
      messages.push({
        role: "user",
        content: outcomes.map(({ block, out }) => ({ type: "tool_result", tool_use_id: block.id, content: out.result, is_error: out.isError })),
      });
      if (Date.now() - t0 > ASK_TURN_BUDGET_MS - 8_000 && !last) {
        // Not enough time for another read: answer with what there is.
        messages[messages.length - 1] = {
          role: "user",
          content: [
            ...(messages[messages.length - 1].content as unknown[]),
            { type: "text", text: "Time is up for reads. Call finish now with what you have." },
          ],
        };
        round = ASK_MAX_ROUNDS - 1;
      }
    }
    return done({ answer: es ? "No llegué a una respuesta. Inténtalo de nuevo." : "I did not reach an answer. Try again.", failed: true, failure: "rounds_exhausted", rounds: ASK_MAX_ROUNDS });
  } catch (e) {
    console.error("ask_turn_failed", JSON.stringify({ error: e instanceof Error ? e.message : String(e), tenant: input.tenantId }));
    return done({ answer: es ? "Algo falló al responder. Inténtalo de nuevo." : "Something went wrong while answering. Try again.", failed: true, failure: e instanceof Error ? e.message : String(e), rounds: 0 });
  }
}

function safeJson(s: string): unknown {
  try { return s ? JSON.parse(s) : {}; } catch { return {}; }
}
