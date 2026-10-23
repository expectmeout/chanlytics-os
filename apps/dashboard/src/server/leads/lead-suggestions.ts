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
 * (lead_suggestions.passed), and not offered again. A member who may not find reads what was written and asks for
 * nothing.
 *
 * Since decision 0070 (option B) the model reads the whole of what the workspace says of itself (its services, notes
 * and website) and what the team told Ask (its memory), decides who buys, and writes three ideas across both finder
 * cards and anywhere in the US, at medium effort; and New ideas is its own act (again): the same line, with what was
 * shown passed on, so each press is three new ideas.
 */
import {
  AppError,
  DAY_MS,
  ideaBasisOf,
  ideaCustomersOf,
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
  LEAD_IDEAS_MAX,
  LEAD_SUGGEST_RETRY_MS,
  LEAD_SUGGEST_UNAVAILABLE,
  LeadIdeasAnswerSchema,
  leadMonth,
  leadReachLine,
  MODEL_ROUTES,
  type IdeaAbout,
  type IdeaCustomers,
  type IdeaHistory,
  type IdeaLanguage,
  type IdeaPassed,
  type IdeaSearch,
  type LeadIdeaDto,
  type LeadSuggestionsDto,
} from "@chanlytics/contracts";
import {
  againIdeas,
  askMemoryLines,
  claimIdeas,
  ideaCustomerRows,
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
  /** New ideas from the same line: what was shown kept to be passed on, and the next write due at once. */
  again: (tenantId: string) => Promise<void>;
}

