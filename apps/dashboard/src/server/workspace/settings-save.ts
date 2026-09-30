/**
 * The settings PUT (app/api/v1/settings): the whole config written with optimistic concurrency, {config, version}. A
 * stale version is a 409, never a silent clobber of another owner's edit; the write schema is the same one the edge
 * parses, so an option that saves here exists in the runtime by construction. The body is this verb's own to read: the
 * write schema's refusals name the field their own way (the last two path segments), so the form can point at a day.
 * What a write says when it cannot land, and what it records when it does, is settings-write.ts's. The route declares
 * who may and how often.
 */
import {
  AppError,
  parseTenantConfig,
  TenantConfigWriteSchema,
  resolveFacts,
  samePhone,
  whyNotAHandoff,
  withStoredKeysKept,
} from "@chanlytics/contracts";
import { getTenantConfig, putTenantConfig } from "@chanlytics/db";
import { SETTINGS_REFUSED, recordSettingsChanged } from "@/server/workspace/settings-write";
import { feedVisibleTo, knownFacts, withHiddenFeed } from "@/server/readers/settings";
import type { RouteContext } from "@/server/with-route";
import type { Member } from "@/server/route";

export async function saveSettings(ctx: RouteContext, req: Request, member: Member) {
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
  // The whole column is written, so what the read left out of the stored row (a field a newer build wrote, at any
  // depth) is put back first: the page never saw it, so the page never meant to delete it.
  const next = withStoredKeysKept(parsed.data, before?.config);
  const result = await putTenantConfig(ctx.supabase, member.tenantId, next, body.version, ctx.userId);
  // Two different failures, each in its own words (settings-write.ts says why).
  if (!result.ok) throw new AppError("conflict", SETTINGS_REFUSED[result.reason], 409);
  await recordSettingsChanged(ctx, member.tenantId, before?.config, next, result.row.version);
  return {
    config: feedVisibleTo(member.role, parseTenantConfig(result.row.config) ?? {}),
    version: result.row.version,
  };
}
