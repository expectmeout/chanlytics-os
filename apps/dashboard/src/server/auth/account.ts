import "server-only";
/**
 * The person's own account, on the route's session: the name they give and the account deleted, through packages/db's
 * doors (auth/account.ts), each answered as it came for the route to read its refusal. A route names no table or
 * function (decision 0111).
 */
import { deleteMyAccount, setProfileName } from "@chanlytics/db/auth";
import type { RouteContext } from "@/server/shared/with-route";

type Ctx = Pick<RouteContext, "supabase">;

export const setOwnName = (ctx: Ctx, args: Parameters<typeof setProfileName>[1]) => setProfileName(ctx.supabase, args);
export const deleteOwnAccount = (ctx: Ctx) => deleteMyAccount(ctx.supabase);
