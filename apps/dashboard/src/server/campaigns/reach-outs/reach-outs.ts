/** Reach outs: reach outs. */

import "server-only";
import {
  AppError,
  REACH_OUT_LANGUAGE,
  REACH_OUT_REFUSALS,
  isReachOutHold,
  draftRefusalOf,
  handOf,
  isLeadList,
  isReachOutRun,
  linkCount,
  localDate,
  mailboxSendsNow,
  reachOutChainBodyOf,
  reachOutDraftOf,
  reachOutRootOf,
  reachOutStepOf,
  reachOutWritesFrom,
  wordsNeedOpening,
  type ReachOutChainDto,
  type ReachOutMailboxChoice,
  type ReachOutMailboxFacts,
  type ReachOutRunDto,
  type ReachOutStepDto,
  recordOrEmpty,
} from "@chanlytics/contracts";
import {
  listDraftsWaiting,
  findEmailWordsByTemplate,
  leadStepKey,
  getLeadWordsOfLeads,
  getOwnWordsAtSteps,
  listReachOutRunSends,
  listReachOutSteps,
  listRunsWaiting,
  findSearchesByIds,
  findReachOutPeopleCounts,
  getSequenceModes,
  mayWorkspaceSpend,
} from "@chanlytics/db/campaigns";
import { listMailboxConnectionsOf, type MailboxConnectionRow } from "@chanlytics/db/email";
import { mailboxSignatureOf } from "@chanlytics/channels/email";
import type { RouteContext } from "@/server/shared/with-route";
import type { Member } from "@/server/shared/route";
import { serviceDb } from "@/server/shared/service-db";
import { deployment } from "@/server/shared/env";
import { callEdge, edgeAnswered, edgeReasonOf, type EdgeReason, type EdgeBody } from "@/server/shared/edge";
import { getTenantFacts } from "@/server/shared/tenant";
import { PREVIEW_TIMEOUT_MS, chainOf, firstEmailOf, saveChain, type SendRow } from "./chain-acts";

/**
 * The chains of a workspace, without their reports (R23: a report is read when its row is opened), each with what feeds
 * it and who is in it now (00426: the ledger's People cell, counted by the drawer's one rule).
 */
