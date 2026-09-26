/**
 * The reach-out clock's claim (Reach out, Part 3; C7, C8, C9, C10, E8): for each domain with a send due, the sends it
 * may take within its day's share and its workspace's month, claimed under the domain's lock (00184); then for each,
 * its email written before the send leaves `claimed` (rows first, C8):
 *
 *   0. an email this send already wrote (a tick that died after writing it) is adopted, whatever has changed since:
 *      it may be in somebody's inbox, so the send goes on as its email's, and the clock reads what became of it;
 *   1. the run and its chain as they stand now: a run closed since is skipped, a chain paused since waits;
 *   2. the words, the lead, the workspace and the domain, judged before anyone is made: a lead's own refusal (a slot
 *      it has no value for) skips it; the step's or the workspace's (no template, a slot no lead could fill, no
 *      address for the foot, no mailbox for the replies) holds the send, an hour on, in its lead's hours, and the
 *      lead keeps its place, so a fault the owner can fix never spends a run's audience;
 *   3. for a step after the first, the lead's email on the step before (D19), waited for while its receipt has not
 *      stamped its Message-ID;
 *   4. the person (made once, E5: reach_out_person), refused for a lead that closed or a customer's address;
 *   5. the frozen request (request.ts), the email row under its own id (core sendMessageId), and the outbound_send job
 *      that sends it through the one door (deliver.ts);
 *   6. the send `claimed → queued`, and its run `scheduled → sending`.
 *
 * The email row comes first: the domain's capacity counts a claim and a queued row each (00184), so this order only
 * ever counts one twice for a moment, which sends less, never more. A claim a tick left mid-way (it died after the
 * claim) is written again five minutes on: its email's id is the same, so it is the same email, never a second.
 * One domain's failure is its own: the rest of the page, and every other workspace, still claim.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  claimSends,
  contactEmailOf,
  domainCapacityOf,
  dueDomains,
  emailWordsOf,
  insertQueuedEmail,
  leadSlotsOf,
  mailboxOfTenant,
  monthSent,
  moveSend,
  parentEmailOf,
  reachOutPerson,
  runSending,
  sendJobScheduled,
  sendNow,
  sendStanding,
  sendingDomainOf,
  stuckClaims,
  withdrawEmail,
  workspaceNameAndConfig,
  writtenEmail,
  type Database,
  type Json,
  type ParentEmail,
  type ReachOutSendRow,
  type WrittenEmail,
} from "../packages/db.js";
import { sendMessageId } from "../packages/core.js";
import { scheduleJob } from "../packages/jobs.js";
import { REACH_OUT_MONTH_EMAILS, domainDailyCap, emailDomainOf, parseTenantConfig } from "../packages/contracts.js";
import { unsubscribeOrigin } from "../dashboard-origin.js";
import { coldReplyDomain } from "../email/email.js";
import { env } from "../env.js";
import { reachOutRequest, reachOutWords } from "./request.js";
import { REPLAN_GIVE_UP_MS, replanSends, type Replan } from "./replan.js";
import type { Logger } from "../log.js";

type Db = SupabaseClient<Database>;

/** The most one domain's claim takes in a tick: its gap spaces its sends minutes apart, so a tick finds one or two. */
export const CLAIM_PER_DOMAIN_PER_TICK = 5;
/** When the claim stops taking domains: its door has 60 s (vercel.json), and a domain's writes take a few seconds. */
export const CLAIM_YIELD_AT_MS = 40_000;
/** How many domains with sends due one page reads, and how many pages a tick reads past the ones it holds. */
export const DUE_DOMAINS_PAGE = 50;
const DUE_PAGES = 4;
/** A claim this old was left by a tick that died after it (a tick lives 60 s at most): it is written again. */
export const REWRITE_AFTER_MS = 5 * 60_000;
/** How far on a held send, or one waiting for the email before it to be stamped, is planned again (in its lead's hours). */
export const HOLD_MS = 3_600_000;
const REWRITE_PAGE = 100;

/**
 * Refusals that are the step's or the workspace's, never the lead's: the send waits and the lead keeps its place. A
 * missing address, a mailbox not yet made or a template with a slot no lead can fill would otherwise skip every lead
 * the run holds, for good, at five a domain a minute.
 */
const HOLDS = new Set([
  "no_mailbox",
  "no_business_address",
  "no_template",
  "no_subject",
  "unknown_slot",
  "words_unsendable",
]);

/**
 * What the cold lane needs to write an email: the seal for its unsubscribe, the origin its page answers on, and the
 * domain its replies come back on (D17: a cold-only domain before scale, when they are set).
 */
