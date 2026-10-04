/**
 * A message's email and text versions, run through their routes: the real route modules, their `run` called with a
 * database in memory and a model of the definer doors (the doors themselves are proved on Postgres in
 * template-versions.db.test.mjs).
 *
 * What is proved here is what the dashboard does around the doors: who may ask, what is checked before the database is
 * (the slots of the message, a subject, a text's length), what the door is given, how its refusals are answered, and
 * that the starter set files each starter's email and text versions beside its WhatsApp one, once, whatever one of
 * them does.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import { starterByKey, starterEmailText, starterSmsText } from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const versions = await import(at("apps/dashboard/app/api/v1/templates/versions/route.ts"));
const version = await import(at("apps/dashboard/app/api/v1/templates/versions/[id]/route.ts"));
const starter = await import(at("apps/dashboard/app/api/v1/templates/starter/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const id = (n) => `77777777-7777-4777-8777-${String(n).padStart(12, "0")}`;
const USER = "u1";
const membership = (tenant_id, role, slug, created_at) => ({
  user_id: USER,
  tenant_id,
  role,
  tenants: { slug },
  created_at,
});
/** A member of two workspaces: harbor (the older membership) and bayside. */
const both = (harbor, bayside) => [
  membership(A, harbor, "harbor", "2026-01-01T00:00:00Z"),
  membership(B, bayside, "bayside", "2026-02-01T00:00:00Z"),
];
const inA = `?workspace=${A}`;
const inB = `?workspace=${B}`;
const send = (method, body, q = "") =>
  new Request(`http://localhost/api/v1/x${q}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
async function refused(p, code, status, words) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, e.message);
    if (status) assert.equal(e.status, status, e.message);
    if (words) assert.ok(e.message.includes(words), `${JSON.stringify(e.message)} should say ${JSON.stringify(words)}`);
    return true;
  });
}
const doorError = (message, code) => Object.assign(new Error(message), { code });

const SLOTS = [
  { position: 1, label: "First name", example: "Dani" },
  { position: 2, label: "Business name", example: "Luna Studio" },
];
/** A template row as the table holds it. */
const tpl = (n, tenant_id, over = {}) => ({
  id: id(n),
  tenant_id,
  channel: "whatsapp",
  name: "visit_reminder",
  language: "en_US",
  body_preview: "Hi {{1}}, a reminder from {{2}}.",
  variables: SLOTS,
  category: "utility",
  meta_status: "approved",
  quality: null,
  rejected_reason: null,
  synced_at: null,
  source: "meta",
  hidden_at: null,
  title: null,
  ...over,
});

/**
 * A model of save_template_version and remove_template_version over the same tables: enough of the doors' own rules
 * that a route test finds what the route does around them (the SQL is run in template-versions.db.test.mjs). Every call
 * is kept, and `refuse` makes the next call to a door refuse as the database would.
 */
function world(tables) {
  const calls = [];
  const refuse = {};
  let next = 900;
  const rpcs = {
    save_template_version: (a) => {
      calls.push(["save", a]);
      if (refuse.save) throw refuse.save;
      const source = tables.templates.find((t) => t.tenant_id === a.p_tenant_id && t.name === a.p_name);
      if (!source) throw doorError("Message not found.", "P0002");
      const row = {
        ...tpl(next++, a.p_tenant_id, {
          channel: a.p_channel,
          name: a.p_name,
          language: a.p_language,
          source: "chanlytics",
          body_preview: a.p_body,
          category: source.category,
          variables: source.variables,
        }),
      };
      const on = tables.templates.findIndex(
        (t) =>
          t.tenant_id === row.tenant_id &&
          t.channel === row.channel &&
          t.name === row.name &&
          t.language === row.language,
      );
      if (on >= 0) tables.templates[on] = { ...tables.templates[on], body_preview: a.p_body };
      else tables.templates.push(row);
      const kept = tables.templates.find(
        (t) => t.name === a.p_name && t.channel === a.p_channel && t.language === a.p_language,
      );
      return { id: kept.id, channel: a.p_channel, name: a.p_name, language: a.p_language };
    },
    remove_template_version: (a) => {
      calls.push(["remove", a]);
      if (refuse.remove) throw refuse.remove;
      const row = tables.templates.find((t) => t.id === a.p_template_id);
      if (!row || !["email", "sms"].includes(row.channel) || row.source !== "chanlytics")
        throw doorError("Version not found.", "P0002");
      tables.templates.splice(tables.templates.indexOf(row), 1);
      return { id: row.id, channel: row.channel, name: row.name, language: row.language };
    },
  };
  const ctx = (params = {}) => ({
    supabase: fakeDb(tables, {}, rpcs),
    userId: USER,
    email: "ada@example.com",
    params,
  });
  return { calls, refuse, ctx };
}

const write = (over = {}) => ({
  name: "visit_reminder",
  language: "en_US",
  channel: "email",
  subject: "Tomorrow at {{2}}",
  body: "Hi {{1}}, see you soon.",
  ...over,
});

test("the two routes declare their policy: operator-only, the save counted as a playbook change (a reach-out's email is saved through its chain) and the delete against settings, the version judged where it lives", () => {
  assert.deepEqual(versions.POST.policy, {
    kind: "write",
    scope: "workspace",
    role: "operator",
    rate: "playbook",
    spend: false,
  });
  assert.deepEqual(version.DELETE.policy, {
    kind: "write",
    scope: "row",
    role: "operator",
    rate: "settings",
    spend: false,
  });
});

test("writing a version: who may, and what is said in the person's words before the database is asked", async () => {
  const tables = { memberships: both("viewer", "operator"), templates: [tpl(1, B), tpl(2, A, { name: "theirs" })] };
  const w = world(tables);
  const post = (body, q = inB) => versions.POST.run(send("POST", body, q), w.ctx());
  await refused(post(write(), inA), "forbidden", 403);
  await refused(versions.POST.run(send("POST", write()), w.ctx()), "choose_workspace", 400);
  await refused(post({}), "validation", 400, "name: Say which message.");
  await refused(post(write({ channel: "whatsapp" })), "validation", 400, "A version is written for email or text.");
  await refused(post(write({ channel: undefined })), "validation", 400, "A version is written for email or text.");
  await refused(post(write({ language: "english" })), "validation", 400, "Pick a language from the list.");
  // A reach-out's email is a version too, written through its chain's save (reach-out-email-in-place.test.mjs): a name
  // that is no step of this workspace's is not found, and a reach-out sends email alone.
  await refused(post(write({ name: "reach_out_0123456789abcdef" })), "not_found", 404, "Reach-out not found.");
  await refused(
    post(write({ name: "reach_out_0123456789abcdef0123456789abcdef", channel: "sms", body: "Hi" })),
    "validation",
    400,
    "A reach-out sends email only.",
  );
  await refused(post(write({ subject: "  " })), "validation", 400, "Give the email a subject.");
  await refused(post(write({ subject: null })), "validation", 400, "Give the email a subject.");
  await refused(post(write({ subject: "x".repeat(61) })), "validation", 400, "The subject must be under 60");
  await refused(post(write({ body: " " })), "validation", 400, "Write the email.");
  await refused(post(write({ body: "x".repeat(2001) })), "validation", 400, "The email must be under 2000");
  await refused(post(write({ channel: "sms", body: "" })), "validation", 400, "Write the text.");
  // The message has two slots: a third is not its.
  await refused(
    post(write({ body: "Hi {{1}}, it is {{3}}." })),
    "validation",
    400,
    "{{3}} is not one of this message's values: it has {{1}} to {{2}}.",
  );
  await refused(
    post(write({ channel: "sms", body: "Hi {{4}}" })),
    "validation",
    400,
    "{{4}} is not one of this message's values",
  );
  // A message this workspace does not have is not found, and the database is never asked about it.
  await refused(post(write({ name: "no_such_message" })), "not_found", 404, "Message not found.");
  await refused(post(write({ name: "theirs" })), "not_found", 404, "Message not found.");
  assert.deepEqual(w.calls, [], "none of those reached the door");
  assert.equal(tables.templates.length, 2);
});

test("writing a version: the door is given what was checked and cleaned, its answer is the row, and what reads badly is a warning", async () => {
  const tables = { memberships: both("viewer", "operator"), templates: [tpl(1, B)] };
  const w = world(tables);
  const post = (body, q = inB) => versions.POST.run(send("POST", body, q), w.ctx());

  const email = await post(write({ subject: "  Tomorrow   at {{2}} ", body: "  Hi {{1}},\r\n\r\nSee you soon.  " }));
  assert.deepEqual(w.calls[0], [
    "save",
    {
      p_tenant_id: B,
      p_name: "visit_reminder",
      p_language: "en_US",
      p_channel: "email",
      p_subject: "Tomorrow at {{2}}",
      p_body: "Hi {{1}},\n\nSee you soon.",
    },
  ]);
  assert.deepEqual(Object.keys(email).sort(), ["template", "warnings"]);
  assert.deepEqual(email.template, {
    id: tables.templates.at(-1).id,
    channel: "email",
    name: "visit_reminder",
    language: "en_US",
  });
  assert.deepEqual(email.warnings, []);

  const text = await post(write({ channel: "sms", subject: "ignored", body: "Hi {{1}}, see you soon." }));
  assert.deepEqual(w.calls[1][1], {
    p_tenant_id: B,
    p_name: "visit_reminder",
    p_language: "en_US",
    p_channel: "sms",
    p_subject: "",
    p_body: "Hi {{1}}, see you soon.",
  });
  assert.equal(text.template.channel, "sms");

  // A text that takes three parts with its STOP line still saves, and says each part is billed.
  const long = await post(write({ channel: "sms", body: `Hi {{1}}, ${"news ".repeat(60)}` }));
  assert.equal(long.warnings.length, 1);
  assert.match(long.warnings[0], /parts, and each part is billed/);
  // And one past four parts is refused, not saved.
  await refused(post(write({ channel: "sms", body: "news ".repeat(160) })), "validation", 400, "keep it to 4");

  // Saved again, it is the same row: the answer names it, and the table holds one.
  const again = await post(write({ body: "Hi {{1}}, see you very soon." }));
  assert.equal(again.template.id, email.template.id);
  assert.equal(tables.templates.filter((t) => t.channel === "email").length, 1);
});

test("writing a version: the slots are the message's own, from its WhatsApp row, in this language when the workspace has more than one", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    templates: [
      tpl(1, B, { language: "en_US" }),
      tpl(2, B, { language: "es", variables: [SLOTS[0]] }),
      tpl(3, B, { channel: "email", language: "en_US", variables: [] }),
      tpl(4, B, { name: "no_slots", variables: [] }),
    ],
  };
  const w = world(tables);
  const post = (body) => versions.POST.run(send("POST", body, inB), w.ctx());
  assert.equal((await post(write({ language: "en_US", body: "{{2}} says hi" }))).template.language, "en_US");
  await refused(post(write({ language: "es", body: "{{2}} dice hola" })), "validation", 400, "it has {{1}}.");
  // A language the message has no WhatsApp row in takes the WhatsApp row it has, before another channel's.
  assert.equal((await post(write({ language: "fr", body: "{{1}} et {{2}}" }))).template.language, "fr");
  // A message with no slots takes none.
  await refused(
    post(write({ name: "no_slots", subject: "Hello", body: "Hi {{1}}" })),
    "validation",
    400,
    "This message fills no values, so {{1}} has nothing to take.",
  );
  assert.equal((await post(write({ name: "no_slots", subject: "Hello", body: "Hi there" }))).template.name, "no_slots");
});

test("writing a version of a starter the workspace has not added: its slots are the starter's, and the door says it is not on file", async () => {
  const tables = { memberships: both("viewer", "operator"), templates: [] };
  const w = world(tables);
  const post = (body) => versions.POST.run(send("POST", body, inB), w.ctx());
  // quick_note has three slots; a fourth is refused by the starter's own count, before the door.
  await refused(post(write({ name: "quick_note", body: "Hi {{4}}" })), "validation", 400, "{{4}} is not one of");
  assert.deepEqual(w.calls, []);
  await refused(post(write({ name: "quick_note", body: "Hi {{3}}" })), "not_found", 404, "Message not found.");
  assert.equal(w.calls.length, 1, "the door is the one that says the message is not there");
});

test("writing a version: the door's own refusals are answered in its words, and a fault is no one's to read", async () => {
  const tables = { memberships: both("viewer", "operator"), templates: [tpl(1, B)] };
  const w = world(tables);
  const post = () => versions.POST.run(send("POST", write(), inB), w.ctx());
  w.refuse.save = doorError("Message not found.", "P0002");
  await refused(post(), "not_found", 404, "Message not found.");
  w.refuse.save = doorError("A subject is at most 60 characters.", "22023");
  await refused(post(), "validation", 400, "A subject is at most 60 characters.");
  w.refuse.save = doorError("canceling statement due to statement timeout", "57014");
  await refused(post(), "internal", 503, "Something went wrong.");
  w.refuse.save = undefined;
  assert.equal((await post()).template.channel, "email");
});

test("removing a version: judged where it lives, only what the door says is a version, a refusal in its words", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    templates: [
      tpl(1, B),
      tpl(2, B, { channel: "email", source: "chanlytics" }),
      tpl(3, A, { channel: "email", source: "chanlytics", name: "theirs" }),
      tpl(4, B, { channel: "sms", source: "chanlytics", language: "es" }),
    ],
  };
  const w = world(tables);
  const del = (n) => version.DELETE.run(send("DELETE"), w.ctx({ id: id(n) }));
  await refused(del(3), "forbidden", 403);
  await refused(del(99), "not_found", 404);
  await refused(version.DELETE.run(send("DELETE"), w.ctx({ id: "not-a-uuid" })), "not_found", 404);
  assert.deepEqual(w.calls, [], "refused before the door");

  // A WhatsApp template reads as not a version, the same 404: the door decides which rows are versions.
  await refused(del(1), "not_found", 404, "Version not found.");
  assert.equal(tables.templates.length, 4);

  assert.deepEqual(await del(2), {
    deleted: true,
    id: id(2),
    channel: "email",
    name: "visit_reminder",
    language: "en_US",
  });
  assert.deepEqual(w.calls.at(-1), ["remove", { p_template_id: id(2) }]);
  assert.deepEqual(
    tables.templates.map((t) => t.id),
    [id(1), id(3), id(4)],
  );

  // Still named by a playbook or a broadcast: a conflict the owner can resolve, in the door's words.
  w.refuse.remove = doorError("A playbook or broadcast still uses this version.", "P0001");
  await refused(del(4), "conflict", 409, "A playbook or broadcast still uses this version.");
  w.refuse.remove = doorError("canceling statement due to statement timeout", "57014");
  await refused(del(4), "internal", 503);
  assert.equal(tables.templates.length, 3);
});

/* ------------------------------ the starter set ----------------------------- */

const post = (w, body, q = inB) => starter.POST.run(send("POST", body, q), w.ctx());
const summary = (r) =>
  r.results.map((x) => [x.key, x.language, x.status, x.versions.map((v) => `${v.channel}:${v.status}`)]);

test("the starter set files each starter's email and text versions beside its WhatsApp one, for the channels it writes for, in the language it is added in", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    templates: [
      tpl(1, B, { name: "visit_reminder", variables: [SLOTS[0], SLOTS[1], { position: 3 }, { position: 4 }] }),
      tpl(2, B, { name: "call_text", variables: [SLOTS[0], SLOTS[1], { position: 3 }], category: "utility" }),
      tpl(3, B, { name: "quick_note", variables: [SLOTS[0], SLOTS[1], { position: 3 }], category: "marketing" }),
    ],
  };
  const w = world(tables);
  const r = await post(w, { keys: ["visit_reminder", "call_text", "quick_note"], languages: ["en_US"] });
  assert.deepEqual(summary(r), [
    ["visit_reminder", "en_US", "exists", ["email:saved", "sms:saved"]],
    ["quick_note", "en_US", "exists", ["email:saved"]],
    ["call_text", "en_US", "exists", ["sms:saved"]],
  ]);
  assert.deepEqual(
    [r.submitted, r.existing, r.synced, r.failed, r.versions_saved, r.versions_existing, r.versions_failed],
    [0, 3, 0, 0, 4, 0, 0],
  );
  const visit = starterByKey("visit_reminder");
  const saved = Object.fromEntries(w.calls.map(([, a]) => [`${a.p_name}/${a.p_channel}`, a]));
  assert.deepEqual(Object.keys(saved).sort(), [
    "call_text/sms",
    "quick_note/email",
    "visit_reminder/email",
    "visit_reminder/sms",
  ]);
  assert.deepEqual(saved["visit_reminder/email"], {
    p_tenant_id: B,
    p_name: "visit_reminder",
    p_language: "en_US",
    p_channel: "email",
    p_subject: starterEmailText(visit, "en_US").subject,
    p_body: starterEmailText(visit, "en_US").body,
  });
  assert.equal(saved["visit_reminder/sms"].p_body, starterSmsText(visit, "en_US").body);
  assert.equal(saved["visit_reminder/sms"].p_subject, "", "a text has no subject");
  assert.ok(!("quick_note/sms" in saved), "an offer has no text version: texts carry no offers");
  assert.ok(!("call_text/email" in saved), "a call's text has no email: a caller has a phone");

  // Said again, nothing is filed twice: each version already here is left as it is.
  const before = w.calls.length;
  const second = await post(w, { keys: ["visit_reminder", "call_text", "quick_note"], languages: ["en_US"] });
  assert.equal(w.calls.length, before, "no door was called");
  assert.deepEqual(summary(second), [
    ["visit_reminder", "en_US", "exists", ["email:exists", "sms:exists"]],
    ["quick_note", "en_US", "exists", ["email:exists"]],
    ["call_text", "en_US", "exists", ["sms:exists"]],
  ]);
  assert.deepEqual([second.versions_saved, second.versions_existing, second.versions_failed], [0, 4, 0]);
});

test("a version a person wrote is never replaced by adding the set again, and Spanish files the Spanish words", async () => {
  const mine = tpl(10, B, {
    channel: "email",
    source: "chanlytics",
    body_preview: "My own words",
    components: [{ type: "BODY", text: "My own words" }],
  });
  const tables = {
    memberships: both("viewer", "operator"),
    templates: [
      tpl(1, B, { variables: [SLOTS[0], SLOTS[1], { position: 3 }, { position: 4 }] }),
      tpl(2, B, { language: "es", variables: [SLOTS[0], SLOTS[1], { position: 3 }, { position: 4 }] }),
      mine,
    ],
  };
  const w = world(tables);
  const r = await post(w, { keys: ["visit_reminder"], languages: ["en_US", "es"] });
  assert.deepEqual(summary(r), [
    ["visit_reminder", "en_US", "exists", ["email:exists", "sms:saved"]],
    ["visit_reminder", "es", "exists", ["email:saved", "sms:saved"]],
  ]);
  assert.equal(tables.templates.find((t) => t.id === mine.id).body_preview, "My own words");
  const es = w.calls.map(([, a]) => a).filter((a) => a.p_language === "es");
  assert.deepEqual(
    es.map((a) => a.p_channel),
    ["email", "sms"],
  );
  assert.equal(es[0].p_subject, starterEmailText(starterByKey("visit_reminder"), "es").subject);
  assert.equal(es[1].p_body, starterSmsText(starterByKey("visit_reminder"), "es").body);
});

test("a version that cannot be filed is said and stops nothing: the rest are filed and the answer arrives whole", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    templates: [
      tpl(1, B, { variables: [SLOTS[0], SLOTS[1], { position: 3 }, { position: 4 }] }),
      tpl(2, B, { name: "quick_note", variables: [SLOTS[0], SLOTS[1], { position: 3 }], category: "marketing" }),
    ],
  };
  const w = world(tables);
  // The first door call is refused in the database's words; the second is a fault it never meant a person to read.
  let n = 0;
  const real = w.ctx;
  const ctx = () => {
    const c = real();
    const rpc = c.supabase.rpc.bind(c.supabase);
    c.supabase.rpc = (name, args) => {
      n += 1;
      if (n === 1) w.refuse.save = doorError("A subject is at most 60 characters.", "22023");
      else if (n === 2) w.refuse.save = doorError("canceling statement due to statement timeout", "57014");
      else w.refuse.save = undefined;
      return rpc(name, args);
    };
    return c;
  };
  const r = await post({ ...w, ctx }, { keys: ["visit_reminder", "quick_note"], languages: ["en_US"] });
  assert.deepEqual(summary(r), [
    ["visit_reminder", "en_US", "exists", ["email:failed", "sms:failed"]],
    ["quick_note", "en_US", "exists", ["email:saved"]],
  ]);
  assert.equal(r.results[0].versions[0].detail, "A subject is at most 60 characters.");
  assert.equal(r.results[0].versions[1].detail, "The version could not be saved. Add the set again to retry.");
  assert.deepEqual([r.versions_saved, r.versions_failed], [1, 2]);
  // Added again, the two that failed are tried again and the one that was saved is left.
  const again = await post(w, { keys: ["visit_reminder", "quick_note"], languages: ["en_US"] });
  assert.deepEqual(summary(again), [
    ["visit_reminder", "en_US", "exists", ["email:saved", "sms:saved"]],
    ["quick_note", "en_US", "exists", ["email:exists"]],
  ]);
});

test("a starter whose WhatsApp version is not on file gets no versions: the message is not there for the door to find", async () => {
  const tables = { memberships: both("viewer", "operator"), templates: [] };
  const w = world(tables);
  // Nothing on file, so the submission is the production guard here, as it is for the whole set.
  await refused(
    post(w, { keys: ["quick_note"], languages: ["en_US"] }),
    "upstream_meta",
    502,
    "Adding templates only works on the production dashboard.",
  );
  assert.deepEqual(w.calls, []);
  assert.equal(tables.templates.length, 0);
  // And a starter the set no longer offers is not added, asked for or not.
  await refused(post(w, { keys: ["welcome_new"] }), "validation", 400, "Pick at least one starter template");
  await refused(post(w, {}, inA), "forbidden", 403);
});
