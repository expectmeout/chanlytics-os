/**
 * Slice 1 backfill (Blueprint §9): Blob threads/*.json -> Postgres, run where
 * the Blob token lives. Internal admin endpoint — x-diag-key auth, NOT part of
 * the frozen surface; removed after Gate 1b.
 *
 * Prod-script bar is honored by the local driver (tooling/scripts/run-backfill.mjs):
 * dry-run default, JSONL snapshot saved BEFORE apply, idempotent here via
 * stable keys backfill:<phone>:<idx> ON CONFLICT DO NOTHING.
 *
 * Timestamp synthesis: per thread, strictly-increasing created_at anchored
 * BEFORE the earliest live (dual-written) row so the read-flip's last-N window
 * never surfaces ancient history as recent. Overlap strip: the longest suffix
 * of blob entries matching the earliest live rows by (role, content) is skipped.
 */
import { list } from "@vercel/blob";
import { json } from "../../lib/http.js";
import { pg } from "../../lib/pg.js";

export const config = { maxDuration: 60 };

// Dormant-thread anchor: a pause set at time T began ~24h earlier.
const PAUSE_APPROX_MS = 24 * 3600 * 1000;

interface BlobThread {
  history: Array<{ role: "user" | "assistant"; content: string }>;
  seen: string[];
  pausedUntil: number;
  replies: number[];
}

