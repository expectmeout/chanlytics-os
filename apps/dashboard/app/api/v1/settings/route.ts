import { read, write, workspace } from "@/server/route";
import type { RouteContext } from "@/server/with-route";
import {
  AppError,
  parseTenantConfig,
  parseTenantConfigResult,
  TenantConfigWriteSchema,
  resolveFacts,
  factConflicts,
  knownForwarding,
  samePhone,
  whyNotAHandoff,
  changedConfigFields,
  type KnownFacts,
} from "@chanlytics/contracts";
import { getTenantConfig, putTenantConfig } from "@chanlytics/db";
import type { Json } from "@chanlytics/db";
import { promptPreview } from "@/server/prompt-preview";
import { linesFor } from "@/server/lines";

function maskFeedUrl(u: string): string {
  return u.length <= 30 ? "…" : `${u.slice(0, 24)}…${u.slice(-6)}`;
}

/** GET /api/v1/settings — the tenant's config, with the version the client
 *  must echo back on write. Members read; RLS scopes. */
/**
 * What the platform knows about this workspace, independent of what was typed.
 *
 * Resolved HERE rather than on the client: the server can read the channel rows
 * and the Google listing under RLS in one round trip, while the browser only
 * ever had a listing DTO with no address on it. One place that knows, so there
 * is one answer — which is the whole point of facts.ts.
 */
async function knownFacts(ctx: RouteContext, tenantId: string): Promise<KnownFacts> {
  const [ws, ch, gl, lines] = await Promise.all([
    ctx.supabase.from("tenants").select("name, timezone").eq("id", tenantId).maybeSingle(),
    ctx.supabase.from("tenant_channels").select("kind, number_e164, status").eq("tenant_id", tenantId),
    ctx.supabase.from("google_listings").select("name, address").eq("tenant_id", tenantId).maybeSingle(),
    // The number the business keeps and forwards: the same rows, read the same way, as Setup's line rows. A failed
    // read is no forwarding, on purpose: the settings read and a save still go through, and a transfer number is
    // then judged against the line alone, as it was before forwarding was known.
    linesFor(ctx.supabase, tenantId).catch(() => []),
  ]);
  // None of these is worth failing the settings read for. A workspace whose
  // channels could not be listed sees its typed values unresolved, which is
  // exactly where it was before any of this existed.
  return {
    workspace: ws.error ? null : ws.data,
    channels: ch.error ? [] : (ch.data ?? []),
    listing: gl.error ? null : gl.data,
    forwarding: knownForwarding(lines),
  };
}

export const GET = read({
  scope: workspace,
  handle: async ({ ctx, member }) => {
    const row = await getTenantConfig(ctx.supabase, member.tenantId);
    if (!row) throw new AppError("not_found", "Workspace has no configuration row.", 404);
    // A config the parser refuses is a different fact from "nothing configured".
    // Collapsing both to {} showed a broken workspace the "no receptionist yet"
    // invitation — and the form behind it would have saved over the broken row,
    // deleting whatever it still held. The edge already tells the two apart
    // (tenant-runtime's configBroken); this is the same answer for the pane.
    const parsed = parseTenantConfigResult(row.config);
    if (parsed.ok) {
      // The calendar feed address grants read access to the owner's calendar;
      // only an owner sees it whole. Anyone else learns that one is set.
      const cfg = parsed.config;
      const visible =
        member.role === "owner" || !cfg.calendar
          ? cfg
          : { ...cfg, calendar: { ical_url: maskFeedUrl(cfg.calendar.ical_url) } };
      const known = await knownFacts(ctx, member.tenantId);
      const facts = resolveFacts(cfg.brain ?? null, known);
      // What the receptionist is told, composed here with the inputs the browser
      // cannot see (the Autonomy rows, these facts, the closures, the calendar's
      // openings), so the pane's card is the prompt and not a rendering of it.
      // The feed address is read here and stays here.
      const prompt = await promptPreview(
        ctx,
        member.tenantId,
        { brain: cfg.brain ?? null, calendarUrl: cfg.calendar?.ical_url ?? null },
        known,
      );
      return {
        config: visible,
        version: row.version,
        role: member.role,
        configBroken: false as const,
        // What each fact resolves to and where it came from, plus anything that
        // disagrees. The pane shows a source beside every value instead of a
        // column of identical-looking text boxes, and a serious disagreement --
        // a published number that is not the line being answered -- is said out
        // loud rather than sitting in a document nobody compares.
        facts,
        conflicts: factConflicts(facts),
        prompt,
        // Who last changed it and when (00085): the Business card says so.
        updatedBy: row.updated_by ?? null,
        updatedAt: row.updated_at ?? null,
      };
    }
    // `as const` on both: the two answers are told apart by this one flag, and the client narrows on it.
    return {
      config: null,
      version: row.version,
      role: member.role,
      configBroken: true as const,
      issues: parsed.issues,
    };
  },
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
  role: "owner",
  rate: "settings",
  handle: async ({ ctx, req, member }) => {
    const body = (await req.json().catch(() => null)) as { config?: unknown; version?: number } | null;
    if (!body || typeof body.version !== "number") {
      throw new AppError("validation", "Body must be { config, version }.");
    }
    // The WRITE schema: the same shape, plus the rules that only apply on the
    // way in. They are not on the read schema because a refinement there turns
    // an already-stored bad row into configBroken, and the receptionist goes
    // silent rather than an owner seeing a message.
    const parsed = TenantConfigWriteSchema.safeParse(body.config ?? {});
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
    const before = await getTenantConfig(ctx.supabase, member.tenantId);
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
    if (!result.ok) {
      // These are different failures and used to share one message. Telling an
      // owner "someone else saved settings" when the row simply does not exist
      // blames an imaginary colleague and prescribes a reload that can never
      // help. Provisioning (migration 00017) makes the second case unreachable
      // for tenants created from now on; this stays honest about the rest.
      if (result.reason === "missing") {
        throw new AppError(
          "conflict",
          "This workspace has no settings record yet, so there was nothing to update. It needs provisioning before settings can be saved.",
          409,
        );
      }
      throw new AppError("conflict", "Someone else saved settings after you loaded them — reload and reapply.", 409);
    }
    // The change, in the ledger every other consequential act lands in. Fields,
    // never values -- see changedConfigFields. Best effort by design: an audit
    // row that failed to write must not fail the save the owner just made and
    // watched succeed.
    const fields = changedConfigFields(before?.config, parsed.data);
    if (fields.length) {
      await ctx.supabase
        .from("events")
        .insert({
          tenant_id: member.tenantId,
          kind: "settings.changed",
          category: "system",
          subject_type: "workspace",
          subject_id: member.tenantId,
          // `via` says a card was tapped rather than a form saved, as the decisions ledger says it.
          data: { fields, by: ctx.userId, version: result.row.version, ...(ctx.via ? { via: ctx.via } : {}) },
        })
        .then(({ error }) => {
          if (error) console.error("settings_event_failed", error.message);
        });
    }
    return { config: parseTenantConfig(result.row.config) ?? {}, version: result.row.version };
  },
});