export async function listChains(ctx: RouteContext, tenantId: string): Promise<ReachOutChainDto[]> {
  const sb = ctx.supabase;
  const steps = await listReachOutSteps(sb, tenantId);
  const roots = steps
    .filter((s) => s.trigger === "lead_first")
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  if (roots.length === 0) return [];
  const templateIds = steps.map((s) => s.template_id).filter((x): x is string => !!x);
  const searchIds = roots.map((r) => r.lead_search_id).filter((x): x is string => !!x);
  const [words, searches, waiting, mailboxes, modes, spend, people, ownWords] = await Promise.all([
    findEmailWordsByTemplate(sb, tenantId, templateIds),
    findSearchesByIds(sb, tenantId, searchIds),
    listRunsWaiting(sb, tenantId),
    listMailboxConnectionsOf(sb, tenantId),
    // The step's run's own readings (packages/db): each chain's sequence's mode (decision 0064, a root's id is its
    // sequence's), and whether the workspace may spend.
    getSequenceModes(
      sb,
      tenantId,
      roots.map((r) => r.id),
    ),
    mayWorkspaceSpend(sb, tenantId),
    // Who is in each now: a count that fails is a dash on the ledger, never the chains' failure.
    findReachOutPeopleCounts(sb, tenantId),
    // Who keeps words of their own at each step (decision 0096): what a change for everyone leaves out, said beside it.
    getOwnWordsAtSteps(
      sb,
      tenantId,
      steps.map((s) => s.id),
    ).catch(() => new Map<string, number>()),
  ]);
  const nowMs = Date.now();
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
    const stepDtos: ReachOutStepDto[] = chain.map((text, count) => {
      const item = text.template_id ? words.get(text.template_id) : null;
      return {
        id: text.id,
        n: count,
        after_days: count === 0 ? null : text.after_days,
        subject: count === 0 ? (item?.subject ?? null) : null,
        body: item?.body ?? "",
        template_id: text.template_id,
        hand: handOf(text.hand),
        state: text.state === "running" ? "running" : "paused",
        own_words: ownWords.get(text.id) ?? 0,
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
      signs_with: root.signs_with === "mailbox" ? "mailbox" : "name",
      steps: stepDtos,
      mailboxes: mailboxesOf(root.mailbox_ids ?? []),
      // Every mailbox of the workspace, as How it runs offers them to this sequence (0077).
      mailbox_choices: mailboxes.map((m) => mailboxChoiceOf(m, root.mailbox_ids ?? [], nowMs)),
      next: {
        run_hour: root.run_hour,
        last_run_for: root.last_run_for,
        // Cold email never sends on its own: a mode it cannot take reads as ask, as its run reads it.
        mode: modes.get(root.id) === "veto" ? "veto" : "ask",
        may_spend: spend,
        waiting_run_id: waitingOf.get(root.id) ?? null,
      },
      created_at: root.created_at,
    };
  });
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
    ? (await listChains(ctx, member.tenantId)).find((c) => c.steps.some((s) => s.id === stepId))
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

/** A mailbox as the sheet and the approval say its day (contracts mailboxDailyCap): never its token's name. */
const mailboxFactsOf = (message: {
  address: string;
  sent_days: number | null;
  daily_cap: number;
  customer_domain: boolean;
}): ReachOutMailboxFacts => ({
  address: message.address,
  sent_days: message.sent_days ?? 0,
  daily_cap: message.daily_cap,
  customer_domain: message.customer_domain,
});

/**
 * A mailbox as How it runs offers it to a sequence (0077): whether the sequence writes from it (contracts
 * reachOutWritesFrom: none named is every one), whether it sends now, what DNS said of its domain, its day, and what it
 * signs with as words (channels mailboxSignatureOf, the send's own reading), with whether they carry a link.
 */
function mailboxChoiceOf(mailboxConnection: MailboxConnectionRow, ids: string[], nowMs: number): ReachOutMailboxChoice {
  const words = mailboxSignatureOf(mailboxConnection)?.text ?? null;
  const read = recordOrEmpty(mailboxConnection.dns);
  const dns: ReachOutMailboxChoice["dns"] = {};
  for (const k of ["spf", "dkim", "dmarc"] as const) if (read[k] === "found" || read[k] === "missing") dns[k] = read[k];
  return {
    id: mailboxConnection.id,
    address: mailboxConnection.address,
    state: mailboxConnection.state,
    sends_now: mailboxSendsNow(mailboxConnection, nowMs),
    picked: reachOutWritesFrom(mailboxConnection, ids),
    dns,
    facts: mailboxFactsOf(mailboxConnection),
    signature: words ? { words, has_link: linkCount(words) > 0 } : null,
    connected_at: mailboxConnection.connected_at,
  };
}

/** The mailboxes a run's sends go from: what each one's day is made of (R22), and what each signs with. */
async function runMailboxRowsOf(ctx: RouteContext, tenantId: string, rows: SendRow[]): Promise<MailboxConnectionRow[]> {
  const ids = new Set(rows.map((s) => s.mailbox_id).filter((x): x is string => !!x));
  if (ids.size === 0) return [];
  return (await listMailboxConnectionsOf(ctx.supabase, tenantId)).filter((m) => ids.has(m.id));
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
export async function findReachOutRun(
  ctx: RouteContext,
  tenantId: string,
  run: { id: string; audience: unknown; playbook_id: string | null; run_for: string | null },
): Promise<ReachOutRunDto | null> {
  if (!isReachOutRun(run.audience)) return null;
  const rootId = reachOutRootOf(run.audience) ?? "";
  const [rows, all, facts] = await Promise.all([
    listReachOutRunSends(ctx.supabase, tenantId, run.id),
    listReachOutSteps(ctx.supabase, tenantId),
    getTenantFacts(ctx.supabase, tenantId),
  ]);
  const root = all.find((s) => s.id === rootId);
  if (!root) return null;
  const steps = chainOf(root, all);
  // A run whose step was dropped from the chain since (R17) has no place in it: said so, never as another step.
  const at = steps.findIndex((s) => s.id === run.playbook_id);
  const stepN = at < 0 ? null : at;
  const step = stepN === null ? null : steps[stepN];
  const approvalCounts = approvalCountsOf(rows, facts.timezone);
  const boxes = await runMailboxRowsOf(ctx, tenantId, rows);
  // Who has words of their own at this step, holding no line (decision 0096): no opening is quoted of them, and the first
  // email the screen reads as is one of the step's words.
  const typed = await getLeadWordsOfLeads(
    ctx.supabase,
    rows.map((s) => s.lead_id),
  );
  const ownOf = (s: SendRow): boolean => {
    const words = step ? typed.get(leadStepKey(step.id, s.lead_id)) : null;
    return !!words && !wordsNeedOpening(words);
  };
  const [first, refused] = await Promise.all([
    firstEmailOf(ctx, tenantId, {
      lead: approvalCounts.checked.find((s) => !ownOf(s)),
      step: step ?? null,
      first: stepN === 0,
      signedBy: root.signed_by,
      signsWith: root.signs_with,
      mailboxes: boxes,
    }),
    draftsRefusedOf(tenantId, run.id, rows),
  ]);
  const mailboxes = boxes.map(mailboxFactsOf);
  return {
    root_id: root.id,
    chain_name: root.name,
    step_id: step?.id ?? null,
    step_n: stepN,
    gap_minutes: root.gap_minutes ?? 0,
    run_for: run.run_for,
    include_unconfirmed: root.include_unconfirmed === true,
    today: approvalCounts.today,
    later: approvalCounts.later,
    first_at: approvalCounts.checked[0]?.send_at ?? null,
    checking: approvalCounts.planned.length - approvalCounts.checked.length,
    held: rows
      .filter((s) => s.state === "held" && isReachOutHold(s.reason))
      .map((s) => ({ ...heldOf(s), ...(ownOf(s) ? { own: true } : {}) })),
    // A planned send always has its time (00183 reach_out_sends_planned_is_timed); one read without it is not listed
    // with a time it does not have.
    planned: approvalCounts.planned.flatMap((text) =>
      text.send_at
        ? [
            {
              send_id: text.id,
              lead_id: text.lead_id,
              business_name: text.lead?.business_name ?? "",
              send_at: text.send_at,
              checked: !!text.checked_at,
              opening: text.opening,
              ...(ownOf(text) ? { own: true } : {}),
            },
          ]
        : [],
    ),
    skipped: approvalCounts.skipped,
    first,
    mailboxes,
    owner_sends: root.owner_sends === true,
    // Handed to its owner and not yet said to have gone (00429), oldest first: the run's To send list, never one the
    // send door would refuse now (draftRefusalOf), which the clock skips on its next tick.
    drafted: rows
      .filter((s) => s.state === "drafted" && !refused.has(s.id))
      .sort((a, b) => (a.drafted_at ?? "").localeCompare(b.drafted_at ?? ""))
      .flatMap((row) => {
        const draft = draftOf(row.draft);
        return draft
          ? [
              {
                send_id: row.id,
                lead_id: row.lead_id,
                business_name: row.lead?.business_name ?? "",
                angle: row.angle,
                to: draft.to,
                subject: draft.subject,
                text: draft.text,
                drafted_at: row.drafted_at ?? row.created_at,
                follow_up: draft.follow_up,
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
  const waiting = await listDraftsWaiting(serviceDb(), { limit: 500, tenantId, runId });
  return new Set(waiting.filter((d) => draftRefusalOf(d.facts) !== null).map((d) => d.id));
}

/** A draft as it was handed over (00429 reach_out_sends.draft): its address, subject and words, or null when not whole. */
function draftOf(v: unknown): { to: string; subject: string; text: string; follow_up: boolean } | null {
  if (!v || typeof v !== "object" || Array.isArray(v)) return null;
  const d = recordOrEmpty(v);
  // A step after the first names the email it answers (parent_id): a follow-up.
  return typeof d.to === "string" && typeof d.subject === "string" && typeof d.text === "string"
    ? { to: d.to, subject: d.subject, text: d.text, follow_up: typeof d.parent_id === "string" }
    : null;
}

/** A held send as the approval sheet lists it. */
const heldOf = (send: SendRow): ReachOutRunDto["held"][number] => ({
  send_id: send.id,
  lead_id: send.lead_id,
  business_name: send.lead?.business_name ?? "",
  email: send.lead?.email ?? null,
  reason: send.reason as ReachOutRunDto["held"][number]["reason"],
  detail: send.hold_detail,
  opening: send.opening,
  angle: send.angle,
  planned_at: send.created_at,
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
  body: Omit<EdgeBody<"/api/admin/reach-out-preview">, "tenant_id" | "user_id">,
): Promise<ReachOutPreviewOutcome> {
  if (!deployment.providersLive) return { ok: false, reason: "preview" };
  const answer = await callEdge(
    "/api/admin/reach-out-preview",
    { ...body, tenant_id: tenantId, user_id: userId },
    { workspace: tenantId, user: userId, timeoutMs: PREVIEW_TIMEOUT_MS },
  );
  if (answer.status === 503 && answer.body?.error === "edge_unreachable")
    return { ok: false, reason: "edge_unreachable" };
  const result = answer.body ?? {};
  return edgeAnswered(answer) && result.ok && result.preview
    ? { ok: true, preview: result.preview }
    : { ok: false, reason: edgeReasonOf(answer) };
}
