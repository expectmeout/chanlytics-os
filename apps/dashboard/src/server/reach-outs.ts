import "server-only";
/**
 * The reads and writes behind the reach-out routes (Reach out, Part 4). Reads run on the session client, so RLS
 * decides; the definer doors (00198) check the member again. Saving is the service role's (R15): the route has
 * checked the role, and this validates every word first (contracts validateReachOutChain), so the database keeps
 * only its CHECKs. Every sentence said is contracts' (REACH_OUT_REFUSALS, chainIssueWords).
 */
import {
  AppError,
  REACH_OUT_REFUSALS,
  chainIssueWords,
  isReachOutHold,
  isReachOutRefusal,
  isReachOutRun,
  localDate,
  maySpend,
  parseTenantConfig,
  reachOutSlots,
  validateReachOutChain,
  type BillingMode,
  type BillingStatus,
  type ReachOutChainDto,
  type ReachOutChainInput,
  type ReachOutChainReportDto,
  type ReachOutDecision,
  type ReachOutReachDto,
  type ReachOutRunDto,
  type ReachOutSavedDto,
  type ReachOutStartDto,
  type ReachOutStepDto,
} from "@chanlytics/contracts";
import { emailWordsFrom } from "@chanlytics/db";
import type { RouteContext } from "@/server/with-route";
import type { Member } from "@/server/route";
import { recordDecision } from "@/server/verbs";
import { runPlaybookNow, saveReachOut, type RunPlaybookOutcome } from "@/server/service";
import { tenantFacts } from "@/server/tenant";

interface PgError {
  code?: string;
  message: string;
}

/**
 * A door's refusal, as the route answers it: the database raises contracts' own sentences, said as they are; the
 * status follows the code (P0002 not found, 22023 or 23514 not as it may be, 23505 or 23503 in the way of something).
 */
export function reachOutRefusal(e: PgError): Error {
  const said = isReachOutRefusal(e.message) ? e.message : null;
  switch (e.code) {
    case "P0002":
      return new AppError("not_found", said ?? REACH_OUT_REFUSALS.notFound, 404);
    case "22023":
    case "23514":
      return new AppError("validation", said ?? REACH_OUT_REFUSALS.unsaved, 422);
    case "23505":
    case "23503":
      return new AppError("conflict", said ?? REACH_OUT_REFUSALS.exists, 409);
    default:
      return new Error(e.message);
  }
}

const PLAYBOOK_COLUMNS =
  "id, name, state, trigger, lead_search_id, after_playbook_id, after_days, gap_minutes, domain_ids, signed_by, include_unconfirmed, template_id, run_hour, last_run_for, created_at";

interface StepRow {
  id: string;
  name: string;
  state: string;
  trigger: string;
  lead_search_id: string | null;
  after_playbook_id: string | null;
  after_days: number | null;
  gap_minutes: number | null;
  domain_ids: string[] | null;
  signed_by: string | null;
  include_unconfirmed: boolean | null;
  template_id: string | null;
  run_hour: number;
  last_run_for: string | null;
  created_at: string;
}

/** A chain's steps, root first, each after the one before (after_playbook_id). */
function chainOf(root: StepRow, all: StepRow[]): StepRow[] {
  const out = [root];
  for (let i = 0; i < 10; i += 1) {
    const next = all.find((s) => s.after_playbook_id === out[out.length - 1]!.id);
    if (!next) break;
    out.push(next);
  }
  return out;
}