const SERVICE_STORE: IdeaStore = {
  claim: (tenantId, line) => claimIdeas(serviceDb(), tenantId, line),
  keep: (tenantId, claim, row) => keepIdeas(serviceDb(), tenantId, claim, row),
  fail: (tenantId, claim) => failIdeas(serviceDb(), tenantId, claim),
  history: (tenantId) => readIdeaHistory(serviceDb(), tenantId),
  saveLine: (tenantId, line) => saveIdeasLine(serviceDb(), tenantId, line),
  again: (tenantId) => againIdeas(serviceDb(), tenantId),
};
/** A test's store: the claim always granted, every keep kept, a failure kept nowhere, and no search found. */
const TEST_STORE: IdeaStore = {
  claim: () => Promise.resolve("2026-01-01T00:00:00.000Z"),
  keep: () => Promise.resolve(true),
  fail: () => Promise.resolve(),
  history: () => Promise.resolve({}),
  saveLine: () => Promise.resolve(),
  again: () => Promise.resolve(),
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
  return items
    .flatMap((i) =>
      i && typeof i.words === "string" && typeof i.category_key === "string"
        ? [{ ...i, words: i.words, who_for: i.who_for ?? "", category_key: i.category_key, reach: null }]
        : [],
    )
    .slice(0, LEAD_IDEAS_MAX); // ideas kept when there were four are shown as the page's three
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

/**
 * Each places idea gains how reachable its kind has been, from what past searches measured, and the counts behind it. A
 * people idea has none: the prior is the places card's.
 */
async function withReach(ctx: Pick<RouteContext, "supabase">, items: LeadIdeaDto[]): Promise<LeadIdeaDto[]> {
  const priors = await Promise.all(
    items.map((i) => (i.people ? Promise.resolve(null) : nichePrior(ctx, i.category_key).catch(() => null))),
  );
  return items.map((i, n) => {
    const prior = priors[n] ?? null;
    return { ...i, reach: leadReachLine(prior), prior };
  });
}

/* --------------------------------------------------------- the ideas, read */

/** The language the ideas are written in: the workspace's own tag, which the model writes in; English where none is set. */
const languageOf = (locale: string): IdeaLanguage => locale.trim().slice(0, 35) || "en";

/** How many of Ask's memory lines the ideas read: the newest, which say most of who the business sells to. */
const IDEA_MEMORY_LINES = 20;

/** What the team told Ask about the business (decision 0070), as the member's own session reads it; none if it cannot. */
async function memoryOf(ctx: Pick<RouteContext, "supabase">, tenantId: string): Promise<string[]> {
  return askMemoryLines(ctx.supabase, tenantId, IDEA_MEMORY_LINES).then(
    (lines) => lines.map((l) => l.text),
    () => [],
  );
}

/**
 * Who the workspace's customers are so far (contracts ideaCustomersOf: its people, its leads that became customers, its
 * won deals), read under the member's own session; none where the read fails, and the ideas are written without it.
 */
async function customersOf(ctx: Pick<RouteContext, "supabase">, tenantId: string): Promise<IdeaCustomers | null> {
  return ideaCustomerRows(ctx.supabase, tenantId).then(ideaCustomersOf, (e: unknown) => {
    log.warn("lead_ideas_customers_unread", { tenant_id: tenantId, error: e });
    return null;
  });
}

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
 * Three ideas written now: what the searches found read, the code's decisions made (contracts ideaPacket), the model
 * asked on its own route, and its answer read back into plans, with what the rules dropped said in the log. No idea
 * that fits is an answer that cannot be read.
 */
async function writeIdeas(
  ctx: Pick<RouteContext, "supabase" | "userId">,
  tenantId: string,
  x: {
    line: string;
    address: string;
    about: IdeaAbout;
    previous: { items: LeadIdeaDto[]; madeAt: string; passed: IdeaPassed[] };
  },
): Promise<{ line: string; items: LeadIdeaDto[]; passed: IdeaPassed[] }> {
  const now = new Date();
  const [history, room, memory, customers] = await Promise.all([
    ideaStore.history(tenantId),
    roomOf(ctx, tenantId, now),
    memoryOf(ctx, tenantId),
    customersOf(ctx, tenantId),
  ]);
  const read: IdeaHistory = ideaHistoryOf(history);
  const searches: IdeaSearch[] = read.searches;
  const passed = ideaPassed(x.previous, searches);
  const packet = ideaPacket({
    line: x.line,
    about: x.about,
    memory,
    customers,
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
      // Who buys is decided before the three are written: more thought than a draft's (option B, decision 0070).
      effort: "medium",
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
    people: items.filter((i) => i.people).length,
    memory: memory.length,
    customers: customers ? customers.people : null,
    won: customers ? customers.won.deals : null,
  });
  if (!items.length) throw new AppError("upstream_anthropic", "The ideas came back unreadable. Try again.");
  return { line: answer.line, items, passed };
}

/** The ideas and what was passed on, as the row keeps them: through JSON, so a plan's shape is the row's. */
const asJson = (v: unknown): Json => JSON.parse(JSON.stringify(v)) as Json;

type IdeasCtx = Pick<RouteContext, "supabase" | "userId">;

/**
 * What the workspace's ideas stand as: the row kept, its ideas, whether they still stand (a round ended, the line saved or a
 * month passed since says not), and how a page is told of them. Read once, by the GET and the POST alike.
 */
async function ideasKept(ctx: IdeasCtx, tenantId: string) {
  const [kept, newest] = await Promise.all([keptSuggestions(ctx, tenantId), ideasBasis(ctx.supabase, tenantId)]);
  const basis = ideaBasisOf(newest);
  const items = keptIdeas(kept);
  const byOwner = kept?.by_owner === true;
  const madeAt = new Date().toISOString();
  /** The page's answer: these ideas, under the line they are written from (the kept one until another is known). */
  const said = async (
    shown: LeadIdeaDto[],
    more: { note?: string; pending?: boolean; due?: boolean } = {},
    line = kept?.business_line ?? "",
  ): Promise<LeadSuggestionsDto> => ({
    business_line: line,
    by_owner: byOwner,
    made_at: kept?.made_at ?? madeAt,
    items: await withReach(ctx, shown),
    ...more,
  });
  return { kept, basis, items, byOwner, madeAt, said, standing: !!kept && stands(kept, items, basis) };
}

/**
 * The ideas for a new search (§8.9) as they were written, and whether they are due to be written again (`due`): the GET. It
 * writes nothing and asks no model, so any member's page may read it (the wiring's second audit, S11-8: a page's read kept a
 * row, asked a model and wrote an event).
 */
export async function suggestionsKept(ctx: IdeasCtx, tenantId: string): Promise<LeadSuggestionsDto> {
  const { items, said, standing } = await ideasKept(ctx, tenantId);
  if (standing) return said(items);
  return said(items, { due: true, ...(items.length ? {} : { note: LEAD_SUGGEST_UNAVAILABLE }) });
}

/**
 * The ideas written where they are due (§8.9), from this workspace's business line and what its searches found, and kept
 * until a round ends, the line is saved again or a month passes: the POST, for a member who may find. A gateway that will
 * not answer is a note on the page, never a page that fails; another request writing them is a page that asks again in a
 * moment.
 */
export async function suggestionsWritten(
  ctx: IdeasCtx,
  tenantId: string,
  opts: { ours?: boolean } = {},
): Promise<LeadSuggestionsDto> {
  const { kept, basis, items, byOwner: ownerSaid, madeAt, said, standing } = await ideasKept(ctx, tenantId);
  // Write it for me: the owner's line let go, so the model writes the line from the whole picture and it is kept as ours.
  const byOwner = ownerSaid && !opts.ours;
  if (standing) return said(items);
  // The model would not answer a moment ago: the older ideas stand, or the page says so, until it is asked again.
  if (kept?.failed_at && Date.now() - Date.parse(kept.failed_at) < LEAD_SUGGEST_RETRY_MS)
    return said(items, items.length ? {} : { note: LEAD_SUGGEST_UNAVAILABLE });
  const offer = await workspaceOffer(ctx, tenantId);
  // The owner's own words when they wrote them; otherwise the workspace's name alone, and the model writes the line from
  // the whole picture (its profile, its customers, its searches), where it was the name and the first services.
  const line = byOwner && kept ? kept.business_line : offer.name;
  const lineShown = kept?.business_line || line;
  // Another request is writing them: the older ideas stand meanwhile, or the page asks again in a moment.
  const claim = await ideaStore.claim(tenantId, line);
  if (!claim) return said(items, items.length ? {} : { pending: true }, lineShown);
  try {
    const written = await writeIdeas(ctx, tenantId, {
      line,
      address: offer.address,
      about: offer.about,
      previous: previousOf(kept, items),
    });
    const businessLine = byOwner && kept ? kept.business_line : written.line;
    // Kept only while the claim stands: a line the owner saved meanwhile is theirs, and these ideas were the old
    // line's, so the page asks again and the next request writes from the new one.
    const held = await ideaStore.keep(tenantId, claim, {
      business_line: businessLine,
      by_owner: byOwner,
      items: asJson(written.items),
      basis,
      passed: asJson(written.passed),
    });
    if (!held) return said(items, items.length ? {} : { pending: true }, lineShown);
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
    if (e instanceof AppError) return said(items, items.length ? {} : { note: LEAD_SUGGEST_UNAVAILABLE }, line);
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

/**
 * New ideas (decision 0070, option B): the same line written again with what was shown kept to be passed on, then the
 * three written now, so the next three are new ones. For a member who may find, as the write is; the claim and every
 * rule after it are the write's.
 */
export async function newIdeas(ctx: IdeasCtx, tenantId: string): Promise<LeadSuggestionsDto> {
  await ideaStore.again(tenantId);
  return suggestionsWritten(ctx, tenantId);
}

/**
 * Write it for me (Ruben, 22 Oct 2026): the owner's saved line let go, and the line written by the model from the whole
 * picture (the profile, the customers, the searches) with three new ideas from it, kept as ours (by_owner false), so each
 * write after it writes the line again as the picture grows. What was shown is passed on, as New ideas passes it; the
 * claim and every rule after it are the write's. Saving a line through Edit makes it the owner's again.
 */
export async function lineForMe(ctx: IdeasCtx, tenantId: string): Promise<LeadSuggestionsDto> {
  await ideaStore.again(tenantId);
  return suggestionsWritten(ctx, tenantId, { ours: true });
}
