import { dayInZone } from "@chanlytics/contracts";
import { read, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { facts as factsReader } from "@/server/readers/facts";
import { memberViews } from "@/server/readers/notifications";
import { newToolContext } from "@/server/ask/tools";
import { listNotices, restedOfViews } from "@/server/ask/notice/notices";

/**
 * GET /api/v1/ask/notice — what Ask noticed, the one most worth acting on first (D7, D19 of the answers canvas), less what this
 * member rested. By code and no model, so it costs nothing and every member sees the same. `?language=es` says it in Spanish.
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, req, member }) => {
    const rc = readerContext(ctx, member);
    const [zone, views] = await Promise.all([
      load(rc, factsReader, undefined).then((r) => r.data.timezone),
      load(rc, memberViews, undefined).then(
        (r) => r.data as Record<string, unknown> | null,
        () => null,
      ),
    ]);
    const language = new URL(req.url).searchParams.get("language") === "es" ? "es" : "en";
    const t = { ...newToolContext(ctx, member.tenantId, member.role, zone, new Date(), rc), language } as Parameters<
      typeof listNotices
    >[0];
    const rested = restedOfViews(views);
    return {
      notices: (await listNotices(t, language, rested)).slice(0, 3),
      rested,
      day: dayInZone(zone, Date.now()).key,
    };
  },
});
