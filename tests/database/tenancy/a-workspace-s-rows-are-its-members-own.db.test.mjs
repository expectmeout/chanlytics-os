/**
 * Tenancy on the stack: the list of tenant tables is the database's own, real people signed in read and write only
 * their own workspace's rows, a person's Ask threads only while they belong, and an acting member's OK set once.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  A,
  B,
  KEY,
  NOTHING_SEEDED,
  OTHER_TABLES,
  PRIVILEGE_REFUSED,
  ROWS_WENT,
  TAKEN_BY_A_SWEEP,
  TENANT_TABLES,
  URL_,
  aboutItsRows,
  ctx,
  db,
  memberClient,
  notRefused,
  nothing,
  owner,
  partner,
  refusedWith,
  seed,
  seen,
  skip,
  stranger,
  viewer,
} from "./_tenancy.mjs";

test("the list of tenant tables is the database's own", { skip }, async () => {
  const res = await fetch(`${URL_}/rest/v1/`, { headers: { apikey: KEY, Authorization: `Bearer ${KEY}` } });
  assert.equal(res.status, 200, `PostgREST's root answered ${res.status}`);
  const spec = await res.json();
  const defs = spec.definitions ?? {};
  const names = Object.keys(defs).filter((n) => !/^events_/.test(n)); // a partition of events is events
  assert.ok(names.length > 30, `the database describes ${names.length} tables`);
  const missing = [];
  const spare = [];
  for (const n of names) {
    const tenantScoped = Boolean(defs[n].properties?.tenant_id);
    if (tenantScoped && !TENANT_TABLES[n]) missing.push(n);
    if (!tenantScoped && !OTHER_TABLES[n]) spare.push(n);
  }
  assert.deepEqual(
    missing,
    [],
    "a table with a tenant_id and no tenancy proof: add it to TENANT_TABLES with its fixture",
  );
  assert.deepEqual(
    spare,
    [],
    "a table without a tenant_id that this suite does not know: say in OTHER_TABLES what scopes it",
  );
  for (const n of Object.keys(TENANT_TABLES)) assert.ok(defs[n], `${n} is in the suite but not in the database`);
});

test(
  "every tenant table: a member reads what the policy says, a stranger reads nothing, and neither a stranger nor a viewer writes",
  { skip },
  async () => {
    const offences = [];
    /** One table judged once: what was found wrong with it, as sentences. */
    const judge = async (table, mode, fixture) => {
      const found = [];
      const note = (of, what) => found.push(`${of}: ${what}`);
      const before = await db.from(table).select("*", { count: "exact", head: true }).eq("tenant_id", A);
      if (before.error) {
        note(table, `the service role could not count: ${before.error.message}`);
        return found;
      }
      if (!(before.count >= 1)) note(table, NOTHING_SEEDED);

      // Reads.
      const asViewer = await seen(viewer.client, table, [["tenant_id", A]]);
      const asStranger = await seen(stranger.client, table, [["tenant_id", A]]);
      if (mode === "member" && !(asViewer >= 1))
        note(table, `a member (viewer) should read the workspace's rows, read ${asViewer}`);
      if (mode === "owner") {
        const asOwner = await seen(owner.client, table, [["tenant_id", A]]);
        const asPartner = await seen(partner.client, table, [["tenant_id", A]]);
        if (!(asOwner >= 1)) note(table, `the owner should read the workspace's rows, read ${asOwner}`);
        if (!nothing(asViewer)) note(table, `a viewer read the owner's table (${asViewer})`);
        if (!nothing(asPartner)) note(table, `a partner read the owner's table (${asPartner})`);
      }
      if (mode === "acting") {
        const asOwner = await seen(owner.client, table, [["tenant_id", A]]);
        if (!(asOwner >= 1)) note(table, `an acting member (owner) should read the workspace's rows, read ${asOwner}`);
        if (!nothing(asViewer)) note(table, `a viewer read an acting members' table (${asViewer})`);
      }
      if (mode === "partner" || mode === "brought") {
        const asPartner = await seen(partner.client, table, [["tenant_id", A]]);
        const asOwner = await seen(owner.client, table, [["tenant_id", A]]);
        if (!(asPartner >= 1))
          note(table, `the partner who brought the workspace should read its rows, read ${asPartner}`);
        if (mode === "brought" && !(asOwner >= 1))
          note(table, `the workspace's owner should read who brought it, read ${asOwner}`);
        if (mode === "partner" && !nothing(asOwner))
          note(table, `the workspace's owner read the partner's rows (${asOwner})`);
        if (!nothing(asViewer)) note(table, `a viewer read a partner's table (${asViewer})`);
      }
      if (mode === "own") {
        const mine = await seen(viewer.client, table, [
          ["tenant_id", A],
          ["user_id", ctx.viewerId],
        ]);
        const theirs = await seen(owner.client, table, [
          ["tenant_id", A],
          ["user_id", ctx.viewerId],
        ]);
        if (!(mine >= 1)) note(table, `a person should read their own rows, read ${mine}`);
        if (!nothing(theirs)) note(table, `another member of the workspace read a person's own rows (${theirs})`);
      }
      if (mode === "none" && !nothing(asViewer))
        note(table, `the service role's table was readable by a member (${asViewer})`);
      if (!nothing(asStranger)) note(table, `a member of another workspace read ${asStranger}`);
      if (mode === "none") {
        // Empty is not enough for the service role's table (see PRIVILEGE_REFUSED): the grant must be gone.
        for (const [who, c] of [
          ["a member (viewer)", viewer.client],
          ["a member of another workspace", stranger.client],
        ]) {
          const how = await refusedWith(c, table, [["tenant_id", A]]);
          if (how !== PRIVILEGE_REFUSED) note(table, notRefused(who, how));
        }
      }

      if (mode === "own") {
        // A person's own rows stay in the workspace they were made in. The own
        // policies check who wrote a row, not where it lives, so the column grant
        // is what holds tenant_id (00121); before it, a person could re-file their
        // own Ask threads and messages under any workspace id.
        const moved = await viewer.client
          .from(table)
          .update({ tenant_id: B })
          .eq("tenant_id", A)
          .eq("user_id", ctx.viewerId)
          .select("tenant_id");
        if (!moved.error && moved.data.length > 0)
          note(table, `a person moved ${moved.data.length} of their own rows to a workspace they are not in`);
      }

      // The stranger's writes, and then the viewer's: nothing changes.
      for (const [who, c, tag] of [
        ["stranger", stranger.client, "a member of another workspace"],
        ["viewer", viewer.client, "a viewer"],
        ...(mode === "partner" || mode === "brought" ? [["partner", partner.client, "the partner"]] : []),
      ]) {
        if (who === "viewer" && mode === "own") continue; // a person writes their own ask threads and marks; the own policies say so
        const upd = await c.from(table).update({ tenant_id: B }).eq("tenant_id", A).select("tenant_id");
        if (!upd.error && upd.data.length > 0) note(table, `${tag} moved ${upd.data.length} rows to another workspace`);
        const del = await c.from(table).delete().eq("tenant_id", A).select("tenant_id");
        if (!del.error && del.data.length > 0) note(table, `${tag} deleted ${del.data.length} rows`);
        const ins = await c.from(table).insert(fixture());
        if (!ins.error) note(table, `${tag} inserted a row into the workspace`);
      }
      const afterwards = await db.from(table).select("*", { count: "exact", head: true }).eq("tenant_id", A);
      if (afterwards.count !== before.count)
        note(table, `${ROWS_WENT} ${before.count} to ${afterwards.count} under a stranger's and a viewer's hands`);
      return found;
    };
    for (const [table, [mode, fixture]] of Object.entries(TENANT_TABLES)) {
      let found = await judge(table, mode, fixture);
      // A sweep took this table's row while it was being judged (TAKEN_BY_A_SWEEP): the row is put back and the table
      // judged again, whole. Whatever a stranger or a viewer did to it is found again each time, so nothing is excused.
      for (let again = 0; again < 3 && TAKEN_BY_A_SWEEP.has(table) && found.some(aboutItsRows); again++) {
        await seed(table, fixture(), null);
        found = await judge(table, mode, fixture);
      }
      offences.push(...found);
    }
    assert.deepEqual(offences, [], "tenancy holds on every table");
  },
);

