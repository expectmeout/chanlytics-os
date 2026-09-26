/**
 * The suggested searches: what is kept, the writer that keeps them, and the business line they read. Moved whole from leads.ts (Reach out Part 2.5), which
 * re-exports it.
 */
import {
  AppError,
  LEAD_SUGGEST_DAYS,
  LEAD_SUGGEST_JSON_SCHEMA,
  LEAD_SUGGEST_UNAVAILABLE,
  leadReachLine,
  LeadSuggestAnswerSchema,
  type LeadSuggestionsDto,
} from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";
import { SUGGEST_SYSTEM, workspaceOffer } from "./lead-helpers";
import { nichePrior } from "./lead-plan-facts";
import { askForJson } from "../model-json";
import { serviceDb } from "../service-db";
import type { RouteContext } from "../with-route";

/* --------------------------------------------------- the first day's asks */

interface SuggestionRow {
  tenant_id: string;
  business_line: string;
  by_owner: boolean;
  items: unknown;
  made_at: string;
}

type SuggestItem = { words: string; who_for: string; category_key: string };

/**
 * Keeping the suggestions is the SERVICE's write: 00142 grants no insert or
 * update on `lead_suggestions` to a member, because what Claude wrote is not
 * something an owner types. That one line is the only part of this module a
 * route test cannot run against a database in memory, so it is a seam --
 * `setModelStream`'s twin, and the same rule: tests hand in their own.
 */
let keep: typeof saveLeadSuggestions = saveLeadSuggestions;

export function setSuggestionsWriter(w: typeof saveLeadSuggestions | null): void {
  keep = w ?? saveLeadSuggestions;
}

/** The kept row, when there is one. */
async function keptSuggestions(ctx: Pick<RouteContext, "supabase">, tenantId: string): Promise<SuggestionRow | null> {
  const { data, error } = await ctx.supabase
    .from("lead_suggestions")
    .select("tenant_id, business_line, by_owner, items, made_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as unknown as SuggestionRow | null;
}

/** Each suggestion gains how reachable that kind of business is, from what past searches measured. */
async function withReach(
  ctx: Pick<RouteContext, "supabase">,
  items: SuggestItem[],
): Promise<LeadSuggestionsDto["items"]> {
  const priors = await Promise.all(items.map((i) => nichePrior(ctx, i.category_key)));
  return items.map((i, n) => ({
    words: i.words,
    who_for: i.who_for,
    category_key: i.category_key,
    reach: leadReachLine(priors[n]),
  }));
}

/**
 * The three or four kinds of business worth reaching (§8.9), written from this
 * workspace's own business line and kept for a week: one model call a week per
 * workspace, unless the owner changes the line. A gateway that will not answer
 * is a note on the page, never a page that fails.
 */
export async function suggestionsFor(
  ctx: Pick<RouteContext, "supabase" | "userId">,
  tenantId: string,
): Promise<LeadSuggestionsDto> {
  const kept = await keptSuggestions(ctx, tenantId);
  const keptItems = Array.isArray(kept?.items) ? (kept.items as SuggestItem[]) : [];
  const byOwner = kept?.by_owner === true;
  if (kept && keptItems.length > 0 && Date.now() - Date.parse(kept.made_at) < LEAD_SUGGEST_DAYS * 86_400_000) {
    return {
      business_line: kept.business_line,
      by_owner: byOwner,
      made_at: kept.made_at,
      items: await withReach(ctx, keptItems),
    };
  }
  const offer = await workspaceOffer(ctx, tenantId);
  // The owner's own words when they wrote them; otherwise what the workspace
  // says it is and what it offers.
  const line =
    byOwner && kept
      ? kept.business_line
      : `${offer.name}${offer.services.length ? `: ${offer.services.join(", ")}` : ""}`;
  const madeAt = new Date().toISOString();
  try {
    const answer = await askForJson(
      {
        tenantId,
        userId: ctx.userId,
        purpose: "lead_suggest",
        request: {
          max_tokens: 400,
          system: SUGGEST_SYSTEM,
          schema: LEAD_SUGGEST_JSON_SCHEMA as unknown as Record<string, unknown>,
          messages: [{ role: "user", content: `The business: ${line}` }],
        },
      },
      LeadSuggestAnswerSchema,
      "suggestions",
    );
    const businessLine = byOwner && kept ? kept.business_line : answer.line;
    await keep(tenantId, { business_line: businessLine, by_owner: byOwner, items: answer.items as unknown as Json });
    return {
      business_line: businessLine,
      by_owner: byOwner,
      made_at: madeAt,
      items: await withReach(ctx, answer.items),
    };
  } catch (e) {
    // The first day's page is not worth failing over a model that would not
    // answer: the owner still gets the composer and the three ways people
    // arrive, and the note says why this part is empty.
    if (e instanceof AppError)
      return {
        business_line: line,
        by_owner: byOwner,
        made_at: kept?.made_at ?? madeAt,
        items: [],
        note: LEAD_SUGGEST_UNAVAILABLE,
      };
    throw e;
  }
}

/** The owner's own words for what they do: saved, and the next read asks Claude again. */
export async function setBusinessLine(
  _ctx: Pick<RouteContext, "supabase">,
  tenantId: string,
  line: string,
): Promise<{ business_line: string }> {
  await keep(tenantId, { business_line: line, by_owner: true, items: [] as unknown as Json });
  return { business_line: line };
}

/**
 * The first day's suggestions, kept for the workspace (§8.9).
 *
 * On the service client, and one of the few writes here that is tenant data:
 * `lead_suggestions` grants no insert or update to a member (00142), because
 * what Claude wrote is not something an owner types. The owner's own control
 * is the business line, which comes through the same door with `items: []` so
 * the next read asks again.
 */
async function saveLeadSuggestions(
  tenantId: string,
  row: { business_line: string; by_owner: boolean; items: Json },
): Promise<void> {
  const { error } = await serviceDb().from("lead_suggestions").upsert(
    {
      tenant_id: tenantId,
      business_line: row.business_line,
      by_owner: row.by_owner,
      items: row.items,
      made_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id" },
  );
  if (error) throw new Error(`lead_suggestions: ${error.message}`);
}
