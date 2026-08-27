/**
 * Chanlytics Messaging — WhatsApp Cloud API webhook (app: Chanlytics AI).
 * GET = Meta verification handshake. POST = signature-validated event receiver.
 *
 * Production engine: inbound message -> guardrailed Claude brain -> reply,
 * with per-thread dedupe, history, human-pause (coexistence echoes), rate caps,
 * staleness guard, and escalation alerts via Resend.
 *
 * Contract (frozen during Meta App Review): process-then-200 in-invocation
 * under maxDuration 60; Meta retries + dedupe make replays safe. The HTTP
 * surface is unchanged by Gate 1b — only where memory is read from moves.
 *
 * Postgres dual-write (PG_WRITES=on): additive, fail-safe, batched — the
 * PgSink no-ops when unconfigured so the frozen Blob/send order never depends
 * on PG. wa_replied logs carry ingest_ms/post_ms (blueprint latency budget).
 *
 * GATE 1b (PG_READS=on): Postgres becomes the SOURCE of the bot's memory —
 * history, pause, and rate cap all come from the same rows the dashboard reads
 * and writes, which retires the Blob mirror and the class of drift bugs that
 * came with it. Reversible by an env flip (no redeploy); Blob keeps being
 * written underneath, which is what makes the rollback safe. A Postgres read
 * failure falls back to Blob rather than giving the bot amnesia. PG_READS
 * implies PG dedupe: PG-sourced memory has no `seen` list, and ingest_inbound's
 * atomic is_new claim is a stronger gate than that array ever was.
 *
 * Env: WHATSAPP_VERIFY_TOKEN, META_APP_SECRET, WHATSAPP_ACCESS_TOKEN,
 *      WHATSAPP_PHONE_ID, WHATSAPP_TEST_ALLOWLIST (optional, comma list),
 *      ANTHROPIC_API_KEY, RESEND_API_KEY + LEAD_TO/LEAD_FROM,
 *      BLOB_READ_WRITE_TOKEN, PG_WRITES + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY,
 *      PG_READS (Gate 1b), PG_DEDUPE (optional, implied by PG_READS).
 */
import crypto from "node:crypto";
import { getThread, saveThread, storeBackend, type ThreadState } from "../lib/store.js";
import { json, text } from "../lib/http.js";
import { pg } from "../lib/pg.js";
import {
  normalizeInbound,
  sendText as waSendText,
  fetchMediaBytes,
  type WaChangeValue,
  type WaRawMessage,
  type NormalizedInbound,
} from "../lib/workspace/channels.js";
import {
  resolveChannel,
  ingestInbound,
  markProcessed,
  recordOutbound,
  recordStatusByExternalId,
  recordEchoAndPause,
  pauseConversation,
  emitEvent,
  readThreadState,
  type IngestResult,
} from "../lib/workspace/db.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "../lib/workspace/db.js";
import { upsertEscalation } from "../lib/workspace/jobs.js";
import { violatesNoPrices } from "../lib/workspace/contracts.js";

export const config = { maxDuration: 60 };

const PAUSE_MS = 24 * 3600 * 1000;   // human echo pauses the bot for 24h
const MAX_REPLIES_PER_DAY = 20;      // per thread
const STALE_MS = 10 * 60 * 1000;     // ignore messages older than 10 min (webhook replays)

/** Gate 1b: read the bot's memory from Postgres instead of Blob. */
const PG_READS = process.env.PG_READS === "on";

/** Sentinel for "Postgres couldn't answer" — distinct from "empty thread", so
 *  a database blip falls back to Blob instead of giving the bot amnesia and
 *  re-greeting a customer mid-conversation. */
const PG_MISS: ThreadState = { history: [], seen: [], pausedUntil: -1, replies: [] };

/** Postgres-sourced thread state, or PG_MISS if it can't be produced. */
async function pgThread(
  db: ReturnType<typeof pg>,
  tenantId: string | null,
  ing: IngestResult | null,
): Promise<ThreadState> {
  if (!db || !tenantId || !ing) return PG_MISS;
  try {
    const s = await readThreadState(db, tenantId, ing.conversation_id, ing.paused_until);
    return { history: s.history, seen: s.seen, pausedUntil: s.pausedUntil, replies: s.replies };
  } catch (e) {
    console.error("pg_thread_read_failed", e instanceof Error ? e.message : e);
    return PG_MISS;
  }
}

