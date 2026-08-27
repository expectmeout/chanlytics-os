// src/schedule.ts
import { Client } from "@upstash/qstash";
var FIRE_URL = "https://chanlytics-messaging.vercel.app/api/jobs/fire";
async function scheduleJob(db, p) {
  const { data: job, error } = await db.from("jobs").insert({
    tenant_id: p.tenantId,
    kind: p.kind,
    due_at: p.dueAt.toISOString(),
    payload: p.payload
  }).select("id, cancel_token").single();
  if (error || !job) throw new Error(`schedule_job: ${error?.message}`);
  const qstash = new Client({ token: p.qstashToken });
  const res = await qstash.publishJSON({
    url: FIRE_URL,
    body: { job_id: job.id },
    notBefore: Math.ceil(p.dueAt.getTime() / 1e3),
    deduplicationId: job.id
  });
  await db.from("jobs").update({ qstash_id: res.messageId }).eq("id", job.id);
  return { jobId: job.id, cancelToken: job.cancel_token };
}
async function cancelJob(db, jobId, qstashToken) {
  const { data, error } = await db.from("jobs").update({ state: "canceled" }).eq("id", jobId).eq("state", "scheduled").select("qstash_id").maybeSingle();
  if (error || !data) return false;
  if (qstashToken && data.qstash_id) {
    try {
      await new Client({ token: qstashToken }).messages.delete(data.qstash_id);
    } catch {
    }
  }
  return true;
}
async function cancelJobsFor(db, tenantId, kind, payloadKey, payloadValue, qstashToken) {
  const { data } = await db.from("jobs").select("id").eq("tenant_id", tenantId).eq("kind", kind).eq("state", "scheduled").eq(`payload->>${payloadKey}`, payloadValue);
  let n = 0;
  for (const j of data ?? []) {
    if (await cancelJob(db, j.id, qstashToken)) n++;
  }
  return n;
}

// ../channels/dist/index.js
var WA_WINDOW_MS = 24 * 3600 * 1e3;
var GRAPH = "https://graph.facebook.com/v25.0";
async function sendText(cfg, to, body) {
  const r = await fetch(`${GRAPH}/${cfg.phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } })
  });
  const out = await r.json().catch(() => ({}));
  return {
    ok: r.ok,
    wamid: out.messages?.[0]?.id ?? null,
    status: r.status,
    errorBody: r.ok ? void 0 : JSON.stringify(out).slice(0, 200)
  };
}
async function sendTemplate(cfg, to, template) {
  const r = await fetch(`${GRAPH}/${cfg.phoneId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${cfg.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: template.name,
        language: { code: template.language },
        components: template.params.length ? [{ type: "body", parameters: template.params.map((t) => ({ type: "text", text: t })) }] : []
      }
    })
  });
  const out = await r.json().catch(() => ({}));
  return {
    ok: r.ok,
    wamid: out.messages?.[0]?.id ?? null,
    status: r.status,
    errorBody: r.ok ? void 0 : JSON.stringify(out).slice(0, 200)
  };
}

// src/handlers.ts
async function outboundSend(ctx, job) {
  const p = job.payload;
  const { data: msg } = await ctx.db.from("messages").select("id, status, body, template_name").eq("id", p.message_id).eq("tenant_id", job.tenant_id).single();
  if (!msg || msg.status !== "queued") return;
  const to = p.to_phone.replace(/^\+/, "");
  const sent = p.template ? await sendTemplate(ctx.waCfg, to, p.template) : await sendText(ctx.waCfg, to, p.body ?? msg.body ?? "");
  if (sent.ok) {
    await ctx.db.from("messages").update({ status: "sent", ...sent.wamid ? { external_id: sent.wamid } : {} }).eq("id", p.message_id);
    await ctx.db.from("conversations").update({ last_message_at: (/* @__PURE__ */ new Date()).toISOString() }).eq("id", p.conversation_id);
    await ctx.db.from("events").insert({
      tenant_id: job.tenant_id,
      kind: "message.sent",
      category: "message",
      subject_type: "message",
      subject_id: p.message_id,
      data: { sender: "human" }
    });
  } else {
    await ctx.db.from("messages").update({ status: "failed", error: { http_status: sent.status, body: sent.errorBody ?? null } }).eq("id", p.message_id);
    await ctx.db.from("events").insert({
      tenant_id: job.tenant_id,
      kind: "message.send_failed",
      category: "message",
      subject_type: "message",
      subject_id: p.message_id,
      data: { http_status: sent.status }
    });
    await upsertEscalation(
      ctx.db,
      job.tenant_id,
      p.conversation_id,
      "send_failed",
      `Dashboard reply could not be delivered (HTTP ${sent.status}).`
    );
    await ctx.alert(
      `Reply delivery failed: +${to}`,
      `A reply queued from the dashboard could not be sent (HTTP ${sent.status}). The thread is flagged in the Inbox.`
    );
  }
}
async function pauseExpire(ctx, job) {
  const p = job.payload;
  const { data: conv } = await ctx.db.from("conversations").select("id, state, paused_until").eq("id", p.conversation_id).single();
  if (!conv || conv.state !== "needs_human") return;
  if (conv.paused_until && new Date(conv.paused_until).getTime() > Date.now() + 1e3) return;
  await ctx.db.from("conversations").update({ state: "open", paused_until: null }).eq("id", p.conversation_id);
}
async function snoozeWake(ctx, job) {
  const p = job.payload;
  const { data: conv } = await ctx.db.from("conversations").select("id, state, snooze_until").eq("id", p.conversation_id).single();
  if (!conv || conv.state !== "snoozed") return;
  if (conv.snooze_until && new Date(conv.snooze_until).getTime() > Date.now() + 1e3) return;
  await ctx.db.from("conversations").update({ state: "open", snooze_until: null }).eq("id", p.conversation_id);
}
async function upsertEscalation(db, tenantId, conversationId, reason, details) {
  const { error } = await db.from("escalations").insert({
    tenant_id: tenantId,
    conversation_id: conversationId,
    reason,
    details
  });
  if (error?.code === "23505") {
    await db.from("escalations").update({ details, reason }).eq("conversation_id", conversationId).eq("state", "open");
  } else if (error) {
    console.error("escalation_upsert_failed", error.message);
  }
}
var HANDLERS = {
  outbound_send: outboundSend,
  pause_expire: pauseExpire,
  snooze_wake: snoozeWake
};
async function dispatchJob(ctx, job) {
  const handler = HANDLERS[job.kind];
  if (!handler) return "unknown_kind";
  await handler(ctx, job);
  return "done";
}
export {
  FIRE_URL,
  cancelJob,
  cancelJobsFor,
  dispatchJob,
  scheduleJob,
  upsertEscalation
};
