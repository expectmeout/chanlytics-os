/**
 * The broadcast_send job: one chunk of a run's recipients, counted and sent. Moved whole from handlers.ts (Reach out
 * Part 2.5), which re-exports its public names.
 */
import { parseTenantConfig } from "@chanlytics/contracts";
import { deliver, isWireUnavailable, sendBroadcastBatch, type BroadcastBatchPorts } from "@chanlytics/core";
import { type Database, resolveOutboundTarget } from "@chanlytics/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import { type ClaimedJob, type JobContext, must } from "./context";

/**
 * How many of a broadcast's people are in one state, or in any state at all.
 *
 * A COUNT, never a page of rows: PostgREST caps a plain select at `max_rows`
 * (1000, supabase/config.toml) and a broadcast may carry BROADCAST_MAX_RECIPIENTS
 * of them, so counting by reading the rows silently undercounts exactly the
 * broadcasts big enough for the number to matter.
 */
async function countRecipients(
  db: SupabaseClient<Database>,
  tenantId: string,
  broadcastId: string,
  state?: string,
): Promise<number> {
  let q = db
    .from("broadcast_recipients")
    .select("contact_id", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .eq("broadcast_id", broadcastId);
  if (state) q = q.eq("state", state);
  const { count, error } = await q;
  if (error) throw new Error(`broadcast_send: cannot count ${state ?? "all"} recipients: ${error.message}`);
  return count ?? 0;
}

/**
 * A run as the batch sends it: with its template, or not at all. Only a reach-out's hand step's run has none (00228),
 * and it sends nothing, so it is never this job's.
 */
function withTemplate<T extends { template_name: string | null; template_language: string | null }>(
  row: T | null,
): (T & { template_name: string; template_language: string }) | null {
  if (!row) return null;
  const { template_name, template_language } = row;
  return template_name && template_language ? { ...row, template_name, template_language } : null;
}

/**
 * Why the tick could not bind this channel's wire for this tenant (the credentials read failed on the edge), or null. A
 * wire that is null is a number that carries none, and the door's to refuse.
 */
function wireUnbound(ctx: JobContext, channel: "whatsapp"): string | null {
  const wire = ctx.wire[channel];
  return isWireUnavailable(wire) ? wire.error : null;
}

/** The wire's ports: why a channel's wire could not be bound, and the platform's pager when this runtime holds one. */
function wirePorts(ctx: JobContext): Pick<BroadcastBatchPorts, "wireUnavailable" | "page"> {
  return { wireUnavailable: async (channel) => wireUnbound(ctx, channel), ...(ctx.page ? { page: ctx.page } : {}) };
}

/** broadcast_send: core's sendBroadcastBatch, over this runtime's ports. payload: { broadcast_id } */

export async function broadcastSend(ctx: JobContext, job: ClaimedJob): Promise<void> {
  const p = job.payload as { broadcast_id: string; waits?: unknown };
  const db = ctx.db;
  await sendBroadcastBatch(
    {
      broadcast: async (id) => {
        const { data, error } = await db
          .from("broadcasts")
          .select("id, state, name, template_name, template_language, params, recipient_count, playbook_id, audience")
          .eq("id", id)
          .eq("tenant_id", job.tenant_id)
          .maybeSingle();
        if (error) throw new Error(`broadcast_send: cannot read broadcast ${id}: ${error.message}`);
        return withTemplate(data);
      },
      // The billing gate, so it fails CLOSED: a tenants row that cannot be read
      // is not a workspace that is paying.
      workspacePaused: async () => {
        const row = must(
          "broadcast_send: cannot read the workspace's status",
          await db.from("tenants").select("status").eq("id", job.tenant_id).maybeSingle(),
        );
        return row?.status === "paused";
      },
      fail: async (id, failure) => {
        must(
          "broadcast_send: cannot mark the broadcast failed",
          await db
            .from("broadcasts")
            .update({ state: "failed", failure, finished_at: new Date().toISOString() })
            .eq("id", id)
            .eq("tenant_id", job.tenant_id),
        );
      },
      startSending: async (id) => {
        const rows = must(
          "broadcast_send: cannot start the broadcast",
          await db
            .from("broadcasts")
            .update({ state: "sending", started_at: new Date().toISOString() })
            .eq("id", id)
            .eq("tenant_id", job.tenant_id)
            .eq("state", "scheduled")
            .select("id"),
        );
        return !!rows && rows.length > 0;
      },
      // `category` is Meta's verdict on what kind of message this is, and it
      // decides which consent the send needs. A template that cannot be READ is
      // not a template Meta withdrew: null here fails the whole broadcast and
      // emails the owner that WhatsApp rejected it, which would be a lie about
      // their Meta account told over a statement timeout.
      template: async (name, language) =>
        must(
          `broadcast_send: cannot read template ${name}`,
          await db
            .from("templates")
            .select("meta_status, body_preview, category")
            .eq("tenant_id", job.tenant_id)
            .eq("channel", "whatsapp")
            .eq("name", name)
            .eq("language", language)
            .maybeSingle(),
        ),
      facts: () => workspaceFacts(db, job.tenant_id),
      batch: async (id, limit) => {
        const { data, error } = await db
          .from("broadcast_recipients")
          .select("contact_id, facts")
          .eq("tenant_id", job.tenant_id)
          .eq("broadcast_id", id)
          .eq("state", "queued")
          .limit(limit);
        if (error) throw new Error(`broadcast_send: cannot read recipients: ${error.message}`);
        return data ?? [];
      },
      // The batch's people in one read, not one read per person.
      contacts: async (ids) => {
        const { data, error } = await db
          .from("contacts")
          .select("id, phone_e164, consent, dnc, marketing_consent, erased_at, display_name, wa_profile_name")
          .in("id", ids)
          .eq("tenant_id", job.tenant_id);
        if (error) throw new Error(`broadcast_send: cannot read the people: ${error.message}`);
        return new Map((data ?? []).map((c) => [c.id, c]));
      },
      // create: false — a broadcast never opens a contact. touch: false — the
      // door below still has to refuse some of these people, and a thread they
      // were not messaged in has nothing new in it.
      target: (phoneE164) =>
        resolveOutboundTarget(db, { tenantId: job.tenant_id, phoneE164, create: false, touch: false }),
      // The messages a dying run left these people: written by deliver after the
      // wire accepted them, with this broadcast's id in their meta, read once for
      // the batch. It is the one check standing between a resumed run and a
      // second WhatsApp template to the same person, so a read that FAILED must
      // never come back as "no, they have not been messaged".
      alreadySent: async (id, contactIds) => {
        const rows = must(
          "broadcast_send: cannot check what the batch was already sent",
          await db
            .from("messages")
            .select("id, contact_id, created_at")
            .eq("tenant_id", job.tenant_id)
            .in("contact_id", contactIds)
            .filter("meta->>broadcast_id", "eq", id)
            .in("status", ["sent", "delivered", "read"]),
        );
        // created_at is written by the same statement that records the send, so
        // it is when the message left, which is what the recipient's row wants.
        const prior = new Map<string, { id: string; sentAt: string | null }>();
        for (const m of rows ?? [])
          if (m.contact_id && !prior.has(m.contact_id)) prior.set(m.contact_id, { id: m.id, sentAt: m.created_at });
        return prior;
      },
      // `sent_at` comes from the patch when the caller knows it — a resumed run
      // reading the message a dying run left knows when it actually went out,
      // and stamping "now" instead would reorder the broadcast's own page.
      mark: async (id, contactId, patch) => {
        const sentAt = patch.sent_at ?? (patch.state === "sent" ? new Date().toISOString() : null);
        must(
          "broadcast_send: cannot record how this person's send went",
          await db
            .from("broadcast_recipients")
            .update({ ...patch, sent_at: sentAt })
            .eq("tenant_id", job.tenant_id)
            .eq("broadcast_id", id)
            .eq("contact_id", contactId),
        );
      },
      deliver: (d) => deliver({ db, wire: ctx.wire }, d),
      ...wirePorts(ctx),
      remaining: (id) => countRecipients(db, job.tenant_id, id, "queued"),
      // Read by the verb as "is this broadcast still wanted"; null is how a
      // cancel reads, so a failed read here would abandon a half-sent broadcast
      // with nothing scheduled, nothing failed and nobody told.
      state: async (id) => {
        const row = must(
          "broadcast_send: cannot read whether the broadcast is still wanted",
          await db.from("broadcasts").select("state").eq("id", id).eq("tenant_id", job.tenant_id).maybeSingle(),
        );
        return row?.state ?? null;
      },
      // The count of WhatsApp's "not now" rides in the payload to the next batch, and only while it is running.
      scheduleNext: async (id, dueAt, waits) => {
        await ctx.schedule("broadcast_send", dueAt ?? new Date(), { broadcast_id: id, ...(waits ? { waits } : {}) });
      },
      // This tally is written to the permanent record and read out to the owner,
      // so it is counted rather than tallied from a page of rows.
      tally: async (id) => {
        const [all, sent] = await Promise.all([
          countRecipients(db, job.tenant_id, id),
          countRecipients(db, job.tenant_id, id, "sent"),
        ]);
        return { sent, held: all - sent };
      },
      finish: async (id, tally) => {
        must(
          "broadcast_send: cannot close the broadcast",
          await db
            .from("broadcasts")
            .update({ state: "sent", finished_at: new Date().toISOString() })
            .eq("id", id)
            .eq("tenant_id", job.tenant_id)
            .eq("state", "sending"),
        );
        must(
          "broadcast_send: cannot record the broadcast's tally",
          await db.from("events").insert({
            tenant_id: job.tenant_id,
            kind: "broadcast.sent",
            category: "message",
            subject_type: "broadcast",
            subject_id: id,
            data: tally,
          }),
        );
      },
      alert: ctx.alert,
      now: Date.now,
      sleep: (ms) => new Promise((res) => setTimeout(res, ms)),
    },
    { tenantId: job.tenant_id, broadcastId: p.broadcast_id, deadline: ctx.deadline, waits: waitsOf(p) },
  );
}

/**
 * The workspace's own words for the slots that name it, and the zone its sending hours are kept by. An empty business
 * name is not a fallback: it resolves to an empty slot, and the verb marks everyone in the batch permanently
 * "missing_value". An unreadable zone reads as UTC where the hours are judged (contracts playbook-schedule).
 */
async function workspaceFacts(
  db: JobContext["db"],
  tenantId: string,
): Promise<{ businessName: string; bookingLink: string | null; timezone: string }> {
  const [tenantRes, cfgRes] = await Promise.all([
    db.from("tenants").select("name, timezone").eq("id", tenantId).maybeSingle(),
    db.from("tenant_config").select("config").eq("tenant_id", tenantId).maybeSingle(),
  ]);
  const tenantRow = must("broadcast_send: cannot read the workspace", tenantRes);
  const cfgRow = must("broadcast_send: cannot read the workspace's settings", cfgRes);
  const parsedCfg = parseTenantConfig(cfgRow?.config ?? null);
  const businessName = parsedCfg?.brain?.business_name || tenantRow?.name || "";
  return {
    businessName,
    bookingLink: parsedCfg?.brain?.booking_link ?? null,
    timezone: tenantRow?.timezone || "UTC",
  };
}

/** How many times running WhatsApp has said "not now", as the job carries it; anything but a count is none. */
function waitsOf(payload: { waits?: unknown }): number {
  return typeof payload.waits === "number" && Number.isInteger(payload.waits) && payload.waits > 0 ? payload.waits : 0;
}
