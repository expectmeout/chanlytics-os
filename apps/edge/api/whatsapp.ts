/**
 * Chanlytics Messaging — WhatsApp Cloud API webhook (app: Chanlytics AI).
 * GET = Meta verification handshake. POST = signature-validated event receiver.
 *
 * Production engine: inbound message -> guardrailed Claude brain -> reply,
 * with per-thread dedupe, history, human-pause (coexistence echoes), rate caps,
 * staleness guard, and escalation alerts via Resend.
 *
 * Contract (frozen during Meta App Review): process-then-200 in-invocation
 * under maxDuration 60; Meta retries + dedupe make replays safe.
 *
 * Slice 1 dual-write (PG_WRITES=on): every event ALSO persists to Postgres —
 * contacts/identities/conversations/messages/events via ingest_inbound (the
 * atomic gate), delivery statuses by wamid, owner echoes, media fetched to
 * Storage at ingest (Meta URLs die in minutes). Blob remains the read source
 * (READ_SOURCE flips at Gate 1b); PG failures log and never break handling.
 *
 * Env: WHATSAPP_VERIFY_TOKEN, META_APP_SECRET, WHATSAPP_ACCESS_TOKEN,
 *      WHATSAPP_PHONE_ID, WHATSAPP_TEST_ALLOWLIST (optional, comma list),
 *      ANTHROPIC_API_KEY, RESEND_API_KEY + LEAD_TO/LEAD_FROM,
 *      BLOB_READ_WRITE_TOKEN, PG_WRITES + SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import crypto from "node:crypto";
import { getThread, saveThread, storeBackend } from "../lib/store.js";
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
  type IngestResult,
} from "../lib/workspace/db.js";

export const config = { maxDuration: 60 };

const PAUSE_MS = 24 * 3600 * 1000;   // human echo pauses the bot for 24h
const MAX_REPLIES_PER_DAY = 20;      // per thread
const STALE_MS = 10 * 60 * 1000;     // ignore messages older than 10 min (webhook replays)

function waCfg() {
  return { phoneId: process.env.WHATSAPP_PHONE_ID || "", accessToken: process.env.WHATSAPP_ACCESS_TOKEN || "" };
}

async function sendText(to: string, body: string): Promise<{ ok: boolean; wamid: string | null }> {
  const r = await waSendText(waCfg(), to, body);
  if (!r.ok) console.error("wa_send_failed", r.status, r.errorBody);
  else console.log("wa_sent", JSON.stringify({ to, wamid: r.wamid }));
  return { ok: r.ok, wamid: r.wamid };
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
      media: n.media ? (n.media as unknown as import("../lib/workspace/db.js").Json) : null,
      meta: { raw_type: n.rawType } as import("../lib/workspace/db.js").Json,
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

/** Fetch expiring Meta media into Storage; update the message's media state. */
async function pgFetchMedia(tenantId: string, ing: IngestResult, n: NormalizedInbound): Promise<void> {
  const db = pg();
  if (!db || !n.media) return;
  try {
    const got = await fetchMediaBytes(waCfg(), n.media.provider_media_id);
    const mediaOut = { ...n.media } as Record<string, unknown>;
    if (got) {
      const ext = MIME_EXT[got.mime || ""] || "bin";
      const path = `${tenantId}/${ing.conversation_id}/${ing.message_id}.${ext}`;
      const { error } = await db.storage.from("media").upload(path, got.bytes, {
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
    await db.from("messages").update({ media: mediaOut as import("../lib/workspace/db.js").Json }).eq("id", ing.message_id).eq("tenant_id", tenantId);
  } catch (e) {
    console.error("pg_media_fetch_failed", e instanceof Error ? e.message : e);
  }
}

async function handleInbound(m: WaRawMessage, value: WaChangeValue, tenantId: string | null): Promise<void> {
  const from = m.from;
  const n = normalizeInbound(m, value);
  // Persist first (P3/§4): the customer's message is never lost to a later failure.
  const ing = await pgIngest(tenantId, n);
  const db = pg();

  const allow = (process.env.WHATSAPP_TEST_ALLOWLIST || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allow.length && !allow.includes(from)) {
    // §4 delta (deliberate): allowlist gates the REPLY, not the persist.
    if (db && tenantId && ing) {
      await pgSafe("allowlist_evt", () =>
        emitEvent(db, tenantId, "ingest.allowlist_skip", "ingest", "message", ing.message_id));
      await pgSafe("processed", () => markProcessed(db, tenantId, ing.message_id));
    }
    return;
  }
  if (m.type !== "text" || !m.text || !m.text.body) {
    // non-text (voice note, image, sticker): hand to a human rather than guess
    if (db && tenantId && ing) await pgFetchMedia(tenantId, ing, n);
    const t = await getThread(from);
    if (Date.now() > t.pausedUntil) {
      await sendText(from, "Thanks for your message! A member of our team will take a look and reply here soon. For anything urgent, call us at (646) 932-5775.");
      t.pausedUntil = Date.now() + PAUSE_MS;
      await saveThread(from, t);
      if (db && tenantId && ing) {
        await pgSafe("pause", () =>
          pauseConversation(db, tenantId, ing.conversation_id, new Date(Date.now() + PAUSE_MS).toISOString()));
      }
      await alertStaff(from, `[${m.type} message]`, "(auto-acknowledged, bot paused)", "non-text message");
    }
    if (db && tenantId && ing) await pgSafe("processed", () => markProcessed(db, tenantId, ing.message_id));
    return;
  }
  if (m.timestamp && Date.now() - Number(m.timestamp) * 1000 > STALE_MS) {
    console.log("wa_skip_stale", m.id);
    if (db && tenantId && ing) await pgSafe("processed", () => markProcessed(db, tenantId, ing.message_id));
    return;
  }

  const thread = await getThread(from);
  if (thread.seen.includes(m.id)) { console.log("wa_skip_dupe", m.id); return; }
  thread.seen.push(m.id);

  if (Date.now() < thread.pausedUntil) {
    thread.history.push({ role: "user", content: m.text.body });
    await saveThread(from, thread);
    console.log("wa_skip_paused", from);
    if (db && tenantId && ing) await pgSafe("processed", () => markProcessed(db, tenantId, ing.message_id));
    return;
  }
  if (thread.replies.length >= MAX_REPLIES_PER_DAY) {
    await saveThread(from, thread);
    console.log("wa_skip_ratecap", from);
    if (db && tenantId && ing) await pgSafe("processed", () => markProcessed(db, tenantId, ing.message_id));
    return;
  }

  let replyText: string;
  let escalate = false;
  let usage: { input_tokens: number; output_tokens: number } | undefined;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { generateReply } = await import("../lib/brain.js");
      const r = await generateReply(thread.history, m.text.body);
      replyText = r.text; escalate = r.escalate; usage = r.usage;
    } catch (e) {
      console.error("brain_failed", e instanceof Error ? e.message : e);
      replyText = "Thanks for reaching out to Melany's Beauty Salon! Book anytime: https://booksy.com/en-us/1817434_melany-s-beauty-salon_hair-salon_29902_brooklyn — or a member of our team will reply here soon.";
      escalate = true;
    }
  } else {
    replyText = "Hi! Thanks for reaching out to Melany's Beauty Salon 💛 We're newly renovated and booking now.\n\nBook anytime: https://booksy.com/en-us/1817434_melany-s-beauty-salon_hair-salon_29902_brooklyn\n\nOr reply here with any question — for a person, just ask for Melany.";
  }

  const sent = await sendText(from, replyText);
  if (sent.ok) {
    thread.history.push({ role: "user", content: m.text.body });
    thread.history.push({ role: "assistant", content: replyText });
    thread.replies.push(Date.now());
    if (db && tenantId && ing) {
      await pgSafe("outbound", () =>
        recordOutbound(db, {
          tenantId, conversationId: ing.conversation_id, contactId: ing.contact_id,
          sender: "ai", body: replyText, externalId: sent.wamid,
        }));
      if (usage) {
        await pgSafe("usage", () =>
          emitEvent(db, tenantId, "usage.llm_tokens", "usage", "conversation", ing.conversation_id, usage as unknown as import("../lib/workspace/db.js").Json));
      }
    }
    if (escalate) {
      thread.pausedUntil = Date.now() + PAUSE_MS;
      if (db && tenantId && ing) {
        await pgSafe("pause", () =>
          pauseConversation(db, tenantId, ing.conversation_id, new Date(Date.now() + PAUSE_MS).toISOString()));
      }
      await alertStaff(from, m.text.body, replyText, "assistant flagged handoff");
    }
  }
  await saveThread(from, thread);
  if (db && tenantId && ing) await pgSafe("processed", () => markProcessed(db, tenantId, ing.message_id));
  console.log("wa_replied", JSON.stringify({ to: from, escalate, store: storeBackend() }));
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
          else console.error("wa_unroutable", phoneNumberId);
        }
        if (field === "messages" && v.messages) {
          for (const m of v.messages) {
            console.log("wa_inbound", JSON.stringify({ from: m.from, type: m.type, id: m.id, text: m.text && m.text.body }));
            await handleInbound(m, v, tenantId);
          }
        } else if (field === "messages" && v.statuses) {
          for (const s of v.statuses) {
            console.log("wa_status", JSON.stringify({ id: s.id, status: s.status, to: s.recipient_id, errors: s.errors }));
            if (db && tenantId && s.id && s.status && ["sent", "delivered", "read", "failed"].includes(s.status)) {
              await pgSafe("status", () =>
                recordStatusByExternalId(db, tenantId!, s.id!, s.status as "sent" | "delivered" | "read" | "failed",
                  s.errors ? ({ errors: s.errors } as unknown as import("../lib/workspace/db.js").Json) : undefined));
            }
          }
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
