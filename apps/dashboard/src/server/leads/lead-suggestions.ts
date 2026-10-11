/**
 * The ideas for a new search (§8.9, 00398, 00399): what is kept, the reader that writes them, and the business line
 * they read. Moved whole from leads.ts (Reach out Part 2.5), which re-exports it.
 *
 * Each idea is a ready plan written from what the workspace's searches found and what came of their leads
 * (lead_suggest_history), decided in contracts (lead-ideas.ts) and written by the model on its own route (lead_suggest,
 * Sonnet 5.5), in the workspace's language. They stand until a round ends (lead_suggestions.basis), the owner saves a
 * business line, or a month passes; two reads at once write them once (lead_suggestions_claim), and what a read wrote
 * is kept only while its claim stands (lead_suggestions_keep: a line saved meanwhile wins). A model that would not
 * answer is not asked again for a few minutes (failed_at). An idea offered before and not started is passed on
 * (lead_suggestions.passed), and not offered again once it has been offered twice. A member who may not find reads
 * what was written and asks for nothing.
 */
import {
  AppError,
  DAY_MS,
  ideaBasisOf,
  ideaHistoryOf,
  ideaJsonSchema,
  ideaPacket,
  ideaPacketText,
  ideaPassed,
  ideaPassedOf,
  ideasRead,
  LEAD_IDEAS_SYSTEM,
  LEAD_MONTHLY_ALLOWANCE,
  LEAD_SUGGEST_DAYS,
  LEAD_SUGGEST_RETRY_MS,
  LEAD_SUGGEST_UNAVAILABLE,
  LeadIdeasAnswerSchema,
  leadMonth,
  leadReachLine,
  MODEL_ROUTES,
  type IdeaHistory,
  type IdeaLanguage,
  type IdeaPassed,
  type IdeaSearch,
  type LeadIdeaDto,
  type LeadSuggestionsDto,
} from "@chanlytics/contracts";
import {
  claimIdeas,
  failIdeas,
  ideasBasis,
  ideasClockAndLanguage,
  keepIdeas,
  readIdeaHistory,
  saveIdeasLine,
  type IdeasKept,
  type Json,
} from "@chanlytics/db";
import { log } from "@/server/log";
import { monthUsed, workspaceOffer } from "./lead-helpers";
import { nichePrior } from "./lead-plan-facts";
import { askForJson } from "../model-json";
import { serviceDb } from "../service-db";
import { tenantFactsOf } from "../tenant";
import type { RouteContext } from "../with-route";

/* ----------------------------------------------------------- what is kept */

interface SuggestionRow {
  tenant_id: string;
  business_line: string;
  by_owner: boolean;
  items: unknown;
  made_at: string;
  basis: string | null;
  failed_at: string | null;
  passed: unknown;
}

/**
 * The service's side of the ideas: the claim on writing them, keeping them by it, a failure by it, the owner's line
 * (the one door, lead_suggestions_write, 00400), and what the searches found (lead_suggest_history, 00398). 00142 grants
 * no write on `lead_suggestions` to a member, because what Claude wrote is not something an owner types, and both are
 * the service's. That is the part of this module a route test cannot run against a database in memory, so it is a
 * seam -- `setModelStream`'s twin, and the same rule: tests hand in their own.
 */
interface IdeaStore {
  claim: (tenantId: string, line: string) => Promise<string | null>;
  keep: (tenantId: string, claim: string, row: IdeasKept) => Promise<boolean>;
  fail: (tenantId: string, claim: string) => Promise<void>;
  history: (tenantId: string) => Promise<unknown>;
  /** The owner's own line, saved with no ideas: unconditional, since it is the owner's word over any write in flight. */
  saveLine: (tenantId: string, line: string) => Promise<void>;
}

const SERVICE_STORE: IdeaStore = {
  claim: (tenantId, line) => claimIdeas(serviceDb(), tenantId, line),
  keep: (tenantId, claim, row) => keepIdeas(serviceDb(), tenantId, claim, row),
  fail: (tenantId, claim) => failIdeas(serviceDb(), tenantId, claim),
  history: (tenantId) => readIdeaHistory(serviceDb(), tenantId),
  saveLine: (tenantId, line) => saveIdeasLine(serviceDb(), tenantId, line),
};
/** A test's store: the claim always granted, every keep kept, a failure kept nowhere, and no search found. */
const TEST_STORE: IdeaStore = {
  claim: () => Promise.resolve("2026-01-01T00:00:00.000Z"),
  keep: () => Promise.resolve(true),
  fail: () => Promise.resolve(),
  history: () => Promise.resolve({}),
  saveLine: () => Promise.resolve(),
};
let ideaStore: IdeaStore = SERVICE_STORE;

/** What a test's writer is handed: the row as it would be kept, for an idea's write and for the owner's line alike. */
type SuggestionsWriter = (tenantId: string, row: IdeasKept) => Promise<void>;

/**
 * Tests hand in a writer of their own (a function: handed every keep and every line saved), or any part of the store;
 * null puts the service's back.
 */
