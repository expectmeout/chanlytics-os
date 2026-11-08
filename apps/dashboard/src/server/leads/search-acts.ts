import "server-only";
/**
 * What a member does to a lead search, on the route's session (decision 0057): the doors packages/db names
 * (leads/search-acts.ts), each answered as it came, for the route to read its refusal in its own words (answerOf,
 * refusalOf). A route is a door and names no table or function (decision 0111); this is where it reaches the database.
 */
import {
  answerSearchRound,
  askSearchForMore,
  excludeSearchMember,
  keepSearchMember,
  putBackSearchMember,
  stopSearchRound,
  undoLeadOperation,
} from "@chanlytics/db/leads";
import type { RouteContext } from "@/server/shared/with-route";

type Ctx = Pick<RouteContext, "supabase">;

export const keepFoundLead = (ctx: Ctx, args: Parameters<typeof keepSearchMember>[1]) =>
  keepSearchMember(ctx.supabase, args);
export const excludeFoundLead = (ctx: Ctx, args: Parameters<typeof excludeSearchMember>[1]) =>
  excludeSearchMember(ctx.supabase, args);
export const putLeadBack = (ctx: Ctx, args: Parameters<typeof putBackSearchMember>[1]) =>
  putBackSearchMember(ctx.supabase, args);
export const answerRound = (ctx: Ctx, args: Parameters<typeof answerSearchRound>[1]) =>
  answerSearchRound(ctx.supabase, args);
export const stopRound = (ctx: Ctx, args: Parameters<typeof stopSearchRound>[1]) => stopSearchRound(ctx.supabase, args);
export const askForMore = (ctx: Ctx, args: Parameters<typeof askSearchForMore>[1]) =>
  askSearchForMore(ctx.supabase, args);
export const undoLeadAct = (ctx: Ctx, args: Parameters<typeof undoLeadOperation>[1]) =>
  undoLeadOperation(ctx.supabase, args);
