/**
 * The model's turn: who the person is and what is open, the words composed, and layer two checking them
 * (steps.ts layerTwo) inside the same try, so a failure anywhere in the turn becomes the holding reply and a
 * person rather than a lost message. With no model key the workspace's own greeting goes, labelled a
 * fallback, and the platform is paged.
 */
import { resolveSystemPrompt, describeNow, shadowWordsOf } from "@chanlytics/contracts";
import type { BrainConfig, BrainMeta } from "@chanlytics/contracts";
import { photoUserText } from "./vision";
import { layerTwo, noModelPlan, NO_MODEL_PAGE } from "./steps";
import { errField, type Answering } from "./context";

/** What the turn leaves for the dispatch: the words, whether they hand off and why, and what they cost. */
export interface Turn {
  replyText: string;
  escalate: boolean;
  escalationReason: string;
  usage: { input_tokens: number; output_tokens: number } | undefined;
  brainMeta: BrainMeta | undefined;
  fallback: ReturnType<typeof noModelPlan> | undefined;
  brainMs: number;
  photo: { mime: string; base64: string } | null;
}

/** Who this person is and their visits, for the model; nothing when they cannot be read, which is never fatal. */
async function leadNoteFor(at: Answering): Promise<string | undefined> {
  const { db, tenantId, from, ports, rt, L } = at;
  // The same description the voice agent is given, from the same reader.
  // One receptionist means one account of who this person is — not a name
  // on the phone and an anonymous stranger over text.
  //
  // Never fatal: an unavailable lead lookup costs recognition, and losing
  // the reply entirely to get it would be a far worse trade.
  let leadNote: string | undefined;
  if (db && tenantId) {
    try {
      const e164 = from.startsWith("+") ? from : `+${from}`;
      const lead = await ports.leads.read(db, tenantId, e164, 1);
      leadNote = ports.leads.describe(lead, new Date(), rt?.timezone ?? "UTC");
      // Their appointments, from the same feed the openings come from:
      // "when is my appointment?" is answered from the calendar, never guessed.
      const visits = rt ? await ports.calendar.visits(rt, { phone: e164, name: lead.name }) : null;
      if (visits) leadNote = `${leadNote}\n${visits}`;
    } catch (e) {
      L.warn("lead_context_unavailable", { error: errField(e) });
    }
  }
  return leadNote;
}

/**
 * Layer-2 policy enforcement (Blueprint §6): prompt text is never the only defense (steps.ts/layerTwo). A price in the
 * draft blocks the send outright; money, in the words or in the model's intent, is a person's; under "ask", a booking
 * or a service/pricing question is a person's to answer whatever the model made of the prompt.
 */
function checked(
  at: Answering,
  brainCfg: BrainConfig,
  r: { text: string; escalate: boolean; reason?: string; meta?: BrainMeta },
): Pick<Turn, "replyText" | "escalate" | "escalationReason"> {
  const { rt, L } = at;
  const intent = r.meta?.intent ?? null;
  const two = layerTwo({
    replyText: r.text,
    escalate: r.escalate,
    escalationReason: r.reason ?? "human_token",
    brainCfg,
    policy: rt?.policy,
    intent,
    language: r.meta?.language ?? null,
    known: rt?.known,
  });
  if (two.priceBlocked) L.warn("policy_block_price");
  if (two.moneyHeld) L.info("wa_policy_money", { intent });
  if (two.askClass) L.info("wa_policy_ask", { class: two.askClass, intent, complied: two.complied });
  return { replyText: two.replyText, escalate: two.escalate, escalationReason: two.escalationReason };
}