export interface Lane {
  unsubscribeSecret: string;
  unsubscribeOrigin: string;
  replyDomain: string;
}

/**
 * The cold lane as this deployment holds it (C13), or what it lacks by the variables' names: the cold account's key
 * and its webhook secret (a cold email whose bounces could not be read could never hold its domain), the unsubscribe's
 * seal, the mail domain the replies come back to, and the platform's own key the email wire is bound with.
 */
export function coldLane(): { ok: true; lane: Lane } | { ok: false; missing: string[] } {
  const mailDomain = emailDomainOf(env.EMAIL_DOMAIN);
  const secret = env.UNSUBSCRIBE_SECRET;
  const missing = [
    !env.RESEND_API_KEY && "RESEND_API_KEY",
    !env.RESEND_COLD_API_KEY && "RESEND_COLD_API_KEY",
    !env.RESEND_COLD_WEBHOOK_SECRET && "RESEND_COLD_WEBHOOK_SECRET",
    !secret && "UNSUBSCRIBE_SECRET",
    !mailDomain && "EMAIL_DOMAIN",
  ].filter((x): x is string => !!x);
  if (missing.length > 0 || !secret || !mailDomain) return { ok: false, missing };
  return {
    ok: true,
    lane: {
      unsubscribeSecret: secret,
      unsubscribeOrigin: unsubscribeOrigin(),
      replyDomain: coldReplyDomain() ?? mailDomain,
    },
  };
}

export interface SenderCounts {
  claimed: number;
  written: number;
  /** Claims a tick left mid-way: written now, or their email adopted. */
  rewritten: number;
  skipped: number;
  /** Planned again: a chain paused since, a domain gone, an email before not yet stamped. */
  waited: number;
  /** Planned again an hour on for the step's or the workspace's words (HOLDS). */
  held: number;
  /** Planned again past two weeks: given up, kept_waiting. */
  gave_up: number;
  errors: number;
  /** Workspaces whose month's allowance is spent: their sends wait for the next month. */
  month_spent: number;
  /** Workspaces that cannot write an email's foot or take its replies: nothing of theirs is claimed. */
  workspaces_held: number;
}

type Outcome = "written" | "adopted" | "skipped" | "waited" | "held" | "lost";

interface Workspace {
  businessName: string | null;
  address: string | null;
  mailbox: { reply_token: string } | null;
  /** Why no email of this workspace can be written now (a HOLDS reason), or null. */
  missing: string | null;
}
type Domain = NonNullable<Awaited<ReturnType<typeof sendingDomainOf>>>;

/** One tick's reads that hold for the whole tick, each made once: a workspace's facts, a template's words, a domain. */
function tickReads(db: Db) {
  const once = <T>(m: Map<string, Promise<T>>, key: string, read: () => Promise<T>): Promise<T> => {
    let p = m.get(key);
    if (!p) {
      p = read();
      // A read that failed is this send's error, and the next send asks again.
      p.catch(() => m.delete(key));
      m.set(key, p);
    }
    return p;
  };
  const workspaces = new Map<string, Promise<Workspace>>();
  const words = new Map<string, Promise<{ subject: string | null; body: string } | null>>();
  const domains = new Map<string, Promise<Domain | null>>();
  return {
    workspace: (tenantId: string) =>
      once(workspaces, tenantId, async () => {
        const [w, mailbox] = await Promise.all([workspaceNameAndConfig(db, tenantId), mailboxOfTenant(db, tenantId)]);
        // The address drafts put at their foot (the dashboard's workspaceOffer): the profile's, as the owner wrote it.
        const address = parseTenantConfig(w.config)?.brain?.profile?.address?.trim() || null;
        const businessName = w.name?.trim() || null;
        return {
          businessName,
          address,
          mailbox: mailbox ? { reply_token: mailbox.reply_token } : null,
          missing: !mailbox ? "no_mailbox" : !businessName || !address ? "no_business_address" : null,
        };
      }),
    words: (tenantId: string, templateId: string) =>
      once(words, templateId, () => emailWordsOf(db, tenantId, templateId)),
    domain: (tenantId: string, domainId: string) =>
      once(domains, domainId, () => sendingDomainOf(db, tenantId, domainId)),
  };
}

interface Tick {
  db: Db;
  now: Date;
  lane: Lane;
  log: Logger;
  reads: ReturnType<typeof tickReads>;
  /** Planned again from now, at the tick's end: their domain went away since their claim. */
  replan: Replan[];
  /** Planned again an hour on, in their lead's hours, at the tick's end: held, or waiting for the email before. */
  later: Replan[];
  /** The holds said this tick, once each per workspace and reason. */
  said: Set<string>;
}

