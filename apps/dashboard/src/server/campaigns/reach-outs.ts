import "server-only";
/**
 * The reads and writes behind the reach-out routes (Reach out, Part 4). Reads run on the session client, so RLS
 * decides; the definer doors (00211) check the member again. Saving is the service role's (R15): the route has
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
  parseTenantConfig,
  reachOutSendsFrom,
  reachOutSlots,
  validateReachOutChain,
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
import {
  emailWordsByTemplate,
  emailWordsOf,
  outreachModeOf,
  reachOutRunSendsOf,
  reachOutStepsOf,
  runsWaitingOf,
  searchNamesByIds,
  sendingDomainsOf,
  workspaceMaySpend,
  workspaceNameAndConfig,
  type ReachOutRunSend,
  type ReachOutStepRow,
} from "@chanlytics/db";
import type { RouteContext } from "@/server/with-route";
import type { Member } from "@/server/route";
import { recordDecision } from "@/server/verbs";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@chanlytics/db";
import { runPlaybookNow, type RunPlaybookOutcome } from "@/server/campaigns/playbook-run";
import { serviceDb } from "@/server/service-db";
import { deployment } from "@/server/deployment";
import { edgeHeaders, edgeUrl } from "@/server/edge";
import { tenantFacts } from "@/server/tenant";

interface PgError {
  code?: string;
  message: string;
}

/**
 * A door's refusal, as the route answers it: the database raises contracts' own sentences, said as they are; the
 * status follows the code (P0002 not found, 22023 or 23514 not as it may be, 23505 or 23503 in the way of something).
 */
function reachOutRefusal(e: PgError): Error {
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

type StepRow = ReachOutStepRow;

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
  const steps = await reachOutStepsOf(sb, tenantId);
  const roots = steps
    .filter((s) => s.trigger === "lead_first")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (roots.length === 0) return [];
  const templateIds = steps.map((s) => s.template_id).filter((x): x is string => !!x);
  const searchIds = roots.map((r) => r.lead_search_id).filter((x): x is string => !!x);
  const [words, names, waiting, domains, mode, spend] = await Promise.all([
    emailWordsByTemplate(sb, tenantId, templateIds),
    searchNamesByIds(sb, tenantId, searchIds),
    runsWaitingOf(sb, tenantId),
    sendingDomainsOf(sb, tenantId),
    // The step's run's own readings (packages/db): its outreach mode, and whether the workspace may spend.
    outreachModeOf(sb, tenantId),
    workspaceMaySpend(sb, tenantId),
  ]);
  // The domains the chain's run sends from, by the run's own rule (contracts reachOutSendsFrom): its named ones, or every
  // one when it names none, verified and clean. A held or unverified domain it names is not its pace.
  const domainsOf = (ids: string[]) =>
    domains.filter((d) => reachOutSendsFrom(d, ids)).map((d) => ({ host: d.host, sent_days: d.sent_days ?? 0 }));
  const waitingOf = new Map<string, string>();
  for (const w of waiting)
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
      domains: domainsOf(root.domain_ids ?? []),
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

/** A chain's report (00211 reach_out_chain_report): its steps counted once, its last runs, whether it may go. */
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
  return dtoOf<ReachOutChainReportDto>(data);
}

/** A search's reach: who a chain over it would write to, and who it would not, and why. */
export async function reachOf(ctx: RouteContext, tenantId: string, searchId: string): Promise<ReachOutReachDto> {
  const { data, error } = await ctx.supabase.rpc("reach_out_reach", { p_tenant_id: tenantId, p_search_id: searchId });
  if (error) throw reachOutRefusal(error);
  return dtoOf<ReachOutReachDto>(data);
}

/** A door's jsonb answer, as the DTO its function builds (00211): the SQL is its shape, and its tests hold it. */
const dtoOf = <T>(data: unknown): T => data as T;

/** The workspace's booking link, which {{booking link}} needs. */
async function bookingLinkOf(ctx: RouteContext, tenantId: string): Promise<string | null> {
  const { config } = await workspaceNameAndConfig(ctx.supabase, tenantId);
  return parseTenantConfig(config)?.brain?.booking_link?.trim() || null;
}

