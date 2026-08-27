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
 * Env: WHATSAPP_VERIFY_TOKEN, META_APP_SECRET, WHATSAPP_ACCESS_TOKEN,
 *      WHATSAPP_PHONE_ID, WHATSAPP_TEST_ALLOWLIST (optional, comma list),
 *      ANTHROPIC_API_KEY (brain; fixed fallback reply without it),
 *      RESEND_API_KEY + LEAD_TO/LEAD_FROM (escalation alerts),
 *      BLOB_READ_WRITE_TOKEN (optional durable state).
 */
import crypto from "node:crypto";
import { getThread, saveThread, storeBackend } from "../lib/store.js";
import { json, text } from "../lib/http.js";

export const config = { maxDuration: 60 };

const PAUSE_MS = 24 * 3600 * 1000;   // human echo pauses the bot for 24h
const MAX_REPLIES_PER_DAY = 20;      // per thread
const STALE_MS = 10 * 60 * 1000;     // ignore messages older than 10 min (webhook replays)

interface WaMessage {
  from: string;
  id: string;
  type: string;
  timestamp?: string;
  text?: { body?: string };
}

async function sendText(to: string, body: string): Promise<boolean> {
  const r = await fetch(`https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
  });
  const out = (await r.json().catch(() => ({}))) as { messages?: Array<{ id?: string }> };
  if (!r.ok) console.error("wa_send_failed", r.status, JSON.stringify(out).slice(0, 200));
  else console.log("wa_sent", JSON.stringify({ to, wamid: out.messages?.[0]?.id || null }));
  return r.ok;
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

async function handleInbound(m: WaMessage): Promise<void> {
  const from = m.from;
  const allow = (process.env.WHATSAPP_TEST_ALLOWLIST || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (allow.length && !allow.includes(from)) return;
  if (m.type !== "text" || !m.text || !m.text.body) {
    // non-text (voice note, image, sticker): hand to a human rather than guess
    const t = await getThread(from);
    if (Date.now() > t.pausedUntil) {
      await sendText(from, "Thanks for your message! A member of our team will take a look and reply here soon. For anything urgent, call us at (646) 932-5775.");
      t.pausedUntil = Date.now() + PAUSE_MS;
      await saveThread(from, t);
      await alertStaff(from, `[${m.type} message]`, "(auto-acknowledged, bot paused)", "non-text message");
    }
    return;
  }
  if (m.timestamp && Date.now() - Number(m.timestamp) * 1000 > STALE_MS) {
    console.log("wa_skip_stale", m.id);
    return;
  }

  const thread = await getThread(from);
  if (thread.seen.includes(m.id)) { console.log("wa_skip_dupe", m.id); return; }
  thread.seen.push(m.id);

  if (Date.now() < thread.pausedUntil) {
    thread.history.push({ role: "user", content: m.text.body });
    await saveThread(from, thread);
    console.log("wa_skip_paused", from);
    return;
  }
  if (thread.replies.length >= MAX_REPLIES_PER_DAY) {
    await saveThread(from, thread);
    console.log("wa_skip_ratecap", from);
    return;
  }

  let replyText: string;
  let escalate = false;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { generateReply } = await import("../lib/brain.js");
      ({ text: replyText, escalate } = await generateReply(thread.history, m.text.body));
    } catch (e) {
      console.error("brain_failed", e instanceof Error ? e.message : e);
      replyText = "Thanks for reaching out to Melany's Beauty Salon! Book anytime: https://booksy.com/en-us/1817434_melany-s-beauty-salon_hair-salon_29902_brooklyn — or a member of our team will reply here soon.";
      escalate = true;
    }
  } else {
    replyText = "Hi! Thanks for reaching out to Melany's Beauty Salon 💛 We're newly renovated and booking now.\n\nBook anytime: https://booksy.com/en-us/1817434_melany-s-beauty-salon_hair-salon_29902_brooklyn\n\nOr reply here with any question — for a person, just ask for Melany.";
  }

  const ok = await sendText(from, replyText);
  if (ok) {
    thread.history.push({ role: "user", content: m.text.body });
    thread.history.push({ role: "assistant", content: replyText });
    thread.replies.push(Date.now());
    if (escalate) {
      thread.pausedUntil = Date.now() + PAUSE_MS;
      await alertStaff(from, m.text.body, replyText, "assistant flagged handoff");
    }
  }
  await saveThread(from, thread);
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
    entry?: Array<{
      changes?: Array<{
        field?: string;
        value?: {
          messages?: WaMessage[];
          statuses?: Array<{ id?: string; status?: string; recipient_id?: string; errors?: unknown }>;
          message_echoes?: Array<{ to?: string }>;
        };
      }>;
    }>;
  }
  let body: WebhookBody = {};
  try { body = JSON.parse(raw) as WebhookBody; } catch { /* ack anyway */ }

  try {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const v = change.value || {};
        const field = change.field;
        if (field === "messages" && v.messages) {
          for (const m of v.messages) {
            console.log("wa_inbound", JSON.stringify({ from: m.from, type: m.type, id: m.id, text: m.text && m.text.body }));
            await handleInbound(m);
          }
        } else if (field === "messages" && v.statuses) {
          for (const s of v.statuses) {
            console.log("wa_status", JSON.stringify({ id: s.id, status: s.status, to: s.recipient_id, errors: s.errors }));
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