/**
 * An email this send wrote before: the send goes on as its email's. Still queued in a run closed since, it is withdrawn
 * first, so its job sends nothing; still queued otherwise, its job is made sure of, once. One its job already took is
 * its job's: the clock reads what became of it (sent, and the lead written to; refused, and why).
 */
async function adopt(t: Tick, s: ReachOutSendRow, id: string, was: WrittenEmail): Promise<Outcome> {
  const { db } = t;
  if (was.status === "queued") {
    const { run } = await sendStanding(db, s);
    if (!run || run === "canceled" || run === "failed")
      await withdrawEmail(db, { tenantId: s.tenant_id, id, reason: "run_canceled" });
    else if (!(await sendJobScheduled(db, { tenantId: s.tenant_id, messageId: id }))) {
      if (!was.to) throw new Error(`the written email ${id} names no recipient`);
      await scheduleJob(db, {
        tenantId: s.tenant_id,
        kind: "outbound_send",
        dueAt: t.now,
        payload: {
          message_id: id,
          conversation_id: was.conversation_id,
          to_email: was.to,
          purpose: "outreach",
          proactive: true,
        },
      });
    }
  }
  const moved = await moveSend(db, {
    tenantId: s.tenant_id,
    id: s.id,
    from: "claimed",
    patch: { state: "queued", message_id: id, contact_id: was.contact_id ?? s.contact_id },
  });
  return moved ? "adopted" : "lost";
}

