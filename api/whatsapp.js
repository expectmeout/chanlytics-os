/**
 * Chanlytics Messaging — WhatsApp Cloud API webhook (app: Chanlytics AI).
 * GET = Meta verification handshake. POST = signature-validated event receiver.
 *
 * Production engine: inbound message -> guardrailed Claude brain -> reply,
 * with per-thread dedupe, history, human-pause (coexistence echoes), rate caps,
 * staleness guard, and escalation alerts via Resend.
 *
 * Env: WHATSAPP_VERIFY_TOKEN, META_APP_SECRET, WHATSAPP_ACCESS_TOKEN,
 *      WHATSAPP_PHONE_ID, WHATSAPP_TEST_ALLOWLIST (optional, comma list),
 *      ANTHROPIC_API_KEY (brain; fixed fallback reply without it),
 *      RESEND_API_KEY + LEAD_TO/LEAD_FROM (escalation alerts),
 *      BLOB_READ_WRITE_TOKEN (optional durable state).
 */
import crypto from "node:crypto";
import { getThread, saveThread, storeBackend } from "../lib/store.js";

export const config = { api: { bodyParser: false } };

const PAUSE_MS = 24 * 3600 * 1000;   // human echo pauses the bot for 24h
const MAX_REPLIES_PER_DAY = 20;      // per thread
const STALE_MS = 10 * 60 * 1000;     // ignore messages older than 10 min (webhook replays)

function readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function sendText(to, body) {
  const r = await fetch(`https://graph.facebook.com/v25.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
  });
  const out = await r.json().catch(() => ({}));
  if (!r.ok) console.error("wa_send_failed", r.status, JSON.stringify(out).slice(0, 200));
  return r.ok;
}

async function alertStaff(threadId, userText, botText, reason) {
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
    console.error("alert_failed", e && e.message);
  }
}

async function handleInbound(m) {
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

  let text, escalate = false;
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      const { generateReply } = await import("../lib/brain.js");
      ({ text, escalate } = await generateReply(thread.history, m.text.body));
    } catch (e) {
      console.error("brain_failed", e && e.message);
      text = "Thanks for reaching out to Melany's Beauty Salon! Book anytime: https://booksy.com/en-us/1817434_melany-s-beauty-salon_hair-salon_29902_brooklyn — or a member of our team will reply here soon.";
      escalate = true;
    }
  } else {
    text = "Hi! Thanks for reaching out to Melany's Beauty Salon 💛 We're newly renovated and booking now.\n\nBook anytime: https://booksy.com/en-us/1817434_melany-s-beauty-salon_hair-salon_29902_brooklyn\n\nOr reply here with any question — for a person, just ask for Melany.";
  }

  const ok = await sendText(from, text);
  if (ok) {
    thread.history.push({ role: "user", content: m.text.body });
    thread.history.push({ role: "assistant", content: text });
    thread.replies.push(Date.now());
    if (escalate) {
      thread.pausedUntil = Date.now() + PAUSE_MS;
      await alertStaff(from, m.text.body, text, "assistant flagged handoff");
    }
  }
  await saveThread(from, thread);
  console.log("wa_replied", JSON.stringify({ to: from, escalate, store: storeBackend() }));
}

export default async function handler(req, res) {
  if (req.method === "GET") {
    const q = req.query || {};
    if (q["hub.mode"] === "subscribe" && q["hub.verify_token"] === process.env.WHATSAPP_VERIFY_TOKEN) {
      return res.status(200).send(q["hub.challenge"]);
    }
    return res.status(403).send("verification failed");
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "GET, POST");
    return res.status(405).json({ ok: false });
  }

  const raw = await readRaw(req);

  const secret = process.env.META_APP_SECRET;
  if (secret) {
    const sig = String(req.headers["x-hub-signature-256"] || "");
    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ ok: false, error: "bad_signature" });
    }
  }

  let body = {};
  try { body = JSON.parse(raw.toString("utf-8")); } catch { /* ack anyway */ }

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
          } catch (e) { console.error("echo_handling_error", e && e.message); }
        } else if (field === "history") {
          console.log("wa_history_sync_batch");
        } else {
          console.log("wa_event", field);
        }
      }
    }
  } catch (e) {
    console.error("wa_webhook_error", e && e.message);
  }
  return res.status(200).json({ ok: true });
}