function waCfg() {
  return { phoneId: process.env.WHATSAPP_PHONE_ID || "", accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "" };
}

async function sendText(to: string, body: string): Promise<{ ok: boolean; wamid: string | null; status: number }> {
  const r = await waSendText(waCfg(), to, body);
  if (!r.ok) console.error("wa_send_failed", r.status, r.errorBody);
  else console.log("wa_sent", JSON.stringify({ to, wamid: r.wamid }));
  return { ok: r.ok, wamid: r.wamid, status: r.status };
}

async function alertStaff(threadId: string, userText: string, botText: string, reason: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) return;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.LEAD_FROM || "Melany's Website <onboarding@resend.dev>",
        to: [process.env.LEAD_TO || "ruben@rjcapital.io"],
        subject: `WhatsApp handoff needed: +${threadId}`,
        text:
          `The WhatsApp assistant flagged a conversation for a human (${reason}).\n\n` +
          `Customer: +${threadId}\n` +
          `Their message: ${userText}\n` +
          `Bot's reply: ${botText}\n\n` +
          `Reply from the WhatsApp Business app — the bot is paused on this thread for 24h.`,
      }),
    });
  } catch (e) {
    console.error("alert_failed", e instanceof Error ? e.message : e);
  }
}

/** Additive PG ingest — never throws into the handling path. */
async function pgIngest(tenantId: string | null, n: NormalizedInbound): Promise<IngestResult | null> {
  const db = pg();
  if (!db || !tenantId) return null;
  try {
    return await ingestInbound(db, {
      tenantId,
      channel: "whatsapp",
      identityExternalId: n.waId,
      phoneE164: n.phoneDigits ? `+${n.phoneDigits.replace(/^\+/, "")}` : null,
      waProfileName: n.profileName,
      messageExternalId: n.messageId,
      type: n.type,
      body: n.body,
      channelTs: n.channelTsIso,
      media: n.media ? (n.media as unknown as Json) : null,
      meta: { raw_type: n.rawType } as Json,
      optOut: n.optOut,
    });
  } catch (e) {
    console.error("ingest_pg_failed", e instanceof Error ? e.message : e);
    return null;
  }
}

async function pgSafe(label: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    console.error(`pg_${label}_failed`, e instanceof Error ? e.message : e);
  }
}

const MIME_EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "video/mp4": "mp4", "application/pdf": "pdf",
};

