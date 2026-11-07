/**
 * Whom a model call is for (decision 0097): every path to Anthropic says, and a banned person or workspace does not go out
 * at all. The real lib/ai/model.ts over a database in memory and a scripted API.
 *
 * What it holds: every purpose has made the decision, and the compiler and the port both refuse a request that has not. The
 * switch off is today, to the byte: no read, no create, no header. With it on, each purpose sends its own subject's profile,
 * on the fallback's try too; a subject with none has one made once, however many calls ask at the same moment, and an answer
 * that never came is never answered with a second create; a restricted subject's traffic goes under its own id, for Anthropic
 * to serve what it still serves; a banned subject's never leaves, not with no profile and not under another's.
 */
import { test, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import ts from "typescript";
import {
  MODEL_PURPOSES,
  MODEL_ROUTES,
  anthropicActed,
  anthropicPaused,
  enforcementActionsOf,
  enforcementStatusOf,
  enforcementWords,
  modelStandingOf,
  modelSubjectOf,
} from "@chanlytics/contracts";
import { askModel, streamModel } from "@chanlytics/channels/ai";
import { resetBreakers } from "@chanlytics/channels/shared";
import { fakeDb } from "../../_fake-db.mjs";
import { at, withEnv } from "../../_cron-doors-world.mjs";
import { repoFiles, parse, importsOf } from "../../_ast.mjs";
import { said, status, streamed, scripted } from "../_model-world.mjs";

process.env.ANTHROPIC_API_KEY = "model-key-for-this-file";
for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "ANTHROPIC_PROFILES"]) delete process.env[k];

const { setPg } = await import(at("apps/edge/lib/shared/pg.ts"));
const { callModel, askJson, setModelFetch, streamModelCall } = await import(at("apps/edge/lib/ai/model.ts"));
const { forgetAnthropicProfiles } = await import(at("apps/edge/lib/ai/anthropic-profiles/attribution.ts"));
after(() => {
  setPg(null);
  setModelFetch(null);
});
beforeEach(() => {
  resetBreakers();
  forgetAnthropicProfiles();
});

const T = "aaaaaaaa-0000-4000-8000-000000000001";
const U = "bbbbbbbb-0000-4000-8000-000000000001";
const WORKSPACE_PROFILE = "uprof_workspace";
const PERSON_PROFILE = "uprof_person";
const MESSAGES = "https://api.anthropic.com/v1/messages";
const PROFILES = "https://api.anthropic.com/v1/user_profiles";
const ON = { ANTHROPIC_PROFILES: "on" };
const body = { system: "Answer.", messages: [{ role: "user", content: "hi" }] };
const FOR = { tenantId: T, userId: U };

const row = (over = {}) => ({
  id: crypto.randomUUID(),
  kind: "workspace",
  user_id: null,
  tenant_id: T,
  reference_id: `workspace:${T}`,
  profile_id: WORKSPACE_PROFILE,
  claimed_at: "2026-11-01T00:00:00Z",
  enforcement_status: "unrestricted",
  enforcement_actions: [],
  enforcement_at: null,
  ...over,
});
const person = (over = {}) =>
  row({
    kind: "person",
    user_id: U,
    tenant_id: null,
    reference_id: `person:${U}`,
    profile_id: PERSON_PROFILE,
    ...over,
  });

/** A database in memory, with the claim as 00544 writes it: once a subject, and the details only to the call that made it. */
function world(rows = [], faults = {}) {
  const tables = {
    tenants: [{ id: T, status: "active", left_empty_at: null }],
    billing_accounts: [{ tenant_id: T, mode: "stripe", status: "active" }],
    ai_usage: [],
    events: [],
    anthropic_profiles: rows,
  };
  const claim = ({ p_kind, p_subject }) => {
    const key = p_kind === "person" ? "user_id" : "tenant_id";
    if (tables.anthropic_profiles.some((r) => r[key] === p_subject)) return null;
    const id = crypto.randomUUID();
    const reference_id = `${p_kind}:${p_subject}`;
    tables.anthropic_profiles.push(
      row({ id, kind: p_kind, user_id: null, tenant_id: null, [key]: p_subject, reference_id, profile_id: null }),
    );
    return {
      id,
      reference_id,
      onboarded_at: "2026-10-01T12:00:00+00:00",
      email: p_kind === "person" ? "  Owner@Example.com " : null,
    };
  };
  const db = fakeDb(tables, faults, { anthropic_profile_claim: claim });
  setPg(db);
  return { tables, db };
}

