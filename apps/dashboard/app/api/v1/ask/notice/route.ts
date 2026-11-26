import { z } from "zod";
import { ASK_NOTICES_SENT, dayInZone, recordOrNull } from "@chanlytics/contracts";
import { logAndGoOn } from "@chanlytics/log";
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
/** The language the notices are said in: Spanish where it asks for it, else English. */
const Query = z.object({ language: z.string().max(8).optional() });

export const GET = read({
  scope: workspace,
  query: Query,
  handle: async ({ ctx, member, input }) => {
    const rc = readerContext(ctx, member);
    const [zone, views] = await Promise.all([
      load(rc, factsReader, undefined).then((r) => r.data.timezone),
      load(rc, memberViews, undefined).then((r) => recordOrNull(r.data), logAndGoOn("ask notice views", null)),
    ]);
    const language = input.language === "es" ? "es" : "en";
    const t: Parameters<typeof listNotices>[0] = {
      ...newToolContext(ctx, member.tenantId, member.role, zone, new Date(), rc),
      language,
    };
    const rested = restedOfViews(views);
    return {
      // Three past the ones the home may pass over as Right now says them (contracts ASK_NOTICES_SENT).
      notices: (await listNotices(t, language, rested)).slice(0, ASK_NOTICES_SENT),
      rested,
      day: dayInZone(zone, Date.now()).key,
    };
  },
});
