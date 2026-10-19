/**
 * A wait that ends closes its notice, for everyone (00421; the wiring's second audit, lane R2), on a real Postgres: a hold
 * that resolves closes the handoff, deadman and call rows about its thread and nothing else; the one door
 * (notifications_close_about) closes each open row once, within the bell's window, of the kinds, subject and title it is
 * given; resume_email_offers closes the pause notice by the title contracts words it with; and the edge's close of a
 * mended warning (packages/db closeMendedNotices) writes what the bell reads. The lead question's close is the leads
 * suite's (leads.db.test.mjs, "the bell rings twice"). Runs against the database `supabase start` builds on this machine,
 * never production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { OFFERS_NOTICE_WORDS, kindsEndedBy, warningsMendedBy } from "@chanlytics/contracts";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes workspaces and notices"
      : false;

const DAY = 24 * 3_600_000;
let db;
let T;
let closeMendedNotices;
const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  ({ closeMendedNotices } = await import(
    pathToFileURL(path.join(ROOT, "packages/db/src/repositories/notices/notifications.ts")).href
  ));
  T = ok(
    await db
      .from("tenants")
      .insert({ slug: `wait-ends-${Date.now().toString(36)}`, name: "Wait Ends" })
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

/** A row the bell keeps, open; `over` may backdate it. */
async function notice(kind, title, about, over = {}) {
  return ok(
    await db
      .from("notifications")
      .insert({
        tenant_id: T,
        kind,
        title,
        body: "x",
        subject_type: about?.type ?? null,
        subject_id: about?.id ?? null,
        ...over,
      })
      .select("id")
      .single(),
    `${kind}: ${title}`,
  ).id;
}
const closedOf = async (ids) =>
  Object.fromEntries(
    ok(await db.from("notifications").select("id, closed_at").in("id", ids), "the rows").map((r) => [
      r.id,
      r.closed_at !== null,
    ]),
  );

async function thread(phone) {
  const person = ok(
    await db.from("contacts").insert({ tenant_id: T, phone_e164: phone }).select("id").single(),
    "person",
  ).id;
  return ok(await db.from("conversations").insert({ tenant_id: T, contact_id: person }).select("id").single(), "thread")
    .id;
}

test(
  "a hold that resolves closes the rows about its thread: every hold kind, no other kind, no other thread",
  { skip },
  async () => {
    const a = await thread("+13055550181");
    const b = await thread("+13055550182");
    for (const c of [a, b])
      assert.equal(
        ok(
          await db.rpc("escalation_open", {
            p_tenant_id: T,
            p_conversation_id: c,
            p_reason: "manual",
            p_details: "A person asked for a person.",
          }),
          "the hold",
        ),
        "opened",
      );
    const about = (id) => ({ type: "conversation", id });
    const rows = {
      handoff: await notice("handoff", "Ana needs a person", about(a)),
      deadman: await notice("deadman", "Ana has waited an hour", about(a)),
      call: await notice("call", "Ana asked for a call back", about(a)),
      note: await notice("note_for_you", "A note on Ana", about(a)),
      other: await notice("handoff", "Bo needs a person", about(b)),
    };
    assert.deepEqual(
      kindsEndedBy("hold"),
      ["handoff", "deadman", "call"],
      "the trigger's kinds, as contracts says them",
    );
    // A snooze or a take-over leaves the hold open: nothing closes.
    ok(
      await db
        .from("escalations")
        .update({ details: "Still waiting." })
        .eq("tenant_id", T)
        .eq("conversation_id", a)
        .eq("state", "open"),
      "a change that is not the resolve",
    );
    assert.ok(
      Object.values(await closedOf(Object.values(rows))).every((c) => !c),
      "open while the hold is open",
    );
    ok(
      await db
        .from("escalations")
        .update({ state: "resolved", resolved_at: new Date().toISOString() })
        .eq("tenant_id", T)
        .eq("conversation_id", a)
        .eq("state", "open"),
      "the resolve",
    );
    const closed = await closedOf(Object.values(rows));
    assert.deepEqual(
      Object.fromEntries(Object.entries(rows).map(([k, id]) => [k, closed[id]])),
      { handoff: true, deadman: true, call: true, note: false, other: false },
      "REGRESSION (S7-4): Ana was answered, and 'Ana needs a person' stayed unread and amber for every member",
    );
  },
);

test(
  "the one door closes each open row once, of the kinds, subject and title it is given, within the bell's window",
  { skip },
  async () => {
    const run = { type: "broadcast", id: "33333333-0000-4000-8000-000000000001" };
    const rows = {
      match: await notice("playbook", "Campaign “Win-back” is ready: 40 people", run),
      otherTitle: await notice("playbook", "The check held 2 emails in Spring", run),
      otherKind: await notice("broadcast_sent", "Broadcast “Win-back” sent", run),
      otherSubject: await notice("playbook", "Campaign “Win-back” is ready: 40 people", {
        ...run,
        id: "33333333-0000-4000-8000-000000000002",
      }),
      old: await notice("playbook", "Campaign “Win-back” is ready: 40 people", run, {
        created_at: new Date(Date.now() - 31 * DAY).toISOString(),
      }),
    };
    const close = () =>
      db.rpc("notifications_close_about", {
        p_tenant_id: T,
        p_kinds: ["playbook"],
        p_subject_type: run.type,
        p_subject_id: run.id,
        p_title: "Campaign “Win-back” is ready: 40 people",
      });
    assert.equal(ok(await close(), "the close"), 1, "one row matched");
    assert.equal(ok(await close(), "again"), 0, "each row once: a second close finds nothing open");
    const closed = await closedOf(Object.values(rows));
    assert.deepEqual(Object.fromEntries(Object.entries(rows).map(([k, id]) => [k, closed[id]])), {
      match: true,
      otherTitle: false,
      otherKind: false,
      otherSubject: false,
      old: false,
    });
  },
);

