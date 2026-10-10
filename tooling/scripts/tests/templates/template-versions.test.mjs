/**
 * A message's email and text versions, run through their routes: the real route modules, their `run` called with a
 * database in memory and a model of the definer doors (the doors themselves are proved on Postgres in
 * template-versions.db.test.mjs).
 *
 * What is proved here is what the dashboard does around the doors: who may ask, what is checked before the database is
 * (the slots of the message, a subject, a text's length), what the door is given, how its refusals are answered, that
 * a message may begin as an email or a text (a starter begins as itself, with its own words, any other name says what it
 * is in `message`, and a name the workspace holds a row of ignores it), that the door which begins one is the service
 * role's and is told which member it acts for, and that the starter set files each starter's email and text versions
 * beside its WhatsApp one, once, whatever one of them does.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import {
  LIBRARY_STARTER_WORDS,
  LIBRARY_WORDS,
  MESSAGE_BEGIN_WORDS,
  TEMPLATE_NAME_WORDS,
  channelNeverCarries,
  starterByKey,
  starterByName,
  starterEmailText,
  starterSmsText,
  starterText,
} from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const versions = await import(at("apps/dashboard/app/api/v1/templates/versions/route.ts"));
const version = await import(at("apps/dashboard/app/api/v1/templates/versions/[id]/route.ts"));
const starter = await import(at("apps/dashboard/app/api/v1/templates/starter/route.ts"));
const { setServiceClient } = await import(at("apps/dashboard/src/server/service-db.ts"));

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
 * A model of save_template_version, create_message_version and remove_template_version over the same tables: enough of
 * the doors' own rules that a route test finds what the route does around them (the SQL is run in
 * template-versions.db.test.mjs). Every call is kept, and `refuse` makes the next call to a door refuse as the database
 * would. The member's own session holds the first and the last; create_message_version is on the service client only,
 * as it is granted, so a call of it on the session would find no such function.
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
    create_message_version: (a) => {
      calls.push(["create", a]);
      if (refuse.create) throw refuse.create;
      // The service role has no session, so the door asks the member it acts for.
      const seat = (tables.memberships ?? []).find((m) => m.tenant_id === a.p_tenant_id && m.user_id === a.p_user);
      if (!seat || !["owner", "operator", "partner"].includes(seat.role))
        throw doorError("Message not found.", "P0002");
      if (tables.templates.some((t) => t.tenant_id === a.p_tenant_id && t.name === a.p_name))
        throw doorError("This message already exists. Write its other versions in the Library.", "23505");
      const row = tpl(next++, a.p_tenant_id, {
        channel: a.p_channel,
        name: a.p_name,
        language: a.p_language,
        source: "chanlytics",
        body_preview: a.p_body,
        category: a.p_category,
        variables: a.p_variables,
        title: a.p_title || null,
        created_by: a.p_user,
      });
      tables.templates.push(row);
      return { id: row.id, channel: row.channel, name: row.name, language: row.language };
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
  setServiceClient(fakeDb(tables, {}, { create_message_version: rpcs.create_message_version }));
  const ctx = (params = {}) => ({
    supabase: fakeDb(
      tables,
      {},
      { save_template_version: rpcs.save_template_version, remove_template_version: rpcs.remove_template_version },
    ),
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

test("writing a version: a message's values are counted as contracts counts them, the highest number its row names", async () => {
  // The row lists two values and numbers them 1 and 3: the message fills three, so a version may use {{3}} and not {{4}}.
  const tables = {
    memberships: both("viewer", "operator"),
    templates: [
      tpl(1, B, {
        name: "gapped_note",
        variables: [
          { position: 1, label: "First name" },
          { position: 3, label: "Time" },
        ],
      }),
    ],
  };
  const w = world(tables);
  const post = (body) => versions.POST.run(send("POST", body, inB), w.ctx());
  const note = (body) => write({ name: "gapped_note", subject: "A note", body });
  await refused(
    post(note("Hi {{4}}")),
    "validation",
    400,
    "{{4}} is not one of this message's values: it has {{1}} to {{3}}.",
  );
  assert.deepEqual(w.calls, []);
  assert.equal((await post(note("Hi {{1}}, at {{3}}"))).template.name, "gapped_note");
});

test("writing a version of a starter the workspace has not added: its slots are the starter's, checked before the door", async () => {
  const tables = { memberships: both("viewer", "operator"), templates: [] };
  const w = world(tables);
  const post = (body) => versions.POST.run(send("POST", body, inB), w.ctx());
  // quick_note has three slots; a fourth is refused by the starter's own count, before the door.
  await refused(post(write({ name: "quick_note", body: "Hi {{4}}" })), "validation", 400, "{{4}} is not one of");
  assert.deepEqual(w.calls, []);
  // Its third is the starter's own, in the starter's own words: the message begins (the tests below say as what).
  const note = starterEmailText(starterByName("quick_note"), "en_US");
  assert.ok(note.body.includes("{{3}}"), "the starter's own words fill its third value");
  assert.equal(
    (await post(write({ name: "quick_note", subject: note.subject, body: note.body }))).template.name,
    "quick_note",
  );
  assert.deepEqual(
    w.calls.map(([door]) => door),
    ["create"],
  );
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

/** A WhatsApp number the workspace B has: the starter set's WhatsApp versions are made only where there is one. */
const NUMBER = { tenant_id: B, kind: "whatsapp", status: "active", config: {} };