/** One claimed send, written: its email and its job, then its move. Only from `claimed`, as it was read. */
async function writeOne(t: Tick, s: ReachOutSendRow): Promise<Outcome> {
  const { db } = t;
  const move = async (patch: Partial<ReachOutSendRow>): Promise<boolean> =>
    moveSend(db, { tenantId: s.tenant_id, id: s.id, from: "claimed", patch });
  const skip = async (reason: string): Promise<Outcome> =>
    (await move({ state: "skipped", reason: reason.slice(0, 60) })) ? "skipped" : "lost";
  const hold = (reason: string): Outcome => {
    t.later.push({ send: s, wrote: false });
    const key = `${s.tenant_id}:${reason}`;
    if (!t.said.has(key)) {
      t.said.add(key);
      t.log.warn("reach_out_send_held", { tenant_id: s.tenant_id, playbook_id: s.playbook_id, reason });
    }
    return "held";
  };

  // 0. Written before, by a tick that died after it: that email is this send's.
  const messageId = await sendMessageId(s.id, s.attempts ?? 0);
  const was = await writtenEmail(db, { tenantId: s.tenant_id, id: messageId });
  if (was) return adopt(t, s, messageId, was);

  // 1. The run and its chain now: the claim read them, and a writer is seconds behind it.
  if (!s.playbook_id) return skip("step_removed");
  const standing = await sendStanding(db, s);
  if (!standing.run || standing.run === "canceled" || standing.run === "failed") return skip("run_canceled");
  if (!standing.step) return skip("step_removed");
  // Paused since the claim: it keeps its time, and is planned again when its chain goes ahead (the clock's restale).
  if (
    !["scheduled", "sending"].includes(standing.run) ||
    standing.step.state !== "running" ||
    standing.root !== "running"
  )
    return (await move({ state: "planned", claimed_at: null })) ? "waited" : "lost";

  // 2. What the email is made of, judged before anyone is made.
  const [lead, workspace, words, domain] = await Promise.all([
    leadSlotsOf(db, s.tenant_id, s.lead_id),
    t.reads.workspace(s.tenant_id),
    t.reads.words(s.tenant_id, standing.step.template_id),
    s.domain_id ? t.reads.domain(s.tenant_id, s.domain_id) : Promise.resolve(null),
  ]);
  if (!lead) return skip("lead_gone");
  if (workspace.missing) return hold(workspace.missing);
  if (!words) return hold("no_template");
  // Its domain removed or held since the claim: planned again on another of the step's domains.
  if (!domain || domain.state !== "verified") {
    t.replan.push({ send: s, wrote: false });
    return "waited";
  }

  // 3. A step after the first answers the lead's email on the step before (D19).
  let parent: ParentEmail | null = null;
  if (standing.step.after_playbook_id) {
    parent = await parentEmailOf(db, {
      tenantId: s.tenant_id,
      rootId: s.root_id,
      leadId: s.lead_id,
      stepId: standing.step.after_playbook_id,
    });
    if (!parent) return skip("no_parent");
    if (!parent.rfcMessageId) {
      // Its receipt stamps it within seconds of its leaving; one that never came in two weeks is not coming.
      if (t.now.getTime() - Date.parse(s.created_at) > REPLAN_GIVE_UP_MS) return skip("parent_unstamped");
      t.later.push({ send: s, wrote: false });
      return "waited";
    }
  }
  const slots = { business_name: lead.business_name, city: lead.city };
  const said = reachOutWords(words, slots, { businessName: workspace.businessName }, parent !== null);
  if (!said.ok) return HOLDS.has(said.reason) ? hold(said.reason) : skip(said.reason);

  // 4. The person, made once; a lead that closed, or an address that is a customer's, is never written to cold.
  const person = await reachOutPerson(db, s.tenant_id, s.lead_id);
  if (!person.ok) return skip(person.refused);
  // The address the door will compare the request with (deliver.ts recipient_changed): the person's, as stored.
  const to = await contactEmailOf(db, s.tenant_id, person.contactId);
  if (!to) return skip("no_address");
  if (!workspace.mailbox) return hold("no_mailbox");

  // 5. The request, frozen; the row; the job.
  const r = reachOutRequest({
    tenantId: s.tenant_id,
    messageId,
    contactId: person.contactId,
    to,
    words,
    lead: slots,
    workspace: { businessName: workspace.businessName, address: workspace.address },
    domain,
    mailbox: workspace.mailbox,
    replyDomain: t.lane.replyDomain,
    unsubscribe: { secret: t.lane.unsubscribeSecret, origin: t.lane.unsubscribeOrigin },
    parent,
  });
  if (!r.ok) return HOLDS.has(r.reason) ? hold(r.reason) : skip(r.reason);
  const meta = {
    source: "reach_out",
    email: {
      subject: r.subject,
      to: [to],
      request: r.request,
      ...(parent ? { parent_id: parent.messageId, in_reply_to: parent.rfcMessageId } : {}),
    },
    reach_out: {
      send_id: s.id,
      lead_id: s.lead_id,
      contact_id: person.contactId,
      playbook_id: s.playbook_id,
      root_id: s.root_id,
      broadcast_id: s.broadcast_id,
      attempt: s.attempts ?? 0,
    },
  };
  const wrote = await insertQueuedEmail(db, {
    id: messageId,
    tenant_id: s.tenant_id,
    conversation_id: person.conversationId,
    contact_id: person.contactId,
    channel: "email",
    direction: "outbound",
    sender: "human",
    type: "text",
    body: r.body,
    status: "queued",
    meta: meta as unknown as Json,
  });
  if (wrote === "exists") {
    // Written between the read above and this insert: that one is this send's.
    const again = await writtenEmail(db, { tenantId: s.tenant_id, id: messageId });
    if (!again) throw new Error(`the email ${messageId} is taken and cannot be read`);
    return adopt(t, s, messageId, again);
  }
  await scheduleJob(db, {
    tenantId: s.tenant_id,
    kind: "outbound_send",
    dueAt: t.now,
    payload: {
      message_id: messageId,
      conversation_id: person.conversationId,
      to_email: to,
      purpose: "outreach",
      proactive: true,
    },
  });

  // 6. The send is queued on its email; its run is sending.
  if (!(await move({ state: "queued", message_id: messageId, contact_id: person.contactId }))) {
    // Moved by another since it was read. Adopted (the clock's unstick found this email): it goes on. Anything else:
    // the email is withdrawn while still queued, so its job sends nothing the send no longer stands behind.
    const now = await sendNow(db, { tenantId: s.tenant_id, id: s.id });
    if (now?.state === "queued" && now.message_id === messageId) return "written";
    await withdrawEmail(db, { tenantId: s.tenant_id, id: messageId, reason: "send_moved" });
    return "lost";
  }
  // The run's word only: its email is written and queued, and the clock's finish moves a scheduled run itself.
  await runSending(db, { tenantId: s.tenant_id, id: s.broadcast_id }).catch((e: unknown) =>
    t.log.warn("reach_out_run_unstarted", {
      broadcast_id: s.broadcast_id,
      error: e instanceof Error ? e.message : String(e),
    }),
  );
  return "written";
}