/** The model composes and layer two checks the words, or, with no model key, the fallback goes. */
export async function modelTurn(
  at: Answering,
  bodyText: string,
  photo: { mime: string; base64: string } | null,
): Promise<Turn> {
  const { ports, db, rt, thread, n, fallbacks, L } = at;
  // A persona is certain here: the mode in force held every message of a workspace without one (./reply-gates.ts).
  const brainCfg = at.brainCfg as BrainConfig;
  let replyText: string;
  let escalate: boolean;
  let escalationReason: string;
  let usage: { input_tokens: number; output_tokens: number } | undefined;
  let brainMeta: BrainMeta | undefined;
  let fallback: ReturnType<typeof noModelPlan> | undefined;
  let brainMs = 0;
  if (ports.env.modelKey) {
    try {
      const { generateReply } = await ports.brain();
      const leadNote = await leadNoteFor(at);
      // What is open, from the calendar feed, when the workspace has one.
      // Cached for five minutes on the edge; a feed that cannot be read says
      // nothing. Read HERE, beside the visits above and the one line below that
      // consumes it — it used to be awaited at the top of the handler, so a
      // short code, an off-allowlist sender, a STOP, a thumbs-up, a duplicate
      // and a rate-capped message each paid an HTTP fetch and an ICS parse for
      // a value none of them ever reads, and the ingest write that must never
      // wait waited behind it.
      const openings = rt ? await ports.calendar.openings(rt) : null;
      const tBrain = Date.now();
      const r = await generateReply(
        thread.history,
        photo ? photoUserText(n.media?.caption) : bodyText,
        // Composed from the workspace's structured facts when it has them,
        // and its hand-written prompt when it does not. lib/call-start.ts
        // composes the SAME thing for the voice agent, which is the point:
        // two copies of the hours is how two channels start disagreeing
        // about when the business opens.
        resolveSystemPrompt(brainCfg, "whatsapp", rt?.timezone, new Date(), rt?.policy, rt?.known),
        fallbacks!.error,
        leadNote,
        // "Are you open?" it could already answer. "Are you open RIGHT NOW?"
        // it was answering too, from nothing — it had a table of hours and no
        // idea what day it was.
        `${describeNow(rt?.timezone, new Date(), brainCfg.profile?.closures)}${openings ? `\n\n${openings}` : ""}`,
        photo ?? undefined,
        undefined,
        // Who it is for: the model port writes the call to the usage ledger and stamps the meta with the settings'
        // version the prompt was composed from.
        {
          tenantId: at.tenantId ?? null,
          subjectId: at.ing?.conversation_id ?? null,
          configVersion: rt?.configVersion ?? null,
          // A second model is put the customer's own words in shadow, when it is on (contracts shadowWordsOf).
          shadowText: shadowWordsOf({ text: bodyText, photo: photo !== null, caption: n.media?.caption }),
        },
      );
      usage = r.usage;
      brainMeta = r.meta;
      brainMs = Date.now() - tBrain;
      ({ replyText, escalate, escalationReason } = checked(at, brainCfg, r));
    } catch (e) {
      L.error("brain_failed", { error: errField(e) });
      replyText = fallbacks!.error;
      escalate = true;
      escalationReason = "brain_error";
    }
  } else {
    // No model key: the receptionist cannot answer. The workspace's own
    // greeting still goes, labelled a fallback, the thread is handed to a
    // person, and the platform is paged once per window (noModelPlan says
    // why). A canned greeting passed off as an answer would be the quiet
    // failure this replaces.
    fallback = noModelPlan(fallbacks!);
    replyText = fallback.replyText;
    escalate = fallback.escalate;
    escalationReason = fallback.escalationReason;
    L.error("wa_no_model");
    // Guarded, like every other external call on this path. pageOperator's own
    // Supabase reads are not wrapped, so a fetch-level failure threw straight
    // out of handleInbound: the workspace's greeting never went, nothing was
    // marked processed, no escalation opened, and the route logged one line and
    // answered 200 — so Meta never retried either. A PLATFORM notice must never
    // be what costs a customer their reply.
    if (db) {
      try {
        await ports.page({ db }, NO_MODEL_PAGE.key, NO_MODEL_PAGE.subject, NO_MODEL_PAGE.body);
      } catch (e) {
        L.error("wa_no_model_page_failed", { error: errField(e) });
      }
    }
  }
  return { replyText, escalate, escalationReason, usage, brainMeta, fallback, brainMs, photo };
}
