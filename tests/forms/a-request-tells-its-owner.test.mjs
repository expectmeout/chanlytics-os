/**
 * What a hosted form's request owes once it is kept (00680; the Forms plan, 3.2 steps 7 and 8), run as the relay hands
 * each step to the edge (form-effects.ts), over a database in memory: what they asked suggested as a note on their
 * page to wait for a member's Keep, and the owner told once, by the bell's own kind for a request, opening it in Inbox.
 *
 * The plan's tests lead: an entry held for a look never rings the bell and starts nothing, and one let through starts
 * everything it should have started, then; a test tells nobody; two requests from one person are two, each told once;
 * a step run again repeats nothing.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { at } from "../_cron-doors-world.mjs";
import { deliver } from "../people/doors/_form-entries.mjs";
import { A, FORM, V1, formWorld } from "./_form-requests.mjs";

for (const k of ["RESEND_API_KEY", "LEAD_TO", "LEAD_FROM"]) delete process.env[k];
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "service-role-key-for-this-file";
process.env.SUPABASE_URL ??= "https://db.example.supabase.co";
const { runFormEffect } = await import(at("apps/edge/lib/website/form-effects.ts"));
const { watchForms } = await import(at("apps/edge/lib/website/form-watch.ts"));
/** How many entries nobody was told of, as the health sweep's watch counts them. */
const watchFormEntries = async (db, nowMs) => (await watchForms(db, nowMs)).form_entries_untold;
const realFetch = globalThis.fetch;
after(() => {
  globalThis.fetch = realFetch;
});

const ANA = {
  answers: {
    f1name: "Ana Ruiz",
    f2mail: "ana.ruiz@example.com",
    f4want: "A warm, soft blonde for spring.",
    f5who0: "c1",
  },
  reach: { name: "Ana Ruiz", email: "ana.ruiz@example.com", phone: null },
};

function world() {
  const suggested = [];
  const made = formWorld({
    more: { notifications: [], jobs: [] },
    rpcs: {
      person_note_suggest: (a) => {
        if (suggested.some((s) => s.p_source_id === a.p_source_id)) return { error: "already" };
        suggested.push(a);
        return { note: { id: `n-${suggested.length}` } };
      },
    },
  });
  const handed = new Set();
  const take = (ref, over = {}) =>
    made.db
      .rpc("form_request_take", {
        p_tenant_id: A,
        p_form_id: FORM,
        p_version_id: V1,
        p_ref: ref,
        p_answers: ANA.answers,
        p_reach: ANA.reach,
        p_words: "0".repeat(64),
        p_link_code: "k7q2md",
        ...over,
      })
      .then((r) => r.data);
  /** The relay's pass: every new event handed to its steps; the failures, by step. */
  const settle = () => deliver(made.tables, (t, id, effect) => runFormEffect(made.db, t, id, effect), handed);
  return { ...made, suggested, take, settle, notifications: made.tables.notifications };
}

let w;
beforeEach(() => {
  w = world();
  globalThis.fetch = async () => new Response("{}", { status: 500 });
});

test("a request leaves its note for a member's Keep and tells its owner once, by the bell's own kind, opening it in Inbox", async () => {
  const taken = await w.take("e-1");
  assert.equal(taken.outcome, "accepted");
  assert.deepEqual(await w.settle(), []);
  assert.equal(w.suggested.length, 1);
  assert.equal(w.suggested[0].p_contact_id, taken.contact_id);
  assert.match(
    w.suggested[0].p_body,
    /^Sent a request: Colour consultation\. Through your link\. They wrote: "A warm, soft blonde for spring\."/,
    "the note says the form, how they came, and their own words",
  );
  assert.match(w.suggested[0].p_body, /Who would you like\?: Maria\./);
  assert.equal(w.notifications.length, 1);
  const [row] = w.notifications;
  assert.equal(row.kind, "form_request");
  assert.equal(row.route, `inbox/rq-${taken.entry_id}`);
  assert.equal(row.title, "Ana Ruiz sent a request: Colour consultation");
  assert.match(row.body, /Through your link\./);
  const [entry] = w.tables.form_entries;
  assert.equal(entry.state, "processed");
  assert.ok(entry.told_at, "the owner was told");

  // Each step run again repeats nothing.
  for (const effect of ["note", "notice", "confirm"]) await runFormEffect(w.db, A, entry.id, effect);
  assert.deepEqual([w.suggested.length, w.notifications.length], [1, 1]);
});