test("with a number, a starter whose WhatsApp version cannot be made stops at the guard and files no version; one the set no longer offers is not added", async () => {
  const tables = { memberships: both("viewer", "operator"), templates: [], tenant_channels: [NUMBER] };
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

const NO_CHANNEL = "Connect a WhatsApp number first — templates belong to a number's account.";
/** Each result of the answer: the starter, the language, what became of its WhatsApp version and of each version beside it. */
const detailed = (r) =>
  r.results.map((x) => [x.key, x.language, x.status, x.detail, x.versions.map((v) => `${v.channel}:${v.status}`)]);

test("with no number the set is written as emails and texts: the first version of a name begins the message as the starter, the other is written beside it, the WhatsApp version is skipped and Meta is not asked", async () => {
  const { tables, w } = empty();
  // A preview answers a submission with its guard, a thrown refusal (the test above): a call to Meta would end this run.
  const r = await post(w, { keys: ["visit_reminder", "quick_note", "call_text"], languages: ["en_US"] });
  assert.deepEqual(detailed(r), [
    ["visit_reminder", "en_US", "skipped", NO_CHANNEL, ["email:saved", "sms:saved"]],
    ["quick_note", "en_US", "skipped", NO_CHANNEL, ["email:saved"]],
    ["call_text", "en_US", "skipped", NO_CHANNEL, ["sms:saved"]],
  ]);
  assert.deepEqual(
    [r.submitted, r.existing, r.synced, r.failed, r.skipped, r.versions_saved, r.versions_existing, r.versions_failed],
    [0, 0, 0, 0, 3, 4, 0, 0],
  );
  assert.equal(NO_CHANNEL, LIBRARY_WORDS.writeNeedsNumber, "the sentence is contracts', the one the composer says too");
  // The door is asked as saveVersion asks it: a name with no row is begun, the next version of it written beside.
  assert.deepEqual(
    w.calls.map(([door, a]) => `${door}:${a.p_name}/${a.p_channel}`),
    ["create:visit_reminder/email", "save:visit_reminder/sms", "create:quick_note/email", "create:call_text/sms"],
  );
  const created = Object.fromEntries(w.calls.filter(([d]) => d === "create").map(([, a]) => [a.p_name, a]));
  assert.deepEqual(
    [created.visit_reminder.p_category, created.quick_note.p_category, created.call_text.p_category],
    ["utility", "marketing", "utility"],
    "only a starter is a message about their own visit: the starter's category, whichever number there is",
  );
  assert.deepEqual(created.visit_reminder.p_variables, valuesOf(starterByName("visit_reminder"), "en_US"));
  assert.equal(created.visit_reminder.p_title, "", "the starter's title is the registry's, not a row's");
  assert.deepEqual(
    tables.templates.map((t) => [t.name, t.channel, t.source]),
    [
      ["visit_reminder", "email", "chanlytics"],
      ["visit_reminder", "sms", "chanlytics"],
      ["quick_note", "email", "chanlytics"],
      ["call_text", "sms", "chanlytics"],
    ],
    "no WhatsApp row is made, and a message with versions on its own channels needs none",
  );
  assert.equal(tables.templates.find((t) => t.name === "visit_reminder" && t.channel === "sms").category, "utility");

  // Said again, nothing is filed twice.
  const before = w.calls.length;
  const second = await post(w, { keys: ["visit_reminder", "quick_note", "call_text"], languages: ["en_US"] });
  assert.equal(w.calls.length, before, "no door was called");
  assert.deepEqual(
    detailed(second).map((x) => x[4]),
    [["email:exists", "sms:exists"], ["email:exists"], ["sms:exists"]],
  );
  assert.deepEqual([second.versions_saved, second.versions_existing, second.skipped], [0, 4, 3]);
});

test("a language of a starter is written beside the message that exists in another, in its own words, whichever channel began it", async () => {
  const { w } = empty();
  const r = await post(w, { keys: ["visit_reminder"], languages: ["en_US", "es"] });
  assert.deepEqual(
    detailed(r).map((x) => [x[1], x[4]]),
    [
      ["en_US", ["email:saved", "sms:saved"]],
      ["es", ["email:saved", "sms:saved"]],
    ],
  );
  assert.deepEqual(
    w.calls.map(([door, a]) => `${door}:${a.p_language}/${a.p_channel}`),
    ["create:en_US/email", "save:en_US/sms", "save:es/email", "save:es/sms"],
    "only the first version of the name begins it: the door refuses a name that has any row, in any language",
  );
  const visit = starterByKey("visit_reminder");
  const es = w.calls.map(([, a]) => a).find((a) => a.p_language === "es" && a.p_channel === "email");
  assert.equal(es.p_subject, starterEmailText(visit, "es").subject);
});

test("the channels asked for are the ones written: a number and WhatsApp alone asks Meta and writes no email or text; a number and email alone never asks Meta", async () => {
  const tables = {
    memberships: both("viewer", "operator"),
    templates: [
      tpl(1, B, { name: "visit_reminder", variables: [SLOTS[0], SLOTS[1], { position: 3 }, { position: 4 }] }),
    ],
    tenant_channels: [NUMBER],
  };
  const w = world(tables);
  // WhatsApp alone: a starter with a version on file is left as it is and no email or text is written beside it; one with
  // none is submitted, which a preview refuses at its guard, as it always did.
  const only = await post(w, { keys: ["visit_reminder"], languages: ["en_US"], channels: ["whatsapp"] });
  assert.deepEqual(detailed(only), [["visit_reminder", "en_US", "exists", undefined, []]]);
  assert.deepEqual(w.calls, [], "no door was called");
  await refused(
    post(w, { keys: ["quick_note"], languages: ["en_US"], channels: ["whatsapp"] }),
    "upstream_meta",
    502,
    "Adding templates only works on the production dashboard.",
  );
  // Email alone, with a number: nothing is asked of Meta (its guard would have refused), its version is skipped without
  // a word (it was not asked for), and the email is written, beginning the message.
  const mail = await post(w, { keys: ["quick_note"], languages: ["en_US"], channels: ["email"] });
  assert.deepEqual(detailed(mail), [["quick_note", "en_US", "skipped", undefined, ["email:saved"]]]);
  assert.deepEqual(
    w.calls.map(([door, a]) => `${door}:${a.p_name}/${a.p_channel}`),
    ["create:quick_note/email"],
  );
  // The default, with a number, asks for every channel: a starter with none on file meets the guard.
  await refused(
    post(w, { keys: ["call_text"], languages: ["en_US"] }),
    "upstream_meta",
    502,
    "Adding templates only works on the production dashboard.",
  );
  // A request that names no channel it knows is refused in one plain sentence.
  for (const channels of [[], ["fax"]])
    await refused(post(w, { keys: ["quick_note"], channels }), "validation", 400, LIBRARY_STARTER_WORDS.pickAChannel);
  assert.equal(LIBRARY_STARTER_WORDS.pickAChannel, "Pick at least one channel: WhatsApp, email or text.");
});

test("with no number and the door not switched on, each version says so in one plain sentence and the answer arrives whole", async () => {
  const { tables, w } = empty();
  w.refuse.create = doorError(
    "Could not find the function public.create_message_version in the schema cache",
    "PGRST202",
  );
  const r = await post(w, { keys: ["visit_reminder", "quick_note"], languages: ["en_US"] });
  assert.deepEqual(detailed(r), [
    ["visit_reminder", "en_US", "skipped", NO_CHANNEL, ["email:failed", "sms:failed"]],
    ["quick_note", "en_US", "skipped", NO_CHANNEL, ["email:failed"]],
  ]);
  assert.equal(r.results[0].versions[0].detail, MESSAGE_BEGIN_WORDS.doorNotSwitchedOn);
  assert.deepEqual([r.versions_saved, r.versions_failed], [0, 3]);
  assert.equal(tables.templates.length, 0, "nothing was written");
});

/* ------------------------ a message may begin as an email or a text ------------------------ */

/** Nothing on file: the workspace B holds no row of any name. */
function empty() {
  const tables = { memberships: both("viewer", "operator"), templates: [] };
  return { tables, w: world(tables) };
}
const begin = (w, body, q = inB) => versions.POST.run(send("POST", body, q), w.ctx());
/** What a member says a message is, with its first version. */
const OFFER = {
  category: "marketing",
  variables: [
    { position: 1, label: "First name", example: "Dani" },
    { position: 2, label: "The offer" },
  ],
  title: "Spring news",
};
const news = (over = {}) =>
  write({
    name: "spring_news",
    subject: "News from {{2}}",
    body: "Hi {{1}}, spring is here: {{2}}",
    message: OFFER,
    ...over,
  });
const valuesOf = (s, language) =>
  starterText(s, language).slots.map((x, i) => ({ position: i + 1, label: x.label, example: x.example }));

test("a starter's first version, with no row of its name, begins the message as the starter: its category, its values and no title, whatever `message` says", async () => {
  const { tables, w } = empty();
  const visit = starterByName("visit_reminder");
  const visitMail = starterEmailText(visit, "en_US");
  const email = await begin(
    w,
    write({
      subject: visitMail.subject,
      body: visitMail.body,
      message: { category: "marketing", variables: [], title: "My own title" },
    }),
  );
  assert.deepEqual(w.calls, [
    [
      "create",
      {
        p_tenant_id: B,
        p_user: USER,
        p_name: "visit_reminder",
        p_language: "en_US",
        p_channel: "email",
        p_subject: visitMail.subject,
        p_body: visitMail.body,
        p_category: "utility",
        p_variables: valuesOf(visit, "en_US"),
        p_title: "",
      },
    ],
  ]);
  assert.deepEqual(email.template, {
    id: tables.templates.at(-1).id,
    channel: "email",
    name: "visit_reminder",
    language: "en_US",
  });
  assert.deepEqual(email.warnings, []);

  // It exists now, so its other versions are written beside it, taking what the first said.
  const text = await begin(w, write({ channel: "sms", subject: null, body: starterSmsText(visit, "en_US").body }));
  assert.equal(w.calls.at(-1)[0], "save", "the door for the versions after the first");
  assert.equal(text.template.channel, "sms");
  const row = tables.templates.find((t) => t.channel === "sms");
  assert.equal(row.category, "utility");
  assert.deepEqual(row.variables, valuesOf(visit, "en_US"));
  assert.equal(w.calls.filter(([door]) => door === "create").length, 1);

  // Its words are the starter's in the language it is begun in.
  const check = starterByName("after_visit_check");
  const checkEs = starterEmailText(check, "es");
  await begin(w, write({ name: "after_visit_check", language: "es", subject: checkEs.subject, body: checkEs.body }));
  const es = w.calls.at(-1)[1];
  assert.deepEqual(es.p_variables, valuesOf(check, "es"));
  assert.notEqual(es.p_variables[0].label, valuesOf(check, "en_US")[0].label, "Spanish labels, not English ones");
  assert.equal(es.p_category, "utility");

  // A text of a starter that is about a visit begins it too, and an offer begins as marketing.
  const callText = starterSmsText(starterByName("call_text"), "en_US");
  await begin(w, write({ name: "call_text", channel: "sms", subject: null, body: callText.body }));
  assert.equal(w.calls.at(-1)[1].p_category, "utility");
  const note = starterEmailText(starterByName("quick_note"), "en_US");
  await begin(w, write({ name: "quick_note", subject: note.subject, body: note.body }));
  assert.equal(w.calls.at(-1)[1].p_category, "marketing");
  assert.deepEqual(w.calls.at(-1)[1].p_variables, valuesOf(starterByName("quick_note"), "en_US"));
});

test("a starter begins only with its own words: a member's are refused in one sentence, so a utility category is never put on words the member wrote", async () => {
  const { tables, w } = empty();
  const mail = starterEmailText(starterByName("visit_reminder"), "en_US");
  const sms = starterSmsText(starterByName("visit_reminder"), "en_US");
  const sentence = "A starter begins with its own words. Add the starter set, then change the words in the Library.";
  assert.equal(MESSAGE_BEGIN_WORDS.starterNeedsItsOwnWords, sentence);
  for (const [why, over] of [
    [
      "an offer's words under a visit's name and category",
      { subject: "Spring sale", body: "Hi {{1}}, 20% off today." },
    ],
    ["the starter's body with a subject of the member's", { subject: "Buy now", body: mail.body }],
    ["the starter's subject with a body of the member's", { subject: mail.subject, body: "Hi {{1}}, a sale." }],
    ["one word changed", { subject: mail.subject, body: mail.body.replace("Hi", "Hello") }],
    ["a text's words in an email", { subject: mail.subject, body: sms.body }],
    ["words that say nothing of a visit, with a message that says utility", { body: "Hi {{1}}", message: OFFER }],
    ["an extra line", { subject: mail.subject, body: `${mail.body}\n\nAnd 10% off.` }],
  ]) {
    await refused(begin(w, write(over)), "validation", 400, sentence);
    assert.deepEqual(w.calls, [], why);
  }
  // A text of the starter is held to the starter's text.
  await refused(
    begin(w, write({ channel: "sms", subject: null, body: `${sms.body} Reply now for 10% off.` })),
    "validation",
    400,
    sentence,
  );
  assert.deepEqual(w.calls, []);
  assert.equal(tables.templates.length, 0);

  // The starter's words as the route cleans them are the starter's still: padding and Windows line endings change none.
  const padded = await begin(
    w,
    write({ subject: `  ${mail.subject}  `, body: `\r\n${mail.body.replace(/\n/g, "\r\n")}  ` }),
  );
  assert.equal(padded.template.name, "visit_reminder");
  assert.deepEqual(
    w.calls.map(([door, a]) => [door, a.p_subject, a.p_body, a.p_category]),
    [["create", mail.subject, mail.body, "utility"]],
  );
  // The message exists now, and a version beside it is the member's to word: the rule is about beginning one.
  const mine = await begin(w, write({ channel: "sms", subject: null, body: "Hi {{1}}, my own words." }));
  assert.equal(mine.template.channel, "sms");
  assert.equal(w.calls.at(-1)[0], "save");
});

test("the first version of a message is the service role's, naming the member who asked, and the session never calls it", async () => {
  const tables = {
    memberships: [
      ...both("viewer", "operator"),
      { ...membership(B, "owner", "bayside", "2026-03-01T00:00:00Z"), user_id: "u2" },
    ],
    templates: [],
  };
  const w = world(tables);
  // The door is modelled on the service client alone: a call on the session would find no such function and throw.
  const asOwner = await versions.POST.run(send("POST", news(), inB), { ...w.ctx(), userId: "u2" });
  assert.equal(w.calls.length, 1);
  assert.equal(w.calls[0][1].p_user, "u2", "the member who asked, not a fixed one");
  assert.equal(tables.templates.find((t) => t.id === asOwner.template.id).created_by, "u2");
  const asOperator = await begin(w, news({ name: "second_news" }));
  assert.equal(w.calls.at(-1)[1].p_user, USER);
  assert.equal(tables.templates.find((t) => t.id === asOperator.template.id).created_by, USER);
});

test("a starter has no first version on a channel it writes nothing for in that language: it is not found, as it was, and the door is not asked", async () => {
  const { w } = empty();
  for (const [why, over] of [
    [
      "an offer has no text: texts carry no offers",
      { name: "quick_note", channel: "sms", subject: null, body: "Hi {{1}}" },
    ],
    ["so does the month's offer", { name: "this_months_offer", channel: "sms", subject: null, body: "Hi {{1}}" }],
    ["a call's text has no email: a caller has a phone", { name: "call_text", body: "Hi {{1}}" }],
    ["the starter writes no French", { name: "visit_reminder", language: "fr", body: "Bonjour {{1}}" }],
    ["a retired starter is no longer written", { name: "welcome_new", body: "Hi {{1}}" }],
    [
      "a custom message cannot take a starter's name, retired or not",
      { name: "welcome_new", body: "Hi {{1}}", message: OFFER },
    ],
  ]) {
    await refused(begin(w, write(over)), "not_found", 404, "Message not found.");
    assert.deepEqual(w.calls, [], why);
  }
  // The starter's own count of values is held before the door: a fifth is not its.
  await refused(
    begin(w, write({ name: "visit_reminder", body: "Hi {{5}}" })),
    "validation",
    400,
    "{{5}} is not one of",
  );
  assert.deepEqual(w.calls, []);
});

test("a custom message's first version: an email that is an offer or news begins it, with the values and the title it says", async () => {
  const { tables, w } = empty();
  const r = await begin(w, news());
  assert.deepEqual(w.calls, [
    [
      "create",
      {
        p_tenant_id: B,
        p_user: USER,
        p_name: "spring_news",
        p_language: "en_US",
        p_channel: "email",
        p_subject: "News from {{2}}",
        p_body: "Hi {{1}}, spring is here: {{2}}",
        p_category: "marketing",
        p_variables: [
          { position: 1, label: "First name", example: "Dani" },
          { position: 2, label: "The offer", example: null },
        ],
        p_title: "Spring news",
      },
    ],
  ]);
  assert.deepEqual(Object.keys(r).sort(), ["template", "warnings"]);
  assert.deepEqual(r.template, {
    id: tables.templates.at(-1).id,
    channel: "email",
    name: "spring_news",
    language: "en_US",
  });

  // No title and no values are a message too: its name made words, and a message that takes nothing.
  const plain = await begin(
    w,
    news({
      name: "plain_news",
      subject: "Spring",
      body: "Spring is here.",
      message: { category: "marketing", variables: [] },
    }),
  );
  assert.equal(plain.template.name, "plain_news");
  assert.deepEqual(w.calls.at(-1)[1].p_variables, []);
  assert.equal(w.calls.at(-1)[1].p_title, "", "none, which the door reads as no title");

  // Its second version is written beside the first, and takes the first's values: the message exists now.
  const again = await begin(
    w,
    news({ language: "es", message: undefined, subject: "Novedades de {{2}}", body: "Hola {{1}}: {{2}}" }),
  );
  assert.equal(w.calls.at(-1)[0], "save");
  assert.equal(again.template.language, "es");
});

test("a custom message is an offer or news: utility is a starter's alone, a text of an offer is refused, and the words are checked first", async () => {
  const { tables, w } = empty();
  const post = (over) => begin(w, news(over));
  await refused(
    post({ message: { ...OFFER, category: "utility" } }),
    "validation",
    400,
    MESSAGE_BEGIN_WORDS.customIsAnOffer,
  );
  assert.equal(
    MESSAGE_BEGIN_WORDS.customIsAnOffer,
    "A message you write is an offer or news. Only a starter is a reminder, a check after or a follow-up.",
  );
  // A text of an offer: contracts' own sentence, the one the ticks and the sends say.
  await refused(
    post({ channel: "sms", subject: null, body: "Hi {{1}}" }),
    "validation",
    400,
    channelNeverCarries("sms", "marketing"),
  );
  await refused(post({ channel: "sms", subject: null, body: "Hi {{1}}" }), "validation", 400, "Texts carry no offers.");
  // And a text of a message a member writes cannot be utility either, so none is begun by text.
  await refused(
    post({ channel: "sms", subject: null, body: "Hi {{1}}", message: { ...OFFER, category: "utility" } }),
    "validation",
    400,
    MESSAGE_BEGIN_WORDS.customIsAnOffer,
  );
  // The words are checked against the values it says, before the rule about the message.
  await refused(
    post({ body: "Hi {{3}}", message: { ...OFFER, category: "utility" } }),
    "validation",
    400,
    "{{3}} is not one of this message's values: it has {{1}} to {{2}}.",
  );
  await refused(
    post({ subject: "Spring", body: "Hi {{1}}", message: { category: "marketing", variables: [] } }),
    "validation",
    400,
    "This message fills no values, so {{1}} has nothing to take.",
  );
  await refused(post({ subject: null }), "validation", 400, "Give the email a subject.");
  // The name is the shape Meta takes, in contracts' words.
  for (const name of ["Spring News", "spring news", "spring-news", "été"])
    await refused(post({ name }), "validation", 400, TEMPLATE_NAME_WORDS);
  assert.equal(TEMPLATE_NAME_WORDS, "The name needs letters, digits or underscores.");
  assert.deepEqual(w.calls, [], "none of them reached the door");
  assert.equal(tables.templates.length, 0);
});

test("a name with no row, no starter and no message is not found; a name with a row ignores message and is written beside its rows", async () => {
  const { tables, w } = empty();
  await refused(begin(w, write({ name: "spring_news" })), "not_found", 404, "Message not found.");
  assert.deepEqual(w.calls, []);

  // The message exists: its slots are its row's (two), whatever `message` says (none), and its category stays its own.
  tables.templates.push(tpl(1, B, { name: "spring_news", category: "marketing" }));
  const r = await begin(
    w,
    write({
      name: "spring_news",
      message: { category: "utility", variables: [], title: "Ignored" },
      body: "Hi {{1}}, {{2}}",
    }),
  );
  assert.deepEqual(
    w.calls.map(([door]) => door),
    ["save"],
  );
  assert.equal(r.template.name, "spring_news");
  assert.equal(
    tables.templates.find((t) => t.channel === "email").category,
    "marketing",
    "the message's own, not the one sent",
  );
  await refused(
    begin(w, write({ name: "spring_news", message: { category: "marketing", variables: [] }, body: "Hi {{3}}" })),
    "validation",
    400,
    "{{3}} is not one of this message's values: it has {{1}} to {{2}}.",
  );
});

test("the door that begins a message answers in its own words, a missing door in one plain sentence with nothing else changed, and a fault in none", async () => {
  const { tables, w } = empty();
  const post = (over) => begin(w, news(over));
  w.refuse.create = doorError("This message already exists. Write its other versions in the Library.", "23505");
  await refused(post(), "conflict", 409, "This message already exists. Write its other versions in the Library.");
  w.refuse.create = doorError("A title is at most 60 characters.", "22023");
  await refused(post(), "validation", 400, "A title is at most 60 characters.");
  w.refuse.create = doorError("Message not found.", "P0002");
  await refused(post(), "not_found", 404, "Message not found.");
  w.refuse.create = doorError("canceling statement due to statement timeout", "57014");
  await refused(post(), "internal", 503, "Something went wrong.");

  // A database that has not applied 00343: PostgREST says its schema cache lacks the function (PGRST202), and Postgres
  // itself says undefined_function (42883) when the cache still lists one it has dropped.
  const sentence = "Writing a message with no WhatsApp version is not switched on here yet.";
  assert.equal(MESSAGE_BEGIN_WORDS.doorNotSwitchedOn, sentence);
  for (const code of ["PGRST202", "42883"]) {
    w.refuse.create = doorError("Could not find the function public.create_message_version in the schema cache", code);
    await refused(post(), "conflict", 409, sentence);
    // A starter begins through the same door, so it says the same.
    await refused(
      begin(
        w,
        write({
          name: "call_text",
          channel: "sms",
          subject: null,
          body: starterSmsText(starterByName("call_text"), "en_US").body,
        }),
      ),
      "conflict",
      409,
      sentence,
    );
  }
  assert.equal(tables.templates.length, 0, "nothing was written");
  w.refuse.create = undefined;

  // And nothing else changes while it is missing: a version beside a row on file is the old door's.
  tables.templates.push(tpl(1, B, { name: "spring_news", category: "marketing" }));
  w.refuse.create = doorError("Could not find the function", "PGRST202");
  assert.equal((await post({ message: undefined, body: "Hi {{1}}, {{2}}" })).template.channel, "email");
  assert.equal(w.calls.at(-1)[0], "save");
});

test("the body takes `message` as the wire names it, and refuses one that is not a category and numbered values", async () => {
  const { w } = empty();
  const post = (message) => begin(w, news({ message }));
  await refused(
    post({ category: "authentication", variables: [] }),
    "validation",
    400,
    "message.category: A message is an offer or news",
  );
  await refused(post({ variables: [] }), "validation", 400, "message.category: A message is an offer or news");
  await refused(
    post({ category: "marketing" }),
    "validation",
    400,
    "message.variables: Give each value a number, in order from 1, and a name.",
  );
  await refused(
    post({ category: "marketing", variables: [{ position: "1", label: "First name" }] }),
    "validation",
    400,
    "Give each value a number, in order from 1, and a name.",
  );
  await refused(
    post({ category: "marketing", variables: [{ position: 1 }] }),
    "validation",
    400,
    "Give each value a number, in order from 1, and a name.",
  );
  await refused(post("marketing"), "validation", 400, "message");
  assert.deepEqual(w.calls, []);
  // A title may be left out or null, an example too, and the door is given them as null and "".
  await begin(
    w,
    news({
      name: "bare_news",
      subject: "Spring",
      message: { category: "marketing", variables: [{ position: 1, label: "Name", example: null }], title: null },
      body: "Hi {{1}}",
    }),
  );
  assert.deepEqual(w.calls.at(-1)[1].p_variables, [{ position: 1, label: "Name", example: null }]);
  assert.equal(w.calls.at(-1)[1].p_title, "");
});
