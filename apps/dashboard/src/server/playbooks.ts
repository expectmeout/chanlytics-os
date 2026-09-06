import "server-only";
import {
  AppError,
  PLAYBOOK_DEFAULTS,
  PLAYBOOK_HOURS,
  PLAYBOOK_NAME_MAX,
  cleanParam,
  parseParamSpec,
  parseTenantConfig,
  starterForTrigger,
  templateTitle,
  triggerOf,
  type ParamSpec,
  type PlaybookDto,
  type PlaybookPolicyClass,
  type PlaybookTrigger,
} from "@chanlytics/contracts";
import type { RouteContext } from "@/server/with-route";
import { listBroadcasts } from "@/server/broadcasts";

/**
 * Playbooks, read and checked.
 *
 * A playbook row plus what its runs earned: sent, delivered and replied
 * summed over the recent runs (the broadcasts that carry its id), the last
 * run's state, and a run waiting for a person if there is one. The checks
 * are the send route's own, so a playbook can never name a template a
 * broadcast could not send or a slot the workspace cannot fill.
 */
const COLUMNS = "id, name, trigger, template_id, template_name, template_language, params, policy_class, state, run_hour, cap_per_run, gap_days, cadence_days, last_run_for, last_run_at, created_at";

export interface PlaybookTotals {
  runs: number;
  sent: number;
  delivered: number;
  replied: number;
  held: number;
  lastRun: { id: string; state: string; run_for: string | null; recipient_count: number } | null;
  waiting: { id: string; recipient_count: number; name: string } | null;
}

export type PlaybookListRow = PlaybookDto & { totals: PlaybookTotals };

export async function listPlaybooks(ctx: RouteContext, tenantId: string): Promise<PlaybookListRow[]> {
  const [{ data: rows, error }, runs] = await Promise.all([
    ctx.supabase.from("playbooks").select(COLUMNS).eq("tenant_id", tenantId).order("created_at", { ascending: false }),
    listBroadcasts(ctx, tenantId),
  ]);
  if (error) throw new Error(error.message);
  const totals = new Map<string, PlaybookTotals>();
  for (const b of runs) {
    if (!b.playbook_id) continue;
    const t = totals.get(b.playbook_id) ?? { runs: 0, sent: 0, delivered: 0, replied: 0, held: 0, lastRun: null, waiting: null };
    t.runs += 1;
    t.sent += b.counts.sent;
    t.delivered += b.counts.delivered;
    t.replied += b.counts.replied;
    t.held += b.counts.skipped + b.counts.failed;
    if (!t.lastRun) t.lastRun = { id: b.id, state: b.state, run_for: b.run_for, recipient_count: b.recipient_count };
    if (b.state === "pending_approval" && !t.waiting) t.waiting = { id: b.id, recipient_count: b.recipient_count, name: b.name };
    totals.set(b.playbook_id, t);
  }
  return (rows ?? []).map((r) => ({
    ...(r as unknown as Omit<PlaybookDto, "params" | "trigger" | "policy_class" | "state">),
    trigger: r.trigger as PlaybookTrigger,
    policy_class: r.policy_class as PlaybookPolicyClass,
    state: r.state as PlaybookDto["state"],
    params: Array.isArray(r.params) ? (r.params as unknown[]).map((p) => parseParamSpec(p) ?? { kind: "text" as const, value: String(p) }) : [],
    totals: totals.get(r.id) ?? { runs: 0, sent: 0, delivered: 0, replied: 0, held: 0, lastRun: null, waiting: null },
  }));
}

export interface PlaybookInput {
  name: string;
  trigger: PlaybookTrigger;
  template_id: string;
  template_name: string;
  template_language: string;
  params: ParamSpec[];
  policy_class: PlaybookPolicyClass;
  run_hour: number;
  cap_per_run: number;
  gap_days: number;
  cadence_days: number;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function int(v: unknown, fallback: number, min: number, max: number, what: string): number {
  if (v === undefined || v === null || v === "") return fallback;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw new AppError("validation", `${what} must be a whole number from ${min} to ${max}.`);
  return n;
}

/** Everything a playbook names, checked the way the send route checks a broadcast. */
export async function checkPlaybookInput(ctx: RouteContext, tenantId: string, body: Record<string, unknown> | null): Promise<PlaybookInput> {
  const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ").slice(0, PLAYBOOK_NAME_MAX) : "";
  const trig = typeof body?.trigger === "string" ? triggerOf(body.trigger) : null;
  if (!trig) throw new AppError("validation", "Pick what starts it: win-back, welcome, save our number, or the month's offer.");
  const templateId = typeof body?.template_id === "string" ? body.template_id : "";
  if (!UUID.test(templateId)) throw new AppError("validation", "Pick a template.");
  const { data: tpl, error } = await ctx.supabase
    .from("templates")
    .select("id, name, language, meta_status, variables, title")
    .eq("id", templateId)
    .eq("tenant_id", tenantId)
    .eq("channel", "whatsapp")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!tpl) throw new AppError("not_found", "Template not found.", 404);
  if (tpl.meta_status !== "approved") throw new AppError("conflict", "That template is not approved by WhatsApp, so it cannot be sent.", 409);
  const expected = Array.isArray(tpl.variables) ? tpl.variables.length : 0;
  const rawParams = Array.isArray(body?.params) ? body.params : [];
  if (rawParams.length !== expected) {
    throw new AppError("validation", expected === 0 ? "This template takes no values." : `This template takes ${expected} value${expected === 1 ? "" : "s"}.`);
  }
  const params: ParamSpec[] = [];
  for (const p of rawParams) {
    const spec = parseParamSpec(p);
    if (!spec) throw new AppError("validation", "Each value is typed text, their first name, the business name, or the booking link.");
    if (spec.kind === "text") {
      const v = cleanParam(spec.value);
      if (v === null) throw new AppError("validation", "Every value is needed, without line breaks or tabs, and under 1024 characters.");
      params.push({ kind: "text", value: v });
    } else {
      params.push(spec);
    }
  }
  if (params.some((s) => s.kind === "booking_link")) {
    const { data: cfgRow } = await ctx.supabase.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle();
    if (!parseTenantConfig(cfgRow?.config ?? null)?.brain?.booking_link) {
      throw new AppError("conflict", "This message takes the booking link, and none is on file. Add it in Settings › Workspace first.", 409);
    }
  }
  return {
    // A name when none was given: the trigger's alone when it sends its own starter, else with the template's title.
    name: name || (starterForTrigger(trig.id)?.name === tpl.name ? trig.label : `${trig.label} · ${templateTitle(tpl.name, tpl.title)}`).slice(0, PLAYBOOK_NAME_MAX),
    trigger: trig.id,
    template_id: tpl.id,
    template_name: tpl.name,
    template_language: tpl.language,
    params,
    policy_class: trig.cls,
    run_hour: int(body?.run_hour, PLAYBOOK_DEFAULTS.runHour, PLAYBOOK_HOURS.min, PLAYBOOK_HOURS.max, "The hour"),
    cap_per_run: int(body?.cap_per_run, PLAYBOOK_DEFAULTS.capPerRun, 1, 500, "The cap"),
    gap_days: int(body?.gap_days, PLAYBOOK_DEFAULTS.gapDays, 7, 365, "The gap"),
    cadence_days: int(body?.cadence_days, PLAYBOOK_DEFAULTS.cadenceDays, 1, 90, "The cadence"),
  };
}
