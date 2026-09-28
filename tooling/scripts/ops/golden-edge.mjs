/**
 * Golden verification suite for the frozen edge surface (Blueprint P7).
 * Runs against a DEPLOYED URL (preview or prod) — never against local source.
 *
 * Env: BASE_URL (required), META_APP_SECRET, WHATSAPP_VERIFY_TOKEN,
 *      RETELL_FN_SECRET, DIAG_KEY, BYPASS (optional x-vercel-protection-bypass),
 *      PROD=1 to skip preview-only assertions.
 *
 * Exit 0 = all pass. Non-zero = failures listed.
 */
import crypto from "node:crypto";

const BASE = process.env.BASE_URL;
if (!BASE) {
  console.error("BASE_URL required");
  process.exit(2);
}
const SECRET = process.env.META_APP_SECRET || "";
const VERIFY = process.env.WHATSAPP_VERIFY_TOKEN || "";
const FN = process.env.RETELL_FN_SECRET || "";
const DIAG = process.env.DIAG_KEY || "";
const BYPASS = process.env.BYPASS || "";

const extra = BYPASS ? { "x-vercel-protection-bypass": BYPASS } : {};
let pass = 0,
  fail = 0;
const failures = [];

function sign(body) {
  return "sha256=" + crypto.createHmac("sha256", SECRET).update(body).digest("hex");
}

async function check(name, fn) {
  try {
    await fn();
    pass++;
    console.log(`  ok  ${name}`);
  } catch (e) {
    fail++;
    failures.push(`${name}: ${e.message}`);
    console.error(` FAIL ${name}: ${e.message}`);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const get = (path, headers = {}) => fetch(BASE + path, { headers: { ...extra, ...headers } });
const post = (path, body, headers = {}) =>
  fetch(BASE + path, { method: "POST", body, headers: { "content-type": "application/json", ...extra, ...headers } });

// --- public pages (part of the frozen surface: referenced in Meta App Review) ---
await check("GET / is 200 and mentions Chanlytics", async () => {
  const r = await get("/");
  assert(r.status === 200, `status ${r.status}`);
  const t = await r.text();
  assert(/chanlytics/i.test(t), "body missing brand");
});
await check("GET /privacy.html is 200 and is a privacy policy", async () => {
  const r = await get("/privacy.html");
  assert(r.status === 200, `status ${r.status}`);
  const t = await r.text();
  assert(/privacy/i.test(t), "body missing 'privacy'");
});

// --- WhatsApp webhook: Meta handshake ---
await check("GET /api/whatsapp handshake echoes challenge", async () => {
  const r = await get(
    `/api/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(VERIFY)}&hub.challenge=golden12345`,
  );
  assert(r.status === 200, `status ${r.status}`);
  assert((await r.text()) === "golden12345", "challenge not echoed verbatim");
});
await check("GET /api/whatsapp wrong token is 403", async () => {
  const r = await get("/api/whatsapp?hub.mode=subscribe&hub.verify_token=WRONG&hub.challenge=x");
  assert(r.status === 403, `status ${r.status}`);
});

// --- WhatsApp webhook: POST signature verification over exact raw bytes ---
await check("POST /api/whatsapp unsigned is 401", async () => {
  const r = await post("/api/whatsapp", JSON.stringify({ entry: [] }));
  assert(r.status === 401, `status ${r.status}`);
});
await check("POST /api/whatsapp bad signature is 401", async () => {
  const body = JSON.stringify({ entry: [] });
  const r = await post("/api/whatsapp", body, { "x-hub-signature-256": "sha256=" + "0".repeat(64) });
  assert(r.status === 401, `status ${r.status}`);
});
await check("POST /api/whatsapp signed status payload is 200 ok", async () => {
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "0",
        changes: [
          {
            field: "messages",
            value: { statuses: [{ id: "wamid.golden", status: "delivered", recipient_id: "15550001111" }] },
          },
        ],
      },
    ],
  });
  const r = await post("/api/whatsapp", body, { "x-hub-signature-256": sign(body) });
  assert(r.status === 200, `status ${r.status}`);
  assert((await r.json()).ok === true, "body not ok:true");
});
await check("POST /api/whatsapp signed text from non-allowlisted number is 200 (dropped)", async () => {
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        id: "0",
        changes: [
          {
            field: "messages",
            value: {
              messages: [
                {
                  from: "15550001111",
                  id: "wamid.golden2",
                  type: "text",
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  text: { body: "golden probe - ignore" },
                },
              ],
            },
          },
        ],
      },
    ],
  });
  const r = await post("/api/whatsapp", body, { "x-hub-signature-256": sign(body) });
  assert(r.status === 200, `status ${r.status}`);
});
await check("POST /api/whatsapp escaped-unicode payload verifies (raw-byte HMAC)", async () => {
  // literal \uXXXX escapes + multibyte chars: the classic re-serialization breaker
  const body =
    '{"object":"whatsapp_business_account","entry":[{"id":"0","changes":[{"field":"messages","value":{"messages":[{"from":"15550001111","id":"wamid.golden3","type":"text","timestamp":"' +
    Math.floor(Date.now() / 1000) +
    '","text":{"body":"hol\\u00e9 \\ud83d\\udc9b café"}}]}}]}]}';
  const r = await post("/api/whatsapp", body, { "x-hub-signature-256": sign(body) });
  assert(r.status === 200, `status ${r.status}`);
});