/** All PG bookkeeping for one inbound message; every method no-ops when unconfigured. */
function pgSink(db: SupabaseClient<Database> | null, tenantId: string | null, ing: IngestResult | null) {
  const on = !!(db && tenantId && ing);
  return {
    on,
    processed: () =>
      on ? pgSafe("processed", () => markProcessed(db!, tenantId!, ing!.message_id)) : Promise.resolve(),
    allowlistSkip: () =>
      on
        ? pgSafe("allowlist_evt", () =>
            emitEvent(db!, tenantId!, "ingest.allowlist_skip", "ingest", "message", ing!.message_id))
        : Promise.resolve(),
    pause: (iso: string) =>
      on ? pgSafe("pause", () => pauseConversation(db!, tenantId!, ing!.conversation_id, iso)) : Promise.resolve(),
    outbound: (body: string, wamid: string | null) =>
      on
        ? pgSafe("outbound", () =>
            recordOutbound(db!, {
              tenantId: tenantId!, conversationId: ing!.conversation_id, contactId: ing!.contact_id,
              sender: "ai", body, externalId: wamid,
            }))
        : Promise.resolve(),
    usage: (u: { input_tokens: number; output_tokens: number }) =>
      on
        ? pgSafe("usage", () =>
            emitEvent(db!, tenantId!, "usage.llm_tokens", "usage", "conversation", ing!.conversation_id,
              u as unknown as Json))
        : Promise.resolve(),
    sendFailed: (httpStatus: number) =>
      on
        ? pgSafe("send_failed_evt", () =>
            emitEvent(db!, tenantId!, "message.send_failed", "message", "message", ing!.message_id,
              { http_status: httpStatus } as Json))
        : Promise.resolve(),
    escalate: (reason: string, details: string) =>
      on
        ? pgSafe("escalation", () =>
            upsertEscalation(db!, tenantId!, ing!.conversation_id, reason, details.slice(0, 400)))
        : Promise.resolve(),
    media: (n: NormalizedInbound) =>
      on && n.media
        ? pgSafe("media_fetch", async () => {
            const got = await fetchMediaBytes(waCfg(), n.media!.provider_media_id);
            const mediaOut = { ...n.media } as Record<string, unknown>;
            if (got) {
              const ext = MIME_EXT[got.mime || ""] || "bin";
              const path = `${tenantId}/${ing!.conversation_id}/${ing!.message_id}.${ext}`;
              const { error } = await db!.storage.from("media").upload(path, got.bytes, {
                contentType: got.mime || "application/octet-stream",
                upsert: true,
              });
              if (error) throw new Error(error.message);
              mediaOut.fetch_state = "stored";
              mediaOut.storage_path = path;
              mediaOut.mime_type = got.mime;
            } else {
              mediaOut.fetch_state = "failed";
            }
            await db!.from("messages").update({ media: mediaOut as Json })
              .eq("id", ing!.message_id).eq("tenant_id", tenantId!);
          })
        : Promise.resolve(),
  };
}

