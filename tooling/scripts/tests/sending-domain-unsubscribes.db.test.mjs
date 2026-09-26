/**
 * A domain's counts and its holds on a real database (00188, Reach out Part 3 PR 7). sending_domain_counts answers
 * `unsubscribed`: the emails it sent that an unsubscribe names, through the unsubscribe's own door
 * (set_email_marketing), never a complaint's no, nor an email another domain sent. The table holds the new hold and
 * who lifts it, and nothing else. Local stack only: it makes a workspace.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite makes workspaces"
      : false;

const DAY = 86_400_000;
const stamp = Date.now().toString(36);
const iso = (ms) => new Date(ms).toISOString();
const HOST = `unsubs-${stamp}.example`;
const OTHER = `unsubs-other-${stamp}.example`;

let db;
let A;
let domain;
const ok = (res) => {
  assert.equal(res.error, null, res.error?.message);
  return res.data;
};
const one = async (q) => ok(await q.select("id").single()).id;

/** A person with a thread, and `count` emails that left from `host` to them. */
async function sentTo(label, host, count, at = null) {
  const email = `${label}-${stamp}@fixture-unsubs.example`;
  const person = await one(db.from("contacts").insert({ tenant_id: A, email }));
  const thread = await one(db.from("conversations").insert({ tenant_id: A, contact_id: person }));
  const rows = Array.from({ length: count }, () => ({
    id: crypto.randomUUID(),
    tenant_id: A,
    conversation_id: thread,
    contact_id: person,
    channel: "email",
    direction: "outbound",
    sender: "human",
    type: "text",
    body: "Saw your shop on the map.",
    status: "sent",
    meta: { source: "reach_out", email: { request: { from: `"Sam" <sam@${host}>`, to: [email] } } },
    ...(at ? { created_at: at } : {}),
  }));
  ok(await db.from("messages").insert(rows));
  return { person, ids: rows.map((r) => r.id) };
}
const say = (person, messageId, source) =>
  db.rpc("set_email_marketing", {
    p_tenant_id: A,
    p_contact_id: person,
    p_state: "opted_out",
    p_source: source,
    p_message_id: messageId,
    p_evidence: { channel: "email", via: source },
  });

before(async () => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
  A = await one(
    db.from("tenants").insert({ slug: `unsubs-${stamp}`, name: "Unsubscribes A", timezone: "America/Chicago" }),
  );
  domain = await one(
    db.from("sending_domains").insert({
      tenant_id: A,
      host: HOST,
      from_local: "sam",
      from_name: "Sam",
      state: "verified",
      provider_status: "verified",
      dmarc: "found",
      verified_at: iso(Date.now() - 40 * DAY),
      clean_since: iso(Date.now() - 40 * DAY),
    }),
  );
});
after(async () => {
  if (skip) return;
  if (A) ok(await db.from("tenants").delete().eq("id", A));
});

test("a domain's count names the emails an unsubscribe came from, and nothing else", { skip }, async () => {
  const unsubscribed = await sentTo("unsub", HOST, 3);
  const complained = await sentTo("complaint", HOST, 1);
  const elsewhere = await sentTo("elsewhere", OTHER, 1);
  const quiet = await sentTo("quiet", HOST, 2);
  ok(await say(unsubscribed.person, unsubscribed.ids[0], "unsubscribe"));
  ok(await say(complained.person, complained.ids[0], "complaint"));
  ok(await say(elsewhere.person, elsewhere.ids[0], "unsubscribe"));
  const c = ok(
    await db.rpc("sending_domain_counts", { p_tenant_id: A, p_host: HOST, p_since: iso(Date.now() - 40 * DAY) }),
  );
  assert.deepEqual(
    [c.sent, c.unsubscribed],
    [3 + 1 + quiet.ids.length, 1],
    "one email of this domain's was unsubscribed from; a complaint is its own count, and another domain's is theirs",
  );
  assert.equal(c.complained, 0, "a complaint is counted from its stamp (00176), which this no did not make");
  // An email sent before the count began and unsubscribed from after it is the episode before: not this count's.
  const before = await sentTo("before", HOST, 1, iso(Date.now() - 50 * DAY));
  ok(await say(before.person, before.ids[0], "unsubscribe"));
  const after = ok(
    await db.rpc("sending_domain_counts", { p_tenant_id: A, p_host: HOST, p_since: iso(Date.now() - 40 * DAY) }),
  );
  assert.equal(after.unsubscribed, 1, "still the one");
  // Past the count's start, nothing is named.
  const later = ok(
    await db.rpc("sending_domain_counts", { p_tenant_id: A, p_host: HOST, p_since: iso(Date.now() + DAY) }),
  );
  assert.deepEqual([later.sent, later.unsubscribed], [0, 0]);
});

test(
  "the table holds a domain held for its unsubscribes, and who lifts a hold: its owner or the platform, nobody else",
  { skip },
  async () => {
    const held = await db
      .from("sending_domains")
      .update({ state: "held", held_why: "unsubscribes", held_at: iso(Date.now()), resume_by: "platform" })
      .eq("id", domain)
      .select("held_why, resume_by")
      .single();
    assert.deepEqual(ok(held), { held_why: "unsubscribes", resume_by: "platform" });
    const refused = await db.from("sending_domains").update({ resume_by: "somebody" }).eq("id", domain);
    assert.equal(refused.error?.code, "23514");
    const fresh = await one(
      db
        .from("sending_domains")
        .insert({ tenant_id: A, host: `fresh-${stamp}.example`, from_local: "sam", from_name: "Sam" }),
    );
    const r = ok(await db.from("sending_domains").select("resume_by").eq("id", fresh).single());
    assert.equal(r.resume_by, "owner", "every domain starts its owner's");
  },
);
