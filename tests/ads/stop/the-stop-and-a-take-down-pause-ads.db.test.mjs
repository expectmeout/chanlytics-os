/**
 * 00676 on a real Postgres, as 00687 left it: the stop pauses the ads made here, a take-down's walk pauses the ad that
 * shows the file, a launch is cancelled while it is set up, and the bell rings for a launch that stopped, a switch never
 * confirmed and a running ad AI can't answer (the content loop PRD's 5.2, 5.3, 14.1 and pass 0, call 21; the Ads plan's
 * G16 and 4.7).
 *
 * What must hold. The stop pauses every ad made here that is on, by whoever stopped, each as the stop's; an ad made in
 * Meta and the owner's own pause are left; the owner is told on the bell and mailed. Turning them back on is the owner's
 * own press, never while AI is stopped, and only of the ads the stop paused. The walk a take-down starts on ads
 * (ads_remediate_files, the owner's own cause alone: nobody is asked for a yes, so none is taken back) pauses the ad that
 * shows the file, as a remediation whose action stays pending until Meta's word says paused, and blocked where Meta
 * refused; that ad is never turned back on. A cancel stops a launch, which keeps when it stopped; one
 * made all the same is paused at once. Runs against the database `supabase start` builds on this machine, never
 * production.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes workspaces, members and ads"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the member this suite signs in needs it"
        : false;

const stamp = Date.now().toString(36);
const users = [];
const workspaces = [];
let db;
let seq = 0;

const ok = (res, what = "a write") => {
  assert.equal(res.error, null, `${what}: ${res.error?.message}`);
  return res.data;
};

/** A member, and their own signed-in session where the door asks who is calling. */
async function memberOf(tenant, role, tag) {
  const email = `ads-stop-${role}-${tag}-${stamp}@example.com`;
  const password = `pw-${Math.random().toString(36).slice(2)}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }));
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await client.auth.signInWithPassword({ email, password }));
  return { id: made.data.user.id, client };
}

/** An ad of the workspace's account, made here and running unless `over` says otherwise. */
async function adIn(ws, over = {}) {
  seq += 1;
  return ok(
    await db
      .from("ads")
      .insert({
        tenant_id: ws.tenant,
        account_id: ws.account,
        platform: "meta",
        origin: "chanlytics",
        name: `Ad ${seq}`,
        door: "whatsapp",
        platform_ad_id: `2385001${String(seq).padStart(4, "0")}${Date.now() % 100000}`,
        platform_campaign_id: `2385002${String(seq).padStart(4, "0")}`,
        status: "made",
        intent: "on",
        intent_at: new Date(Date.now() - 86_400_000).toISOString(),
        told_at: new Date(Date.now() - 86_400_000).toISOString(),
        platform_state: "ACTIVE",
        budget_kind: "total",
        budget_minor: 7000,
        budget_left_minor: 6420,
        budget_at: "campaign",
        budget_shared: false,
        ends_at: new Date(Date.now() + 9 * 86_400_000).toISOString(),
        approved: { picture: ws.photo, whatsapp: "+13055550142" },
        created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
        ...over,
      })
      .select("*")
      .single(),
    "an ad",
  );
}

/** A workspace with a connected account, its owner and an operator, and a photo its ads show. */
async function workspace(tag) {
  const tenant = ok(
    await db
      .from("tenants")
      .insert({ slug: `harbor-stop-${tag}-${stamp}`, name: `Harbor Stop ${tag}` })
      .select("id")
      .single(),
  ).id;
  workspaces.push(tenant);
  const account = ok(
    await db
      .from("ad_accounts")
      .insert({
        tenant_id: tenant,
        platform: "meta",
        external_id: `act-stop-${tag}-${stamp}`,
        currency: "USD",
        status: "connected",
      })
      .select("id")
      .single(),
  ).id;
  const owner = await memberOf(tenant, "owner", tag);
  const operator = await memberOf(tenant, "operator", tag);
  const photo = ok(
    await db
      .from("files")
      .insert({
        tenant_id: tenant,
        status: "filed",
        source: "upload",
        name: `chair-${tag}`,
        mime: "image/jpeg",
        bytes: 1000,
        fingerprint: `fp-stop-${tag}-${stamp}`,
      })
      .select("id")
      .single(),
  ).id;
  return { tenant, account, owner, operator, photo };
}

/** The walk a take-down starts on ads (00682, 00687), as the service role calls it for the owner. */
const walk = (ws, cause = "owner_removed") =>
  db.rpc("ads_remediate_files", {
    p_tenant_id: ws.tenant,
    p_actor: ws.owner.id,
    p_cause: cause,
    p_subject_id: ws.photo,
    p_files: [ws.photo],
  });

const adOf = async (id) => ok(await db.from("ads").select("*").eq("id", id).single());
const rowsOf = async (table, tenant) => ok(await db.from(table).select("*").eq("tenant_id", tenant));

before(() => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  for (const tenant of workspaces) await db.from("tenants").delete().eq("id", tenant);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test(
  "the stop pauses every ad made here that is on, by whoever stopped; Meta's and the owner's own pause are left",
  { skip },
  async () => {
    const ws = await workspace("stop");
    const [one, two] = [await adIn(ws), await adIn(ws)];
    const owners = await adIn(ws, { intent: "paused", platform_state: "CAMPAIGN_PAUSED" });
    const inMeta = await adIn(ws, { origin: "platform", approved: null });
    ok(await db.from("tenants").update({ sending_stopped_at: new Date().toISOString() }).eq("id", ws.tenant));
    const kept = ok(
      await db.rpc("ad_pause_all", { p_tenant_id: ws.tenant, p_actor: ws.operator.id, p_presses: null, p_by: "stop" }),
    );
    assert.equal(kept.outcome, "kept");
    assert.deepEqual(kept.ads.map((ad) => ad.outcome).sort(), ["asked", "asked"]);
    for (const ad of [one, two]) {
      const now = await adOf(ad.id);
      assert.deepEqual([now.intent, now.paused_by, now.version], ["paused", "stop", ad.version + 1]);
      assert.ok(now.paused_at);
    }
    assert.equal((await adOf(owners.id)).paused_by, null, "the owner's own pause before 00676 is not the stop's");
    assert.equal((await adOf(inMeta.id)).intent, "on", "an ad made in Meta is never paused by the stop");
    const bell = (await rowsOf("notifications", ws.tenant)).filter((row) => row.kind === "ads_paused");
    assert.deepEqual(
      bell.map((row) => [row.recipient_user_id, row.mail_due_at !== null]),
      [[ws.owner.id, true]],
      "the owner told once and mailed; not the one who stopped",
    );
    const viewer = await memberOf(ws.tenant, "viewer", "stop-viewer");
    const refused = ok(
      await db.rpc("ad_pause_all", { p_tenant_id: ws.tenant, p_actor: viewer.id, p_presses: null, p_by: "stop" }),
    );
    assert.equal(refused.outcome, "not_allowed");
  },
);

test(
  "turning them back on is the owner's own press, never while AI is stopped, and only of the stop's",
  { skip },
  async () => {
    const ws = await workspace("resume");
    const one = await adIn(ws);
    ok(await db.from("tenants").update({ sending_stopped_at: new Date().toISOString() }).eq("id", ws.tenant));
    ok(
      await db.rpc("ad_pause_all", { p_tenant_id: ws.tenant, p_actor: ws.operator.id, p_presses: null, p_by: "stop" }),
    );
    const paused = await adOf(one.id);
    const ask = (actor) =>
      db.rpc("ad_resume_stopped", {
        p_tenant_id: ws.tenant,
        p_actor: actor,
        p_presses: [{ ad_id: one.id, version: paused.version }],
      });
    assert.equal(ok(await ask(ws.owner.id)).outcome, "stopped", "nothing turns on while AI is stopped");
    ok(await db.from("tenants").update({ sending_stopped_at: null }).eq("id", ws.tenant));
    assert.equal((await adOf(one.id)).intent, "paused", "lifting the stop turns nothing on");
    assert.equal(ok(await ask(ws.operator.id)).outcome, "not_allowed");
    const back = ok(await ask(ws.owner.id));
    assert.deepEqual(
      back.ads.map((ad) => ad.outcome),
      ["asked"],
    );
    assert.deepEqual([(await adOf(one.id)).intent, (await adOf(one.id)).paused_by], ["on", null]);
  },
);

test(
  "a take-down's walk pauses the ad that shows the file, as a remediation settled by Meta's word",
  { skip },
  async () => {
    const ws = await workspace("walk");
    const shows = await adIn(ws);
    const other = await adIn(ws, { approved: { picture: "00000000-0000-4000-8000-000000000009" } });
    // The causes that left with the yes (00687) start nothing.
    for (const cause of ["yes_taken_back", "person_erased"])
      assert.equal((await walk(ws, cause)).error?.code, "22023", `${cause} is refused`);
    assert.deepEqual(await rowsOf("remediations", ws.tenant), []);
    assert.equal((await adOf(shows.id)).intent, "on");
    const answer = ok(await walk(ws));
    assert.deepEqual(
      answer.map((ad) => [ad.ad_id, ad.act, ad.outcome]),
      [[shows.id, "pause", "pending"]],
    );
    assert.deepEqual([(await adOf(shows.id)).intent, (await adOf(shows.id)).paused_by], ["paused", "remediation"]);
    assert.equal((await adOf(other.id)).intent, "on");
    const [remediation] = await rowsOf("remediations", ws.tenant);
    assert.deepEqual(
      [remediation.cause, remediation.subject_type, remediation.finished_at],
      ["owner_removed", "file", null],
    );
    // Never turned back on with this picture.
    const resumed = ok(
      await db.rpc("ad_set_intent", {
        p_tenant_id: ws.tenant,
        p_actor: ws.owner.id,
        p_ad_id: shows.id,
        p_version: (await adOf(shows.id)).version,
        p_intent: "on",
      }),
    );
    assert.deepEqual([resumed.outcome, resumed.why], ["cant_resume", "picture"]);
    // Meta's word: paused. The action is done, the remediation finished; started and confirmed kept apart.
    ok(
      await db.rpc("ad_told", {
        p_tenant_id: ws.tenant,
        p_ad_id: shows.id,
        p_asked: "paused",
        p_outcome: "told",
        p_platform_state: "CAMPAIGN_PAUSED",
      }),
    );
    const [action] = await rowsOf("remediation_actions", ws.tenant);
    assert.equal(action.outcome, "done");
    assert.ok(action.finished_at >= action.started_at);
    assert.ok((await rowsOf("remediations", ws.tenant))[0].finished_at, "finished once none is pending");
  },
);

test("a pause Meta refused leaves the action blocked in Meta's words, never done", { skip }, async () => {
  const ws = await workspace("refused");
  const shows = await adIn(ws);
  ok(await walk(ws));
  ok(await db.from("ads").update({ platform_issue: "This ad can't be paused right now." }).eq("id", shows.id));
  ok(
    await db.rpc("ad_told", {
      p_tenant_id: ws.tenant,
      p_ad_id: shows.id,
      p_asked: "paused",
      p_outcome: "refused",
      p_platform_state: "ACTIVE",
      p_said: "This ad can't be paused right now.",
    }),
  );
  const [action] = await rowsOf("remediation_actions", ws.tenant);
  assert.deepEqual([action.outcome, action.said], ["blocked", "This ad can't be paused right now."]);
  assert.deepEqual([(await adOf(shows.id)).intent, (await adOf(shows.id)).paused_by], ["on", null]);
});

test(
  "a cancel stops a launch, which keeps when; one made all the same after it is paused at once",
  { skip },
  async () => {
    const ws = await workspace("cancel");
    const setting = await adIn(ws, { status: "sending", platform_ad_id: null, launch: { key: "k1", step: "make" } });
    const cancel = (id, actor = ws.owner.id) =>
      db.rpc("ad_launch_cancel", { p_tenant_id: ws.tenant, p_actor: actor, p_ad_id: id });
    assert.equal(ok(await cancel(setting.id, ws.operator.id)).outcome, "not_allowed");
    assert.equal(ok(await cancel(setting.id)).outcome, "asked");
    assert.equal(ok(await cancel(setting.id)).outcome, "same");
    ok(
      await db.rpc("ad_launch_keep", {
        p_tenant_id: ws.tenant,
        p_ad_id: setting.id,
        p_kept: { status: "failed", launch: { stopped: "cancelled", step: "stopped" } },
      }),
    );
    const stopped = await adOf(setting.id);
    assert.deepEqual(
      [stopped.status, stopped.launch.stopped, typeof stopped.launch.stopped_at],
      ["failed", "cancelled", "string"],
    );
    const late = await adIn(ws, { status: "sending", platform_ad_id: null, launch: { key: "k2", step: "switch" } });
    ok(await cancel(late.id));
    ok(
      await db.rpc("ad_launch_keep", {
        p_tenant_id: ws.tenant,
        p_ad_id: late.id,
        p_kept: {
          status: "made",
          platform_ad_id: "23850000000009001",
          campaign_id: "23850000000009002",
          launch: { step: "done" },
        },
      }),
    );
    const made = await adOf(late.id);
    assert.deepEqual([made.status, made.intent, made.paused_by], ["made", "paused", "owner"]);
    assert.equal(ok(await cancel(late.id)).outcome, "made", "made already: its Pause stops it");
    const verbs = ok(await db.from("decisions").select("verb").eq("tenant_id", ws.tenant)).map((row) => row.verb);
    assert.deepEqual(verbs.filter((verb) => verb === "cancel_ad").length, 2);
  },
);

test(
  "the bell's causes: a launch that couldn't finish (not the owner's cancel), and a switch unanswered five minutes",
  { skip },
  async () => {
    const ws = await workspace("bell");
    const refused = await adIn(ws, {
      status: "failed",
      platform_ad_id: null,
      launch: { stopped: "refused", stopped_at: new Date(Date.now() - 120_000).toISOString() },
    });
    await adIn(ws, {
      status: "failed",
      platform_ad_id: null,
      launch: {
        stopped: "cancelled",
        cancel: { by: "owner" },
        stopped_at: new Date(Date.now() - 120_000).toISOString(),
      },
    });
    const unanswered = await adIn(ws, {
      launch: { step: "done", unknown_at: new Date(Date.now() - 600_000).toISOString() },
    });
    const causes = ok(
      await db.rpc("ad_bell_causes", {
        p_tenant_id: ws.tenant,
        p_account_id: ws.account,
        p_at: new Date().toISOString(),
      }),
    );
    const ours = causes.filter((row) => ["ad_unfinished", "ad_unconfirmed"].includes(row.kind));
    assert.deepEqual(
      ours.map((row) => [row.kind, row.ad_id]).sort(),
      [
        ["ad_unconfirmed", unanswered.id],
        ["ad_unfinished", refused.id],
      ].sort(),
    );
  },
);

test(
  "a running ad's way in, kept by the read: closed rings once in the read's words; unread waits an hour; open closes",
  { skip },
  async () => {
    const ws = await workspace("way");
    const running = await adIn(ws);
    const keep = (ways) => db.rpc("ad_way_in_keep", { p_tenant_id: ws.tenant, p_account_id: ws.account, p_ways: ways });
    const blocked = {
      ad_id: running.id,
      way_in: "blocked",
      title: "“Ad” is on, and AI can't answer it",
      body: "It can still spend $64.20.",
    };
    assert.equal(ok(await keep([blocked])).rung, 1);
    assert.equal(ok(await keep([blocked])).rung, 0, "never a second open row");
    const rows = (await rowsOf("notifications", ws.tenant)).filter((row) => row.kind === "ad_way_in");
    assert.deepEqual(
      rows.map((row) => [row.recipient_user_id, row.body, row.mail_due_at !== null]),
      [[ws.owner.id, blocked.body, true]],
    );
    assert.equal(ok(await keep([{ ad_id: running.id, way_in: null }])).closed, 1, "open again closes it");
    assert.equal(ok(await keep([{ ...blocked, way_in: "unread" }])).rung, 0, "an unknown word alone rings nothing");
    assert.deepEqual(
      [(await adOf(running.id)).way_in, typeof (await adOf(running.id)).way_in_at],
      ["unread", "string"],
    );
  },
);