/** The API by address: a create's answers in order, then the Messages API's. */
function api({ creates = [], messages = [said("Hello.")] } = {}) {
  const made = scripted(...(creates.length ? creates : [profile("uprof_made")]));
  const model = scripted(...messages);
  const fetch = (url, init) => (String(url).startsWith(PROFILES) ? made.fetch(url, init) : model.fetch(url, init));
  setModelFetch(fetch);
  return { made, model };
}
const profile = (id) => ({
  kind: "answer",
  body: { type: "user_profile", id, enforcement_status: "unrestricted", enforcement_actions: [] },
});

test("every purpose has said whom its traffic is for", () => {
  for (const p of MODEL_PURPOSES)
    assert.ok(["person", "workspace"].includes(MODEL_ROUTES[p].attributed), `${p} has made no decision`);
  // What nobody signed in asks for is the business's, and it is the traffic the docs do not name: the receptionist above all.
  for (const p of ["receptionist", "reply_draft", "lead_judge", "reply_read", "note_suggest", "sender_read"])
    assert.equal(MODEL_ROUTES[p].attributed, "workspace", p);
  for (const p of ["ask", "lead_json", "template_draft", "receptionist_review", "fix_route", "file_look"])
    assert.equal(MODEL_ROUTES[p].attributed, "person", p);
});

test("the one decision: a person's purpose is theirs, nobody's is the workspace's, and no workspace is ours", () => {
  assert.deepEqual(modelSubjectOf("ask", FOR), { kind: "person", userId: U });
  // A sweep asks a person's purpose too, with nobody signed in: never a person it did not name.
  assert.deepEqual(modelSubjectOf("ask", { tenantId: T }), { kind: "workspace", tenantId: T });
  // A stranger's words at the receptionist are not the owner's, even with a person named beside them.
  assert.deepEqual(modelSubjectOf("receptionist", FOR), { kind: "workspace", tenantId: T });
  assert.deepEqual(modelSubjectOf("ask", { tenantId: null, userId: U }), { kind: "person", userId: U });
  assert.deepEqual(modelSubjectOf("receptionist", { tenantId: null }), { kind: "ours" });
});

test("the port refuses a request that says nothing of whom it is for, and nothing leaves", async () => {
  const net = scripted(said("never"));
  const ask = { purpose: "receptionist", body };
  const r = await askModel("k", ask, { fetch: net.fetch });
  assert.equal(r.outcome, "rejected");
  assert.equal(r.errorType, "no_attribution");
  const s = await streamModel("k", ask, { fetch: net.fetch });
  assert.equal(s.outcome, "rejected");
  assert.equal(net.calls.length, 0, "nothing reached the API");
});

test("no way round the door: only lib/ai/model.ts asks the port, and only the port names the API", () => {
  const files = repoFiles(["apps", "packages"]).filter((f) => !/\.(test|type-test)\.|\/test\/|\.generated\./.test(f));
  // By the module named: the dashboard has an askModel and a streamModel of its own, Ask's settings and its call to the edge.
  const asking = files.filter((f) =>
    importsOf(parse(f)).some(
      (i) =>
        !i.typeOnly &&
        /channels(\/ai)?(\.js)?$/.test(i.specifier) &&
        (i.names ?? []).some((n) => n === "askModel" || n === "streamModel"),
    ),
  );
  assert.deepEqual(asking, ["apps/edge/lib/ai/model.ts"], "a second door to the port has no attribution decision");

  const naming = files.filter((f) => {
    let found = false;
    const visit = (n) => {
      if ((ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) && n.text.includes("api.anthropic.com"))
        found = true;
      ts.forEachChild(n, visit);
    };
    visit(parse(f));
    return found;
  });
  assert.deepEqual(
    naming.sort(),
    [
      "packages/channels/src/ai/anthropic-files.ts",
      "packages/channels/src/ai/anthropic-profiles.ts",
      "packages/channels/src/ai/anthropic.ts",
    ],
    "only the port's modules reach Anthropic: a call, a profile, and a file (an upload is no inference, so it names no one)",
  );

  const sdk = files.filter((f) => importsOf(parse(f)).some((i) => !i.typeOnly && i.specifier === "@anthropic-ai/sdk"));
  assert.deepEqual(sdk, [], "the SDK is a client with no attribution decision: the apps ask through the port");
});