/** What Start did (R14): the edge's outcome with its reason, or that the edge could not be asked. */
function startOf(r: RunPlaybookOutcome): ReachOutStartDto {
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

type SendRow = ReachOutRunSend;

/** The first checked business's email as it reads: the step's words with their values in and its opening written. */
async function firstEmailOf(
  ctx: RouteContext,
  tenantId: string,
  p: { lead: SendRow | undefined; step: StepRow | null; first: boolean; signedBy: string | null },
): Promise<ReachOutRunDto["first"]> {
  const { lead, step } = p;
  if (!lead || !step?.template_id) return null;
  const [words, facts, link] = await Promise.all([
    emailWordsOf(ctx.supabase, tenantId, step.template_id),
    tenantFacts(ctx.supabase, tenantId),
    bookingLinkOf(ctx, tenantId),
  ]);
  if (!words) return null;
  const slots = { businessName: facts.name, yourName: p.signedBy, bookingLink: link };
  const leadSlots = { business_name: lead.lead?.business_name ?? null, city: lead.lead?.city ?? null };
  const body = reachOutSlots(words.body, leadSlots, slots, lead.opening);
  const subject = p.first && words.subject ? reachOutSlots(words.subject, leadSlots, slots, lead.opening) : null;
  if (!body.ok) return null;
  return {
    business_name: lead.lead?.business_name ?? "",
    subject: subject?.ok ? subject.text : null,
    body: body.text,
    opening: lead.opening,
    angle: lead.angle,
  };
}

/** The domains a run's sends go from, with the days each has sent (R22). */
async function runDomainsOf(ctx: RouteContext, tenantId: string, rows: SendRow[]): Promise<ReachOutRunDto["domains"]> {
  const ids = new Set(rows.map((s) => s.domain_id).filter((x): x is string => !!x));
  if (ids.size === 0) return [];
  return (await sendingDomainsOf(ctx.supabase, tenantId))
    .filter((d) => ids.has(d.id))
    .map((d) => ({ host: d.host, sent_days: d.sent_days ?? 0 }));
}

/** A run's sends counted as its approval sheet says them (R21): checked and due today, later, still being checked. */
function runCountsOf(rows: SendRow[], tz: string) {
  const today = localDate(tz, new Date());
  const planned = rows
    .filter((s) => s.state === "planned")
    .sort((a, b) => (a.send_at ?? "").localeCompare(b.send_at ?? ""));
  const checked = planned.filter((s) => s.checked_at);
  const dueToday = (s: SendRow) => !!s.send_at && localDate(tz, new Date(s.send_at)) <= today;
  const skipped: Record<string, number> = {};
  for (const s of rows)
    if (s.state === "skipped") skipped[s.reason ?? "other"] = (skipped[s.reason ?? "other"] ?? 0) + 1;
  return {
    planned,
    checked,
    skipped,
    today: checked.filter(dueToday).length,
    later: checked.filter((s) => !dueToday(s)).length,
  };
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
  const rootId = String((run.audience as { root_id?: unknown }).root_id ?? "");
  const [rows, all, facts] = await Promise.all([
    reachOutRunSendsOf(ctx.supabase, tenantId, run.id),
    reachOutStepsOf(ctx.supabase, tenantId),
    tenantFacts(ctx.supabase, tenantId),
  ]);
  const root = all.find((s) => s.id === rootId);
  if (!root) return null;
  const steps = chainOf(root, all);
  // A run whose step was dropped from the chain since (R17) has no place in it: said so, never as another step.
  const at = steps.findIndex((s) => s.id === run.playbook_id);
  const stepN = at < 0 ? null : at;
  const step = stepN === null ? null : steps[stepN]!;
  const c = runCountsOf(rows, facts.timezone);
  const [first, domains] = await Promise.all([
    firstEmailOf(ctx, tenantId, { lead: c.checked[0], step, first: stepN === 0, signedBy: root.signed_by }),
    runDomainsOf(ctx, tenantId, rows),
  ]);
  return {
    root_id: root.id,
    chain_name: root.name,
    step_id: step?.id ?? null,
    step_n: stepN,
    gap_minutes: root.gap_minutes ?? 0,
    run_for: run.run_for,
    include_unconfirmed: root.include_unconfirmed === true,
    today: c.today,
    later: c.later,
    first_at: c.checked[0]?.send_at ?? null,
    checking: c.planned.length - c.checked.length,
    held: rows.filter((s) => s.state === "held" && isReachOutHold(s.reason)).map(heldOf),
    // A planned send always has its time (00183 reach_out_sends_planned_is_timed); one read without it is not listed
    // with a time it does not have.
    planned: c.planned.flatMap((s) =>
      s.send_at
        ? [{ send_id: s.id, business_name: s.lead?.business_name ?? "", send_at: s.send_at, checked: !!s.checked_at }]
        : [],
    ),
    skipped: c.skipped,
    first,
    domains,
  };
}

/** A held send as the approval sheet lists it. */
const heldOf = (s: SendRow): ReachOutRunDto["held"][number] => ({
  send_id: s.id,
  lead_id: s.lead_id,
  business_name: s.lead?.business_name ?? "",
  email: s.lead?.email ?? null,
  reason: s.reason as ReachOutRunDto["held"][number]["reason"],
  detail: s.hold_detail,
  opening: s.opening,
  angle: s.angle,
  planned_at: s.created_at,
});

/* ---- Reach out (Part 4): a chain saved by the service role, and one business's preview ---- */

/**
 * A chain, made or edited whole (00211 reach_out_save). The service role's alone (R15): the route has checked the
 * member's role and validated every word, and passes who they are; the door checks the membership again.
 */
async function saveReachOut(
  tenantId: string,
  userId: string,
  chain: Record<string, unknown>,
  db: SupabaseClient<Database> = serviceDb(),
): Promise<{ data: unknown; error: { code?: string; message: string } | null }> {
  const { data, error } = await db.rpc("reach_out_save", {
    p_tenant_id: tenantId,
    p_user_id: userId,
    p_chain: chain as Json,
  });
  return { data, error };
}

type ReachOutPreviewOutcome =
  | { ok: true; preview: unknown }
  | { ok: false; reason: "preview" | "edge_unreachable" | "ask_budget" | "bad_request" | string };

/**
 * One business's email as the chain would write it (the edge's reach-out-preview door, R11): the model is asked, and
 * what it cost is counted in Ask's daily budget against this member (R12).
 */
export async function previewReachOut(
  tenantId: string,
  userId: string,
  body: Record<string, unknown>,
): Promise<ReachOutPreviewOutcome> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  const r = await fetch(`${edgeUrl()}/api/admin/reach-out-preview`, {
    method: "POST",
    headers: edgeHeaders("/api/admin/reach-out-preview", { workspace: tenantId, user: userId }),
    body: JSON.stringify({ ...body, tenant_id: tenantId, user_id: userId }),
  }).catch(() => null);
  if (!r) return { ok: false, reason: "edge_unreachable" };
  const j = (await r.json().catch(() => ({}))) as { ok?: boolean; preview?: unknown; error?: string };
  return r.ok && j.ok && j.preview
    ? { ok: true, preview: j.preview }
    : { ok: false, reason: j.error ?? `edge ${r.status}` };
}
