/**
 * The reach-out clock's claim (Reach out, Part 3; C7, C8, C9, C10, E8): for each domain with a send due, the sends it
 * may take within its day's share and its workspace's month, claimed under the domain's lock (00184); then for each,
 * its email written before the send leaves `claimed` (rows first, C8):
 *
 *   1. the run and its chain as they stand now: a run closed since is skipped, a chain paused since waits;
 *   2. the person (made once, E5: reach_out_person), refused for a lead that closed or a customer's address;
 *   3. the words, the lead, the workspace, the domain's identity and the mailbox the replies come back to;
 *   4. for a step after the first, the lead's email on the step before (D19), waited for while its receipt has not
 *      stamped its Message-ID;
 *   5. the frozen request (request.ts), the email row under its own id (core sendMessageId), and the outbound_send job
 *      that sends it through the one door (deliver.ts);
 *   6. the send `claimed → queued`, and its run `scheduled → sending`.
 *
 * The email row comes first: the domain's capacity counts a claim and a queued row each (00184), so this order only
 * ever counts one twice for a moment, which sends less, never more. A send that cannot be written says why and is
 * skipped; one that must wait is planned again. A claim a tick left mid-way (it died after the claim) is written again
 * five minutes on: its email's id is the same, so it is the same email, never a second.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  claimSends,
  domainCapacityOf,
  dueDomains,
  insertQueuedEmail,
  mailboxOfTenant,
  monthSent,
  moveSend,
  parentEmailOf,
  reachOutPerson,
  sendJobScheduled,
  stuckClaims,
  withdrawEmail,
  writtenEmail,
  type Database,
  type Json,
  type ParentEmail,
  type ReachOutSendRow,
} from "../packages/db.js";
import { sendMessageId } from "../packages/core.js";
import { scheduleJob } from "../packages/jobs.js";
import { REACH_OUT_MONTH_EMAILS, domainDailyCap, emailDomainOf, parseTenantConfig } from "../packages/contracts.js";
import { dashboardOrigin } from "../dashboard-origin.js";
import { env } from "../env.js";
import { reachOutRequest } from "./request.js";
import { REPLAN_GIVE_UP_MS, replanSends, type Replan } from "./replan.js";
import type { Logger } from "../log.js";

type Db = SupabaseClient<Database>;

/** The most one domain's claim takes in a tick: its gap spaces its sends minutes apart, so a tick finds one or two. */
export const CLAIM_PER_DOMAIN_PER_TICK = 5;
/** When the claim stops taking domains: its door has 60 s (vercel.json), and a domain's writes take a few seconds. */
export const CLAIM_YIELD_AT_MS = 40_000;
/** How many domains with sends due one tick reads. */
export const DUE_DOMAINS_PAGE = 50;
/** A claim this old was left by a tick that died after it (a tick lives 60 s at most): it is written again. */
export const REWRITE_AFTER_MS = 5 * 60_000;
/** How long a step's send waits for the email before it to be stamped with its Message-ID. */
export const PARENT_WAIT_MS = 3_600_000;
const REWRITE_PAGE = 100;

/** What the cold lane needs to write an email: the seal for its unsubscribe, the page it opens, the mail domain. */
export interface Lane {
  unsubscribeSecret: string;
  unsubscribeOrigin: string;
  mailDomain: string;
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
  return { ok: true, lane: { unsubscribeSecret: secret, unsubscribeOrigin: dashboardOrigin(), mailDomain } };
}

export interface SenderCounts {
  claimed: number;
  written: number;
  rewritten: number;
  skipped: number;
  waited: number;
  errors: number;
  /** Workspaces whose month's allowance is spent: their sends wait for the next month. */
  month_spent: number;
}

/** `deferred`: handed to the re-plan at the tick's end, and counted there. `lost`: another moved it first. */
type Outcome = "written" | "skipped" | "waited" | "deferred" | "lost";

interface Workspace {
  businessName: string | null;
  address: string | null;
  mailbox: { reply_token: string } | null;
}
interface Words {
  subject: string | null;
  body: string;
}
interface Identity {
  host: string;
  from_local: string;
  from_name: string;
}