test("the switch off is today: no read, no create, no header, and every purpose still goes", async () => {
  const w = world([person()]);
  const net = api();
  for (const purpose of MODEL_PURPOSES) {
    const r = await callModel({ purpose, body }, FOR);
    assert.equal(r.outcome, "ok", purpose);
  }
  assert.equal(net.made.calls.length, 0, "nothing was created");
  assert.ok(net.model.calls.every((c) => !("anthropic-user-profile-id" in c.headers)));
  assert.ok(!w.db.seen.some((q) => q.table === "anthropic_profiles" || q.rpc === "anthropic_profile_claim"));
});

test("with it on, every purpose sends its own subject's profile", async () => {
  world([row(), person()]);
  const net = api();
  await withEnv(ON, async () => {
    for (const purpose of MODEL_PURPOSES) {
      assert.equal((await callModel({ purpose, body }, FOR)).outcome, "ok", purpose);
      const sent = net.model.calls.at(-1).headers["anthropic-user-profile-id"];
      assert.equal(
        sent,
        MODEL_ROUTES[purpose].attributed === "person" ? PERSON_PROFILE : WORKSPACE_PROFILE,
        `${purpose} went under the wrong profile`,
      );
    }
  });
  assert.equal(net.model.calls.length, MODEL_PURPOSES.length);
});

test("askJson and Ask's stream go by the same door, and the fallback's try carries the same profile", async () => {
  world([row(), person()]);
  const net = api({ messages: [status(529, "Overloaded"), said('{"ok":true}')] });
  await withEnv(ON, async () => {
    await askJson({
      purpose: "note_suggest",
      system: "s",
      user: "u",
      schema: { type: "object" },
      maxTokens: 50,
      plainJsonHint: "json",
      for: FOR,
    });
    assert.deepEqual(
      net.model.calls.map((c) => c.headers["anthropic-user-profile-id"]),
      [WORKSPACE_PROFILE, WORKSPACE_PROFILE],
    );
    const flow = scripted(streamed("Hi."));
    setModelFetch(flow.fetch);
    const s = await streamModelCall({ purpose: "ask", body }, FOR);
    assert.equal(s.outcome, "ok");
    assert.equal(flow.calls[0].headers["anthropic-user-profile-id"], PERSON_PROFILE);
    assert.equal(flow.calls[0].url, MESSAGES);
  });
});

test("a restricted subject's calls go under its own id: Anthropic may still serve them in part, and it decides", async () => {
  for (const status of ["restricted", "pending"]) {
    forgetAnthropicProfiles();
    world([row(), person({ enforcement_status: status })]);
    const net = api();
    await withEnv(ON, async () => {
      assert.equal((await callModel({ purpose: "ask", body }, FOR)).outcome, "ok", status);
      assert.equal(net.model.calls[0].headers["anthropic-user-profile-id"], PERSON_PROFILE, status);
      const flow = scripted(streamed("Hi."));
      setModelFetch(flow.fetch);
      assert.equal((await streamModelCall({ purpose: "ask", body }, FOR)).outcome, "ok", status);
      assert.equal(flow.calls[0].headers["anthropic-user-profile-id"], PERSON_PROFILE, status);
    });
  }
});

test("a call Anthropic refuses fails as any refusal does, and the next account's call goes", async () => {
  world([row(), person({ enforcement_status: "restricted" })]);
  const net = api({ messages: [status(403, "This profile is restricted."), said('{"ok":true}')] });
  await withEnv(ON, async () => {
    assert.equal((await callModel({ purpose: "ask", body }, FOR)).outcome, "rejected");
    assert.equal((await callModel({ purpose: "receptionist", body }, { tenantId: T })).outcome, "ok");
    assert.deepEqual(
      net.model.calls.map((c) => c.headers["anthropic-user-profile-id"]),
      [PERSON_PROFILE, WORKSPACE_PROFILE],
    );
  });
});