test(
  "the tables without a tenant_id: the workspace row is a member's to read and a stranger's to miss; a person's marks are their own; the service role's tables show a member nothing",
  { skip },
  async () => {
    const offences = [];
    const note = (table, what) => offences.push(`${table}: ${what}`);

    const mine = await seen(viewer.client, "tenants", [["id", A]]);
    const notMine = await seen(stranger.client, "tenants", [["id", A]]);
    if (mine !== 1) note("tenants", `a member should read the workspace row, read ${mine}`);
    if (!nothing(notMine)) note("tenants", `a stranger read the workspace row (${notMine})`);
    const renamed = await stranger.client.from("tenants").update({ name: "taken" }).eq("id", A).select("id");
    if (!renamed.error && renamed.data.length > 0) note("tenants", "a stranger renamed the workspace");
    const viewerRenamed = await viewer.client.from("tenants").update({ name: "taken" }).eq("id", A).select("id");
    if (!viewerRenamed.error && viewerRenamed.data.length > 0) note("tenants", "a viewer renamed the workspace");
    const gone = await stranger.client.from("tenants").delete().eq("id", A).select("id");
    if (!gone.error && gone.data.length > 0) note("tenants", "a stranger deleted the workspace");

    const marks = await seen(viewer.client, "notification_marks", [["notification_id", ctx.notification]]);
    const theirMarks = await seen(owner.client, "notification_marks", [["notification_id", ctx.notification]]);
    const strangerMarks = await seen(stranger.client, "notification_marks", [["notification_id", ctx.notification]]);
    if (marks !== 1) note("notification_marks", `a person should read their own mark, read ${marks}`);
    if (!nothing(theirMarks)) note("notification_marks", `another member read a person's mark (${theirMarks})`);
    if (!nothing(strangerMarks)) note("notification_marks", `a stranger read a person's mark (${strangerMarks})`);

    // A partner's row is theirs: the partner reads it, a member of the workspace they brought does not, and nobody
    // signed in changes it.
    const own = await seen(partner.client, "partners", [["id", ctx.partner]]);
    if (own !== 1) note("partners", `a partner should read their own row, read ${own}`);
    for (const [who, c] of [
      ["the workspace's owner", owner.client],
      ["a viewer", viewer.client],
      ["a stranger", stranger.client],
    ]) {
      const theirs = await seen(c, "partners", [["id", ctx.partner]]);
      if (!nothing(theirs)) note("partners", `${who} read a partner's row (${theirs})`);
    }
    const raised = await partner.client.from("partners").update({ share_bp: 10000 }).eq("id", ctx.partner).select("id");
    if (!raised.error && raised.data.length > 0) note("partners", "a partner raised their own share");

    for (const table of Object.keys(OTHER_TABLES).filter((t) => ["none", "empty"].includes(OTHER_TABLES[t]))) {
      const counted = await db.from(table).select("*", { count: "exact", head: true });
      if (counted.error) {
        note(table, `the service role could not count: ${counted.error.message}`);
        continue;
      }
      // A table empty at rest proves its scope by the grant alone (below): no member may even ask.
      if (OTHER_TABLES[table] === "none" && !(counted.count >= 1))
        note(table, "nothing to read, so the proof would be vacuous");
      const asViewer = await seen(viewer.client, table, []);
      const asOwner = await seen(owner.client, table, []);
      if (!nothing(asViewer)) note(table, `the service role's table was readable by a member (${asViewer})`);
      if (!nothing(asOwner)) note(table, `the service role's table was readable by an owner (${asOwner})`);
      // Empty is not enough for the service role's table (see PRIVILEGE_REFUSED): the grant must be gone.
      for (const [who, c] of [
        ["a member (viewer)", viewer.client],
        ["an owner", owner.client],
        ["a member of another workspace", stranger.client],
      ]) {
        const how = await refusedWith(c, table, []);
        if (how !== PRIVILEGE_REFUSED) note(table, notRefused(who, how));
      }
    }
    assert.deepEqual(offences, [], "the other tables keep their scope");
  },
);