export function setSuggestionsWriter(w: SuggestionsWriter | Partial<IdeaStore> | null): void {
  if (!w) ideaStore = SERVICE_STORE;
  else if (typeof w === "function")
    ideaStore = {
      ...TEST_STORE,
      keep: async (tenantId, _claim, row) => {
        await w(tenantId, row);
        return true;
      },
      saveLine: (tenantId, line) =>
        w(tenantId, { business_line: line, by_owner: true, items: [], basis: null, passed: [] }),
    };
  else ideaStore = { ...TEST_STORE, ...w };
}

/** The kept row, when there is one. */
async function keptSuggestions(ctx: Pick<RouteContext, "supabase">, tenantId: string): Promise<SuggestionRow | null> {
  const { data, error } = await ctx.supabase
    .from("lead_suggestions")
    .select("tenant_id, business_line, by_owner, items, made_at, basis, failed_at, passed")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ?? null;
}

/** The ideas a row keeps: each with its words and its kind. One kept before plans were written has none to open. */
function keptIdeas(kept: SuggestionRow | null): LeadIdeaDto[] {
  const items = kept && Array.isArray(kept.items) ? (kept.items as Partial<LeadIdeaDto>[]) : [];
  return items.flatMap((i) =>
    i && typeof i.words === "string" && typeof i.category_key === "string"
      ? [{ ...i, words: i.words, who_for: i.who_for ?? "", category_key: i.category_key, reach: null }]
      : [],
  );
}

/**
 * Whether the kept ideas still stand: written over the same newest round (a row from before 00398 has no basis, and is
 * written again), under a month old, and with an idea in them.
 */
const stands = (kept: SuggestionRow, items: LeadIdeaDto[], basis: string): boolean =>
  items.length > 0 &&
  kept.basis !== null &&
  kept.basis === basis &&
  Date.now() - Date.parse(kept.made_at) < LEAD_SUGGEST_DAYS * DAY_MS;

/** Each idea gains how reachable its kind has been, from what past searches measured, and the counts behind it. */
async function withReach(ctx: Pick<RouteContext, "supabase">, items: LeadIdeaDto[]): Promise<LeadIdeaDto[]> {
  const priors = await Promise.all(items.map((i) => nichePrior(ctx, i.category_key).catch(() => null)));
  return items.map((i, n) => {
    const prior = priors[n] ?? null;
    return { ...i, reach: leadReachLine(prior), prior };
  });
}

/* --------------------------------------------------------- the ideas, read */

/** The workspace's own line for what it does: its name and what it offers. */
const offerLine = (offer: { name: string; services: string[] }) =>
  `${offer.name}${offer.services.length ? `: ${offer.services.join(", ")}` : ""}`;

/** The language the ideas are written in: the workspace's, English where it is not Spanish. */
const languageOf = (locale: string): IdeaLanguage => (/^es\b/i.test(locale) ? "es" : "en");

/**
 * The month's room and the workspace's language, read together: how many leads this month still covers is what a
 * search the ideas plan may be. A read that fails leaves the month whole and the language English.
 */
async function roomOf(
  ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  now: Date,
): Promise<{ leadsLeft: number; language: IdeaLanguage }> {
  try {
    const row = await ideasClockAndLanguage(ctx.supabase, tenantId);
    const used = await monthUsed(ctx, tenantId, leadMonth(tenantFactsOf(row).timezone, now));
    return { leadsLeft: Math.max(0, LEAD_MONTHLY_ALLOWANCE - used.allowance), language: languageOf(row?.locale ?? "") };
  } catch {
    return { leadsLeft: LEAD_MONTHLY_ALLOWANCE, language: "en" };
  }
}

/** What the ideas before these were, for what was passed on: the kept row's ideas, when they were made, and its passed. */
const previousOf = (kept: SuggestionRow | null, items: LeadIdeaDto[]) => ({
  items,
  madeAt: kept?.made_at ?? "",
  passed: ideaPassedOf(kept?.passed),
});

/**
 * Four ideas written now: what the searches found read, the code's decisions made (contracts ideaPacket), the model
 * asked on its own route, and its answer read back into plans, with what the rules dropped said in the log. No idea
 * that fits is an answer that cannot be read.
 */