test("a banned subject's calls do not leave: not with no profile, and not under another's", async () => {
  world([row(), person({ enforcement_status: "banned" })]);
  const net = api();
  await withEnv(ON, async () => {
    assert.deepEqual(await callModel({ purpose: "ask", body }, FOR), { outcome: "held", why: "paused" });
    assert.deepEqual(await streamModelCall({ purpose: "ask", body }, FOR), { outcome: "held", why: "paused" });
    assert.equal(net.model.calls.length, 0, "the person's traffic left");
    // The workspace's own traffic is its own: one person's ban stops one person.
    assert.equal((await callModel({ purpose: "receptionist", body }, FOR)).outcome, "ok");
    assert.equal(net.model.calls[0].headers["anthropic-user-profile-id"], WORKSPACE_PROFILE);
  });
});

test("a banned workspace holds its receptionist and leaves the person's Ask, and every other workspace, alone", async () => {
  const other = "aaaaaaaa-0000-4000-8000-000000000002";
  world([
    row({ enforcement_status: "banned" }),
    person(),
    row({ tenant_id: other, reference_id: `workspace:${other}`, profile_id: "uprof_other" }),
  ]);
  const net = api();
  await withEnv(ON, async () => {
    assert.deepEqual(await callModel({ purpose: "receptionist", body }, { tenantId: T }), {
      outcome: "held",
      why: "paused",
    });
    assert.equal(net.model.calls.length, 0);
    assert.equal((await callModel({ purpose: "ask", body }, FOR)).outcome, "ok");
    assert.equal(net.model.calls[0].headers["anthropic-user-profile-id"], PERSON_PROFILE);
  });
});

test("a read that fails holds the call rather than strip the id, and answers the last it saw while it has one", async () => {
  const w = world([], { "anthropic_profiles.select": { message: "down" } });
  const net = api();
  await withEnv(ON, async () => {
    assert.deepEqual(await callModel({ purpose: "receptionist", body }, { tenantId: T }), {
      outcome: "held",
      why: "unread",
    });
    assert.equal(net.model.calls.length, 0);
    assert.equal(net.made.calls.length, 0, "and nothing is created on a read that could not say none exists");
  });
  assert.ok(w.db.seen.length > 0);

  // Past the minute, the read fails, and the last it saw stands: a blip neither strips the id nor stops the receptionist.
  const up = { "anthropic_profiles.select": null };
  const held = { message: "down" };
  world([row()], up);
  const later = api();
  const realNow = Date.now;
  await withEnv(ON, async () => {
    await callModel({ purpose: "receptionist", body }, { tenantId: T });
    up["anthropic_profiles.select"] = held;
    Date.now = () => realNow() + 2 * 60_000;
    try {
      assert.equal((await callModel({ purpose: "receptionist", body }, { tenantId: T })).outcome, "ok");
    } finally {
      Date.now = realNow;
    }
  });
  assert.deepEqual(
    later.model.calls.map((c) => c.headers["anthropic-user-profile-id"]),
    [WORKSPACE_PROFILE, WORKSPACE_PROFILE],
  );
});

test("a subject with none has one made once, and the call goes under it", async () => {
  const { tables } = world();
  const net = api();
  await withEnv(ON, async () => {
    const [a, b, c] = await Promise.all([
      callModel({ purpose: "ask", body }, FOR),
      callModel({ purpose: "ask", body }, FOR),
      callModel({ purpose: "ask", body }, FOR),
    ]);
    assert.deepEqual([a.outcome, b.outcome, c.outcome], ["ok", "ok", "ok"]);
    assert.equal(net.made.calls.length, 1, "POST /v1/user_profiles is not idempotent: never twice");
    await callModel({ purpose: "ask", body }, FOR);
    assert.equal(net.made.calls.length, 1);
    assert.equal(net.model.calls.at(-1).headers["anthropic-user-profile-id"], "uprof_made");
  });
  assert.equal(tables.anthropic_profiles.length, 1);
  assert.equal(tables.anthropic_profiles[0].profile_id, "uprof_made");
});

