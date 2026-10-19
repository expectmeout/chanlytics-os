import "server-only";
/**
 * The reads and writes behind the reach-out routes (Reach out, Part 4). Reads run on the session client, so RLS
 * decides; the definer doors (00211) check the member again. Saving is the service role's (R15): the route has
 * checked the role, and this validates every word first (contracts validateReachOutChain), so the database keeps
 * only its CHECKs. Every sentence said is contracts' (REACH_OUT_REFUSALS, chainIssueWords).
 */
import {
  AppError,
  REACH_OUT_LANGUAGE,
  REACH_OUT_REFUSALS,
  chainIssueWords,
  isReachOutHold,
  draftRefusalOf,
  handOf,
  isLeadList,
  isReachOutRefusal,
  isReachOutRun,
  localDate,
  parseTenantConfig,
  reachOutChainBodyOf,
  reachOutDraftOf,
  reachOutEmailOf,
  reachOutRootOf,
  reachOutStepOf,
  reachOutWritesFrom,
  validateReachOutChain,
  type ReachOutChainDto,
  type ReachOutChainInput,
  type ReachOutChainReportDto,
  type ReachOutDecision,
  type ReachOutMailboxFacts,
  type ReachOutReachDto,
  type ReachOutRunDto,
  type ReachOutSaidDto,
  type ReachOutSaidOutcome,
  type ReachOutSavedDto,
  type ReachOutStartDto,
  type ReachOutStepDto,
} from "@chanlytics/contracts";
import {
  draftsWaiting,
  emailWordsByTemplate,
  emailWordsOf,
  emitEvent,
  mailboxConnectionsOf,
  outreachModeOf,
  reachOutRunSendsOf,
  reachOutStepsOf,
  runsWaitingOf,
  saveReachOutChain,
  searchesByIds,
  reachOutPeopleCounts,
  sendSaid,
  workspaceMaySpend,
  type ReachOutRunSend,
  type ReachOutStepRow,
} from "@chanlytics/db";
import type { RouteContext } from "@/server/with-route";
import type { Member } from "@/server/route";
import { recordDecision } from "@/server/verbs";
import { runPlaybookNow, type RunPlaybookOutcome } from "@/server/campaigns/playbook-run";
import { serviceDb } from "@/server/service-db";
import { storedConfigOf } from "@/server/workspace/config-row";
import { log } from "@/server/log";
import { deployment } from "@/server/env";
import { callEdge, edgeAnswered, edgeReasonOf, type EdgeReason } from "@/server/edge";

/** One email written by the model at the edge, whose door may take thirty seconds: a little over it. */
const PREVIEW_TIMEOUT_MS = 35_000;
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

type StepRow = ReachOutStepRow;

/** A chain's steps, root first, each after the one before (after_playbook_id). */
function chainOf(root: StepRow, all: StepRow[]): StepRow[] {
  const out = [root];
  for (let i = 0; i < 10; i += 1) {
    const next = all.find((s) => s.after_playbook_id === out[out.length - 1].id);
    if (!next) break;
    out.push(next);
  }
  return out;
}

/**
 * The chains of a workspace, without their reports (R23: a report is read when its row is opened), each with what feeds
 * it and who is in it now (00426: the ledger's People cell, counted by the drawer's one rule).
 */