/** The chains of a workspace, without their reports (R23: a report is read when its row is opened). */
export async function chainsOf(ctx: RouteContext, tenantId: string): Promise<ReachOutChainDto[]> {
  const sb = ctx.supabase;
  const { data: rows, error } = await sb
    .from("playbooks")
    .select(PLAYBOOK_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("kind", "reach_out");
  if (error) throw new Error(error.message);
  const steps = (rows ?? []) as StepRow[];
  const roots = steps
    .filter((s) => s.trigger === "lead_first")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (roots.length === 0) return [];
  const templateIds = steps.map((s) => s.template_id).filter((x): x is string => !!x);
  const searchIds = roots.map((r) => r.lead_search_id).filter((x): x is string => !!x);
  const [templates, searches, policy, billing, waiting] = await Promise.all([
    sb.from("templates").select("id, components, body_preview").eq("tenant_id", tenantId).in("id", templateIds),
    sb.from("lead_searches").select("id, name").eq("tenant_id", tenantId).in("id", searchIds),
    sb.from("policies").select("class, mode, subject_type").eq("tenant_id", tenantId).eq("class", "outreach"),
    sb.from("billing_accounts").select("mode, status").eq("tenant_id", tenantId).maybeSingle(),
    sb.from("broadcasts").select("id, audience").eq("tenant_id", tenantId).eq("state", "pending_approval"),
  ]);
  for (const r of [templates, searches, policy, billing, waiting]) if (r.error) throw new Error(r.error.message);
  const words = new Map(
    ((templates.data ?? []) as { id: string; components: unknown; body_preview: string | null }[]).map((t) => [
      t.id,
      emailWordsFrom(t),
    ]),
  );
  const names = new Map(((searches.data ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]));
  // The outreach row every workspace has (00183); none, or one it does not know, reads as ask, as the step's run does.
  const said = ((policy.data ?? []) as { mode: string; subject_type: string | null }[]).find(
    (p) => p.subject_type === null,
  )?.mode;
  const mode = said === "veto" || said === "never" ? said : "ask";
  const b = billing.data as { mode: string; status: string } | null;
  const spend = !!b && maySpend(b.mode as BillingMode, b.status as BillingStatus);
  const waitingOf = new Map<string, string>();
  for (const w of (waiting.data ?? []) as { id: string; audience: unknown }[])
    if (isReachOutRun(w.audience)) waitingOf.set(String((w.audience as { root_id?: unknown }).root_id), w.id);

  return roots.map((root) => {
    const chain = chainOf(root, steps);
    const stepDtos: ReachOutStepDto[] = chain.map((s, n) => {
      const w = s.template_id ? words.get(s.template_id) : null;
      return {
        id: s.id,
        n,
        after_days: n === 0 ? null : s.after_days,
        subject: n === 0 ? (w?.subject ?? null) : null,
        body: w?.body ?? "",
        template_id: s.template_id,
        state: s.state === "running" ? "running" : "paused",
      };
    });
    return {
      root_id: root.id,
      name: root.name,
      search: root.lead_search_id ? { id: root.lead_search_id, name: names.get(root.lead_search_id) ?? "" } : null,
      state: root.state === "running" ? "running" : "paused",
      include_unconfirmed: root.include_unconfirmed === true,
      gap_minutes: root.gap_minutes ?? 0,
      domain_ids: root.domain_ids ?? [],
      signed_by: root.signed_by,
      steps: stepDtos,
      next: {
        run_hour: root.run_hour,
        last_run_for: root.last_run_for,
        mode,
        may_spend: spend,
        waiting_run_id: waitingOf.get(root.id) ?? null,
      },
      created_at: root.created_at,
    };
  });
}

/** A chain's report (00198 reach_out_chain_report): its steps counted once, its last runs, whether it may go. */
export async function chainReportOf(
  ctx: RouteContext,
  tenantId: string,
  rootId: string,
): Promise<ReachOutChainReportDto> {
  const { data, error } = await ctx.supabase.rpc("reach_out_chain_report", {
    p_tenant_id: tenantId,
    p_root_id: rootId,
  });
  if (error) throw reachOutRefusal(error);
  return data as unknown as ReachOutChainReportDto;
}

/** A search's reach: who a chain over it would write to, and who it would not, and why. */
export async function reachOf(ctx: RouteContext, tenantId: string, searchId: string): Promise<ReachOutReachDto> {
  const { data, error } = await ctx.supabase.rpc("reach_out_reach", { p_tenant_id: tenantId, p_search_id: searchId });
  if (error) throw reachOutRefusal(error);
  return data as unknown as ReachOutReachDto;
}

/** The workspace's booking link, which {{booking link}} needs. */
async function bookingLinkOf(ctx: RouteContext, tenantId: string): Promise<string | null> {
  const { data, error } = await ctx.supabase
    .from("tenant_config")
    .select("config")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return parseTenantConfig(data?.config ?? null)?.brain?.booking_link?.trim() || null;
}

/** What Start did (R14): the edge's outcome with its reason, or that the edge could not be asked. */
export function startOf(r: RunPlaybookOutcome): ReachOutStartDto {
  if (r.ok)
    return {
      outcome: r.outcome,
      reason: r.reason ?? r.skipped ?? null,
      planned: r.planned ?? 0,
      run_id: r.runId ?? null,
    };
  const outcome = r.reason === "preview" ? "preview" : r.reason === "edge_unreachable" ? "unreached" : "failed";
  return { outcome, reason: outcome === "failed" ? r.reason : null, planned: 0, run_id: null };
}

/**
 * A chain saved whole. Every word is validated here first (the database keeps only its CHECKs, R15); then the
 * service role's door, with the member's id; then, for a new chain, its first run asked for now through the run-now
 * door every playbook uses (R13), whose answer is said as it is (R14).
 */
export async function saveChain(
  ctx: RouteContext,
  member: Member,
  input: ReachOutChainInput,
  rootId: string | null,
): Promise<ReachOutSavedDto> {
  const issues = validateReachOutChain(input, { bookingLink: !!(await bookingLinkOf(ctx, member.tenantId)) });
  if (issues.length > 0) {
    const said = issues.map((i) => ({ ...i, words: chainIssueWords(i) }));
    throw new AppError("validation", said[0]!.words, 422, { issues: said });
  }
  const { data, error } = await saveReachOut(member.tenantId, ctx.userId, { ...input, root_id: rootId });
  if (error) throw reachOutRefusal(error);
  const saved = data as { root_id: string; step_ids: string[]; rechecked: number };
  if (rootId) return { root_id: saved.root_id, step_ids: saved.step_ids, rechecked: saved.rechecked ?? 0, start: null };
  await recordDecision(ctx, member.tenantId, "playbook", saved.root_id, "start_playbook", { name: input.name });
  const start = startOf(await runPlaybookNow(member.tenantId, saved.root_id, ctx.userId));
  return { root_id: saved.root_id, step_ids: saved.step_ids, rechecked: 0, start };
}

/** A chain that never wrote, removed whole (R16); one that did is refused, in words, to be paused instead. */
export async function removeChain(
  ctx: RouteContext,
  member: Member,
  root: { id: string; name: string },
): Promise<{ removed: true; id: string }> {
  const { error } = await ctx.supabase.rpc("reach_out_remove", { p_tenant_id: member.tenantId, p_root_id: root.id });
  if (error) throw reachOutRefusal(error);
  await recordDecision(ctx, member.tenantId, "playbook", root.id, "pause_playbook", { name: root.name, deleted: true });
  return { removed: true, id: root.id };
}

/** An owner's answer to one held (or planned) email: include, rewrite, skip, or not a fit, atomic (R18). */
export async function decideSend(
  ctx: RouteContext,
  sendId: string,
  decision: ReachOutDecision,
): Promise<{ send_id: string; decision: ReachOutDecision }> {
  const { error } = await ctx.supabase.rpc("reach_out_send_decide", { p_send_id: sendId, p_decision: decision });
  if (error) throw reachOutRefusal(error);
  return { send_id: sendId, decision };
}

/** Every hold of a run the check could not answer, back to be checked in one call (R18). */
export async function recheckRun(
  ctx: RouteContext,
  broadcastId: string,
): Promise<{ broadcast_id: string; rechecked: number }> {
  const { data, error } = await ctx.supabase.rpc("reach_out_run_recheck", { p_broadcast_id: broadcastId });
  if (error) throw reachOutRefusal(error);
  const r = data as { rechecked?: number } | null;
  return { broadcast_id: broadcastId, rechecked: r?.rechecked ?? 0 };
}

interface SendRow {
  id: string;
  lead_id: string;
  state: string;
  reason: string | null;
  hold_detail: string | null;
  opening: string | null;
  angle: string | null;
  send_at: string | null;
  checked_at: string | null;
  created_at: string;
  domain_id: string | null;
  lead: { business_name: string | null; email: string | null; city: string | null } | null;
}

/**
 * A reach-out run as its approval sheet reads it (F13, R20–R22): who today, who later, who is still being checked,
 * what the check held, the first checked business's email as it reads, and the domains its sends go from. A run holds
 * at most a step's cap (200) sends, well under a read's thousand rows.
 */
export async function reachOutRunOf(
  ctx: RouteContext,
  tenantId: string,
  run: { id: string; audience: unknown; playbook_id: string | null; run_for: string | null },
): Promise<ReachOutRunDto | null> {
  if (!isReachOutRun(run.audience)) return null;
  const sb = ctx.supabase;
  const rootId = String((run.audience as { root_id?: unknown }).root_id ?? "");
  const [sends, chain, facts, link] = await Promise.all([
    sb
      .from("reach_out_sends")
      .select(
        "id, lead_id, state, reason, hold_detail, opening, angle, send_at, checked_at, created_at, domain_id, lead:leads(business_name, email, city)",
      )
      .eq("tenant_id", tenantId)
      .eq("broadcast_id", run.id),
    sb.from("playbooks").select(PLAYBOOK_COLUMNS).eq("tenant_id", tenantId).eq("kind", "reach_out"),
    tenantFacts(sb, tenantId),
    bookingLinkOf(ctx, tenantId),
  ]);
  if (sends.error) throw new Error(sends.error.message);
  if (chain.error) throw new Error(chain.error.message);
  const all = (chain.data ?? []) as StepRow[];
  const root = all.find((s) => s.id === rootId);
  if (!root) return null;
  const steps = chainOf(root, all);
  const stepN = Math.max(
    0,
    steps.findIndex((s) => s.id === run.playbook_id),
  );
  const step = steps[stepN]!;
  const rows = (sends.data ?? []) as unknown as SendRow[];
  const tz = facts.timezone;
  const today = localDate(tz, new Date());
  const planned = rows.filter((s) => s.state === "planned");
  const checked = planned.filter((s) => s.checked_at).sort((a, b) => (a.send_at ?? "").localeCompare(b.send_at ?? ""));
  const dueToday = (s: SendRow) => !!s.send_at && localDate(tz, new Date(s.send_at)) <= today;
  const skipped: Record<string, number> = {};
  for (const s of rows)
    if (s.state === "skipped") skipped[s.reason ?? "other"] = (skipped[s.reason ?? "other"] ?? 0) + 1;

  let first: ReachOutRunDto["first"] = null;
  const lead = checked[0];
  if (lead && step.template_id) {
    const { data: tpl, error } = await sb
      .from("templates")
      .select("components, body_preview")
      .eq("tenant_id", tenantId)
      .eq("id", step.template_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const words = tpl ? emailWordsFrom(tpl) : null;
    const rootWords = stepN === 0 ? words : null;
    const slots = { businessName: facts.name, yourName: root.signed_by, bookingLink: link };
    const leadSlots = { business_name: lead.lead?.business_name ?? null, city: lead.lead?.city ?? null };
    const body = words ? reachOutSlots(words.body, leadSlots, slots, lead.opening) : null;
    const subject = rootWords?.subject ? reachOutSlots(rootWords.subject, leadSlots, slots, lead.opening) : null;
    if (body?.ok)
      first = {
        business_name: lead.lead?.business_name ?? "",
        subject: subject?.ok ? subject.text : null,
        body: body.text,
        opening: lead.opening,
        angle: lead.angle,
      };
  }

  const domainIds = [...new Set(rows.map((s) => s.domain_id).filter((x): x is string => !!x))];
  const domains =
    domainIds.length === 0
      ? []
      : await sb
          .from("sending_domains")
          .select("id, host, sent_days")
          .eq("tenant_id", tenantId)
          .in("id", domainIds)
          .then(({ data, error }) => {
            if (error) throw new Error(error.message);
            return ((data ?? []) as { host: string; sent_days: number | null }[]).map((d) => ({
              host: d.host,
              sent_days: d.sent_days ?? 0,
            }));
          });

  return {
    root_id: root.id,
    chain_name: root.name,
    step_id: step.id,
    step_n: stepN,
    gap_minutes: root.gap_minutes ?? 0,
    run_for: run.run_for,
    include_unconfirmed: root.include_unconfirmed === true,
    today: checked.filter(dueToday).length,
    later: checked.filter((s) => !dueToday(s)).length,
    first_at: checked[0]?.send_at ?? null,
    checking: planned.length - checked.length,
    held: rows
      .filter((s) => s.state === "held" && isReachOutHold(s.reason))
      .map((s) => ({
        send_id: s.id,
        lead_id: s.lead_id,
        business_name: s.lead?.business_name ?? "",
        email: s.lead?.email ?? null,
        reason: s.reason as ReachOutRunDto["held"][number]["reason"],
        detail: s.hold_detail,
        opening: s.opening,
        angle: s.angle,
        planned_at: s.created_at,
      })),
    planned: planned
      .slice()
      .sort((a, b) => (a.send_at ?? "").localeCompare(b.send_at ?? ""))
      .map((s) => ({
        send_id: s.id,
        business_name: s.lead?.business_name ?? "",
        send_at: s.send_at ?? "",
        checked: !!s.checked_at,
      })),
    skipped,
    first,
    domains,
  };
}