test("what a create says: ours, stable, and no name, no address, no hash of one and no words", async () => {
  world();
  const net = api();
  await withEnv(ON, () => callModel({ purpose: "ask", body }, FOR));
  const { url, body: sent, headers } = net.made.calls[0];
  assert.equal(url, PROFILES);
  assert.deepEqual(sent, {
    external_user_details: {
      reference_id: `person:${U}`,
      entity_type: "individual",
      onboarded_at: "2026-10-01T12:00:00.000Z",
    },
  });
  assert.ok(!JSON.stringify(sent).includes("example.com"), "the address never leaves");
  assert.ok(!("anthropic-beta" in headers), "a user-profiles beta would leave out the enforcement fields");

  forgetAnthropicProfiles();
  world();
  const again = api();
  await withEnv(ON, () => callModel({ purpose: "receptionist", body }, { tenantId: T }));
  assert.deepEqual(again.made.calls[0].body.external_user_details, {
    reference_id: `workspace:${T}`,
    entity_type: "business",
    onboarded_at: "2026-10-01T12:00:00.000Z",
  });
});

test("a create that made nothing lets the claim go; one whose answer never came keeps it, and nothing creates again", async () => {
  for (const [script, kept] of [
    [status(400, "No."), false],
    [status(429, "Not now."), false],
    [status(500, "Who knows."), true],
  ]) {
    forgetAnthropicProfiles();
    resetBreakers();
    const { tables } = world();
    const net = api({ creates: [script] });
    await withEnv(ON, async () => {
      const first = await callModel({ purpose: "receptionist", body }, { tenantId: T });
      assert.equal(first.outcome, "ok", "a customer's reply is not refused for a registration");
      assert.ok(!("anthropic-user-profile-id" in net.model.calls[0].headers));
      assert.equal(tables.anthropic_profiles.length, kept ? 1 : 0);
      forgetAnthropicProfiles();
      await callModel({ purpose: "receptionist", body }, { tenantId: T });
      assert.equal(net.made.calls.length, kept ? 1 : 2, "an unknown answer is never answered with a second create");
    });
  }
});

test("an id we could not store is still sent: it is real, and the sweep finds it", async () => {
  const { tables } = world([], { "anthropic_profiles.update": { message: "down" } });
  const net = api();
  await withEnv(ON, () => callModel({ purpose: "receptionist", body }, { tenantId: T }));
  assert.equal(net.model.calls[0].headers["anthropic-user-profile-id"], "uprof_made");
  assert.equal(tables.anthropic_profiles[0].profile_id, null, "the claim stands, for the sweep to adopt");
});

test("no workspace and nobody is ours, by decision, and goes under no profile", async () => {
  world();
  const net = api();
  await withEnv(ON, () => callModel({ purpose: "lead_judge", body }, { tenantId: null }));
  assert.equal(net.made.calls.length, 0);
  assert.ok(!("anthropic-user-profile-id" in net.model.calls[0].headers));
});

test("Anthropic's word: an unknown value is a restriction, and no value at all says nothing", () => {
  assert.equal(enforcementStatusOf("unrestricted"), "unrestricted");
  // On the reference and not on the guide's page: a list filtered on the guide's two values would miss it.
  assert.equal(enforcementStatusOf("pending"), "pending");
  assert.equal(enforcementStatusOf("suspended_for_review"), "restricted", "its page asks an unknown value to read so");
  // An answer that left the field out must not pause every customer on the platform.
  assert.equal(enforcementStatusOf(undefined), null);
  assert.equal(enforcementStatusOf(null), null);
  // A ban alone stops a call here; every open action is told to the platform; a member reads one of two words.
  assert.deepEqual(
    ["unrestricted", "pending", "restricted", "banned"].map((s) => [
      anthropicPaused(s),
      anthropicActed(s),
      modelStandingOf(s),
    ]),
    [
      [false, false, null],
      [false, true, "limited"],
      [false, true, "limited"],
      [true, true, "paused"],
    ],
  );

  const [a, b] = enforcementActionsOf([
    {
      type: "ban",
      id: "enac_1",
      reason: "high_harm",
      action: null,
      opened_at: "2026-10-02T19:30:00Z",
      expires_at: null,
    },
    { type: "something_new", id: "enac_2", reason: "a_new_reason", action: "a_new_step" },
  ]);
  assert.equal(a.type, "ban");
  assert.deepEqual([b.type, b.reason, b.action], ["restriction", "unspecified", null]);
  assert.deepEqual(enforcementActionsOf("not a list"), []);
  assert.equal(
    enforcementWords("restricted", [{ reason: "fraud_or_abuse", action: "verify" }]),
    "Restricted: fraud or abuse. They can clear it with an identity check.",
  );
  assert.equal(enforcementWords("banned", []), "Banned: no reason given.");
});