test("two requests from one person are two: each told once, each with its own note", async () => {
  const first = await w.take("e-1");
  const second = await w.take("e-2", { p_answers: { ...ANA.answers, f4want: "Hair for my sister's wedding." } });
  assert.equal(first.contact_id, second.contact_id, "one person");
  await w.settle();
  assert.equal(w.notifications.length, 2);
  assert.deepEqual(new Set(w.notifications.map((n) => n.route)).size, 2, "each opens its own request");
  assert.equal(w.suggested.length, 2);
});

test("an entry held for a look never rings the bell and starts nothing; let through, everything it should have started starts then", async () => {
  const held = await w.take("e-held", { p_held_why: "too_fast" });
  assert.equal(held.outcome, "held");
  assert.deepEqual(await w.settle(), []);
  assert.deepEqual([w.suggested.length, w.notifications.length, w.tables.events.length], [0, 0, 0]);
  assert.equal(
    await watchFormEntries(w.db, w.clock.now + 3_600_000),
    0,
    "and the watch never pages for one held on purpose",
  );

  const through = (await w.db.rpc("form_entry_let_through", { p_tenant_id: A, p_entry_id: held.entry_id })).data;
  assert.equal(through.outcome, "accepted");
  await w.settle();
  assert.deepEqual([w.suggested.length, w.notifications.length], [1, 1]);
  assert.equal(w.tables.form_entries[0].contact_id, through.contact_id, "its person is resolved as it is let through");
  assert.equal(w.notifications[0].route, `inbox/rq-${held.entry_id}`);
});

test("a request a member set aside as not a real one comes back as a request, and tells nobody twice", async () => {
  const taken = await w.take("e-1");
  await w.settle();
  assert.equal((await w.db.rpc("form_entry_hold", { p_tenant_id: A, p_entry_id: taken.entry_id })).data, true);
  assert.equal(w.tables.form_entries[0].held_why, "member");
  const back = (await w.db.rpc("form_entry_let_through", { p_tenant_id: A, p_entry_id: taken.entry_id })).data;
  assert.equal(back.outcome, "back");
  await w.settle();
  assert.deepEqual([w.suggested.length, w.notifications.length], [1, 1]);
  assert.equal(w.tables.form_entries[0].state, "processed");
});

test("a test tells nobody, at any moment", async () => {
  const taken = await w.take("e-test", { p_test: true });
  assert.equal(taken.outcome, "test");
  assert.deepEqual(await w.settle(), []);
  assert.deepEqual([w.suggested.length, w.notifications.length, w.tables.events.length], [0, 0, 0]);
  for (const effect of ["note", "notice"]) await runFormEffect(w.db, A, taken.entry_id, effect);
  assert.deepEqual([w.suggested.length, w.notifications.length], [0, 0]);
  assert.equal(await watchFormEntries(w.db, w.clock.now + 3_600_000), 0);
});

test("a request whose notice fails is told on the next try, and its note is not suggested twice", async () => {
  const taken = await w.take("e-1");
  w.faults["notifications.insert"] = { message: "the bell's table is not answering", code: "57014" };
  const failed = await w.settle();
  assert.deepEqual(
    failed.map((f) => f.effect),
    ["notice"],
  );
  assert.equal(w.notifications.length, 0);
  assert.equal(await watchFormEntries(w.db, w.clock.now + 3_600_000), 1, "it shows meanwhile");
  delete w.faults["notifications.insert"];
  await deliver(w.tables, (t, id, effect) => runFormEffect(w.db, t, id, effect), new Set(), { again: failed });
  assert.equal(w.notifications.length, 1, "once");
  assert.equal(w.suggested.length, 1);
  assert.equal(w.tables.form_entries.find((e) => e.id === taken.entry_id).state, "processed");
});
