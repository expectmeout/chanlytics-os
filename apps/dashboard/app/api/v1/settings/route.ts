import { read, write, workspace } from "@/server/route";
import { load, readerContext } from "@/server/readers";
import { settings } from "@/server/readers/settings";
import { saveSettings } from "@/server/workspace/settings-save";

/** GET /api/v1/settings — the tenant's config, with the version the client
 *  must echo back on write. Members read; RLS scopes. The body is its reader's (readers/settings.ts). */
export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => (await load(readerContext(ctx, member), settings, undefined)).data,
});

/**
 * PUT /api/v1/settings — owner-only, whole-config write with optimistic
 * concurrency: {config, version}. A stale version is a 409, never a silent
 * clobber of another owner's edit. The zod schema is the SAME one the edge
 * parses, so an option that saves here exists in the runtime by construction.
 * The body is the route's own to read: the write schema's refusals name the
 * field their own way (the last two path segments), so the form can point at
 * a day.
 *
 * The handle is saveSettings in src/server/workspace/settings-save.ts: the route is its declaration (who may, how
 * often), the verb is what it does.
 */
export const PUT = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  handle: ({ ctx, req, member }) => saveSettings(ctx, req, member),
});
