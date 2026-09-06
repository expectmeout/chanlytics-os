import {
  AppError,
  AUDIENCE_KINDS,
  BROADCAST_MAX_RECIPIENTS,
  BROADCAST_NAME_MAX,
  BROADCAST_SCHEDULE_MAX_DAYS,
  EVERYONE_LABEL,
  PEOPLE_LISTS,
  broadcastName,
  cleanParam,
  eligibleFor,
  numberHealth,
  overLimitRefusal,
  paramLabel,
  parseParamSpec,
  parseTenantConfig,
  toPersonRowVM,
  type ParamSpec,
  type Audience,
  type AudienceKind,
} from "@chanlytics/contracts";
import type { Json } from "@chanlytics/db";
import { withRoute, memberContext, requireRole } from "@/server/with-route";
import { jsonBody } from "@/server/request-guards";
import { recordDecision } from "@/server/verbs";
import { takeRate } from "@/server/rate-limit";
import { schedule } from "@/server/service";
import { listPeople } from "@/server/people";
import { withVisits } from "@/server/calendar";
import { listBroadcasts } from "@/server/broadcasts";

/**
 * Broadcasts: one approved template to the people who said yes.
 *
 * GET  /api/v1/broadcasts — the workspace's recent broadcasts with the numbers
 *      their messages earned.
 * POST /api/v1/broadcasts — { template_id, params, audience: { kind, id },
 *      scheduled_for?, name? }. Owner or operator. The template must be
 *      approved by WhatsApp; the values must be ones Meta accepts; the
 *      audience is one of People's lists, a list kept by hand, or everyone —
 *      crossed with who said yes and has a number. The recipients are
 *      enrolled now, so the owner sees who and how many; the job re-checks
 *      each person at the wire. The ledger records the decision to send.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INSERT_CHUNK = 500;

export const GET = withRoute(async (req, ctx) => {
  const { tenantId } = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  return { broadcasts: await listBroadcasts(ctx, tenantId) };
});

export const POST = withRoute(async (req, ctx) => {
  const member = await memberContext(ctx, new URL(req.url).searchParams.get("workspace"));
  requireRole(member, "operator");
  takeRate(ctx.userId, "broadcast");
  const tenantId = member.tenantId;
  const body = (await jsonBody(req)) as {
    template_id?: unknown; params?: unknown; audience?: { kind?: unknown; id?: unknown } | null; scheduled_for?: unknown; name?: unknown;
  } | null;

  const templateId = typeof body?.template_id === "string" ? body.template_id : "";
  if (!UUID.test(templateId)) throw new AppError("validation", "Pick a template.");
  const kind = body?.audience?.kind;
  if (typeof kind !== "string" || !(AUDIENCE_KINDS as readonly string[]).includes(kind)) {
    throw new AppError("validation", "Pick who this goes to.");
  }
  const audienceId = typeof body?.audience?.id === "string" ? body.audience.id : null;
  if (kind === "saved" && (!audienceId || !UUID.test(audienceId))) throw new AppError("validation", "Pick a list.");
  if (kind === "list" && (!audienceId || !PEOPLE_LISTS.some((l) => l.id === audienceId))) throw new AppError("validation", "Pick a list.");

  // 1. The template, as Meta holds it.
  const { data: tpl, error: tErr } = await ctx.supabase
    .from("templates")
    .select("id, name, language, meta_status, category, variables, body_preview, title")
    .eq("id", templateId)
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp")
    .maybeSingle();
  if (tErr) throw new Error(tErr.message);
  if (!tpl) throw new AppError("not_found", "Template not found.", 404);
  if (tpl.meta_status !== "approved") throw new AppError("conflict", "That template is not approved by WhatsApp, so it cannot be sent.", 409);

  // 2. The values, as Meta will accept them.
  const expected = Array.isArray(tpl.variables) ? tpl.variables.length : 0;
  const rawParams = Array.isArray(body?.params) ? body.params : [];
  if (rawParams.length !== expected) {
    throw new AppError("validation", expected === 0 ? "This template takes no values." : `This template takes ${expected} value${expected === 1 ? "" : "s"}.`);
  }
  // Each slot: typed text once, or a value the job fills per person.
  const specs: ParamSpec[] = [];
  for (const p of rawParams) {
    const spec = parseParamSpec(p);
    if (!spec) throw new AppError("validation", "Each value is typed text, their first name, the business name, or the booking link.");
    if (spec.kind === "text") {
      const v = cleanParam(spec.value);
      if (v === null) throw new AppError("validation", "Every value is needed, without line breaks or tabs, and under 1024 characters.");
      specs.push({ kind: "text", value: v });
    } else {
      specs.push(spec);
    }
  }
  if (specs.some((s) => s.kind === "booking_link")) {
    const { data: cfgRow } = await ctx.supabase.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle();
    if (!parseTenantConfig(cfgRow?.config ?? null)?.brain?.booking_link) {
      throw new AppError("conflict", "This message takes the booking link, and none is on file. Add it in Settings › Workspace first.", 409);
    }
  }

  // 3. The audience, crossed with who said yes.
  const now = new Date();
  // With their appointments, so a calendar list (Lapsed, Asked never booked)
  // enrols exactly the people the page counted.
  const rows = (await withVisits(ctx, tenantId, await listPeople(ctx, tenantId), now)).people.map((r) => toPersonRowVM(r, now));
  let savedIds: Set<string> | null = null;
  let label = EVERYONE_LABEL;
  if (kind === "saved") {
    const { data: seg, error: sErr } = await ctx.supabase.from("segments").select("id, name").eq("id", audienceId!).eq("tenant_id", tenantId).maybeSingle();
    if (sErr) throw new Error(sErr.message);
    if (!seg) throw new AppError("not_found", "List not found.", 404);
    const { data: members, error: mErr } = await ctx.supabase.from("segment_members").select("contact_id").eq("segment_id", seg.id);
    if (mErr) throw new Error(mErr.message);
    savedIds = new Set((members ?? []).map((m) => m.contact_id));
    label = seg.name;
  } else if (kind === "list") {
    label = PEOPLE_LISTS.find((l) => l.id === audienceId)!.label;
  }
  const eligible = eligibleFor(rows, kind as AudienceKind, audienceId, savedIds);
  if (eligible.length === 0) throw new AppError("conflict", "Nobody there has said yes to offers yet. Record their answer on their profile first.", 409);
  if (eligible.length > BROADCAST_MAX_RECIPIENTS) throw new AppError("validation", `At most ${BROADCAST_MAX_RECIPIENTS} people in one broadcast.`);

  // 3b. The number, as WhatsApp has rated it. A flagged number does not
  // broadcast; an audience past the day's limit is split, not silently cut.
  const { data: ch, error: chErr } = await ctx.supabase
    .from("tenant_channels")
    .select("config")
    .eq("tenant_id", tenantId)
    .eq("kind", "whatsapp")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (chErr) throw new Error(chErr.message);
  if (!ch) throw new AppError("conflict", "Connect a WhatsApp number first — a broadcast goes out on one.", 409);
  const cfg = (ch.config && typeof ch.config === "object" && !Array.isArray(ch.config) ? ch.config : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof cfg[k] === "string" ? (cfg[k] as string) : null);
  const health = numberHealth({ quality: str("quality_rating"), event: str("quality_event"), limit: str("messaging_limit") });
  if (!health.canSend) throw new AppError("conflict", health.refusal!, 409);
  const over = overLimitRefusal(health, eligible.length);
  if (over) throw new AppError("validation", over);

  // 4. When.
  let when = now;
  if (typeof body?.scheduled_for === "string" && body.scheduled_for) {
    const t = new Date(body.scheduled_for);
    if (Number.isNaN(t.getTime())) throw new AppError("validation", "That is not a time.");
    if (t.getTime() > now.getTime() + BROADCAST_SCHEDULE_MAX_DAYS * 86_400_000) throw new AppError("validation", `Schedule within ${BROADCAST_SCHEDULE_MAX_DAYS} days.`);
    when = t.getTime() > now.getTime() ? t : now;
  }
  const name = typeof body?.name === "string" && body.name.trim() ? body.name.trim().slice(0, BROADCAST_NAME_MAX) : broadcastName(tpl.name, now, tpl.title);
  const audience: Audience = { kind: kind as AudienceKind, id: audienceId, label };
  // The row and the ledger both take JSON; an interface has no index signature.
  const audienceJson = { kind: audience.kind, id: audience.id, label: audience.label };

  // 5. The rows, then the job, then the ledger.
  const { data: made, error: bErr } = await ctx.supabase
    .from("broadcasts")
    .insert({
      tenant_id: tenantId, name, template_id: tpl.id, template_name: tpl.name, template_language: tpl.language,
      params: specs as unknown as Json, audience: audienceJson, state: "scheduled", scheduled_for: when.toISOString(),
      recipient_count: eligible.length, created_by: ctx.userId,
    })
    .select("id")
    .single();
  if (bErr || !made) throw new Error(bErr?.message ?? "broadcast not created");
  for (let i = 0; i < eligible.length; i += INSERT_CHUNK) {
    const chunk = eligible.slice(i, i + INSERT_CHUNK).map((p) => ({ broadcast_id: made.id, contact_id: p.id, tenant_id: tenantId }));
    const { error } = await ctx.supabase.from("broadcast_recipients").insert(chunk);
    if (error) {
      await ctx.supabase.from("broadcasts").update({ state: "failed" }).eq("id", made.id);
      throw new Error(error.message);
    }
  }
  try {
    await schedule(tenantId, "broadcast_send", when, { broadcast_id: made.id });
  } catch (e) {
    await ctx.supabase.from("broadcasts").update({ state: "failed" }).eq("id", made.id);
    throw new AppError("upstream_meta", "The send could not be scheduled. Nothing was sent; try again.", 502, e instanceof Error ? e.message : undefined);
  }
  const decisionId = await recordDecision(ctx, tenantId, "broadcast", made.id, "send_broadcast", {
    name, template: `${tpl.name}/${tpl.language}`, category: tpl.category, audience: audienceJson, values: specs.map(paramLabel), recipients: eligible.length, scheduled_for: when.toISOString(),
  });
  return { id: made.id, name, state: "scheduled", recipient_count: eligible.length, scheduled_for: when.toISOString(), decision_id: decisionId };
});
