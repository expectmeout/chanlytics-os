/**
 * A post's send whose job ended for good (packages/jobs settle-post.ts), as the ledger settles it after a run died: the
 * placement says what is true, and the owner's bell rings only for what they can act on.
 *
 *   - Google's send that died after it began to send may be up: Checking, with the ask of its profile on the ledger
 *     (00728 gave Google's reconcile a profile to ask), never failed as "look on your profile".
 *   - A send that died before it began sent nothing: "did not go", never "look on your profile".
 *   - A send that had written its own next ask (a wait for a version, an opening that could not be read, Google too
 *     busy) and died before it reported back is left as it stood: the next ask sends it. It was failed, with its next
 *     ask still on the ledger, which then found a failed post and did nothing.
 *   - A post left Checking, or left to its next ask, carries on by itself: no bell says "Couldn't post" about a post
 *     that is about to be found up.
 *   - What the bell's body says of what a post's job left never speaks of a campaign send.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { FILE_WORDS, ON_INSTAGRAM } from "@chanlytics/contracts";
import { saySettled, settleJob } from "@chanlytics/jobs";
import { fakeDb } from "../../_fake-db.mjs";
import { claimDue, ledgerWorld } from "./_kill-at.mjs";

const T = "aaaa1111-4444-4000-8000-000000000001";
const POST = "dddd4444-4444-4000-8000-000000000004";

/** A placement where its send left it, the ledger as it stood, and the two doors a settle moves a post through. */
function world({ place = "google", status, jobs = [] }) {
  const tables = {
    posts: [{ id: POST, tenant_id: T, place, kind: "picture", status, attempts: 0, error: null, held_reason: null }],
    jobs: jobs.map((j, i) => ({
      id: `job-${i + 2}`,
      tenant_id: T,
      attempts: 0,
      due_at: new Date().toISOString(),
      ...j,
    })),
  };
  const db = fakeDb(
    tables,
    {},
    {
      claim_due_jobs: (args) => claimDue(tables.jobs, args),
      // 00611's door: Checking, and the ask of its place two minutes on, together; false when it was not being sent.
      post_unanswered: ({ p_post_id, p_attempt }) => {
        const p = tables.posts.find((r) => r.id === p_post_id);
        if (!p || p.status !== "publishing") return false;
        p.status = "checking";
        tables.jobs.push({
          id: `job-ask-${tables.jobs.length + 1}`,
          tenant_id: p.tenant_id,
          kind: "post_reconcile",
          payload: { post_id: p.id, attempt: p_attempt },
          state: "scheduled",
          attempts: 0,
          due_at: new Date(Date.now() + 120_000).toISOString(),
        });
        return true;
      },
      post_moved: ({ p_post_id, p_from, p_to, p_patch }) => {
        const p = tables.posts.find((r) => r.id === p_post_id);
        if (!p || !p_from.includes(p.status)) return false;
        p.status = p_to;
        if (p_patch?.error) p.error = p_patch.error;
        return true;
      },
    },
  );
  return { db, tables, post: () => tables.posts[0] };
}

const send = (kind, payload = {}) => ({
  id: "job-1",
  tenant_id: T,
  kind,
  payload: { post_id: POST, attempt: "1", ...payload },
});
const asks = (w) => w.tables.jobs.filter((j) => j.kind === "post_reconcile");

test("Google's send that died after it began to send is Checking, with the ask of its profile on the ledger", async () => {
  const w = world({ status: "publishing" });
  const settled = await settleJob(w.db, send("post_google"), false);
  assert.equal(w.post().status, "checking", "it may be up: never failed as a post nobody can find out about");
  assert.equal(w.post().error, null);
  assert.deepEqual(
    asks(w).map((j) => j.payload),
    [{ post_id: POST, attempt: "1" }],
    "the profile is asked what it holds two minutes on",
  );
  assert.deepEqual(settled, [{ what: "post", changed: true, resumed: true }]);
});

test("Google's second ask that died after it began to send is Checking too, under its own attempt", async () => {
  const w = world({ status: "publishing" });
  await settleJob(w.db, send("post_google", { attempt: "2" }), false);
  assert.equal(w.post().status, "checking");
  assert.equal(asks(w)[0].payload.attempt, "2", "the profile's answer then knows no third ask may begin");
});

test("a send that died before it began sent nothing: it did not go, in those words, on Google as on Instagram", async () => {
  const google = world({ status: "queued" });
  assert.deepEqual(await settleJob(google.db, send("post_google"), false), [{ what: "post", changed: true }]);
  assert.equal(google.post().status, "failed");
  assert.equal(google.post().error.words, FILE_WORDS.google.notSent, "never 'look on your profile': nothing left");
  const instagram = world({ place: "instagram", status: "preparing" });
  assert.deepEqual(await settleJob(instagram.db, send("post_publish"), false), [{ what: "post", changed: true }]);
  assert.equal(instagram.post().status, "failed");
  assert.equal(instagram.post().error.words, ON_INSTAGRAM.notSent);
});