export async function chainsOf(ctx: RouteContext, tenantId: string): Promise<ReachOutChainDto[]> {
  const sb = ctx.supabase;
  const steps = await reachOutStepsOf(sb, tenantId);
  const roots = steps
    .filter((s) => s.trigger === "lead_first")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (roots.length === 0) return [];
  const templateIds = steps.map((s) => s.template_id).filter((x): x is string => !!x);
  const searchIds = roots.map((r) => r.lead_search_id).filter((x): x is string => !!x);
  const [words, searches, waiting, mailboxes, mode, spend, people] = await Promise.all([
    emailWordsByTemplate(sb, tenantId, templateIds),
    searchesByIds(sb, tenantId, searchIds),
    runsWaitingOf(sb, tenantId),
    mailboxConnectionsOf(sb, tenantId),
    // The step's run's own readings (packages/db): its outreach mode, and whether the workspace may spend.
    outreachModeOf(sb, tenantId),
    workspaceMaySpend(sb, tenantId),
    // Who is in each now: a count that fails is a dash on the ledger, never the chains' failure.
    reachOutPeopleCounts(sb, tenantId),
  ]);
  // The mailboxes the chain's run writes from, by the run's own rule (contracts reachOutWritesFrom): its named ones, or
  // every one when it names none. One that does not send now (paused, held, signed out) is not its pace.
  const mailboxesOf = (ids: string[]) =>
    mailboxes.filter((m) => m.state === "connected" && reachOutWritesFrom(m, ids)).map(mailboxFactsOf);
  const waitingOf = new Map<string, string>();
  for (const w of waiting) {
    const root = reachOutRootOf(w.audience);
    if (root) waitingOf.set(root, w.id);
  }

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
        hand: handOf(s.hand),
        state: s.state === "running" ? "running" : "paused",
      };
    });
    const search = root.lead_search_id ? searches.get(root.lead_search_id) : undefined;
    return {
      root_id: root.id,
      name: root.name,
      search: root.lead_search_id ? { id: root.lead_search_id, name: search?.name ?? "" } : null,
      fed_by: isLeadList(search) ? "list" : "search",
      people: people ? (people[root.id] ?? { waiting: 0, writing: 0, done: 0 }) : null,
      state: root.state === "running" ? "running" : "paused",
      include_unconfirmed: root.include_unconfirmed === true,
      gap_minutes: root.gap_minutes ?? 0,
      mailbox_ids: root.mailbox_ids ?? [],
      owner_sends: root.owner_sends === true,
      signed_by: root.signed_by,
      steps: stepDtos,
      mailboxes: mailboxesOf(root.mailbox_ids ?? []),
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
export const dtoOf = <T>(data: unknown): T => data as T;

/** The workspace's booking link, which {{booking link}} needs. */
async function bookingLinkOf(ctx: RouteContext, tenantId: string): Promise<string | null> {
  return parseTenantConfig(await storedConfigOf(ctx.supabase, tenantId))?.brain?.booking_link?.trim() || null;
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
 * service role's door, with the member's id and, for a new chain, the start's line in the ledger, in the door's own
 * write (00381); then, for a new chain, its first run asked for now through the run-now door every playbook uses
 * (R13), whose answer is said as it is (R14).
 */
export async function saveChain(
  ctx: RouteContext,
  member: Member,
  input: ReachOutChainInput,
  rootId: string | null,
  /** A draft's record (00459): an email still to write (no words yet) is kept as it is, and Start asks for it. */
  opts: { unwritten?: boolean } = {},
): Promise<ReachOutSavedDto> {
  const all = validateReachOutChain(input, { bookingLink: !!(await bookingLinkOf(ctx, member.tenantId)) });
  const blank = (i: number | null) => {
    const s = i === null ? null : input.steps[i];
    return !!s && !s.hand && !s.body.trim();
  };
  const issues = opts.unwritten ? all.filter((i) => !blank(i.step)) : all;
  if (issues.length > 0) {
    const said = issues.map((i) => ({ ...i, words: chainIssueWords(i) }));
    throw new AppError("validation", said[0].words, 422, { issues: said });
  }
  // An email carries no hand key at all: the door reads a step with one as a call or a note (00228).
  const steps = input.steps.map(({ hand, ...s }) => (hand ? { ...s, hand } : s));
  const { data: saved, error } = await saveReachOutChain(serviceDb(), {
    tenantId: member.tenantId,
    userId: ctx.userId,
    chain: { ...input, steps, root_id: rootId },
    // A new chain is started by this save: the decision rides with it. An edit records none, and its event is below.
    decision: rootId ? null : { payload: { name: input.name }, via: ctx.via ?? null, undoOf: ctx.undoOf ?? null },
  });
  if (error || !saved) throw reachOutRefusal(error ?? { message: "no chain" });
  if (saved.undo_dropped) log.error("decision_undo_of_unknown", { undo_of: ctx.undoOf, verb: "start_playbook" });
  if (rootId) {
    // A chain edited: a new one is start_playbook, below, and an edit left nothing on the ledger.
    await emitEvent(serviceDb(), member.tenantId, "playbook.changed", "playbook", saved.root_id, {
      name: input.name,
      by: ctx.userId,
      fields: ["steps"],
    });
    return { root_id: saved.root_id, step_ids: saved.step_ids, rechecked: saved.rechecked ?? 0, start: null };
  }
  const start = startOf(await runPlaybookNow(member.tenantId, saved.root_id, ctx.userId));
  return { root_id: saved.root_id, step_ids: saved.step_ids, rechecked: 0, start };
}

/**
 * One reach-out step's email written where it is read, on Templates (One message, every channel, step 5). The row's name
 * says which step (contracts reachOutStepOf), and its chain is saved whole with that step's words changed, through the
 * chain's own save (saveChain), so everything the sheet's save guarantees holds: every word checked by the one email
 * check, the member's right to approve judged again by the door, and new words sending what waits for the step back to
 * the check. A step with no email of its own (a call or a note), or none at all, is not found.
 */
export async function saveReachOutEmail(
  ctx: RouteContext,
  member: Member,
  email: { name: string; subject?: string | null; body: string },
): Promise<{ template: { id: string; channel: "email"; name: string; language: string }; rechecked: number }> {
  const stepId = reachOutStepOf(email.name);
  const chain = stepId
    ? (await chainsOf(ctx, member.tenantId)).find((c) => c.steps.some((s) => s.id === stepId))
    : null;
  const step = chain?.steps.find((s) => s.id === stepId);
  if (!chain || !step || !step.template_id) throw new AppError("not_found", REACH_OUT_REFUSALS.notFound, 404);
  const draft = reachOutDraftOf({ chain, searchName: chain.search?.name ?? "", signedBy: null });
  const steps = draft.steps.map((s) =>
    s.id === step.id ? { ...s, subject: step.n === 0 ? (email.subject ?? "") : null, body: email.body } : s,
  );
  // An edit never reads the search (the door keeps the chain's own): the root's id stands where a gone search has none.
  const saved = await saveChain(
    ctx,
    member,
    reachOutChainBodyOf({ ...draft, steps }, chain.search?.id ?? chain.root_id),
    chain.root_id,
  );
  return {
    template: { id: step.template_id, channel: "email", name: email.name, language: REACH_OUT_LANGUAGE },
    rechecked: saved.rechecked,
  };
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
  send: { id: string; tenant_id: string; broadcast_id: string },
  decision: ReachOutDecision,
): Promise<{ send_id: string; decision: ReachOutDecision }> {
  const { error } = await ctx.supabase.rpc("reach_out_send_decide", { p_send_id: send.id, p_decision: decision });
  if (error) throw reachOutRefusal(error);
  // What a member decided of an email the check held, on the run it belongs to: an email went out, or did not, on
  // their word, and the ledger said neither.
  await emitEvent(serviceDb(), send.tenant_id, "reach_out.send_decided", "broadcast", send.broadcast_id, {
    decision,
    by: ctx.userId,
  });
  return { send_id: send.id, decision };
}

/**
 * The owner's word on an email handed to them (00429): it went (Sent), or it did not (Skip). The door
 * (reach_out_send_said, checked again in SQL) records Sent whatever changed since the draft was handed, since the email
 * left their own inbox: the email, the send and the lead in one transaction, with what about its lead would refuse it
 * now (since), said beside it. Said once; a second word answers how it stands.
 */
export async function saySend(
  ctx: RouteContext,
  send: { id: string; tenant_id: string; broadcast_id: string },
  outcome: ReachOutSaidOutcome,
): Promise<ReachOutSaidDto> {
  const r = await sendSaid(ctx.supabase, { sendId: send.id, outcome, reason: null });
  if (r.error) throw reachOutRefusal(r.error);
  // A draft left out on its owner's word is a decision about an email of the run, as a held one's Skip is.
  if (r.data.said && outcome === "not_sent")
    await emitEvent(serviceDb(), send.tenant_id, "reach_out.send_decided", "broadcast", send.broadcast_id, {
      decision: "skip",
      by: ctx.userId,
    });
  return {
    send_id: send.id,
    said: r.data.said,
    state: r.data.state,
    reason: r.data.reason ?? null,
    since: r.data.since ?? null,
    on_thread: !!r.data.conversation_id,
  };
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
  // A company's addressee fills the person slots (00430), as the send fills them.
  const leadSlots = {
    business_name: lead.lead?.business_name ?? null,
    city: lead.lead?.city ?? null,
    kind: lead.lead?.kind ?? null,
    facts: lead.lead?.facts ?? null,
    source: lead.lead?.source ?? null,
  };
  // The one fill the sender and every preview take (contracts reachOutEmailOf): a first email's subject and its body, or
  // a later step's body alone.
  const email = reachOutEmailOf(
    { subject: p.first ? (words.subject ?? "") : null, body: words.body },
    leadSlots,
    slots,
    lead.opening,
  );
  if (!email.ok) return null;
  return {
    business_name: lead.lead?.business_name ?? "",
    subject: email.subject,
    body: email.body,
    opening: lead.opening,
    angle: lead.angle,
  };
}

/** A mailbox as the sheet and the approval say its day (contracts mailboxDailyCap): never its token's name. */
const mailboxFactsOf = (m: {
  address: string;
  sent_days: number | null;
  daily_cap: number;
  customer_domain: boolean;
}): ReachOutMailboxFacts => ({
  address: m.address,
  sent_days: m.sent_days ?? 0,
  daily_cap: m.daily_cap,
  customer_domain: m.customer_domain,
});

/** The mailboxes a run's sends go from, with what each one's day is made of (R22). */
async function runMailboxesOf(
  ctx: RouteContext,
  tenantId: string,
  rows: SendRow[],
): Promise<ReachOutRunDto["mailboxes"]> {
  const ids = new Set(rows.map((s) => s.mailbox_id).filter((x): x is string => !!x));
  if (ids.size === 0) return [];
  return (await mailboxConnectionsOf(ctx.supabase, tenantId)).filter((m) => ids.has(m.id)).map(mailboxFactsOf);
}

/** A run's sends counted as its approval sheet says them (R21): checked and due today, later, still being checked. */
function approvalCountsOf(rows: SendRow[], tz: string) {
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
 * what the check held, the first checked business's email as it reads, and the mailboxes its sends go from. A run holds
 * at most a step's cap (200) sends, well under a read's thousand rows.
 */
export async function reachOutRunOf(
  ctx: RouteContext,
  tenantId: string,
  run: { id: string; audience: unknown; playbook_id: string | null; run_for: string | null },
): Promise<ReachOutRunDto | null> {
  if (!isReachOutRun(run.audience)) return null;
  const rootId = reachOutRootOf(run.audience) ?? "";
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
  const step = stepN === null ? null : steps[stepN];
  const c = approvalCountsOf(rows, facts.timezone);
  const [first, mailboxes, refused] = await Promise.all([
    firstEmailOf(ctx, tenantId, { lead: c.checked[0], step, first: stepN === 0, signedBy: root.signed_by }),
    runMailboxesOf(ctx, tenantId, rows),
    draftsRefusedOf(tenantId, run.id, rows),
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
        ? [
            {
              send_id: s.id,
              lead_id: s.lead_id,
              business_name: s.lead?.business_name ?? "",
              send_at: s.send_at,
              checked: !!s.checked_at,
            },
          ]
        : [],
    ),
    skipped: c.skipped,
    first,
    mailboxes,
    owner_sends: root.owner_sends === true,
    // Handed to its owner and not yet said to have gone (00429), oldest first: the run's To send list, never one the
    // send door would refuse now (draftRefusalOf), which the clock skips on its next tick.
    drafted: rows
      .filter((s) => s.state === "drafted" && !refused.has(s.id))
      .sort((a, b) => (a.drafted_at ?? "").localeCompare(b.drafted_at ?? ""))
      .flatMap((s) => {
        const d = draftOf(s.draft);
        return d
          ? [
              {
                send_id: s.id,
                lead_id: s.lead_id,
                business_name: s.lead?.business_name ?? "",
                angle: s.angle,
                to: d.to,
                subject: d.subject,
                text: d.text,
                drafted_at: s.drafted_at ?? s.created_at,
                follow_up: d.follow_up,
              },
            ]
          : [];
      }),
  };
}

/**
 * The run's drafts the send door would refuse now (00429 reach_out_drafts_waiting, contracts draftRefusalOf): its lead
 * said no, closed, was stopped, went on the never-again list or became a customer since the draft was handed. Read on the
 * service role (the route checked the member), only for a run with drafts.
 */
async function draftsRefusedOf(tenantId: string, runId: string, rows: readonly SendRow[]): Promise<Set<string>> {
  if (!rows.some((s) => s.state === "drafted")) return new Set();
  const waiting = await draftsWaiting(serviceDb(), { limit: 500, tenantId, runId });
  return new Set(waiting.filter((d) => draftRefusalOf(d.facts) !== null).map((d) => d.id));
}

/** A draft as it was handed over (00429 reach_out_sends.draft): its address, subject and words, or null when not whole. */
function draftOf(v: unknown): { to: string; subject: string; text: string; follow_up: boolean } | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const d = v as Record<string, unknown>;
  // A step after the first names the email it answers (parent_id): a follow-up.
  return typeof d.to === "string" && typeof d.subject === "string" && typeof d.text === "string"
    ? { to: d.to, subject: d.subject, text: d.text, follow_up: typeof d.parent_id === "string" }
    : null;
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

type ReachOutPreviewOutcome = { ok: true; preview: unknown } | { ok: false; reason: EdgeReason };

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
  const r = await callEdge(
    "/api/admin/reach-out-preview",
    { ...body, tenant_id: tenantId, user_id: userId },
    { workspace: tenantId, user: userId, timeoutMs: PREVIEW_TIMEOUT_MS },
  );
  if (r.status === 503 && r.body?.error === "edge_unreachable") return { ok: false, reason: "edge_unreachable" };
  const j = (r.body ?? {}) as { ok?: boolean; preview?: unknown };
  return edgeAnswered(r) && j.ok && j.preview
    ? { ok: true, preview: j.preview }
    : { ok: false, reason: edgeReasonOf(r) };
}
