/** Sender: sender. */

import {
  claimDrafts,
  claimSends,
  listDueMailboxes,
  findLeadSlots,
  findLeadStepWords,
  getMailboxCapacity,
  readMonthSent,
  findParentEmail,
  sendStanding,
  listStuckClaims,
  findWrittenEmail,
  type DueMailbox,
  type ReachOutSendRow,
} from "@chanlytics/db/campaigns";
import { findMailboxConnection } from "@chanlytics/db/email";
import { sendMessageId } from "@chanlytics/core";
import { MIN_MS, REACH_OUT_MONTH_EMAILS, mailboxDailyCap, mailboxSendsNow, slotCount } from "@chanlytics/contracts";
import { checkedWordsOf } from "@chanlytics/channels/email";
import { replanSends, type Replan } from "../replan.js";
import type { LogEvent, Logger } from "../../../shared/log.js";
import {
  CLAIM_PER_MAILBOX_PER_TICK,
  CLAIM_YIELD_AT_MS,
  DRAFTS_PER_TICK,
  DUE_MAILBOXES_PAGE,
  DUE_PAGES,
  HOLD_MS,
  REWRITE_AFTER_MS,
  REWRITE_PAGE,
  adopt,
  claimedTurns,
  handOver,
  previewForWords,
  sendFromMailbox,
  tickReads,
  type Db,
  type Lane,
  type Made,
  type Outcome,
  type SenderCounts,
  type Tick,
} from "./lanes.js";
import type { TenantId } from "@chanlytics/contracts";

/** One claimed send, written: its email and its job, then its move. Only from `claimed`, as it was read. */
async function writeOne(tick: Tick, reachOutSend: ReachOutSendRow): Promise<Outcome> {
  const { db } = tick;
  const turns = claimedTurns(tick, reachOutSend);
  const { skip, recheck, hold } = turns;

  // 0. Written before, by a tick that died after it: that email is this send's.
  const messageId = await sendMessageId(reachOutSend.id, reachOutSend.attempts ?? 0);
  const was = await findWrittenEmail(db, { tenantId: reachOutSend.tenant_id, id: messageId });
  if (was) return adopt(tick, reachOutSend, messageId, was);

  // 1. The run and its chain now: the claim read them, and a writer is seconds behind it.
  if (!reachOutSend.step_id) return skip("step_removed");
  const standing = await sendStanding(db, reachOutSend);
  if (!standing.run || standing.run === "canceled" || standing.run === "failed") return skip("run_canceled");
  if (!standing.step) return skip("step_removed");
  // Paused since the claim: it keeps its time, and is planned again when its chain goes ahead (the clock's restale).
  if (
    !["scheduled", "sending"].includes(standing.run) ||
    standing.step.state !== "running" ||
    standing.root !== "running"
  )
    return turns.wait();

  // 2. What the email is made of, judged before anyone is made.
  const [lead, workspace, stepWords, ownWords, mailbox] = await Promise.all([
    findLeadSlots(db, reachOutSend.tenant_id, reachOutSend.lead_id),
    tick.reads.workspace(reachOutSend.tenant_id),
    tick.reads.words(reachOutSend.tenant_id, standing.step.template_id),
    // Typed for this lead on their sheet (decision 0096): the email they get, in place of the step's words. A read that
    // fails throws, and the send stays claimed: it never goes with the step's words because this did not land.
    findLeadStepWords(db, {
      tenantId: reachOutSend.tenant_id,
      stepId: reachOutSend.step_id,
      leadId: reachOutSend.lead_id,
    }),
    reachOutSend.mailbox_id
      ? tick.reads.mailbox(reachOutSend.tenant_id, reachOutSend.mailbox_id)
      : Promise.resolve(null),
  ]);
  if (!lead) return skip("lead_gone");
  if (workspace.missing) return hold(workspace.missing);
  const words = ownWords ?? stepWords;
  if (!words) return hold("no_template");
  // Checked against other words than these (its step's, the name it signs with, whether a booking link exists): the
  // check reads it again before it goes (R5). Never a skip: nothing about the lead changed.
  if (reachOutSend.checked_words !== checkedWordsOf(words, standing.signedBy, workspace.bookingLink !== null))
    return recheck();

  // 3. A step after the first answers the lead's email on the step before (D19).
  const after = standing.step.after_step_id;
  const parent = after
    ? await findParentEmail(db, {
        tenantId: reachOutSend.tenant_id,
        rootId: reachOutSend.sequence_id,
        leadId: reachOutSend.lead_id,
        stepId: after,
      })
    : null;
  if (after && !parent) return skip("no_parent");
  // Their preview, read only for words that name it (decision 0079).
  const preview =
    slotCount(`${words.subject ?? ""}\n${words.body}`, "their preview") > 0
      ? await previewForWords(tick, reachOutSend)
      : null;
  const created: Made = {
    afterStep: after,
    lead,
    words,
    // A company's addressee fills the person slots, and the foot says where it was found (00430).
    slots: {
      business_name: lead.business_name,
      city: lead.city,
      kind: lead.kind,
      facts: lead.facts,
      source: lead.source,
      preview: preview?.slot ?? null,
    },
    workspace: {
      businessName: workspace.businessName,
      yourName: standing.signedBy,
      bookingLink: workspace.bookingLink,
      address: workspace.address,
    },
    parent,
    signsWith: standing.signsWith,
    own: workspace.signature,
    previewId: preview?.id ?? null,
  };
  if (standing.ownerSends || parent?.ownerSent) return handOver(tick, reachOutSend, turns, created);
  return sendFromMailbox(tick, reachOutSend, turns, created, { mailbox, messageId });
}