export async function claimAndWrite(p: {
  db: Db;
  now: Date;
  started: number;
  lane: Lane;
  log: Logger;
  /** One workspace to keep to; every workspace when absent, as the clock runs. A test proves it on its own. */
  tenantId?: string;
}): Promise<SenderCounts> {
  const out: SenderCounts = {
    claimed: 0,
    written: 0,
    rewritten: 0,
    skipped: 0,
    waited: 0,
    held: 0,
    gave_up: 0,
    errors: 0,
    month_spent: 0,
    workspaces_held: 0,
  };
  const t: Tick = {
    db: p.db,
    now: p.now,
    lane: p.lane,
    log: p.log,
    reads: tickReads(p.db),
    replan: [],
    later: [],
    said: new Set(),
  };
  const late = () => Date.now() - p.started > CLAIM_YIELD_AT_MS;
  const failed = (event: string, fields: Record<string, unknown>, e: unknown) => {
    out.errors += 1;
    p.log.error(event, { ...fields, error: e instanceof Error ? e.message : String(e) });
  };
  const write = async (s: ReachOutSendRow, again: boolean) => {
    try {
      const r = await writeOne(t, s);
      if (r === "written" || r === "adopted") out[again ? "rewritten" : "written"] += 1;
      else if (r === "skipped" || r === "waited" || r === "held") out[r] += 1;
    } catch (e) {
      // This send stays claimed: written again in five minutes, or planned again by the clock's unstick after ten.
      failed("reach_out_write_failed", { send_id: s.id, tenant_id: s.tenant_id }, e);
    }
  };

  // A claim a tick left mid-way, written again under the same id: the same email, or its first.
  try {
    for (const s of await stuckClaims(p.db, new Date(p.now.getTime() - REWRITE_AFTER_MS), REWRITE_PAGE, p.tenantId)) {
      if (late()) break;
      await write(s, true);
    }
  } catch (e) {
    failed("reach_out_rewrite_failed", {}, e);
  }

  // The claim, a page of domains at a time, past the workspaces held this tick and the domains already done.
  const allowance = new Map<string, number>();
  const skipTenants = new Set<string>();
  const done = new Set<string>();
  for (let page = 0; page < DUE_PAGES && !late(); page += 1) {
    const domains = await dueDomains(p.db, p.now, DUE_DOMAINS_PAGE, {
      tenantId: p.tenantId,
      skipTenants,
      skipDomains: done,
    });
    for (const d of domains) {
      if (late()) break;
      done.add(d.id);
      if (skipTenants.has(d.tenant_id)) continue;
      try {
        // A workspace that cannot write an email's foot or take its replies claims nothing: its sends keep.
        const workspace = await t.reads.workspace(d.tenant_id);
        if (workspace.missing) {
          skipTenants.add(d.tenant_id);
          out.workspaces_held += 1;
          p.log.warn("reach_out_workspace_held", { tenant_id: d.tenant_id, reason: workspace.missing });
          continue;
        }
        if (!allowance.has(d.tenant_id))
          allowance.set(d.tenant_id, REACH_OUT_MONTH_EMAILS - (await monthSent(p.db, d.tenant_id, p.now)));
        const left = allowance.get(d.tenant_id) ?? 0;
        if (left <= 0) {
          skipTenants.add(d.tenant_id);
          out.month_spent += 1;
          p.log.info("reach_out_month_spent", { tenant_id: d.tenant_id, allowance: REACH_OUT_MONTH_EMAILS });
          continue;
        }
        const [c, domain] = await Promise.all([domainCapacityOf(p.db, d.id, p.now), t.reads.domain(d.tenant_id, d.id)]);
        if (!domain || domain.state !== "verified" || !domain.clean_since || !c.clean_since) continue;
        // The day's share the door judges by (the days the domains clock wrote, deliver.ts), never past the live count:
        // a claim past the door's share would only be sent back, and cost each send one of its tries.
        const cap = domainDailyCap(Math.min(c.sent_days, domain.sent_days ?? 0));
        const claimed = await claimSends(p.db, {
          domainId: d.id,
          cap,
          at: p.now,
          limit: Math.min(CLAIM_PER_DOMAIN_PER_TICK, left),
        });
        out.claimed += claimed.length;
        allowance.set(d.tenant_id, left - claimed.length);
        for (const s of claimed) await write(s, false);
      } catch (e) {
        failed("reach_out_claim_failed", { domain_id: d.id, tenant_id: d.tenant_id }, e);
      }
    }
    if (domains.length < DUE_DOMAINS_PAGE) break;
  }

  // Planned again: from now on another domain, and an hour on in their leads' hours.
  const replans: Array<[Replan[], Date]> = [
    [t.replan, p.now],
    [t.later, new Date(p.now.getTime() + HOLD_MS)],
  ];
  for (const [items, from] of replans) {
    if (items.length === 0) continue;
    try {
      const { gave_up } = await replanSends(p.db, items, from, p.log);
      out.gave_up += gave_up;
    } catch (e) {
      // Left claimed: written again in five minutes, or planned again by the clock's unstick.
      failed("reach_out_replan_failed", { sends: items.length }, e);
    }
  }
  return out;
}
