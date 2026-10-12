/**
 * A customer's no reaches its notice through its event (decision 0048, 00409), on a real Postgres: a STOP the door recorded
 * (ingest_inbound writes the consent and its contact.consent_changed event in one transaction, and opens no hold) is owed to
 * the consent_notice subscriber by the relay, in lane 2; the subscriber, run on its real ports, reads the person from the rows
 * and tells the workspace once, a second run tells nobody, and the bell keeps one notice for one event. And the notice keeps
 * its mail apart from its row (`mail_due_at`): a mail still owed is found by its event and cleared when it has gone. Runs
 * against the database `supabase start` builds on this machine, never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
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
let repo;
const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  ({ SUBSCRIBERS } = await import(pathToFileURL(path.join(ROOT, "packages/core/src/subscribers.ts")).href));
  repo = await import(pathToFileURL(path.join(ROOT, "packages/db/src/repositories/notifications.ts")).href);
  T = ok(
    await db
      .from("tenants")
      .insert({ slug: `consent-notice-${Date.now().toString(36)}`, name: "Consent Notice" })
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

test(
  "a STOP the door recorded is owed to consent_notice, opens no hold, and is told once from its event; the bell keeps one notice for it",
  { skip },
  async () => {
    const phone = "+13055550188";
    const taken = ok(
      await db.rpc("ingest_inbound", {
        p_tenant_id: T,
        p_channel: "sms",
        p_identity_external_id: phone,
        p_phone_e164: phone,
        p_wa_profile_name: "Dulce Amaro",
        p_message_external_id: `stop-${Date.now().toString(36)}`,
        p_type: "text",
        p_body: "STOP",
        p_channel_ts: new Date().toISOString(),
        p_media: null,
        p_meta: {},
        p_opt_out: true,
        p_opt_in: false,
      }),
      "the STOP taken in",
    );
    assert.deepEqual([taken.consent, taken.dnc], ["opted_out", true]);
    const event = ok(
      await db
        .from("events")
        .select(
          "id, tenant_id, kind, subject_type, subject_id, data, created_at, version, aggregate_version, causation_id",
        )
        .eq("tenant_id", T)
        .eq("kind", "contact.consent_changed")
        .eq("subject_id", taken.contact_id)
        .single(),
      "its event",
    );
    assert.deepEqual([event.data.consent, event.data.source], ["opted_out", "customer_message"]);
    assert.equal(
      ok(await db.from("escalations").select("id").eq("tenant_id", T), "holds").length,
      0,
      "the door opens no hold: a STOP is news, never a wait",
    );

    const subscribed = ok(
      await db.from("event_subscriptions").select("subscriber, lane, paused").eq("kind", "contact.consent_changed"),
      "subscriptions",
    );
    assert.ok(
      subscribed.some((s) => s.subscriber === "consent_notice" && s.lane === 2 && !s.paused),
      "consent_notice takes contact.consent_changed in lane 2",
    );
    const outbox = ok(await db.from("event_outbox").select("event_id").eq("event_id", event.id), "outbox");
    const delivered = ok(
      await db
        .from("event_deliveries")
        .select("subscriber")
        .eq("event_id", event.id)
        .eq("subscriber", "consent_notice"),
      "deliveries",
    );
    assert.ok(outbox.length + delivered.length >= 1, "the event waits for the relay, or is the subscriber's");
    assert.ok(delivered.length <= 1, "and is the subscriber's once");

    const told = [];
    const ports = {
      bookedFromAppointment: async () => 0,
      holdFacts: async () => null,
      holdTold: async () => false,
      optOutPerson: (tenantId, contactId) => repo.personFactsOf(db, tenantId, contactId),
      optOutTold: (tenantId, p) => repo.optOutTold(db, { tenantId, ...p }),
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
            // The mail of a notice is owed from the moment its row is kept, until it has gone (00409).
            mail_due_at: new Date().toISOString(),
          }),
          "the bell",
        );
      },
    };
    await SUBSCRIBERS.consent_notice(event, ports);
    assert.equal(told.length, 1);
    assert.equal(told[0].kind, "opted_out", "the table accepts the kind (notifications_kind_check, 00409)");
    assert.equal(told[0].subject, "Dulce Amaro asked to stop receiving messages");
    assert.equal(told[0].route, `clients/${taken.contact_id}`);

    // Bell told, mail owed: found by its event and not yet told in full; once the mail has gone, told.
    const asked = { tenantId: T, eventId: event.id, contactId: taken.contact_id, at: event.created_at };
    const kept = await repo.noticeFor(db, { tenantId: T, kind: "opted_out", sourceEvent: event.id });
    assert.ok(kept && kept.mailOwed, "the row says its mail is owed");
    assert.equal(await repo.optOutTold(db, asked), false);
    await repo.mailSent(db, { tenantId: T, id: kept.id });
    assert.equal(
      (await repo.noticeFor(db, { tenantId: T, kind: "opted_out", sourceEvent: event.id }))?.mailOwed,
      false,
    );
    assert.equal(await repo.optOutTold(db, asked), true);

    await SUBSCRIBERS.consent_notice(event, ports);
    assert.equal(told.length, 1, "a second run tells nobody");
    const twin = await db.from("notifications").insert({
      tenant_id: T,
      kind: "opted_out",
      title: "twin",
      body: "twin",
      source_event: event.id,
    });
    assert.equal(twin.error?.code, "23505", "the bell keeps one notice for one event");
  },
);