async function writeIdeas(
  ctx: Pick<RouteContext, "supabase" | "userId">,
  tenantId: string,
  x: { line: string; address: string; previous: { items: LeadIdeaDto[]; madeAt: string; passed: IdeaPassed[] } },
): Promise<{ line: string; items: LeadIdeaDto[]; passed: IdeaPassed[] }> {
  const now = new Date();
  const [history, room] = await Promise.all([ideaStore.history(tenantId), roomOf(ctx, tenantId, now)]);
  const read: IdeaHistory = ideaHistoryOf(history);
  const searches: IdeaSearch[] = read.searches;
  const passed = ideaPassed(x.previous, searches);
  const packet = ideaPacket({
    line: x.line,
    history: read,
    profileAddress: x.address,
    leadsLeft: room.leadsLeft,
    passed,
    language: room.language,
    now,
  });
  const answer = await askForJson(
    {
      tenantId,
      userId: ctx.userId,
      purpose: "lead_suggest",
      request: {
        max_tokens: MODEL_ROUTES.lead_suggest.maxTokens,
        system: LEAD_IDEAS_SYSTEM,
        schema: ideaJsonSchema(packet),
        messages: [{ role: "user", content: ideaPacketText(packet) }],
      },
    },
    LeadIdeasAnswerSchema,
    "ideas",
  );
  const { items, dropped } = ideasRead(answer, packet);
  log.info("lead_ideas_written", {
    tenant_id: tenantId,
    wrote: answer.ideas.length,
    kept: items.length,
    dropped,
    kinds: packet.kinds.length,
    places: packet.places.length,
  });
  if (!items.length) throw new AppError("upstream_anthropic", "The ideas came back unreadable. Try again.");
  return { line: answer.line, items, passed };
}

/** The ideas and what was passed on, as the row keeps them: through JSON, so a plan's shape is the row's. */
const asJson = (v: unknown): Json => JSON.parse(JSON.stringify(v)) as Json;

/**
 * The ideas for a new search (§8.9), written from this workspace's business line and what its searches found, and kept
 * until a round ends, the line is saved again or a month passes. A gateway that will not answer is a note on the page,
 * never a page that fails; another read writing them is a page that asks again in a moment.
 */
export async function suggestionsFor(
  ctx: Pick<RouteContext, "supabase" | "userId">,
  tenantId: string,
  opts: { write: boolean },
): Promise<LeadSuggestionsDto> {
  const [kept, newest] = await Promise.all([keptSuggestions(ctx, tenantId), ideasBasis(ctx.supabase, tenantId)]);
  const basis = ideaBasisOf(newest);
  const items = keptIdeas(kept);
  const byOwner = kept?.by_owner === true;
  const madeAt = new Date().toISOString();
  // The line the ideas are written from, once it is known; until then the kept one.
  let lineShown = kept?.business_line ?? "";
  const said = async (shown: LeadIdeaDto[], more: { note?: string; pending?: boolean } = {}) => ({
    business_line: lineShown,
    by_owner: byOwner,
    made_at: kept?.made_at ?? madeAt,
    items: await withReach(ctx, shown),
    ...more,
  });
  if (kept && stands(kept, items, basis)) return said(items);
  // A member who may not find reads what was written, and asks for nothing.
  if (!opts.write) return said(items, items.length ? {} : { note: LEAD_SUGGEST_UNAVAILABLE });
  // The model would not answer a moment ago: the older ideas stand, or the page says so, until it is asked again.
  if (kept?.failed_at && Date.now() - Date.parse(kept.failed_at) < LEAD_SUGGEST_RETRY_MS)
    return said(items, items.length ? {} : { note: LEAD_SUGGEST_UNAVAILABLE });
  const offer = await workspaceOffer(ctx, tenantId);
  // The owner's own words when they wrote them; otherwise what the workspace says it is and what it offers.
  const line = byOwner && kept ? kept.business_line : offerLine(offer);
  lineShown = lineShown || line;
  // Another read is writing them: the older ideas stand meanwhile, or the page asks again in a moment.
  const claim = await ideaStore.claim(tenantId, line);
  if (!claim) return said(items, items.length ? {} : { pending: true });
  try {
    const written = await writeIdeas(ctx, tenantId, {
      line,
      address: offer.address,
      previous: previousOf(kept, items),
    });
    const businessLine = byOwner && kept ? kept.business_line : written.line;
    // Kept only while the claim stands: a line the owner saved meanwhile is theirs, and these ideas were the old
    // line's, so the page asks again and the next read writes from the new one.
    const held = await ideaStore.keep(tenantId, claim, {
      business_line: businessLine,
      by_owner: byOwner,
      items: asJson(written.items),
      basis,
      passed: asJson(written.passed),
    });
    if (!held) return said(items, items.length ? {} : { pending: true });
    return {
      business_line: businessLine,
      by_owner: byOwner,
      made_at: madeAt,
      items: await withReach(ctx, written.items),
    };
  } catch (e) {
    await ideaStore.fail(tenantId, claim).catch(() => undefined);
    // The page is not worth failing over a model that would not answer: the older ideas stand, or the note says why
    // this part is empty, beside the composer that still opens.
    if (e instanceof AppError)
      return {
        business_line: line,
        by_owner: byOwner,
        made_at: kept?.made_at ?? madeAt,
        items: await withReach(ctx, items),
        ...(items.length ? {} : { note: LEAD_SUGGEST_UNAVAILABLE }),
      };
    throw e;
  }
}

/**
 * The owner's own words for what they do: saved with no ideas and no basis, so the next read asks Claude again, and
 * nothing passed on, since the ideas passed on were another line's. Unconditional: the owner's word clears any write
 * in flight, whose keep then finds its claim gone.
 */
export async function setBusinessLine(
  _ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  line: string,
): Promise<{ business_line: string }> {
  await ideaStore.saveLine(tenantId, line);
  return { business_line: line };
}
