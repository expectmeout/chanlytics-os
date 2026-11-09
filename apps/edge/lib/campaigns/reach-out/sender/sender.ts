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
  type ReachOutSendRow,
} from "@chanlytics/db/campaigns";
import { findMailboxConnection } from "@chanlytics/db/email";
import { sendMessageId } from "@chanlytics/core";
import { REACH_OUT_MONTH_EMAILS, mailboxDailyCap, mailboxSendsNow, slotCount } from "@chanlytics/contracts";
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

export async function claimAndWrite(params: {
  db: Db;
  now: Date;
  started: number;
  /** The mailbox lane, or null without its seal: then only drafts are claimed and written. */
  lane: Lane | null;
  log: Logger;
  /** One workspace to keep to; every workspace when absent, as the clock runs. A test proves it on its own. */
  tenantId?: TenantId;
}): Promise<SenderCounts> {
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

  // The drafts due of reach-outs their owners send (00429), a page a tick: no mailbox's day and no seal, since their
  // owner's own client sends them.
  try {
    if (!late())
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

  // The claim, a page of mailboxes at a time, past the workspaces held this tick and the mailboxes already done; none
  // without the lane's seal.
  const allowance = new Map<string, number>();
  const skipTenants = new Set<string>();
  const done = new Set<string>();
  for (let page = 0; page < DUE_PAGES && params.lane && !late(); page += 1) {
    const due = await listDueMailboxes(params.db, params.now, DUE_MAILBOXES_PAGE, {
      tenantId: params.tenantId,
      skipTenants,
      skipMailboxes: done,
    });
    for (const row of due) {
      if (late()) break;
      done.add(row.id);
      if (skipTenants.has(row.tenant_id)) continue;
      try {
        // A workspace that cannot write an email's foot claims nothing: its sends keep.
        const workspace = await tick.reads.workspace(row.tenant_id);
        if (workspace.missing) {
          skipTenants.add(row.tenant_id);
          out.workspaces_held += 1;
          params.log.warn("reach_out_workspace_held", { tenant_id: row.tenant_id, reason: workspace.missing });
          continue;
        }
        if (!allowance.has(row.tenant_id))
          allowance.set(
            row.tenant_id,
            REACH_OUT_MONTH_EMAILS - (await readMonthSent(params.db, row.tenant_id, params.now)),
          );
        const left = allowance.get(row.tenant_id) ?? 0;
        if (left <= 0) {
          skipTenants.add(row.tenant_id);
          out.month_spent += 1;
          params.log.info("reach_out_month_spent", { tenant_id: row.tenant_id, allowance: REACH_OUT_MONTH_EMAILS });
          continue;
        }
        // Read for the claim and not kept: its writer reads the row as it stands after the claim, so a mailbox paused
        // or signed out in between holds its sends rather than writing from it.
        const [c, mailbox] = await Promise.all([
          getMailboxCapacity(params.db, row.id, params.now),
          findMailboxConnection(params.db, row.tenant_id, row.id),
        ]);
        if (!mailbox || !mailboxSendsNow(c, params.now.getTime())) continue;
        // The day's share the door judges by (mailbox_capacity's own days, deliver.ts): a claim past the door's share
        // would only be sent back, and cost each send one of its tries.
        const claimed = await claimSends(params.db, {
          mailboxId: row.id,
          cap: mailboxDailyCap(c),
          at: params.now,
          limit: Math.min(CLAIM_PER_MAILBOX_PER_TICK, left),
        });
        out.claimed += claimed.length;
        allowance.set(row.tenant_id, left - claimed.length);
        for (const s of claimed) await write(s, false);
      } catch (e) {
        failed("reach_out_claim_failed", { mailbox_id: row.id, tenant_id: row.tenant_id }, e);
      }
    }
    if (due.length < DUE_MAILBOXES_PAGE) break;
  }

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
