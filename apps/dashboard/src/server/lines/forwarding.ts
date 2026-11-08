import "server-only";
/**
 * A forwarded line's test, asked for by the member on the route's session: packages/db's door (lines/forwarding.ts),
 * answered as it came for the route to read its refusal. A route names no table or function (decision 0111).
 */
import { testLineForwarding } from "@chanlytics/db/lines";
import type { RouteContext } from "@/server/shared/with-route";

export const askForwardingTest = (
  ctx: Pick<RouteContext, "supabase">,
  args: Parameters<typeof testLineForwarding>[1],
) => testLineForwarding(ctx.supabase, args);
