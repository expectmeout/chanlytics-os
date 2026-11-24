import { z } from "zod";
import { read, write, workspace } from "@/server/shared/route";
import { load, readerContext } from "@/server/shared/reader";
import { websiteForms } from "@/server/readers/connections";
import { changeWebsiteKey } from "@/server/connections/website-forms";

/**
 * GET /api/v1/website-forms — the website connection as Campaigns › Forms shows it (00675, 00709): each site the business
 * sends entries from, where it stands, its keys (never a key itself) and the forms found on it, when an entry last
 * arrived, the door a site's server posts to, and whether this member may change a key. The body is its reader's (readers/connections.ts websiteForms).
 */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), websiteForms, undefined)).data,
});

/**
 * POST /api/v1/website-forms — a website's key made (`make`, with its name), for a site the workspace has (`site_id`)
 * or for a new site named as the key is (00709), changed for a new one by the
 * same name with the old one honoured a day (`change`), or ended at once (`end`): `{ made, ended }`, where `made`
 * carries the new key, shown this once. An owner or a partner.
 */
export const POST = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  input: z.discriminatedUnion("act", [
    z.object({ act: z.literal("make"), name: z.string().trim().min(1).max(60), site_id: z.optional(z.uuid()) }),
    z.object({ act: z.enum(["change", "end"]), key_id: z.uuid() }),
  ]),
  handle: ({ ctx, member, input }) => changeWebsiteKey(ctx, member, input),
});
