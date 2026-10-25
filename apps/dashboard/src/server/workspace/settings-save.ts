/**
 * The settings PUT (app/api/v1/settings): the whole config written with optimistic concurrency, {config, version}. A
 * stale version is a 409, never a silent clobber of another owner's edit; the write schema is the same one the edge
 * parses, so an option that saves here exists in the runtime by construction. The body is this verb's own to read: the
 * write schema's refusals name the field their own way (the last two path segments), so the form can point at a day.
 * What a write says when it cannot land, and what it records when it does, is settings-write.ts's. Around the write:
 * the masked feed address a non-owner was shown comes back as the stored one before the schema reads it
 * (withHiddenFeed); a transfer number is judged again when it changes, so a number that would ring the receptionist
 * straight back cannot be saved from anywhere; what the read left out of the stored row is put back first
 * (withStoredKeysKept); and the answer hides the feed from whoever may not see it (feedVisibleTo). The route declares
 * who may and how often. A change of the business's name renames the workspace too (renamedWith), and the answer says so.
 */
import {
  AppError,
  parseTenantConfig,
  TenantConfigWriteSchema,
  resolveFacts,
  samePhone,
  whyNotAHandoff,
  withStoredKeysKept,
  type TenantConfig,
} from "@chanlytics/contracts";
import { filedNamesOf, putTenantConfig } from "@chanlytics/db";
import { configRowOf } from "@/server/workspace/config-row";
import { SETTINGS_REFUSED, recordSettingsChanged } from "@/server/workspace/settings-write";
import { feedVisibleTo, knownFacts, withHiddenFeed } from "@/server/readers/settings";
import { renameWorkspace } from "@/server/workspace/workspace-list";
import { log } from "@/server/log";
import type { RouteContext } from "@/server/with-route";
import type { Member } from "@/server/route";

export async function saveSettings(ctx: RouteContext, req: Request, member: Member) {
  const body = (await req.json().catch(() => null)) as { config?: unknown; version?: number } | null;
  if (!body || typeof body.version !== "number") {
    throw new AppError("validation", "Body must be { config, version }.");
  }
  // The row as stored, the feed's address whole: what withHiddenFeed puts back, and what withStoredKeysKept keeps.
  const before = await configRowOf(ctx.supabase, member.tenantId);
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
  await judgeChangedHandoff(ctx, member.tenantId, parsed.data, before?.config);
  // The whole column is written, so what the read left out of the stored row (a field a newer build wrote, at any
  // depth) is put back first: the page never saw it, so the page never meant to delete it.
  const next = withStoredKeysKept(parsed.data, before?.config);
  const result = await putTenantConfig(ctx.supabase, member.tenantId, next, body.version, ctx.userId);
  // Two different failures, each in its own words (settings-write.ts says why).
  if (!result.ok) throw new AppError("conflict", SETTINGS_REFUSED[result.reason], 409);
  await recordSettingsChanged(ctx, member.tenantId, before?.config, next, result.row.version);
  const renamed = await renamedWith(ctx, member, before?.config, next);
  return {
    config: feedVisibleTo(member.role, parseTenantConfig(result.row.config) ?? {}),
    version: result.row.version,
    ...(renamed ? { renamed } : {}),
  };
}

/**
 * The transfer number, judged again when it changes. The page asks the same question as the owner types; this is the
 * door, so a number that would ring the receptionist straight back cannot be saved from anywhere: the settings PUT, or
 * a fix kept from a rehearsal (receptionist/rehearsal.ts, decision 0069). Only a CHANGED number is judged, so saving
 * something else never trips over a number stored before this rule. `next` is the config as the write schema parsed it.
 */
export async function judgeChangedHandoff(
  ctx: RouteContext,
  tenantId: string,
  next: Pick<TenantConfig, "brain">,
  stored: unknown,
): Promise<void> {
  const nextHandoff = next.brain?.profile?.handoff_number ?? null;
  const prevHandoff = parseTenantConfig(stored ?? null)?.brain?.profile?.handoff_number ?? null;
  if (!nextHandoff || samePhone(nextHandoff, prevHandoff)) return;
  const facts = resolveFacts(next.brain ?? null, await knownFacts(ctx, tenantId));
  const why = whyNotAHandoff(nextHandoff, facts.voice_line.value, facts.kept_line.value);
  if (why) throw new AppError("validation", why);
}

/** What a save that changed the business's name did to the workspace's: its answer's `renamed`. */
type Renamed =
  /** Renamed: the names it changed from and to, and the name the carriers still hold where it is not the new one. */
  | { from: string; to: string; carriers_hold: string | null }
  /** The settings were saved and the workspace kept its name: the pages still say `kept`. */
  | { kept: string | null; refused: true };

/**
 * One name for the business (the wiring's second audit, X4-5): a save that changes the name the receptionist introduces it
 * by renames the workspace, whose name the sign-up page, its paper form and the desk sign say. Only a change of it: a save
 * of anything else leaves a workspace named otherwise as it is. The settings are saved whatever this does, so a refusal is
 * the answer's to say, never the save's to throw; and the name a filing gave the carriers does not follow (a campaign
 * keeps its name until a new one is filed), so the answer says it where it differs.
 */
async function renamedWith(ctx: RouteContext, member: Member, was: unknown, next: unknown): Promise<Renamed | null> {
  const name = parseTenantConfig(next)?.brain?.business_name?.trim() ?? "";
  const before = parseTenantConfig(was ?? null)?.brain?.business_name?.trim() ?? "";
  if (!name || name === before) return null;
  let done: { from: string; to: string } | null;
  try {
    done = await renameWorkspace(ctx, member, name);
  } catch (e) {
    log.warn("workspace_rename_refused", { tenant_id: member.tenantId, error: e });
    return { kept: null, refused: true };
  }
  if (!done) return null;
  const filed = await filedNamesOf(ctx.supabase, member.tenantId).catch(() => null);
  const held = filed?.campaign ?? null;
  return { ...done, carriers_hold: held && held !== done.to ? held : null };
}