/** What a tick is asked. */
interface ClaimParams {
  db: Db;
  now: Date;
  started: number;
  /** The mailbox lane, or null without its seal: then only drafts are claimed and written. */
  lane: Lane | null;
  log: Logger;
  /** One workspace to keep to; every workspace when absent, as the clock runs. A test proves it on its own. */
  tenantId?: TenantId;
}

/** What a tick's lanes share: what it was asked, its reads, its counts, its window, and how one send is written. */
interface Run {
  params: ClaimParams;
  tick: Tick;
  out: SenderCounts;
  /** Whether the tick's window has closed (CLAIM_YIELD_AT_MS): nothing more is started. */
  late: () => boolean;
  failed: (event: LogEvent, fields: Record<string, unknown>, e: unknown) => void;
  write: (s: ReachOutSendRow, again: boolean) => Promise<void>;
}

/**
 * Which lane a tick writes first: the drafts on an even minute, the mailboxes' emails on an odd one. Both are written one
 * at a time inside the tick's one window (CLAIM_YIELD_AT_MS), so whichever goes second has what the first left of it. The
 * drafts always went first, and a morning's drafts are a day's share of every reach-out its owner sends, all due at once:
 * for as long as they lasted, the mailboxes' emails, each planned for a moment in its lead's own day, had the end of every
 * window, or none of it. Turn about, each lane has a whole window every other minute, whatever the other holds (the
 * review of 11 November 2026; docs/capacity.md, the two reach_out rows). The clock ticks once a minute, so the minute's
 * own number is the turn: no row keeps it.
 */
const draftsGoFirst = (now: Date): boolean => Math.floor(now.getTime() / MIN_MS) % 2 === 0;

/**
 * The drafts due of reach-outs their owners send (00429), a page a tick: no mailbox's day and no seal, since their
 * owner's own client sends them.
 */
async function writeDraftsDue({ params, out, late, failed, write }: Run): Promise<void> {
  try {
    if (late()) return;
    for (const s of await claimDrafts(params.db, {
      at: params.now,
      limit: DRAFTS_PER_TICK,
      tenantId: params.tenantId ?? null,
    })) {
      out.claimed += 1;
      if (late()) break; // claimed and left: written again in five minutes, as any claim a tick leaves
      await write(s, false);
    }
  } catch (e) {
    failed("reach_out_claim_failed", { drafts: true }, e);
  }
}

/** What a tick holds of the workspaces its mailboxes belong to: each one's month left, and those that claim nothing more. */
interface WorkspacesHeld {
  allowance: Map<string, number>;
  skipTenants: Set<string>;
}

/**
 * One due mailbox's claim, written. Nothing for a workspace that cannot write an email's foot or whose month is spent
 * (each counted once, and passed over for the rest of the tick), and nothing for a mailbox resting or not connected.
 */
async function writeMailboxDue({ params, tick, out, write }: Run, row: DueMailbox, held: WorkspacesHeld) {
  // A workspace that cannot write an email's foot claims nothing: its sends keep.
  const workspace = await tick.reads.workspace(row.tenant_id);
  if (workspace.missing) {
    held.skipTenants.add(row.tenant_id);
    out.workspaces_held += 1;
    params.log.warn("reach_out_workspace_held", { tenant_id: row.tenant_id, reason: workspace.missing });
    return;
  }
  if (!held.allowance.has(row.tenant_id))
    held.allowance.set(
      row.tenant_id,
      REACH_OUT_MONTH_EMAILS - (await readMonthSent(params.db, row.tenant_id, params.now)),
    );
  const left = held.allowance.get(row.tenant_id) ?? 0;
  if (left <= 0) {
    held.skipTenants.add(row.tenant_id);
    out.month_spent += 1;
    params.log.info("reach_out_month_spent", { tenant_id: row.tenant_id, allowance: REACH_OUT_MONTH_EMAILS });
    return;
  }
  // Read for the claim and not kept: its writer reads the row as it stands after the claim, so a mailbox paused
  // or signed out in between holds its sends rather than writing from it.
  const [capacity, mailbox] = await Promise.all([
    getMailboxCapacity(params.db, row.id, params.now),
    findMailboxConnection(params.db, row.tenant_id, row.id),
  ]);
  if (!mailbox || !mailboxSendsNow(capacity, params.now.getTime())) return;
  // The day's share the door judges by (mailbox_capacity's own days, deliver.ts): a claim past the door's share
  // would only be sent back, and cost each send one of its tries.
  const claimed = await claimSends(params.db, {
    mailboxId: row.id,
    cap: mailboxDailyCap(capacity),
    at: params.now,
    limit: Math.min(CLAIM_PER_MAILBOX_PER_TICK, left),
  });
  out.claimed += claimed.length;
  held.allowance.set(row.tenant_id, left - claimed.length);
  for (const s of claimed) await write(s, false);
}