test(
  "a person reads their Ask threads only while they belong to the workspace (00236): an answer keeps what the model read of the workspace's customers, so a person removed reads none of their threads or turns there, and one added back reads them again",
  { skip },
  async () => {
    const leaver = await memberClient("viewer", A);
    const thread = await seed("ask_threads", { tenant_id: A, user_id: leaver.userId });
    await seed("ask_messages", {
      tenant_id: A,
      thread_id: thread,
      user_id: leaver.userId,
      role: "assistant",
      content: { text: "Robin asked about Saturday.", raw: { blocks: '{"base":[]}' } },
    });
    const read = async () => [
      await seen(leaver.client, "ask_threads", [["id", thread]]),
      await seen(leaver.client, "ask_messages", [["thread_id", thread]]),
    ];
    assert.deepEqual(await read(), [1, 1], "a member reads their own thread and its turn");

    const out = await db.from("memberships").delete().eq("user_id", leaver.userId).eq("tenant_id", A);
    assert.equal(out.error, null, out.error?.message);
    const [threads, turns] = await read();
    assert.ok(
      nothing(threads) && nothing(turns),
      `removed from the workspace, they read ${threads} thread(s) and ${turns} turn(s)`,
    );
    const kept = await db.from("ask_messages").select("id", { count: "exact", head: true }).eq("thread_id", thread);
    assert.equal(kept.count, 1, "nothing is deleted: the rows wait for the purge");

    const back = await db.from("memberships").insert({ tenant_id: A, user_id: leaver.userId, role: "viewer" });
    assert.equal(back.error, null, back.error?.message);
    assert.deepEqual(await read(), [1, 1], "added back, they read them again");
  },
);