async function handleInbound(m: WaRawMessage, value: WaChangeValue, tenantId: string | null): Promise<void> {
  const from = m.from;
  const n = normalizeInbound(m, value);
  const db = pg();
  const t0 = Date.now();

  const allow = (process.env.WHATSAPP_TEST_ALLOWLIST || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allow.length && !allow.includes(from)) {
    // §4 delta (deliberate): allowlist gates the REPLY, not the persist.
    const ing = await pgIngest(tenantId, n);
    const sink = pgSink(db, tenantId, ing);
    await sink.allowlistSkip();
    await sink.processed();
    return;
  }

  // Persist first (P3/§4): the customer's message is never lost to a later
  // failure.
  //
  // Gate 1b (PG_READS=on): Postgres becomes the SOURCE of the bot's memory
  // instead of a write-only shadow of Blob. Flag-gated and reversible by an env
  // flip so the live salon line can be rolled back without a redeploy; Blob is
  // still written underneath, which is what makes that rollback safe.
  let ing: IngestResult | null;
  let thread: ThreadState;
  let memory: "pg" | "blob" = "blob";
  if (PG_READS) {
    ing = await pgIngest(tenantId, n);
    thread = await pgThread(db, tenantId, ing);
    memory = thread === PG_MISS ? "blob" : "pg";
    if (memory === "blob") thread = await getThread(from);
  } else {
    // The Blob read is side-effect-free, so it runs alongside the write.
    [ing, thread] = (await Promise.all([pgIngest(tenantId, n), getThread(from)])) as
      [IngestResult | null, ThreadState];
  }
  const ingestMs = Date.now() - t0;
  const sink = pgSink(db, tenantId, ing);

  // Atomic concurrent-redelivery gate. PG_READS implies it: Postgres-sourced
  // memory carries no `seen` list, so is_new IS the dedupe — and it is stronger
  // than the array was (a unique index two concurrent lambdas cannot both miss).
  // A missed auto-reply beats a double text, so processed-state is deliberately
  // not consulted.
  if ((process.env.PG_DEDUPE === "on" || memory === "pg") && ing && !ing.is_new) {
    console.log("wa_skip_pg_dupe", m.id);
    return;
  }

  if (m.type !== "text" || !m.text || !m.text.body) {
    // non-text (voice note, image, sticker): hand to a human rather than guess
    await sink.media(n);
    if (Date.now() > thread.pausedUntil) {
      await sendText(from, "Thanks for your message! A member of our team will take a look and reply here soon. For anything urgent, call us at (646) 932-5775.");
      thread.pausedUntil = Date.now() + PAUSE_MS;
      await saveThread(from, thread);
      await Promise.all([
        sink.pause(new Date(Date.now() + PAUSE_MS).toISOString()),
        sink.escalate("non_text", `Customer sent a ${m.type} message — auto-acknowledged, bot paused.`),
        alertStaff(from, `[${m.type} message]`, "(auto-acknowledged, bot paused)", "non-text message"),
      ]);
    }
    await sink.processed();
    return;
  }
  if (m.timestamp && Date.now() - Number(m.timestamp) * 1000 > STALE_MS) {
    console.log("wa_skip_stale", m.id);
    await sink.processed();
    return;
  }

  if (thread.seen.includes(m.id)) { console.log("wa_skip_dupe", m.id); return; }
  thread.seen.push(m.id);

  if (Date.now() < thread.pausedUntil) {
    thread.history.push({ role: "user", content: m.text.body });
    await saveThread(from, thread);
    console.log("wa_skip_paused", from);
    await sink.processed();
    return;
  }
  if (thread.replies.length >= MAX_REPLIES_PER_DAY) {
    await saveThread(from, thread);
    console.log("wa_skip_ratecap", from);
    await sink.processed();
    return;
  }

  let replyText: string;
  let escalate = false;
  let escalationReason = "human_token";
  let usage: { input_tokens: number; output_tokens: number } | undefined;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { generateReply } = await import("../lib/brain.js");
      const r = await generateReply(thread.history, m.text.body);
      replyText = r.text; escalate = r.escalate; usage = r.usage;
      if (r.reason) escalationReason = r.reason;
      // Layer-2 policy enforcement (Blueprint §6): prompt text is never the
      // only defense. A price in the draft blocks the send outright.
      if (violatesNoPrices(replyText)) {
        console.warn("policy_block_price", JSON.stringify({ to: from }));
        replyText = "Great question! Pricing is quoted at your consult based on length and texture — a member of our team will follow up here shortly. For anything urgent, call (646) 932-5775.";
        escalate = true;
        escalationReason = "policy_block";
      }
    } catch (e) {
      console.error("brain_failed", e instanceof Error ? e.message : e);
      replyText = "Thanks for reaching out to Melany's Beauty Salon! Book anytime: https://booksy.com/en-us/1817434_melany-s-beauty-salon_hair-salon_29902_brooklyn — or a member of our team will reply here soon.";
      escalate = true;
      escalationReason = "brain_error";
    }
  } else {
    replyText = "Hi! Thanks for reaching out to Melany's Beauty Salon 💛 We're newly renovated and booking now.\n\nBook anytime: https://booksy.com/en-us/1817434_melany-s-beauty-salon_hair-salon_29902_brooklyn\n\nOr reply here with any question — for a person, just ask for Melany.";
  }

  const sent = await sendText(from, replyText);
  const tSent = Date.now();
  if (sent.ok) {
    thread.history.push({ role: "user", content: m.text.body });
    thread.history.push({ role: "assistant", content: replyText });
    thread.replies.push(Date.now());
    const post: Promise<unknown>[] = [sink.outbound(replyText, sent.wamid)];
    if (usage) post.push(sink.usage(usage));
    if (escalate) {
      thread.pausedUntil = Date.now() + PAUSE_MS;
      post.push(sink.pause(new Date(Date.now() + PAUSE_MS).toISOString()));
      post.push(sink.escalate(escalationReason, m.text.body));
      post.push(alertStaff(from, m.text.body, replyText, "assistant flagged handoff"));
    }
    await Promise.all(post);
    await saveThread(from, thread);
    await sink.processed();
  } else {
    // The customer got NO reply and Meta already has its 200 — this must be
    // loud, and the message must stay visibly unprocessed for reconciliation.
    await saveThread(from, thread);
    await Promise.all([
      alertStaff(from, m.text.body, "(send failed — the customer received no reply)", "wa_send_failed"),
      sink.sendFailed(sent.status),
      sink.escalate("send_failed", `Auto-reply could not be delivered (HTTP ${sent.status}). Customer got no answer.`),
    ]);
  }
  console.log("wa_replied", JSON.stringify({
    to: from, escalate, sent: sent.ok, store: storeBackend(), memory,
    ingest_ms: ingestMs, post_ms: Date.now() - tSent,
  }));
}