// --- Retell endpoints ---
await check("POST /api/retell-webhook unauthorized is 401", async () => {
  const r = await post("/api/retell-webhook", JSON.stringify({ event: "call_started", call: { call_id: "golden" } }));
  assert(r.status === 401, `status ${r.status}`);
});
await check("POST /api/retell-webhook with key, call_started is 200", async () => {
  const r = await post(
    `/api/retell-webhook?key=${encodeURIComponent(FN)}`,
    JSON.stringify({ event: "call_started", call: { call_id: "golden" } }),
  );
  assert(r.status === 200, `status ${r.status}`);
});
await check("POST /api/retell-inbound with key returns caller_context", async () => {
  const r = await post(
    `/api/retell-inbound?key=${encodeURIComponent(FN)}`,
    JSON.stringify({ call_inbound: { from_number: "+15550001111" } }),
  );
  assert(r.status === 200, `status ${r.status}`);
  const j = await r.json();
  assert(typeof j.call_inbound?.dynamic_variables?.caller_context === "string", "missing caller_context");
});
await check("POST /api/retell-fn bad secret is 401", async () => {
  const r = await post("/api/retell-fn", JSON.stringify({}), { "x-fn-secret": "WRONG" });
  assert(r.status === 401, `status ${r.status}`);
});
await check("POST /api/retell-fn short number gets graceful spoken fallback", async () => {
  const r = await post(
    "/api/retell-fn",
    JSON.stringify({ call: { call_id: "golden" }, args: { phone_number: "123" } }),
    { "x-fn-secret": FN },
  );
  assert(r.status === 200, `status ${r.status}`);
  const j = await r.json();
  assert(/whatsapp/i.test(j.result || ""), "fallback string missing");
});

// --- diag ---
if (DIAG) {
  await check("GET /api/diag with x-diag-key reports the memory + env", async () => {
    const r = await get("/api/diag", { "x-diag-key": DIAG });
    assert(r.status === 200, `status ${r.status}`);
    const j = await r.json();
    assert(j.memory === "postgres" && j.env, "diag shape wrong");
    console.log(
      `      diag: memory=${j.memory} env=${JSON.stringify(j.env)} waTokenCheck=${JSON.stringify(j.waTokenCheck)}`,
    );
  });
}
await check("GET /api/diag wrong key is 403", async () => {
  const r = await get("/api/diag?key=WRONG");
  assert(r.status === 403, `status ${r.status}`);
});