/** A component's text, by its type: an email template's HEADER is its subject and its BODY its words. */
const partText = (components: unknown, type: string): string | null => {
  if (!Array.isArray(components)) return null;
  for (const c of components)
    if (c && typeof c === "object" && String((c as { type?: unknown }).type ?? "").toUpperCase() === type) {
      const t = (c as { text?: unknown }).text;
      return typeof t === "string" && t.trim() ? t : null;
    }
  return null;
};

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
  const words = new Map<string, Promise<Words | null>>();
  const domains = new Map<string, Promise<Identity | null>>();
  return {
    workspace: (tenantId: string) =>
      once(workspaces, tenantId, async () => {
        const [t, cfg, mailbox] = await Promise.all([
          db.from("tenants").select("name").eq("id", tenantId).maybeSingle(),
          db.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle(),
          mailboxOfTenant(db, tenantId),
        ]);
        if (t.error) throw new Error(`the workspace: ${t.error.message}`);
        if (cfg.error) throw new Error(`the workspace's profile: ${cfg.error.message}`);
        // The address drafts put at their foot (the dashboard's workspaceOffer): the profile's, as the owner wrote it.
        const profile = parseTenantConfig(cfg.data?.config ?? null)?.brain?.profile ?? null;
        return {
          businessName: t.data?.name ?? null,
          address: profile?.address ?? null,
          mailbox: mailbox ? { reply_token: mailbox.reply_token } : null,
        };
      }),
    words: (tenantId: string, templateId: string) =>
      once(words, templateId, async () => {
        const { data, error } = await db
          .from("templates")
          .select("components, body_preview")
          .eq("tenant_id", tenantId)
          .eq("id", templateId)
          .eq("channel", "email")
          .maybeSingle();
        if (error) throw new Error(`the step's words: ${error.message}`);
        if (!data) return null;
        const body = partText(data.components, "BODY") ?? data.body_preview?.trim() ?? "";
        return body ? { subject: partText(data.components, "HEADER"), body } : null;
      }),
    domain: (tenantId: string, domainId: string) =>
      once(domains, domainId, async () => {
        const { data, error } = await db
          .from("sending_domains")
          .select("host, from_local, from_name, state")
          .eq("tenant_id", tenantId)
          .eq("id", domainId)
          .maybeSingle();
        if (error) throw new Error(`the domain: ${error.message}`);
        return data && data.state === "verified"
          ? { host: data.host, from_local: data.from_local, from_name: data.from_name }
          : null;
      }),
  };
}

interface Tick {
  db: Db;
  now: Date;
  lane: Lane;
  log: Logger;
  reads: ReturnType<typeof tickReads>;
  /** Sends whose domain went away since their claim: planned again on another, together, at the tick's end. */
  replan: Replan[];
}

