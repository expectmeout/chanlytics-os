import "server-only";
import {
  CUSTOMER_MESSAGE_SKILL,
  MESSAGE_CRAFT_JSON_SCHEMA,
  MessageCraftAnswerSchema,
  craftedVersions,
  messageBriefText,
  messageCraftIssues,
  noteAsTold,
  notesInForce,
  parseTenantConfigResult,
  type CraftVersions,
  type MessageBrief,
} from "@chanlytics/contracts";
import { log } from "@/server/log";
import { load } from "../../readers";
import { businessShape, config, facts } from "../../readers/facts";
import type { ToolContext } from "../tools/context";
import { CRAFT_MIN_MS, craftWith, turnDeadline, type CraftKept } from "./craft";

/** The services a brief names: enough to know the business, never its price notes (a price is the draft's alone). */
const SERVICES_SAID = 12;

/** What the business is, for the writer, as the turn's own readers read it; null where any of it could not be read. */
async function businessOf(t: ToolContext): Promise<MessageBrief["business"] | null> {
  try {
    const [named, row, shape] = await Promise.all([
      load(t.rc, facts, undefined).then((r) => r.data),
      load(t.rc, config, undefined).then((r) => r.data),
      load(t.rc, businessShape, undefined).then((r) => r.data),
    ]);
    // A configuration that does not parse is not "no voice": the words would be written in nobody's.
    const parsed = parseTenantConfigResult(row?.config ?? null);
    if (!parsed.ok) return null;
    const profile = parsed.config.brain?.profile;
    return {
      name: parsed.config.brain?.business_name || named.name,
      tone: profile?.tone?.trim() || null,
      services: (profile?.services ?? []).slice(0, SERVICES_SAID).map((s) => s.name),
      notes: notesInForce(profile?.notes, named.timezone, t.rc.now).map(noteAsTold),
      word: shape.word,
    };
  } catch (e) {
    log.error("ask_tool_read_failed", { tool: "customer_message", read: "business", tenant_id: t.tenantId, error: e });
    return null;
  }
}

/** The message as the card asked it: its name, kind, language and values, and Ask's versions, the first draft. */
interface MessageAskedOf {
  name: string;
  category: MessageBrief["message"]["category"];
  language: MessageBrief["message"]["language"];
  values: MessageBrief["message"]["values"];
  draft: CraftVersions;
}

type MessageWritten = { wrote: true; versions: CraftVersions } | { wrote: false; why: CraftKept };

/**
 * The customer message writer (contracts ask-skills, CUSTOMER_MESSAGE_SKILL) behind a message card: the business read,
 * the brief made, the craft call made in the turn's time left, and its words checked by the skill's checks. The words, or
 * why the card keeps its first draft (said once in the log, `ask_skill_crafted`, with how long it took, which is what says
 * whether a craft call fits a turn). A plan's step (`t.step`) writes the offer message its later offers reuse, so the
 * writer is told to write around the offer's value. The writer reads what the owner asked in their own words too, and
 * ends before the turn does (the loop's `endsAt`).
 */
export async function writeCustomerMessage(t: ToolContext, asked: MessageAskedOf): Promise<MessageWritten> {
  const said = (r: MessageWritten & { ms: number; issues?: string[]; detail?: string }): MessageWritten => {
    log.info("ask_skill_crafted", {
      tenant_id: t.tenantId,
      skill: CUSTOMER_MESSAGE_SKILL.id,
      outcome: r.wrote ? "wrote" : "kept",
      ...(r.wrote ? {} : { why: r.why }),
      ms: r.ms,
      ...(r.issues ? { issues: r.issues } : {}),
      ...(r.detail ? { detail: r.detail.slice(0, 200) } : {}),
    });
    return r.wrote ? { wrote: true, versions: r.versions } : { wrote: false, why: r.why };
  };
  const deadline = turnDeadline(t);
  // Too little of the turn left to write in: nothing is read or asked.
  if (deadline - Date.now() < CRAFT_MIN_MS) return said({ wrote: false, why: "late", ms: 0 });
  const business = await businessOf(t);
  if (!business) return said({ wrote: false, why: "unread", ms: 0 });
  // The owner's own words beside Ask's draft of them, where a turn asked: what they gave is what the message may say.
  const owner = t.question?.trim() || null;
  const brief: MessageBrief = { business, message: { ...asked, reused: t.step !== undefined, asked: owner } };
  const made = await craftWith(CUSTOMER_MESSAGE_SKILL, {
    tenantId: t.tenantId,
    userId: t.ctx.userId,
    question: messageBriefText(brief),
    schema: MESSAGE_CRAFT_JSON_SCHEMA,
    answer: MessageCraftAnswerSchema,
    deadline,
    what: "message",
  });
  if (!made.ok)
    return said({ wrote: false, why: made.why, ms: made.ms, ...(made.detail ? { detail: made.detail } : {}) });
  const { versions, missing } = craftedVersions(made.answer, brief);
  const issues = messageCraftIssues(versions, brief, missing);
  if (issues.length)
    return said({ wrote: false, why: "checks", ms: made.ms, issues: issues.map((i) => `${i.channel} ${i.code}`) });
  return said({ wrote: true, versions, ms: made.ms });
}
