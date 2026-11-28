/**
 * What a post says back, on a real database (00699; the content loop PRD's 5.3, 9 and 15.1), with real sessions: a
 * comment on a post Chanlytics sent is kept once with its person and asks AI's draft; one on a post made by hand is
 * not kept; the owner's words go out as the public answer once, a viewer's and another workspace's never; one left
 * unanswered keeps AI's draft for an answer after all; a post's
 * numbers are kept a read at a time, a missing one with no value; a post's link is one, and an open counts; a visit
 * asked for in the conversation a post's touch is in records what it answered; an erased person's touches keep only
 * that they happened; a comment left on an ad is kept by the ad Meta names, even on a post made by hand, and the Ads
 * page's reads name who commented and sum what its days did (00719), and the person's touches name the ad, so a visit
 * they book after it is put down to it by the one credit rule. Each table's rows: a member of the workspace reads
 * them, another workspace sees none.
 *
 * Runs against the local stack `supabase start` builds, never production: it makes workspaces, users and rows.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { creditFor, creditOf } from "@chanlytics/contracts";
import { findComment, findCommentForWork, listComments, listTouchesOf, listVisitsOf } from "@chanlytics/db/content";
import { readAdCommenters, readAdsEngaged } from "@chanlytics/db/ads";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON = process.env.SUPABASE_ANON_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces, users and rows"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env: the members this suite signs in as need it"
        : false;

const stamp = Date.now().toString(36);
const ACCOUNT = "17841400000000001";
let db;
let A;
let B;
let REEL;
let STORY;
const users = [];
const as = {};

const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

async function member(name, tenant, role) {
  const email = `results-${name}-${stamp}@example.com`;
  const password = `pw-${stamp}-${name}-Aa1!`;
  const made = await db.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(made.error, null, made.error?.message);
  users.push(made.data.user.id);
  ok(await db.from("memberships").insert({ tenant_id: tenant, user_id: made.data.user.id, role }), `${name}'s seat`);
  const client = createClient(URL_, ANON, { auth: { persistSession: false, autoRefreshToken: false } });
  ok(await client.auth.signInWithPassword({ email, password }), `${name} signs in`);
  return { client, id: made.data.user.id };
}

async function post(fileId, kind, external, hoursAgo = 2) {
  const row = ok(
    await db
      .from("posts")
      .insert({
        tenant_id: A,
        file_id: fileId,
        place: "instagram",
        kind,
        caption: "Forty-five minutes.",
        status: "published",
        external_id: external,
        published_at: new Date(Date.now() - hoursAgo * 3_600_000).toISOString(),
        account_id: ACCOUNT,
      })
      .select("id")
      .single(),
    `the ${kind}`,
  );
  return row.id;
}

const keepComment = (id, media, over = {}) =>
  db.rpc("post_comment_keep", {
    p_tenant_id: A,
    p_account: ACCOUNT,
    p_from: "990000000003087",
    p_username: "second.account",
    p_comment_id: id,
    p_media_id: media,
    p_parent_id: "",
    p_words: "how much is this?",
    p_at: new Date().toISOString(),
    ...over,
  });

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const tenants = ok(
    await db
      .from("tenants")
      .insert([
        { name: `Results A ${stamp}`, slug: `results-a-${stamp}` },
        { name: `Results B ${stamp}`, slug: `results-b-${stamp}` },
      ])
      .select("id"),
    "the workspaces",
  );
  A = tenants[0].id;
  B = tenants[1].id;
  as.owner = await member("owner", A, "owner");
  as.viewer = await member("viewer", A, "viewer");
  as.stranger = await member("stranger", B, "owner");
  const file = ok(
    await db
      .from("files")
      .insert({
        tenant_id: A,
        status: "filed",
        source: "made",
        name: `results-${stamp}`,
        kind: "image",
        mime: "image/jpeg",
        bytes: 1000,
        fingerprint: `fp-results-${stamp}`,
      })
      .select("id")
      .single(),
    "the file",
  );
  REEL = await post(file.id, "reel", `reel-${stamp}`);
  STORY = await post(file.id, "story", `story-${stamp}`);
});

after(async () => {
  if (skip) return;
  const all = [A, B];
  for (const table of ["jobs", "comment_answers", "touches", "post_observations", "link_days", "links", "appointments"])
    await db.from(table).delete().in("tenant_id", all);
  await db.from("posts").delete().in("tenant_id", all);
  for (const table of ["ad_days", "ads", "ad_accounts"]) await db.from(table).delete().in("tenant_id", all);
  await db.from("files").delete().in("tenant_id", all);
  await db.from("conversations").delete().in("tenant_id", all);
  await db.from("contact_identities").delete().in("tenant_id", all);
  await db.from("contacts").delete().in("tenant_id", all);
  await db.from("memberships").delete().in("tenant_id", all);
  await db.from("tenants").delete().in("id", all);
  for (const id of users) await db.auth.admin.deleteUser(id).catch(() => {});
});

test("a comment on a post Chanlytics sent is kept once, with its person, and asks AI's draft", { skip }, async () => {
  const kept = ok(await keepComment(`c1-${stamp}`, `reel-${stamp}`), "the comment");
  assert.equal(kept.kept, true);
  assert.equal(kept.post_id, REEL);
  assert.equal(kept.new_person, true);
  const again = ok(await keepComment(`c1-${stamp}`, `reel-${stamp}`), "again");
  assert.deepEqual({ kept: again.kept, why: again.why }, { kept: false, why: "again" });
  const jobs = ok(await db.from("jobs").select("payload").eq("tenant_id", A).eq("kind", "comment_reply"), "jobs");
  assert.equal(jobs.length, 1, "one draft asked, once");
  const handMade = ok(await keepComment(`c2-${stamp}`, "made-by-hand"), "by hand");
  assert.equal(handMade.why, "not_ours");
  const read = ok(await as.owner.client.from("touches").select("id, kind").eq("tenant_id", A), "a member reads");
  assert.equal(read.length, 1);
  assert.equal(ok(await as.stranger.client.from("touches").select("id"), "a stranger").length, 0);
  const denied = await as.owner.client.rpc("post_comment_keep", {
    p_tenant_id: A,
    p_account: ACCOUNT,
    p_from: "1",
    p_username: "",
    p_comment_id: "x",
    p_media_id: `reel-${stamp}`,
    p_parent_id: "",
    p_words: "",
    p_at: new Date().toISOString(),
  });
  assert.ok(denied.error, "a member may not keep a comment by hand");
});

test(
  "the owner's words go out as the public answer once; a viewer's and another workspace's never",
  { skip },
  async () => {
    const touch = ok(await db.from("touches").select("id").eq("tenant_id", A).limit(1).single(), "the touch").id;
    const send = (who) =>
      as[who].client.rpc("comment_answer_send", { p_tenant_id: A, p_touch_id: touch, p_words: "It's $45." });
    assert.ok((await send("viewer")).error, "a viewer may not");
    assert.ok((await send("stranger")).error, "another workspace may not");
    assert.deepEqual(ok(await send("owner"), "the owner's press"), { sent: true, state: "sending" });
    assert.deepEqual(ok(await send("owner"), "pressed again"), { sent: false, state: "sending" });
    ok(
      await db.rpc("comment_answer_settle", {
        p_tenant_id: A,
        p_touch_id: touch,
        p_sent: true,
        p_external_id: `answer-${stamp}`,
        p_said: "",
      }),
      "settled",
    );
    const answer = ok(
      await as.owner.client.from("comment_answers").select("state, external_id").single(),
      "the answer",
    );
    assert.deepEqual(answer, { state: "sent", external_id: `answer-${stamp}` });
  },
);

test("a comment's one answer reads back through its repository, as PostgREST embeds it", { skip }, async () => {
  // A comment has one answer (its key is unique), so the embed is an object, not a list: Inbox's list, its pane and
  // the job's read each say the answer the owner sent.
  const touch = ok(await db.from("touches").select("id").eq("tenant_id", A).limit(1).single(), "the touch").id;
  const one = await findComment(as.owner.client, A, touch);
  assert.equal(one?.answer?.state, "sent");
  assert.equal(one?.answer?.words, "It's $45.");
  const listed = (await listComments(as.owner.client, A, new Date(0).toISOString())).find((c) => c.touchId === touch);
  assert.equal(listed?.answer?.state, "sent");
  assert.equal((await findCommentForWork(db, touch))?.answer?.state, "sent");
});

test(
  "a comment left unanswered is no point and keeps AI's draft; answered after all, the draft comes back",
  { skip },
  async () => {
    const kept = ok(await keepComment(`c3-${stamp}`, `reel-${stamp}`, { p_words: "is 4pm free?" }), "a second comment");
    ok(
      await db.rpc("comment_answer_draft_keep", {
        p_tenant_id: A,
        p_touch_id: kept.touch_id,
        p_draft: "Message us and we'll find you a time.",
        p_cannot_why: "",
      }),
      "AI's draft",
    );
    const leave = (who, left) =>
      as[who].client.rpc("comment_answer_leave", { p_tenant_id: A, p_touch_id: kept.touch_id, p_left: left });
    assert.ok((await leave("viewer", true)).error, "a viewer may not");
    assert.ok((await leave("stranger", true)).error, "another workspace may not");
    assert.deepEqual(ok(await leave("owner", true), "left"), { state: "left" });
    assert.deepEqual(ok(await leave("owner", false), "answered after all"), { state: "drafted" });
    const answer = ok(
      await as.owner.client.from("comment_answers").select("state, draft").eq("touch_id", kept.touch_id).single(),
      "the answer",
    );
    assert.deepEqual(answer, { state: "drafted", draft: "Message us and we'll find you a time." });
  },
);

test("a post's numbers are kept a read at a time, a missing one with no value", { skip }, async () => {
  const rows = [
    { metric: "reach", availability: "available", value: 1 },
    { metric: "likes", availability: "withheld", value: 3 },
  ];
  assert.equal(
    ok(
      await db.rpc("post_observations_keep", { p_tenant_id: A, p_post_id: STORY, p_step: "1h", p_rows: rows }),
      "read",
    ),
    2,
  );
  const kept = ok(
    await as.owner.client.from("post_observations").select("metric, value").eq("post_id", STORY).order("metric"),
    "a member reads",
  );
  assert.deepEqual(
    kept.map((r) => [r.metric, r.value === null ? null : Number(r.value)]),
    [
      ["likes", null],
      ["reach", 1],
    ],
  );
  assert.equal(ok(await as.stranger.client.from("post_observations").select("id"), "a stranger").length, 0);
});

test(
  "a story's last read is due 22 hours after it went up, and nothing of it once its day is over",
  { skip },
  async () => {
    // Instagram answers for an ended story as for nothing (code 100, subcode 33): its last read is taken inside its day.
    const file = ok(await db.from("files").select("id").eq("tenant_id", A).limit(1).single(), "the file").id;
    const nearItsEnd = await post(file, "story", `story-near-${stamp}`, 22.5);
    const young = await post(file, "story", `story-young-${stamp}`, 21);
    const ended = await post(file, "story", `story-ended-${stamp}`, 25);
    const reel = await post(file, "reel", `reel-older-${stamp}`, 4 * 24);
    const due = ok(await db.rpc("post_observations_due", { p_limit: 5000 }), "what is due");
    const stepsOf = (id) =>
      due
        .filter((d) => d.post_id === id)
        .map((d) => d.step)
        .sort();
    assert.deepEqual(stepsOf(nearItsEnd), ["1d", "1h"]);
    assert.deepEqual(stepsOf(young), ["1h"]);
    assert.deepEqual(stepsOf(ended), [], "an ended story is asked nothing");
    assert.deepEqual(stepsOf(reel), ["1d", "1h", "3d"], "a reel keeps every step");
  },
);

test(
  "a workspace with a picture or a reel up is due its daily read of what its places hold, once a day, and only the service asks",
  { skip },
  async () => {
    // A holds a reel that is up, and stories, which never count; B holds no post.
    const due = async () => ok(await db.rpc("posts_read_due", { p_limit: 1000 }), "who is due").map((d) => d.tenant_id);
    const first = await due();
    assert.ok(first.includes(A), "a reel up within a year");
    assert.ok(!first.includes(B), "no post, no read");
    // The clock hands it one job: while that waits, and for a day after, the workspace is not due again.
    const handOut = () => db.rpc("jobs_hand_out", { p_kind: "posts_read", p_tenants: [A], p_spread_seconds: 300 });
    assert.equal(ok(await handOut(), "handed"), 1);
    assert.equal(ok(await handOut(), "a second knock"), 0);
    assert.ok(!(await due()).includes(A), "its read is on the ledger");
    // A read that failed is not the day's read: the clock's next turn hands the workspace another. A job fails only
    // from a run (jobs_guard: scheduled, then fired, then failed).
    const move = (state) => db.from("jobs").update({ state }).eq("tenant_id", A).eq("kind", "posts_read");
    ok(await move("fired"), "it ran");
    ok(await move("failed"), "it failed");
    assert.ok((await due()).includes(A), "due again");
    ok(await db.from("jobs").delete().eq("tenant_id", A).eq("kind", "posts_read"), "tidied");
    for (const who of [as.owner, as.viewer, as.stranger])
      assert.ok((await who.client.rpc("posts_read_due", { p_limit: 10 })).error, "no member may ask");
  },
);

test("a post's link is one, made by a member who may act, and an open counts", { skip }, async () => {
  const made = ok(await as.owner.client.rpc("post_link_make", { p_tenant_id: A, p_post_id: REEL }), "made");
  const again = ok(await as.owner.client.rpc("post_link_make", { p_tenant_id: A, p_post_id: REEL }), "again");
  assert.equal(again.code, made.code);
  assert.equal(made.lands, "chat");
  assert.ok((await as.viewer.client.rpc("post_link_make", { p_tenant_id: A, p_post_id: STORY })).error);
  const opened = ok(await db.rpc("link_open", { p_code: made.code, p_count: true }), "opened");
  assert.equal(opened.subject_type, "post");
  assert.equal(opened.lands, "chat");
});

test("a visit asked for in the conversation a post's touch is in records what it answered", { skip }, async () => {
  const person = ok(
    await db.from("touches").select("contact_id").eq("tenant_id", A).limit(1).single(),
    "who",
  ).contact_id;
  const thread = ok(
    await db.from("conversations").insert({ tenant_id: A, contact_id: person }).select("id").single(),
    "their thread",
  );
  ok(
    await db.rpc("touches_keep", {
      p_tenant_id: A,
      p_kind: "story_reply",
      p_subject_type: "post",
      p_subject_id: STORY,
      p_contact_id: person,
      p_place: "instagram",
      p_event_id: `mid-${stamp}`,
      p_at: new Date(Date.now() - 600_000).toISOString(),
      p_conversation_id: thread.id,
    }),
    "the story reply",
  );
  const starts = new Date(Date.now() + 2 * 86_400_000);
  const visit = ok(
    await db
      .from("appointments")
      .insert({
        tenant_id: A,
        contact_id: person,
        conversation_id: thread.id,
        source: "receptionist",
        status: "proposed",
        starts_at: starts.toISOString(),
        ends_at: new Date(starts.getTime() + 3_600_000).toISOString(),
        timezone: "UTC",
      })
      .select("through_type, through_id")
      .single(),
    "the visit",
  );
  assert.deepEqual(visit, { through_type: "post", through_id: STORY });
});

test("an erased person's touches keep only that they happened, of what and when", { skip }, async () => {
  const person = ok(
    await db.from("touches").select("contact_id").eq("tenant_id", A).limit(1).single(),
    "who",
  ).contact_id;
  // An owner's press erases at once; the service role only finishes an erasure an owner began (erasing_since).
  ok(await as.owner.client.rpc("erase_contact", { p_contact_id: person }), "the owner's erasure");
  const left = ok(
    await db.from("touches").select("contact_id, evidence, emptied_at, kind, subject_id").eq("tenant_id", A),
    "what is left",
  );
  assert.ok(left.length >= 2);
  for (const t of left) {
    assert.equal(t.contact_id, null);
    assert.deepEqual(t.evidence, {});
    assert.ok(t.emptied_at);
    assert.ok(t.kind && t.subject_id, "that it happened, and of what, stays");
  }
});

test(
  "a comment left on an ad is kept by the ad, even on a post made by hand, and the Ads page names who and sums the days",
  { skip },
  async () => {
    // Workspace B, whose owner is `stranger` to A: its own world, so nothing above it counts B's rows.
    const account = ok(
      await db
        .from("ad_accounts")
        .insert({
          tenant_id: B,
          platform: "meta",
          external_id: `13${Date.now()}`,
          name: "B ads",
          currency: "USD",
          timezone: "UTC",
          status: "connected",
          standing: { account: "active", funding: "ok" },
          config: {},
        })
        .select("id")
        .single(),
      "the ad account",
    ).id;
    const AD = `1202${Date.now()}`;
    ok(
      await db.rpc("ads_read_keep", {
        p_tenant_id: B,
        p_account_id: account,
        p_read: {
          account: {},
          next_read_at: new Date(Date.now() + 3_600_000).toISOString(),
          ads: [
            {
              platform_ad_id: AD,
              name: "Boost",
              door: "other",
              budget_kind: "total",
              budget_minor: 500,
              platform_state: "ACTIVE",
              intent: "on",
            },
          ],
          days: [
            { platform_ad_id: AD, day: "2026-11-24", spend_minor: 250, engaged: { plays: 300, comments: 2 } },
            { platform_ad_id: AD, day: "2026-11-25", spend_minor: 250, engaged: { plays: 20, saves: 1 } },
          ],
        },
      }),
      "the read",
    );
    const adId = ok(
      await db.from("ads").select("id").eq("tenant_id", B).eq("platform_ad_id", AD).single(),
      "the ad",
    ).id;
    const onAd = (id, from, over = {}) =>
      keepComment(id, `hand-${stamp}`, { p_tenant_id: B, p_from: from, p_ad_id: AD, ...over });
    const first = ok(await onAd(`ad1-${stamp}`, "990000000004001"), "on the ad");
    assert.deepEqual([first.kept, first.ad_id, "post_id" in first], [true, adId, false]);
    ok(await onAd(`ad2-${stamp}`, "990000000004002"), "a second person");
    ok(await onAd(`ad3-${stamp}`, "990000000004001"), "the first again, on another comment");
    assert.equal(ok(await onAd(`ad4-${stamp}`, "990000000004003", { p_ad_id: null }), "no ad").why, "not_ours");
    const drafts = ok(await db.from("jobs").select("id").eq("tenant_id", B).eq("kind", "comment_reply"), "drafts");
    assert.equal(drafts.length, 0, "no draft for a post Chanlytics did not send");

    const since = new Date(Date.now() - 3_600_000).toISOString();
    const commenters = await readAdCommenters(as.stranger.client, B, since);
    assert.equal(commenters?.get(adId)?.count, 2, "two people, one of them twice");
    assert.ok(
      commenters?.get(adId)?.people.every((p) => p.contact && typeof p.at === "string"),
      "each with their row",
    );
    assert.equal((await readAdCommenters(as.owner.client, B, since))?.size, 0, "another workspace's member reads none");
    const engaged = await readAdsEngaged(as.stranger.client, B, "2026-11-24");
    assert.deepEqual(engaged?.get(adId), { plays: 320, comments: 2, saves: 1 });

    // The person is credited to the ad (the whole-system plan of 28 Nov 2026, lane 6, item 7): their touches, as their
    // page and their visits' credit read them, are of the ad, and a visit made after the comment is put down to it.
    const who = first.contact_id;
    const touches = await listTouchesOf(as.stranger.client, B, { contactIds: [who], since });
    assert.deepEqual(
      touches.map((touch) => [touch.kind, touch.subject.type, touch.subject.id, touch.contact_id]),
      [
        ["comment", "ad", adId, who],
        ["comment", "ad", adId, who],
      ],
      "both of their comments, each a touch of the ad",
    );
    const starts = new Date(Date.now() + 2 * 86_400_000);
    ok(
      await db
        .from("appointments")
        .insert({
          tenant_id: B,
          contact_id: who,
          source: "receptionist",
          status: "booked",
          starts_at: starts.toISOString(),
          ends_at: new Date(starts.getTime() + 3_600_000).toISOString(),
          timezone: "UTC",
        })
        .select("id")
        .single(),
      "their visit",
    );
    const visits = await listVisitsOf(as.stranger.client, B, { contactIds: [who], since });
    assert.equal(visits.length, 1, "the visit, read as its workspace's member");
    assert.equal(creditFor({ type: "ad", id: adId }, creditOf(visits[0], touches)), "assisted", "the ad helped it");
    const others = await listTouchesOf(as.owner.client, B, { contactIds: [who], since });
    assert.equal(others.length, 0, "another workspace's member reads none of them");
  },
);
