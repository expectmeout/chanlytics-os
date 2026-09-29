/**
 * A message's media is the edge's to write (00246), on a real Postgres with a real session: a member may queue a reply
 * in their own workspace as they always could, and may not queue one carrying an attachment -- least of all one whose
 * path names another workspace's object, which the dashboard's media route would sign with the service role. The
 * signer's own fence (a path outside the asking workspace is never signed) is proved beside the route, in
 * conversations/inbox/inbox-routes.test.mjs. Runs against the database `supabase start` builds, never production.
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
      ? "refusing a database that is not on this machine"
      : !ANON
        ? "no SUPABASE_ANON_KEY in env"
        : false;

let admin;
const made = { users: [], tenants: [] };
const PASSWORD = "media-fence-test-password-1";
const RUN = Date.now().toString(36);
const ok = (r, what) => {
  assert.equal(r.error, null, `${what}: ${r.error?.message}`);
  return r.data;
};

before(async () => {
  if (skip) return;
  admin = createClient(URL_, KEY, { auth: { persistSession: false } });
});
after(async () => {
  if (skip) return;
  for (const id of made.tenants) await admin.from("tenants").delete().eq("id", id);
  for (const id of made.users) await admin.auth.admin.deleteUser(id).catch(() => undefined);
});

async function workspace(tag) {
  const t = ok(
    await admin
      .from("tenants")
      .insert({ name: `Media ${tag}`, slug: `media-${tag}-${RUN}` })
      .select("id")
      .single(),
    "tenant",
  ).id;
  made.tenants.push(t);
  const contact = ok(
    await admin
      .from("contacts")
      .insert({ tenant_id: t, phone_e164: `+1305555${String(made.tenants.length).padStart(4, "0")}` })
      .select("id")
      .single(),
    "contact",
  ).id;
  const conversation = ok(
    await admin.from("conversations").insert({ tenant_id: t, contact_id: contact }).select("id").single(),
    "conversation",
  ).id;
  return { t, contact, conversation };
}

test(
  "a member queues a reply in their own workspace, and never one carrying an attachment: not their own workspace's path, and not another's",
  { skip },
  async () => {
    const mine = await workspace("mine");
    const theirs = await workspace("theirs");
    const email = `media-owner-${RUN}@example.com`;
    const u = ok(await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true }), "user").user;
    made.users.push(u.id);
    ok(await admin.from("memberships").insert({ user_id: u.id, tenant_id: mine.t, role: "owner" }), "membership");
    const session = createClient(URL_, ANON, { auth: { persistSession: false } });
    ok(await session.auth.signInWithPassword({ email, password: PASSWORD }), "sign in");

    const reply = (over = {}) =>
      session
        .from("messages")
        .insert({
          tenant_id: mine.t,
          conversation_id: mine.conversation,
          contact_id: mine.contact,
          channel: "whatsapp",
          direction: "outbound",
          sender: "human",
          sent_by: u.id,
          status: "queued",
          type: "text",
          body: "See you at 3",
          ...over,
        })
        .select("id");

    const plain = await reply();
    assert.equal(plain.error, null, `a plain reply is still the member's to queue: ${plain.error?.message}`);

    for (const [storage_path, why] of [
      [`${theirs.t}/${theirs.conversation}/secret.jpg`, "another workspace's object"],
      [`${mine.t}/${mine.conversation}/mine.jpg`, "even one under their own workspace's path"],
    ]) {
      const r = await reply({ type: "media", body: null, media: { storage_path, fetch_state: "stored" } });
      assert.ok(r.error, `refused: ${why}`);
      assert.equal(r.error.code, "42501", `the row policy's refusal: ${why}`);
    }
    const { data: rows } = await admin.from("messages").select("id, media").eq("conversation_id", mine.conversation);
    assert.deepEqual(
      rows.map((m) => m.media),
      [null],
      "only the plain reply was written",
    );
  },
);
