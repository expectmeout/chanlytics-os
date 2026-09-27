import { read, write, workspace } from "@/server/route";
import {
  AppError,
  parseTenantConfig,
  TenantConfigWriteSchema,
  resolveFacts,
  samePhone,
  whyNotAHandoff,
} from "@chanlytics/contracts";
import { getTenantConfig, putTenantConfig } from "@chanlytics/db";
import type { Json } from "@chanlytics/db";
import { SETTINGS_REFUSED, recordSettingsChanged } from "@/server/workspace/settings-write";
import { load, readerContext } from "@/server/readers";
import { feedVisibleTo, knownFacts, settings, withHiddenFeed } from "@/server/readers/settings";

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
 */
export const PUT = write({
  scope: workspace,
  role: "partner",
  rate: "settings",
  handle: async ({ ctx, req, member }) => {
    const body = (await req.json().catch(() => null)) as { config?: unknown; version?: number } | null;
    if (!body || typeof body.version !== "number") {
      throw new AppError("validation", "Body must be { config, version }.");
    }
    const before = await getTenantConfig(ctx.supabase, member.tenantId);
    // The WRITE schema: the same shape, plus the rules that only apply on the
    // way in. They are not on the read schema because a refinement there turns
    // an already-stored bad row into configBroken, and the receptionist goes
    // silent rather than an owner seeing a message. The masked feed address a
    // non-owner was shown comes back as the stored one first (withHiddenFeed).
    const parsed = TenantConfigWriteSchema.safeParse(withHiddenFeed(member.role, body.config ?? {}, before?.config));
    if (!parsed.success) {
      // Say WHICH field, and say all of them.
      //
      // This reported issues[0].message alone and threw the path away, so a form
      // rejected for two bad days produced "Config rejected: A day needs both an
      // opening and a closing time" — no day named — and the caller fixed one,
      // resubmitted, and got the same unattributed sentence again. The write
      // rules build a path for exactly this.
      const said = parsed.error.issues.slice(0, 3).map((i) => {
        const field = i.path
          .filter((p) => typeof p === "string")
          .slice(-2)
          .join(".");
        return field ? `${field}: ${i.message}` : i.message;
      });
      const more = parsed.error.issues.length - said.length;
      throw new AppError("validation", `Config rejected — ${said.join(" ")}${more > 0 ? ` (and ${more} more)` : ""}`);
    }
    // The transfer number, judged again here when it changes. The page asks the same question as the owner types;
    // this is the door, so a number that would ring the receptionist straight back cannot be saved from anywhere.
    // Only a CHANGED number is judged, so saving something else never trips over a number stored before this rule.
    const nextHandoff = parsed.data.brain?.profile?.handoff_number ?? null;
    const prevHandoff = parseTenantConfig(before?.config ?? null)?.brain?.profile?.handoff_number ?? null;
    if (nextHandoff && !samePhone(nextHandoff, prevHandoff)) {
      const facts = resolveFacts(parsed.data.brain ?? null, await knownFacts(ctx, member.tenantId));
      const why = whyNotAHandoff(nextHandoff, facts.voice_line.value, facts.kept_line.value);
      if (why) throw new AppError("validation", why);
    }
    const result = await putTenantConfig(ctx.supabase, member.tenantId, parsed.data as Json, body.version, ctx.userId);
    // Two different failures, each in its own words (settings-write.ts says why).
    if (!result.ok) throw new AppError("conflict", SETTINGS_REFUSED[result.reason], 409);
    await recordSettingsChanged(ctx, member.tenantId, before?.config, parsed.data, result.row.version);
    return {
      config: feedVisibleTo(member.role, parseTenantConfig(result.row.config) ?? {}),
      version: result.row.version,
    };
  },
});