// --- Slice 1 ingest probes (INGEST=1): routed to the smoke-test tenant, ---
// --- asserted directly in Postgres. Needs SUPABASE_URL + service key.    ---
if (process.env.INGEST === "1" && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const tag = process.env.RUN_TAG || String(Date.now());
  const wamid = `wamid.golden.ingest.${tag}`;
  const fromDigits = "15550001111";
  const msgPayload = (id) =>
    JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "0",
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "TEST-PHONE-ID" },
                contacts: [{ wa_id: fromDigits, profile: { name: "Golden Probe" } }],
                messages: [
                  {
                    from: fromDigits,
                    id,
                    type: "text",
                    timestamp: String(Math.floor(Date.now() / 1000)),
                    text: { body: "golden ingest probe — ignore" },
                  },
                ],
              },
            },
          ],
        },
      ],
    });

  await check("INGEST: signed message routed to smoke tenant is 200", async () => {
    const body = msgPayload(wamid);
    const r = await post("/api/whatsapp", body, { "x-hub-signature-256": sign(body) });
    assert(r.status === 200, `status ${r.status}`);
  });
  await check("INGEST: message row persisted, processed, allowlist-skipped", async () => {
    const { data: msg } = await db
      .from("messages")
      .select("id, tenant_id, body, meta, conversation_id, contact_id")
      .eq("external_id", wamid)
      .maybeSingle();
    assert(msg, "message row missing");
    assert(msg.body === "golden ingest probe — ignore", "body mismatch");
    assert(msg.meta && msg.meta.processed_at, "processed_at not stamped");
    const { data: evt } = await db
      .from("events")
      .select("id")
      .eq("kind", "ingest.allowlist_skip")
      .eq("subject_id", msg.id)
      .maybeSingle();
    assert(evt, "allowlist_skip event missing");
    const { data: contact } = await db
      .from("contacts")
      .select("wa_profile_name, phone_e164")
      .eq("id", msg.contact_id)
      .single();
    assert(contact.wa_profile_name === "Golden Probe", "profile name not captured");
    assert(contact.phone_e164 === "+15550001111", `phone ${contact.phone_e164}`);
    const { data: conv } = await db
      .from("conversations")
      .select("last_wa_inbound_at")
      .eq("id", msg.conversation_id)
      .single();
    assert(conv.last_wa_inbound_at, "last_wa_inbound_at not set");
  });
  await check("INGEST: replayed payload dedupes to one row", async () => {
    const body = msgPayload(wamid);
    const r = await post("/api/whatsapp", body, { "x-hub-signature-256": sign(body) });
    assert(r.status === 200, `status ${r.status}`);
    const { count } = await db.from("messages").select("id", { count: "exact", head: true }).eq("external_id", wamid);
    assert(count === 1, `expected 1 row, got ${count}`);
  });
  await check("INGEST: delivery status updates by wamid (monotone)", async () => {
    const body = JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "0",
          changes: [
            {
              field: "messages",
              value: {
                metadata: { phone_number_id: "TEST-PHONE-ID" },
                statuses: [{ id: wamid, status: "delivered", recipient_id: fromDigits }],
              },
            },
          ],
        },
      ],
    });
    const r = await post("/api/whatsapp", body, { "x-hub-signature-256": sign(body) });
    assert(r.status === 200, `status ${r.status}`);
    const { data: msg } = await db
      .from("messages")
      .select("status, status_updated_at")
      .eq("external_id", wamid)
      .single();
    assert(msg.status === "delivered", `status ${msg.status}`);
    assert(msg.status_updated_at, "status_updated_at not stamped");
  });
}

console.log(`\n${pass} passed, ${fail} failed${fail ? ":\n  " + failures.join("\n  ") : ""}`);
process.exit(fail ? 1 : 0);
