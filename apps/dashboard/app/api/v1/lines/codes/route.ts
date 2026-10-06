import { AppError } from "@chanlytics/contracts";
import { read, workspace } from "@/server/route";
import { lineCodesFor } from "@/server/connections/lines";

/**
 * GET /api/v1/lines/codes — the one-time codes texted to the workspace's own line in the last fifteen minutes: Meta's, when the
 * owner is connecting that number to WhatsApp and its sign-up window asked for one. The owner's or the partner's, the door
 * Connect WhatsApp is behind (a code is the owner's to read). Read by the edge from the provider's own record on every call,
 * never kept here and never cached (private, no-store, as every route: a code is wanted within seconds of being sent); the
 * page asks when Connections opens and every three seconds while Meta's window is open, which is the codes' own bucket.
 *
 * The handle is lineCodesFor in src/server/connections/lines.ts: the route is its declaration (who may, how often), the verb is
 * what it does.
 */
export const GET = read({
  scope: workspace,
  role: "partner",
  rate: "lines_codes",
  handle: async ({ ctx, member }) => {
    const r = await lineCodesFor(member.tenantId, ctx.userId);
    if (!r.ok) throw new AppError("internal", "The texts sent to your line could not be read just now.", 502);
    return { codes: r.codes };
  },
});