/**
 * The mailboxes' own emails: the claim, a page of mailboxes at a time, past the workspaces held this tick and the
 * mailboxes already done; none without the lane's seal.
 */
async function writeMailboxesDue(run: Run): Promise<void> {
  const { params, late, failed } = run;
  const held: WorkspacesHeld = { allowance: new Map(), skipTenants: new Set() };
  const done = new Set<string>();
  for (let page = 0; page < DUE_PAGES && params.lane && !late(); page += 1) {
    const due = await listDueMailboxes(params.db, params.now, DUE_MAILBOXES_PAGE, {
      tenantId: params.tenantId,
      skipTenants: held.skipTenants,
      skipMailboxes: done,
    });
    for (const row of due) {
      if (late()) break;
      done.add(row.id);
      if (held.skipTenants.has(row.tenant_id)) continue;
      try {
        await writeMailboxDue(run, row, held);
      } catch (e) {
        failed("reach_out_claim_failed", { mailbox_id: row.id, tenant_id: row.tenant_id }, e);
      }
    }
    if (due.length < DUE_MAILBOXES_PAGE) break;
  }
}

export async function claimAndWrite(params: ClaimParams): Promise<SenderCounts> {
  const out: SenderCounts = {
    claimed: 0,
    written: 0,
    drafted: 0,
    rewritten: 0,
    skipped: 0,
    waited: 0,
    held: 0,
    rechecked: 0,
    gave_up: 0,
    errors: 0,
    month_spent: 0,
    workspaces_held: 0,
  };
  const tick: Tick = {
    db: params.db,
    now: params.now,
    lane: params.lane,
    log: params.log,
    reads: tickReads(params.db),
    replan: [],
    later: [],
    said: new Set(),
  };
  const late = () => Date.now() - params.started > CLAIM_YIELD_AT_MS;
  const failed = (event: LogEvent, fields: Record<string, unknown>, e: unknown) => {
    out.errors += 1;
    params.log.error(event, { ...fields, error: e instanceof Error ? e.message : String(e) });
  };
  const write = async (s: ReachOutSendRow, again: boolean) => {
    try {
      const r = await writeOne(tick, s);
      if (r === "written" || r === "adopted") out[again ? "rewritten" : "written"] += 1;
      else if (r === "drafted" || r === "skipped" || r === "waited" || r === "held" || r === "rechecked") out[r] += 1;
    } catch (e) {
      // This send stays claimed: written again in five minutes, or planned again by the clock's unstick after ten.
      failed("reach_out_write_failed", { send_id: s.id, tenant_id: s.tenant_id }, e);
    }
  };

  // A claim a tick left mid-way, written again under the same id: the same email, or its first.
  try {
    for (const s of await listStuckClaims(
      params.db,
      new Date(params.now.getTime() - REWRITE_AFTER_MS),
      REWRITE_PAGE,
      params.tenantId,
    )) {
      if (late()) break;
      await write(s, true);
    }
  } catch (e) {
    failed("reach_out_rewrite_failed", {}, e);
  }

  // The two lanes, the one whose turn it is first (draftsGoFirst): each is written one at a time inside this tick's window.
  const run: Run = { params, tick, out, late, failed, write };
  const lanes = draftsGoFirst(params.now) ? [writeDraftsDue, writeMailboxesDue] : [writeMailboxesDue, writeDraftsDue];
  for (const lane of lanes) await lane(run);

  // Planned again: from now on another mailbox, and an hour on in their leads' hours.
  const replans: Array<[Replan[], Date]> = [
    [tick.replan, params.now],
    [tick.later, new Date(params.now.getTime() + HOLD_MS)],
  ];
  for (const [items, from] of replans) {
    if (items.length === 0) continue;
    try {
      const { gave_up } = await replanSends(params.db, items, from, params.log);
      out.gave_up += gave_up;
    } catch (e) {
      // Left claimed: written again in five minutes, or planned again by the clock's unstick.
      failed("reach_out_replan_failed", { sends: items.length }, e);
    }
  }
  return out;
}