test("a send that wrote its own next ask and died before it reported back is left as it stood: the next ask sends it", async () => {
  for (const [place, kind, status, next] of [
    // A version of its piece is being made (00708): the send asked again a minute on.
    ["instagram", "post_publish", "preparing", { post_id: POST, attempt: "1", wait: "1", unread: "0" }],
    // Its opening could not be read (00728).
    ["instagram", "post_publish", "preparing", { post_id: POST, attempt: "1", wait: "0", unread: "1" }],
    ["google", "post_google", "queued", { post_id: POST, attempt: "1", unread: "1" }],
    // Google was too busy: its second and last ask, ten minutes on, the post back in the queue.
    ["google", "post_google", "queued", { post_id: POST, attempt: "2" }],
  ]) {
    const w = world({ place, status, jobs: [{ kind, state: "scheduled", payload: next }] });
    const settled = await settleJob(w.db, send(kind), false);
    assert.equal(w.post().status, status, `${kind} ${JSON.stringify(next)}: the post stands as it stood`);
    assert.equal(w.post().error, null);
    assert.deepEqual(settled, [{ what: "post", changed: false, resumed: true }]);
  }
});

test("a next ask that is itself over (done, failed, withdrawn) carries nothing on: the post did not go", async () => {
  for (const state of ["done", "failed", "canceled"]) {
    const w = world({
      place: "instagram",
      status: "preparing",
      jobs: [{ kind: "post_publish", state, payload: { post_id: POST, attempt: "1", wait: "1", unread: "0" } }],
    });
    await settleJob(w.db, send("post_publish"), false);
    assert.equal(w.post().status, "failed", `a ${state} job sends nothing`);
  }
  // Another post's next ask is not this one's.
  const other = world({
    place: "instagram",
    status: "preparing",
    jobs: [{ kind: "post_publish", state: "scheduled", payload: { post_id: "another-post", attempt: "1", wait: "1" } }],
  });
  await settleJob(other.db, send("post_publish"), false);
  assert.equal(other.post().status, "failed");
});

test("what was certainly not taken is still failed in its own words, whatever is on the ledger", async () => {
  const w = world({ status: "publishing" });
  await settleJob(w.db, send("post_google"), true, "Google did not take the post.");
  assert.equal(w.post().status, "failed");
  assert.equal(w.post().error.words, "Google did not take the post.");
  assert.equal(asks(w).length, 0);
});

test("a post left Checking rings no bell from the ledger: it is told when its place answers", async () => {
  const w = world({ status: "publishing" });
  // The send as the ledger holds it once its run died after it said it was about to speak.
  w.tables.jobs.push({
    ...send("post_google"),
    state: "fired",
    attempts: 1,
    spoke_at: new Date().toISOString(),
    due_at: new Date(Date.now() - 60_000).toISOString(),
    lease_until: new Date(Date.now() - 1000).toISOString(),
  });
  const ledger = ledgerWorld(w.db, {
    dispatch: () => async () => {
      throw new Error("a send that spoke is never run again");
    },
  });
  const run = await ledger.run();
  assert.deepEqual(
    run.steps,
    ["claim", "keep", "rpc:post_unanswered", "fail"],
    "given up: held, settled, then failed; nobody is told",
  );
  assert.equal(w.post().status, "checking");
  assert.deepEqual(ledger.told, [], "no 'Couldn't post to Google' about a post that is being checked");
  assert.ok(run.lines.some((l) => l.event === "job_resumed_untold"));
});

test("a post that did not go rings the bell once, and its body says nothing of a campaign send", async () => {
  const w = world({ status: "queued" });
  w.tables.jobs.push({
    ...send("post_google"),
    state: "fired",
    attempts: 1,
    due_at: new Date(Date.now() - 60_000).toISOString(),
    lease_until: new Date(Date.now() - 1000).toISOString(),
  });
  const ledger = ledgerWorld(w.db, { dispatch: () => async () => "done" });
  await ledger.run();
  assert.equal(w.post().status, "failed");
  assert.equal(ledger.told.length, 1);
  assert.equal(ledger.told[0].subject, "Couldn't post to Google");
  assert.doesNotMatch(ledger.told[0].body, /campaign send|people it had already reached/);
});

test("the sentence about what a job left: a post, a comment's answer and a request say nothing there, each says it on its own page", () => {
  for (const what of ["post", "comment_answer", "request"])
    assert.equal(saySettled([{ what, changed: true }]), null, `${what}: never the words of a campaign send`);
  assert.equal(saySettled([{ what: "post", changed: true, resumed: true }]), null);
  assert.match(
    saySettled([{ what: "broadcast", changed: true, reached: 3, remaining: 2 }]),
    /campaign send is marked as stopped/,
  );
  assert.match(
    saySettled([{ what: "broadcast", changed: true, resumed: true, reached: 3, remaining: 2 }]),
    /carries on in a fresh run/,
  );
});
