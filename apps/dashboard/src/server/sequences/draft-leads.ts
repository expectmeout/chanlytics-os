/**
 * Ask drafts a sequence to leads' emails (POST sequences/draft-leads; the lead-to-sequence canvas's New, "A draft by Ask:
 * from your goal in Settings and this search", 18 Oct 2026): one model call writes the first email and a follow-up in the
 * reach-out's own words (its ten slots, the opening written for each business when its batch is planned), from what the
 * workspace is, its goal (config `ask.goal`) and the search the leads came from (its name and what was asked). Every word
 * the model gives is judged here as every email is (contracts validateReachOutWords: the slots it may name, no link in a
 * first email, its length), a step that does not hold is left for the owner to write, and the call step always closes it.
 * Nothing is written (decision 0017): New makes the draft with these steps (POST sequences, starts 'leads').
 */
import "server-only";
import { z } from "zod";
import {
  AppError,
  DATA_NOT_INSTRUCTIONS,
  REACH_OUT_AFTER_DAYS,
  fencedInline,
  parseTenantConfig,
  validateReachOutWords,
  violatesNoPrices,
} from "@chanlytics/contracts";
import { askForJson } from "../model-json";
import { load, type ReaderContext } from "../readers";
import * as facts from "../readers/facts";
import { storedConfigOf } from "../workspace/config-row";
import { searchRow } from "../leads/lead-searches";

/** What the model is asked for: the first email with its subject, and a follow-up with its wait. */
const LEAD_DRAFT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["first", "follow_up"],
  properties: {
    first: {
      type: "object",
      additionalProperties: false,
      required: ["subject", "body"],
      properties: { subject: { type: "string" }, body: { type: "string" } },
    },
    follow_up: {
      type: "object",
      additionalProperties: false,
      required: ["body", "after_days"],
      properties: { body: { type: "string" }, after_days: { type: "integer" } },
    },
  },
} as const;

const LeadDraftAnswer = z.object({
  first: z.object({ subject: z.string(), body: z.string() }),
  follow_up: z.object({ body: z.string(), after_days: z.number().int() }),
});

/** The rules the model writes under: the reach-out's own, said once. */
const DRAFT_RULES = [
  "You write the two cold emails a small business sends to other local businesses it found, once each, by hand-picked lead.",
  "Use only these slots, written exactly so, in double braces: {{opening}} (one line about them, written for each business later; put it first in the body, on its own line), {{business}}, {{first name}}, {{city}}, {{your name}}, {{your business}}. Use {{booking link}} only in the follow-up, never in the first email.",
  "The first email: a subject of at most 8 words naming {{business}} or what you offer, and a body of at most 80 words: {{opening}}, who you are in one sentence, what you could do for them in one, and one easy question to answer. No link, no attachment, no price, no exclamation marks.",
  "The follow-up answers the first in the same thread, so it has no subject: at most 50 words, kind, one question. It waits 3 to 7 days.",
  "Plain, warm, specific to the kind of business the search found. Never invent a fact about them: the opening is the only line about them.",
  "Sign nothing: the signature is added. Answer with the JSON asked for.",
];

/** What the model is told: the workspace, its goal, and the search, each fenced as data. */
function draftAskedOf(p: {
  business: string;
  goal: string | null;
  search: { name: string; asked: string } | null;
  name: string;
}) {
  return [
    DATA_NOT_INSTRUCTIONS,
    `The business sending: ${fencedInline("record", p.business)}`,
    p.goal ? `What it is working toward: ${fencedInline("record", p.goal)}` : null,
    p.search
      ? `The leads came from a search named ${fencedInline("record", p.search.name)}, asked as ${fencedInline("record", p.search.asked)}.`
      : null,
    `The sequence is called ${fencedInline("record", p.name)}.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** One email kept as the model wrote it, where it holds as every email must; else left for the owner to write. */
const keptEmail = (w: { subject: string | null; body: string }, first: boolean) =>
  validateReachOutWords(w, first).length === 0 && !violatesNoPrices(`${w.subject ?? ""} ${w.body}`) ? w : null;

/** The route's handle: what is known, one model call, what is kept of it, and the call step after it. */
export async function draftLeadSteps(rc: ReaderContext, input: { name: string; search_id?: string }) {
  const [names, config, search] = await Promise.all([
    load(rc, facts.facts, undefined).then((r) => r.data),
    storedConfigOf(rc.ctx.supabase, rc.tenantId).then(parseTenantConfig, () => null),
    input.search_id
      ? searchRow(rc.ctx, rc.tenantId, input.search_id).then(
          (s) => ({ name: s.name, asked: s.asked }),
          () => null,
        )
      : Promise.resolve(null),
  ]);
  const answer = await askForJson(
    {
      tenantId: rc.tenantId,
      userId: rc.userId,
      purpose: "sequence_draft",
      request: {
        max_tokens: 700,
        system: DRAFT_RULES.join("\n"),
        schema: LEAD_DRAFT_JSON_SCHEMA,
        messages: [
          {
            role: "user",
            content: draftAskedOf({ business: names.name, goal: config?.ask?.goal ?? null, search, name: input.name }),
          },
        ],
      },
    },
    LeadDraftAnswer,
    "draft",
  );
  const first = keptEmail({ subject: answer.first.subject.trim(), body: answer.first.body.trim() }, true);
  if (!first) throw new AppError("upstream_anthropic", "Ask's draft didn't hold up. Start it blank and write it.", 502);
  const follow = keptEmail({ subject: null, body: answer.follow_up.body.trim() }, false);
  const wait = Math.min(REACH_OUT_AFTER_DAYS.max, Math.max(REACH_OUT_AFTER_DAYS.min, answer.follow_up.after_days));
  return {
    steps: [
      { subject: first.subject, body: first.body, after_days: null },
      { subject: null, body: follow ? follow.body : "", after_days: wait },
      { subject: null, body: "", after_days: 3, hand: { kind: "call" as const, words: "Call them" } },
    ],
  };
}