/** One claimed send, written: its email and its job, then its move. Only from `claimed`, as it was read. */
async function writeOne(t: Tick, s: ReachOutSendRow): Promise<Outcome> {
  const { db } = t;
  const move = async (patch: Partial<ReachOutSendRow>): Promise<boolean> =>
    moveSend(db, { tenantId: s.tenant_id, id: s.id, from: "claimed", patch });
  const skip = async (reason: string): Promise<Outcome> =>
    (await move({ state: "skipped", reason: reason.slice(0, 60) })) ? "skipped" : "lost";
  const wait = async (sendAt: Date | null): Promise<Outcome> =>
    (await move({ state: "planned", claimed_at: null, ...(sendAt ? { send_at: sendAt.toISOString() } : {}) }))
      ? "waited"
      : "lost";

  // 1. The run and its chain now: the claim read them, and a writer is seconds behind it.
  if (!s.playbook_id) return skip("step_removed");
  const [run, chain] = await Promise.all([
    db.from("broadcasts").select("state").eq("tenant_id", s.tenant_id).eq("id", s.broadcast_id).maybeSingle(),
    db
      .from("playbooks")
      .select("id, state, template_id, after_playbook_id")
      .eq("tenant_id", s.tenant_id)
      .in("id", [s.playbook_id, s.root_id]),
  ]);
  if (run.error) throw new Error(`the run: ${run.error.message}`);
  if (chain.error) throw new Error(`the chain: ${chain.error.message}`);
  const step = (chain.data ?? []).find((p) => p.id === s.playbook_id);
  const root = (chain.data ?? []).find((p) => p.id === s.root_id);
  if (!run.data || run.data.state === "canceled" || run.data.state === "failed") return skip("run_canceled");
  if (!step) return skip("step_removed");
  // Paused since the claim: it keeps its time, and is planned again when its chain goes ahead (the clock's restale).
  if (!["scheduled", "sending"].includes(run.data.state) || step.state !== "running" || root?.state !== "running")
    return wait(null);

  // 2. The person, made once; a lead that closed, or an address that is a customer's, is never written to cold.
  const person = await reachOutPerson(db, s.tenant_id, s.lead_id);
  if (!person.ok) return skip(person.refused);

  // 3. What the email is made of.
  const [contact, lead, workspace, words, domain] = await Promise.all([
    db.from("contacts").select("email").eq("tenant_id", s.tenant_id).eq("id", person.contactId).maybeSingle(),
    db.from("leads").select("business_name, city").eq("tenant_id", s.tenant_id).eq("id", s.lead_id).maybeSingle(),
    t.reads.workspace(s.tenant_id),
    t.reads.words(s.tenant_id, step.template_id),
    s.domain_id ? t.reads.domain(s.tenant_id, s.domain_id) : Promise.resolve(null),
  ]);
  if (contact.error) throw new Error(`the person: ${contact.error.message}`);
  if (lead.error) throw new Error(`the lead: ${lead.error.message}`);
  // The address the door will compare the request with (deliver.ts recipient_changed): the person's, as stored.
  const to = contact.data?.email ?? null;
  if (!to) return skip("no_address");
  if (!workspace.mailbox) return skip("no_mailbox");
  if (!words) return skip("no_template");
  // Its domain removed or held since the claim: planned again on another of the step's domains.
  if (!domain) {
    t.replan.push({ send: s, wrote: false });
    return "deferred";
  }

  // 4. A step after the first answers the lead's email on the step before (D19).
  let parent: ParentEmail | null = null;
  if (step.after_playbook_id) {
    parent = await parentEmailOf(db, {
      tenantId: s.tenant_id,
      rootId: s.root_id,
      leadId: s.lead_id,
      stepId: step.after_playbook_id,
    });
    if (!parent) return skip("no_parent");
    if (!parent.rfcMessageId) {
      // Its receipt stamps it within seconds of its leaving; one that never came in two weeks is not coming.
      if (t.now.getTime() - Date.parse(s.created_at) > REPLAN_GIVE_UP_MS) return skip("parent_unstamped");
      return wait(new Date(t.now.getTime() + PARENT_WAIT_MS));
    }
  }

  // 5. The request, frozen; the row; the job.
  const messageId = await sendMessageId(s.id, s.attempts ?? 0);
  const r = reachOutRequest({
    tenantId: s.tenant_id,
    messageId,
    contactId: person.contactId,
    to,
    words,
    lead: { business_name: lead.data?.business_name ?? null, city: lead.data?.city ?? null },
    workspace: { businessName: workspace.businessName, address: workspace.address },
    domain,
    mailbox: workspace.mailbox,
    mailDomain: t.lane.mailDomain,
    unsubscribe: { secret: t.lane.unsubscribeSecret, origin: t.lane.unsubscribeOrigin },
    parent,
  });
  if (!r.ok) return skip(r.reason);
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
  // Written before, by a writer that died after it: that email, as it was frozen, is this send's. Its job is scheduled
  // once, whoever got to it.
  let job = { conversationId: person.conversationId, to };
  if (wrote === "exists") {
    const was = await writtenEmail(db, { tenantId: s.tenant_id, id: messageId });
    if (was) job = { conversationId: was.conversation_id, to: was.to ?? to };
  }
  if (wrote === "written" || !(await sendJobScheduled(db, { tenantId: s.tenant_id, messageId })))
    await scheduleJob(db, {
      tenantId: s.tenant_id,
      kind: "outbound_send",
      dueAt: t.now,
      payload: {
        message_id: messageId,
        conversation_id: job.conversationId,
        to_email: job.to,
        purpose: "outreach",
        proactive: true,
      },
    });

  // 6. The send is queued on its email; its run is sending.
  if (!(await move({ state: "queued", message_id: messageId, contact_id: person.contactId }))) {
    // Moved by another since it was read. Adopted (the clock's unstick found this email): it goes on. Anything else:
    // the email is withdrawn while still queued, so its job sends nothing the send no longer stands behind.
    const { data: now, error } = await db
      .from("reach_out_sends")
      .select("state, message_id")
      .eq("tenant_id", s.tenant_id)
      .eq("id", s.id)
      .maybeSingle();
    if (error) throw new Error(`the send, after its move: ${error.message}`);
    if (now?.state === "queued" && now.message_id === messageId) return "written";
    await withdrawEmail(db, { tenantId: s.tenant_id, id: messageId, reason: "send_moved" });
    return "lost";
  }
  const { error: re } = await db
    .from("broadcasts")
    .update({ state: "sending" })
    .eq("tenant_id", s.tenant_id)
    .eq("id", s.broadcast_id)
    .eq("state", "scheduled");
  // The run's word only: its email is written and queued, and the clock's finish moves a scheduled run itself.
  if (re) t.log.warn("reach_out_run_unstarted", { broadcast_id: s.broadcast_id, error: re.message });
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
  const out: SenderCounts = { claimed: 0, written: 0, rewritten: 0, skipped: 0, waited: 0, errors: 0, month_spent: 0 };
  const t: Tick = { db: p.db, now: p.now, lane: p.lane, log: p.log, reads: tickReads(p.db), replan: [] };
  const late = () => Date.now() - p.started > CLAIM_YIELD_AT_MS;
  const write = async (s: ReachOutSendRow, again: boolean) => {
    try {
      const r = await writeOne(t, s);
      if (r === "written") out[again ? "rewritten" : "written"] += 1;
      else if (r === "skipped" || r === "waited") out[r] += 1;
    } catch (e) {
      // This send stays claimed: written again in five minutes, or planned again by the clock's unstick after ten.
      out.errors += 1;
      p.log.error("reach_out_write_failed", {
        send_id: s.id,
        tenant_id: s.tenant_id,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  };

  // A claim a tick left mid-way, written again under the same id: the same email, or its first.
  for (const s of await stuckClaims(p.db, new Date(p.now.getTime() - REWRITE_AFTER_MS), REWRITE_PAGE, p.tenantId)) {
    if (late()) break;
    await write(s, true);
  }

  const allowance = new Map<string, number>();
  for (const d of await dueDomains(p.db, p.now, DUE_DOMAINS_PAGE, p.tenantId)) {
    if (late()) break;
    if (!allowance.has(d.tenant_id)) {
      const left = REACH_OUT_MONTH_EMAILS - (await monthSent(p.db, d.tenant_id, p.now));
      allowance.set(d.tenant_id, left);
      if (left <= 0) {
        out.month_spent += 1;
        p.log.info("reach_out_month_spent", { tenant_id: d.tenant_id, allowance: REACH_OUT_MONTH_EMAILS });
      }
    }
    const left = allowance.get(d.tenant_id) ?? 0;
    if (left <= 0) continue;
    // The day's share as the door judges it (deliver.ts): a domain never clean has none.
    const c = await domainCapacityOf(p.db, d.id, p.now);
    const cap = c.clean_since ? domainDailyCap(c.sent_days) : 0;
    if (cap <= 0) continue;
    const claimed = await claimSends(p.db, {
      domainId: d.id,
      cap,
      at: p.now,
      limit: Math.min(CLAIM_PER_DOMAIN_PER_TICK, left),
    });
    out.claimed += claimed.length;
    allowance.set(d.tenant_id, left - claimed.length);
    for (const s of claimed) await write(s, false);
  }

  if (t.replan.length > 0) {
    const r = await replanSends(p.db, t.replan, p.now, p.log);
    out.waited += r.replanned + r.waiting;
    out.skipped += r.gave_up;
  }
  return out;
}