test(
  "lifting the offers pause closes its notice, by the title contracts words it with, and no other sweep row",
  { skip },
  async () => {
    ok(
      await db.from("mailboxes").insert({
        tenant_id: T,
        local_part: `waits${Date.now().toString(36)}`,
        reply_token: `${Date.now().toString(36)}abcdefghijklmnopqrst`
          .replace(/[^a-z2-7]/g, "a")
          .slice(0, 24)
          .padEnd(24, "a"),
        from_name: "Wait Ends",
        offers_paused_at: new Date().toISOString(),
        offers_paused_reason: "complaints",
      }),
      "a paused mailbox",
    );
    const pause = await notice("sweep", OFFERS_NOTICE_WORDS.paused(null).title, null);
    const held = await notice("sweep", "mail.example.com is held: it bounced", {
      type: "sending_domain",
      id: "44444444-0000-4000-8000-000000000001",
    });
    assert.equal(ok(await db.rpc("resume_email_offers", { p_tenant_id: T }), "the resume"), true);
    const closed = await closedOf([pause, held]);
    assert.equal(
      closed[pause],
      true,
      "the resume's literal is contracts' title: a reworded notice would have been left open by the SQL",
    );
    assert.equal(closed[held], false, "a domain's hold is mended by its domain, not by the offers");
  },
);

test(
  "the edge's close of a mended warning writes what the bell reads: 'back to normal' closes 'flagged'",
  { skip },
  async () => {
    // A number's rating is that number's: its notices are about its channel (waba-events.ts).
    const channel = { type: "channel", id: "55555555-0000-4000-8000-000000000001" };
    const another = { type: "channel", id: "55555555-0000-4000-8000-000000000002" };
    const flagged = await notice("number", "WhatsApp quality rating flagged", channel);
    const theirs = await notice("number", "WhatsApp quality rating flagged", another);
    const lowered = await notice("number", "WhatsApp messaging limit lowered", channel);
    const kept = await notice("number", "WhatsApp quality rating back to normal", channel);
    const n = await closeMendedNotices(db, {
      tenantId: T,
      warnings: warningsMendedBy({ kind: "number", title: "WhatsApp quality rating back to normal" }),
      subject: channel,
      keptId: kept,
      nowMs: Date.now(),
    });
    assert.equal(n, 1);
    assert.deepEqual(await closedOf([flagged, theirs, lowered, kept]), {
      [flagged]: true,
      [theirs]: false,
      [lowered]: false,
      [kept]: false,
    });
  },
);

test(
  "a run that is decided closes the rows about it (00461): approved or skipped it leaves pending_approval, and one that ends closes its held-emails row; no other run's, no other kind's",
  { skip },
  async () => {
    const template = ok(
      await db
        .from("templates")
        .insert({ tenant_id: T, channel: "whatsapp", name: "offer", language: "en_US", meta_status: "approved" })
        .select("id")
        .single(),
      "the template",
    ).id;
    const run = async (state) =>
      ok(
        await db
          .from("sequence_batches")
          .insert({
            tenant_id: T,
            name: "Win-back · 2026-10-19",
            template_id: template,
            template_name: "offer",
            template_language: "en_US",
            state,
            scheduled_for: new Date(Date.now() + DAY).toISOString(),
          })
          .select("id")
          .single(),
        `a run ${state}`,
      ).id;
    const runs = {
      approved: await run("pending_approval"),
      skipped: await run("pending_approval"),
      waiting: await run("pending_approval"),
      going: await run("scheduled"),
    };
    const about = (id) => ({ type: "broadcast", id });
    const rows = {
      approved: await notice("playbook", "Campaign “Win-back” is ready: 4 people", about(runs.approved)),
      skipped: await notice("playbook", "Campaign “Win-back” is ready: 4 people", about(runs.skipped)),
      waiting: await notice("playbook", "Campaign “Win-back” is ready: 2 people", about(runs.waiting)),
      news: await notice("broadcast_sent", "Win-back went out", about(runs.approved)),
      held: await notice("playbook", "2 emails wait for your say", about(runs.going)),
    };
    assert.deepEqual(kindsEndedBy("run"), ["playbook"], "the trigger's kind, as contracts says it");
    const move = async (id, state) =>
      ok(await db.from("sequence_batches").update({ state }).eq("tenant_id", T).eq("id", id).select("id"), state);
    const closed = async () => {
      const by = await closedOf(Object.values(rows));
      return Object.fromEntries(Object.entries(rows).map(([k, id]) => [k, by[id]]));
    };
    await move(runs.approved, "scheduled");
    await move(runs.skipped, "canceled");
    // A going run sends on: its held-emails row still asks.
    await move(runs.going, "sending");
    assert.deepEqual(await closed(), { approved: true, skipped: true, waiting: false, news: false, held: false });
    // It ends: nothing about it can be asked any more.
    await move(runs.going, "sent");
    assert.equal((await closed()).held, true, "an ended run's held-emails row closes");
    // A row is closed once: a later move of the same run writes no second close.
    const first = ok(
      await db.from("notifications").select("closed_at").eq("id", rows.approved).single(),
      "the row",
    ).closed_at;
    await move(runs.approved, "sending");
    const again = ok(
      await db.from("notifications").select("closed_at").eq("id", rows.approved).single(),
      "the row",
    ).closed_at;
    assert.equal(again, first);
  },
);