export async function GET(request: Request): Promise<Response> {
  const q = new URL(request.url).searchParams;
  if (q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN) {
    return text(200, q.get("hub.challenge") || "");
  }
  return text(403, "verification failed");
}

export async function POST(request: Request): Promise<Response> {
  const raw = await request.text();

  // fail-closed: a missing secret is a config error, never a verification skip
  const secret = process.env.META_APP_SECRET;
  if (!secret) {
    console.error("wa_missing_app_secret");
    return json(401, { ok: false, error: "bad_signature" });
  }
  const sig = String(request.headers.get("x-hub-signature-256") || "");
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return json(401, { ok: false, error: "bad_signature" });
  }

  interface WebhookBody {
    entry?: Array<{ changes?: Array<{ field?: string; value?: WaChangeValue }> }>;
  }
  let body: WebhookBody = {};
  try { body = JSON.parse(raw) as WebhookBody; } catch { /* ack anyway */ }

  try {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const v = change.value || {};
        const field = change.field;
        // Multi-tenant routing key (Blueprint §3): phone_number_id -> tenant.
        let tenantId: string | null = null;
        const db = pg();
        const phoneNumberId = v.metadata?.phone_number_id;
        if (db && phoneNumberId) {
          const routed = await resolveChannel(db, "whatsapp", phoneNumberId);
          if (routed) tenantId = routed.tenantId;
          else {
            // A log line disappears; a metric built on messages_in would
            // undercount this traffic invisibly and forever. Persist it the
            // same way the voice path does, so a misconfigured or newly-added
            // phone_number_id is visible instead of silently dropped.
            console.error("wa_unroutable", phoneNumberId);
            await emitEvent(
              db, "00000000-0000-0000-0000-000000000000", "ingest.unroutable", "ingest", null, null,
              { channel: "whatsapp", phone_number_id: phoneNumberId } as Json,
            ).catch(() => {});
          }
        }
        if (field === "messages" && v.messages) {
          for (const m of v.messages) {
            console.log("wa_inbound", JSON.stringify({ from: m.from, type: m.type, id: m.id, text: m.text && m.text.body }));
            await handleInbound(m, v, tenantId);
          }
        } else if (field === "messages" && v.statuses) {
          await Promise.all((v.statuses ?? []).map(async (s) => {
            console.log("wa_status", JSON.stringify({ id: s.id, status: s.status, to: s.recipient_id, errors: s.errors }));
            if (db && tenantId && s.id && s.status && ["sent", "delivered", "read", "failed"].includes(s.status)) {
              await pgSafe("status", () =>
                recordStatusByExternalId(db, tenantId!, s.id!, s.status as "sent" | "delivered" | "read" | "failed",
                  s.errors ? ({ errors: s.errors } as unknown as Json) : undefined));
            }
          }));
        } else if (field === "smb_message_echoes") {
          // Melany (or staff) replied from the WhatsApp Business app -> pause the bot on that thread
          try {
            for (const echo of v.message_echoes || []) {
              const to = echo.to;
              if (to) {
                const t = await getThread(to);
                t.pausedUntil = Date.now() + PAUSE_MS;
                await saveThread(to, t);
                if (db && tenantId) {
                  await pgSafe("echo", () =>
                    recordEchoAndPause(db, {
                      tenantId, customerPhoneDigits: to,
                      body: echo.text?.body ?? null, externalId: echo.id ?? null,
                      pausedUntilIso: new Date(Date.now() + PAUSE_MS).toISOString(),
                    }));
                }
                console.log("wa_paused_by_echo", to);
              }
            }
          } catch (e) { console.error("echo_handling_error", e instanceof Error ? e.message : e); }
        } else if (field === "history") {
          console.log("wa_history_sync_batch");
        } else {
          console.log("wa_event", field);
        }
      }
    }
  } catch (e) {
    console.error("wa_webhook_error", e instanceof Error ? e.message : e);
  }
  return json(200, { ok: true });
}