async function readBlobThread(pathname: string): Promise<BlobThread | null> {
  const { get } = await import("@vercel/blob");
  try {
    const res = await get(pathname, { access: "private", useCache: false });
    if (res && res.statusCode === 200 && res.stream) {
      const txt = await new Response(res.stream as ReadableStream).text();
      return JSON.parse(txt) as BlobThread;
    }
  } catch { /* fallthrough */ }
  return null;
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  if (!process.env.DIAG_KEY || request.headers.get("x-diag-key") !== process.env.DIAG_KEY) {
    return json(403, { ok: false });
  }
  const apply = url.searchParams.get("mode") === "apply";
  const tenantSlug = url.searchParams.get("tenant") || "melanys-beauty-salon";
  const db = pg();
  if (!db) return json(400, { ok: false, error: "PG_WRITES not enabled" });

  const { data: tenant } = await db.from("tenants").select("id").eq("slug", tenantSlug).single();
  if (!tenant) return json(404, { ok: false, error: "tenant not found" });

  const snapshot: Array<{ phone: string; thread: BlobThread }> = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: "threads/", cursor });
    for (const b of page.blobs) {
      const phone = b.pathname.replace(/^threads\//, "").replace(/\.json$/, "");
      if (!/^\d{8,15}$/.test(phone)) continue; // skips diag-probe and anything non-phone
      const t = await readBlobThread(b.pathname);
      if (t) snapshot.push({ phone, thread: t });
    }
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  const report: Array<Record<string, unknown>> = [];
  for (const { phone, thread } of snapshot) {
    const e164 = `+${phone}`;
    const entries = thread.history || [];
    const r: Record<string, unknown> = { phone, entries: entries.length };

    // resolve/create contact + conversation (apply only)
    let contactId: string | null = null;
    let conversationId: string | null = null;
    const { data: contact } = await db
      .from("contacts").select("id").eq("tenant_id", tenant.id).eq("phone_e164", e164).maybeSingle();
    contactId = contact?.id ?? null;
    if (contactId) {
      const { data: conv } = await db
        .from("conversations").select("id").eq("tenant_id", tenant.id).eq("contact_id", contactId).maybeSingle();
      conversationId = conv?.id ?? null;
    }

    // live rows for overlap-strip + anchor
    let liveRows: Array<{ body: string | null; sender: string; created_at: string; external_id: string | null }> = [];
    if (conversationId) {
      const { data } = await db
        .from("messages")
        .select("body, sender, created_at, external_id, type, meta")
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(200);
      // Compare only rows that ever entered Blob history: media messages and
      // owner echoes are PG-only, and one of them inside the window would
      // break every suffix match -> full duplicate import.
      liveRows = (data ?? []).filter(
        (m) =>
          !(m.external_id || "").startsWith("backfill:") &&
          m.type !== "media" &&
          !(m.meta as Record<string, unknown> | null)?.echo,
      );
    }

    // longest suffix of blob entries matching the earliest live rows
    let strip = 0;
    const maxK = Math.min(entries.length, liveRows.length);
    for (let k = maxK; k > 0; k--) {
      let match = true;
      for (let i = 0; i < k; i++) {
        const e = entries[entries.length - k + i];
        const l = liveRows[i];
        const senderOk = e.role === "user" ? l.sender === "customer" : l.sender !== "customer";
        if (!senderOk || (l.body || "") !== e.content) { match = false; break; }
      }
      if (match) { strip = k; break; }
    }
    const toImport = entries.slice(0, entries.length - strip);
    r.strippedOverlap = strip;
    r.toImport = toImport.length;
    r.pausedActive = thread.pausedUntil > Date.now();

    if (apply && toImport.length + (thread.pausedUntil > Date.now() ? 1 : 0) > 0) {
      if (!contactId) {
        const { data: c, error: cerr } = await db
          .from("contacts")
          .upsert({ tenant_id: tenant.id, phone_e164: e164 }, { onConflict: "tenant_id,phone_e164" })
          .select("id").single();
        if (cerr || !c) { r.err_contact = cerr?.message; report.push(r); continue; }
        contactId = c.id;
      }
      if (!conversationId) {
        const { data: cv, error: verr } = await db
          .from("conversations")
          .upsert({ tenant_id: tenant.id, contact_id: contactId }, { onConflict: "tenant_id,contact_id" })
          .select("id").single();
        if (verr || !cv) { r.err_conversation = verr?.message; report.push(r); continue; }
        conversationId = cv.id;
      }
      // Anchor: before the earliest live row; for dormant threads with no live
      // rows, before the thread's own last activity (never "just now").
      const lastActivity = Math.max(0, ...thread.replies, thread.pausedUntil ? thread.pausedUntil - PAUSE_APPROX_MS : 0);
      const earliestLive = liveRows[0]?.created_at
        ? new Date(liveRows[0].created_at).getTime()
        : lastActivity > 0 ? lastActivity : Date.now();
      const anchor = earliestLive - (toImport.length + 60) * 1000;
      let imported = 0;
      for (let i = 0; i < toImport.length; i++) {
        const e = toImport[i];
        const isCallNote = e.role === "assistant" && e.content.startsWith("[voice call note");
        const { error } = await db.from("messages").insert({
          tenant_id: tenant.id,
          conversation_id: conversationId,
          contact_id: contactId,
          channel: "whatsapp",
          direction: e.role === "user" ? "inbound" : "outbound",
          sender: e.role === "user" ? "customer" : "ai",
          type: isCallNote ? "call_summary" : "text",
          body: e.content,
          external_id: `backfill:${phone}:${i}`,
          status: e.role === "user" ? "received" : "sent",
          created_at: new Date(anchor + i * 1000).toISOString(),
          meta: { backfill: true, processed_at: new Date().toISOString() },
        });
        if (!error) imported++;
        else if (error.code !== "23505") r[`err_${i}`] = error.message;
      }
      r.imported = imported;
      // conversation recency + pause state (never move recency backwards)
      const lastTs = new Date(anchor + Math.max(0, toImport.length - 1) * 1000).toISOString();
      const { data: convRow } = await db
        .from("conversations").select("last_message_at, paused_until").eq("id", conversationId).single();
      const patch: { last_message_at?: string; paused_until?: string; state?: string } = {};
      // epoch comparison — PostgREST and toISOString() render timestamps differently
      if (!convRow?.last_message_at || new Date(convRow.last_message_at).getTime() < new Date(lastTs).getTime()) {
        patch.last_message_at = lastTs;
      }
      if (thread.pausedUntil > Date.now()) {
        patch.paused_until = new Date(thread.pausedUntil).toISOString();
        patch.state = "needs_human";
      }
      if (Object.keys(patch).length) {
        await db.from("conversations").update(patch).eq("id", conversationId);
      }
    }
    report.push(r);
  }

  return json(200, {
    ok: true,
    mode: apply ? "apply" : "dry",
    tenant: tenantSlug,
    threads: report,
    snapshot, // the driver persists this as the JSONL backup BEFORE apply
  });
}