test(
  "a browser that says yes twice is one browser, on the person's own session, and another person's is out of reach (00575)",
  { skip },
  async () => {
    const row = {
      user_id: ctx.viewerId,
      endpoint: "https://push.example.com/one",
      p256dh: "k",
      auth: "a",
      user_agent: null,
    };
    const keep = () =>
      viewer.client
        .from("web_push_subscriptions")
        .upsert(row, { onConflict: "user_id,endpoint", ignoreDuplicates: true });
    assert.equal((await keep()).error, null, "said yes");
    assert.equal((await keep()).error, null, "REGRESSION: a browser that said yes again was refused");
    const mine = await viewer.client.from("web_push_subscriptions").select("endpoint").eq("user_id", ctx.viewerId);
    assert.deepEqual(mine.data, [{ endpoint: row.endpoint }]);
    const theirs = await stranger.client.from("web_push_subscriptions").select("endpoint").eq("user_id", ctx.viewerId);
    assert.deepEqual(theirs.data, [], "another person reads none of them");
    const forged = await stranger.client
      .from("web_push_subscriptions")
      .insert({ ...row, endpoint: "https://push.example.com/two" });
    assert.ok(forged.error, "and keeps none in their name");
    const gone = await viewer.client.from("web_push_subscriptions").delete().eq("endpoint", row.endpoint);
    assert.equal(gone.error, null, "told no more");
  },
);

test(
  "the act door's record goes under the member's own session: one per card, finished by who started it; a viewer writes none (00574)",
  { skip },
  async () => {
    const row = {
      tenant_id: A,
      message_id: crypto.randomUUID(),
      proposal_id: "p-door",
      kind: "note",
      by: "press",
      origin_by: "asked",
      strangers: false,
      reason: null,
    };
    const start = (who, user) =>
      who.client
        .from("ask_actions")
        .insert({ ...row, user_id: user })
        .select("id")
        .maybeSingle();
    const refused = await start(viewer, ctx.viewerId);
    assert.ok(refused.error, "a viewer acts on no card");
    const started = await start(owner, ctx.ownerId);
    assert.equal(started.error, null, started.error?.message);
    assert.equal((await start(owner, ctx.ownerId)).error?.code, "23505", "a press sent twice is one record");
    const finish = (who) =>
      who.client
        .from("ask_actions")
        .update({ state: "done", finished_at: new Date().toISOString() })
        .eq("id", started.data.id)
        .select("state");
    assert.deepEqual((await finish(viewer)).data ?? [], [], "nobody else finishes it");
    assert.deepEqual((await finish(owner)).data, [{ state: "done" }]);
  },
);

test(
  "a press that showed the words is their OK: an acting member's session sets it, once; a viewer and another workspace's owner set nothing (00573)",
  { skip },
  async () => {
    const of = async () =>
      (await db.from("sequence_steps").select("words_ok_at").eq("id", ctx.playbook).single()).data.words_ok_at;
    const press = (who, tenant) => who.client.rpc("words_seen", { p_tenant_id: tenant, p_step_id: ctx.playbook });
    assert.equal(await of(), null, "its words have no OK yet");
    assert.ok((await press(viewer, A)).error, "a viewer may not");
    assert.equal((await press(stranger, B)).data, false, "another workspace's owner finds no such step of theirs");
    assert.equal(await of(), null);
    assert.equal((await press(owner, A)).data, true);
    const at = await of();
    assert.ok(at, "the words are taken as seen");
    assert.equal((await press(owner, A)).data, false, "a second press changes nothing");
    assert.equal(await of(), at);
  },
);
