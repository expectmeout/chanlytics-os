/**
 * A hold reaches its notice through its event (decision 0043, 00396), on a real Postgres: a hold opened through the one
 * door (escalation_open, 00388) is owed to the owner_notice subscriber by the relay, in lane 0; the subscriber, run on its
 * real ports, reads the hold, the person and their words from the rows and tells the workspace once; a second run tells
 * nobody, and the bell refuses a second notice for one event. Runs against the database `supabase start` builds on this
 * machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes customers and notices"
      : false;

let db;
let T;
let SUBSCRIBERS;
let holdFactsOf;
let holdTold;
const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  ({ SUBSCRIBERS } = await import(pathToFileURL(path.join(ROOT, "packages/core/src/subscribers.ts")).href));
  ({ holdFactsOf, holdTold } = await import(
    pathToFileURL(path.join(ROOT, "packages/db/src/repositories/notifications.ts")).href
  ));
  T = ok(
    await db
      .from("tenants")
      .insert({ slug: `hold-notice-${Date.now().toString(36)}`, name: "Hold Notice" })
      .select("id")
      .single(),
    "workspace",
  ).id;
});

after(async () => {
  if (skip || !T) return;
  await db.from("events").delete().eq("tenant_id", T);
  await db.from("tenants").delete().eq("id", T);
});

test("a hold opened through its door is owed to owner_notice, and told once from its rows", { skip }, async () => {
  const person = ok(
    await db
      .from("contacts")
      .insert({ tenant_id: T, phone_e164: "+13055550177", display_name: "Rosa Diaz" })
      .select("id")
      .single(),
    "person",
  ).id;
  const conversation = ok(
    await db.from("conversations").insert({ tenant_id: T, contact_id: person }).select("id").single(),
    "thread",
  ).id;
  ok(
    await db.from("messages").insert({
      tenant_id: T,
      conversation_id: conversation,
      contact_id: person,
      channel: "sms",
      direction: "inbound",
      sender: "customer",
      status: "received",
      type: "text",
      body: "Can I move my visit to Friday?",
    }),
    "their words",
  );
  assert.equal(
    ok(
      await db.rpc("escalation_open", {
        p_tenant_id: T,
        p_conversation_id: conversation,
        p_reason: "rate_cap",
        p_details: "Thread hit 20 automatic replies today — the receptionist stopped and is waiting for a human.",
      }),
      "the hold",
    ),
    "opened",
  );
  const event = ok(
    await db
      .from("events")
      .select(
        "id, tenant_id, kind, subject_type, subject_id, data, created_at, version, aggregate_version, causation_id",
      )
      .eq("tenant_id", T)
      .eq("kind", "escalation.opened")
      .single(),
    "its event",
  );
  const subscribed = ok(
    await db.from("event_subscriptions").select("subscriber, lane, paused").eq("kind", "escalation.opened"),
    "subscriptions",
  );
  assert.ok(
    subscribed.some((s) => s.subscriber === "owner_notice" && s.lane === 0 && !s.paused),
    "owner_notice takes escalation.opened in lane 0",
  );
  // Owed to the subscriber: on the outbox, or already relayed to a delivery of its own. The outbox is read first, so a
  // relay tick between the two reads finds it in both, never in neither.
  const outbox = ok(await db.from("event_outbox").select("event_id").eq("event_id", event.id), "outbox");
  const delivered = ok(
    await db.from("event_deliveries").select("subscriber").eq("event_id", event.id).eq("subscriber", "owner_notice"),
    "deliveries",
  );
  assert.ok(outbox.length + delivered.length >= 1, "the event waits for the relay, or is the subscriber's");
  assert.ok(delivered.length <= 1, "and is the subscriber's once");

  const told = [];
  const ports = {
    bookedFromAppointment: async () => 0,
    holdFacts: (tenantId, ref) => holdFactsOf(db, tenantId, ref, Date.now()),
    holdTold: (tenantId, p) => holdTold(db, { tenantId, ...p }),
    tell: async (news) => {
      told.push(news);
      ok(
        await db.from("notifications").insert({
          tenant_id: T,
          kind: news.kind,
          title: news.subject,
          body: news.body,
          route: news.route,
          subject_type: news.about?.type ?? null,
          subject_id: news.about?.id ?? null,
          source_event: news.sourceEvent,
        }),
        "the bell",
      );
    },
  };
  await SUBSCRIBERS.owner_notice(event, ports);
  assert.equal(told.length, 1);
  assert.equal(told[0].subject, "Rosa Diaz needs a person — the receptionist reached its daily limit");
  assert.match(told[0].body, /^They wrote: “Can I move my visit to Friday\?”\nThread hit 20 automatic replies today/);
  assert.match(told[0].body, /Text conversation · \+1 \(305\) 555-0177/);
  await SUBSCRIBERS.owner_notice(event, ports);
  assert.equal(told.length, 1, "a second run tells nobody");
  const twin = await db.from("notifications").insert({
    tenant_id: T,
    kind: "handoff",
    title: "twin",
    body: "twin",
    source_event: event.id,
  });
  assert.equal(twin.error?.code, "23505", "the bell keeps one notice for one event");
});
