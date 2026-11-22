/**
 * A conversation says its ad (the Ads tracking plan's T1 and its call 6): a real thread whose person first came from an
 * ad says which under its head, and the message that came from an ad is marked where it happened, so a known person who
 * writes again from an ad months later is seen there too. Read through the shared record's reader over ad_entries (the
 * content loop PRD's Appendix A.2; 00677 ad_touches_of), named as the person's page names it (ad_named).
 *
 * What must hold. The Inbox's read and a thread's own read carry the line and the marks, by this workspace and these
 * messages. A read whose threads hold no ad asks nothing more: no person from an ad and no message with an ad's
 * referral is no read. A read of it that fails costs the threads nothing. The thread's model hands the head its ad (with
 * its door where Chanlytics holds the ad) and each bubble its mark. The Inbox's own search takes "from an ad". AI, asked
 * who from the ads is waiting, answers with the list the Ads page reads (listAdPeopleWaitingOnYou), no filter row added.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const kernel = await import(at("apps/dashboard/src/server/shared/reader.ts"));
const { conversations } = await import(at("apps/dashboard/src/server/readers/conversations.ts"));
const { messagesOf } = await import(at("apps/dashboard/src/server/readers/conversation.ts"));
const { toInboxThreadVM } = await import(at("packages/contracts/src/conversations/inbox-thread/thread-vm.ts"));
const { ixSays } = await import(at("apps/dashboard/src/surfaces/inbox/says.ts"));
const { runTool, newToolContext } = await import(at("apps/dashboard/src/server/ask/tools/index.ts"));
const { clearContextCache } = await import(at("apps/dashboard/src/server/ask/context.ts"));

beforeEach(() => {
  kernel.readerCache.clear();
  clearContextCache();
});

const T = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TZ = "America/New_York";
const NOW = new Date("2026-11-21T19:00:00Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms) => new Date(NOW.getTime() - ms).toISOString();
const id = (kind, n) =>
  `${kind.repeat(8)}-${kind.repeat(4)}-4${kind.repeat(3)}-8${kind.repeat(3)}-${String(n).padStart(12, "0")}`;

const A = id("d", 1);
const D = id("d", 2);
const K_AD = id("b", 1);
const K_BACK = id("b", 2);
const K_PLAIN = id("b", 3);
const C_AD = id("c", 1);
const C_BACK = id("c", 2);
const C_PLAIN = id("c", 3);
const M_FIRST = id("e", 1);
const M_LATER = id("e", 2);
const M_AGAIN = id("e", 3);
const M_PLAIN = id("e", 4);

const person = (pid, name, over = {}) => ({
  id: pid,
  tenant_id: T,
  display_name: name,
  wa_profile_name: null,
  phone_e164: `+1555555010${pid.slice(-1)}`,
  email: null,
  consent: "opted_in",
  dnc: false,
  marketing_consent: null,
  proposal_url: null,
  email_suppressed_at: null,
  email_suppressed_reason: null,
  acquired_via: "whatsapp",
  acquired_ref: null,
  erased_at: null,
  merged_into_contact_id: null,
  erasing_since: null,
  created_at: ago(90 * DAY),
  ...over,
});
const PEOPLE = {
  [K_AD]: person(K_AD, "Maya Ortiz", { acquired_via: "ad", acquired_ref: "1200001", created_at: ago(3 * DAY) }),
  [K_BACK]: person(K_BACK, "Jordan Price"),
  [K_PLAIN]: person(K_PLAIN, "Sam Lee"),
};
const thread = (cid, pid, over = {}) => ({
  id: cid,
  tenant_id: T,
  contact_id: pid,
  state: "open",
  paused_until: null,
  snooze_until: null,
  assignee_user_id: null,
  last_wa_inbound_at: ago(HOUR),
  last_message_at: ago(HOUR),
  contacts: PEOPLE[pid],
  ...over,
});
const referral = (adId) => ({ referral: { source_type: "ad", source_id: adId, headline: "Spring colour" } });
const message = (mid, cid, pid, msAgo, meta = {}) => ({
  id: mid,
  tenant_id: T,
  conversation_id: cid,
  contact_id: pid,
  direction: "inbound",
  sender: "customer",
  type: "text",
  body: "Hi, is the spring colour still on?",
  media: null,
  meta,
  status: "received",
  channel: "whatsapp",
  created_at: ago(msAgo),
  channel_ts: ago(msAgo),
  error: null,
});
const world = (over = {}) => ({
  conversations: [thread(C_AD, K_AD), thread(C_BACK, K_BACK), thread(C_PLAIN, K_PLAIN)],
  contacts: Object.values(PEOPLE),
  messages: [
    message(M_FIRST, C_AD, K_AD, 3 * DAY, referral("1200001")),
    message(M_LATER, C_AD, K_AD, 2 * HOUR),
    message(M_AGAIN, C_BACK, K_BACK, HOUR, referral("1200077")),
    message(M_PLAIN, C_PLAIN, K_PLAIN, HOUR),
  ],
  escalations: [],
  ...over,
});
/** ad_touches_of as 00677 answers it, out of the entries these messages opened. */
const TOUCHES = {
  touches: [
    { message_id: M_FIRST, ref: "meta:1200001" },
    { message_id: M_AGAIN, ref: "meta:1200077" },
  ],
  named: [
    { ref: "1200001", ad_id: A, name: "Spring colour offer" },
    { ref: "meta:1200001", ad_id: A, name: "Spring colour offer" },
    { ref: "meta:1200077", ad_id: D, name: "First visit" },
  ],
};

async function inboxRead(tables, touches = () => TOUCHES) {
  const supabase = fakeDb(tables, {}, { ad_touches_of: touches, contact_seen: () => [] });
  const ctx = { supabase, userId: "u1", email: "owner@example.com", params: {} };
  const read = await kernel.load(kernel.readerContext(ctx, { tenantId: T, role: "viewer" }), conversations, {
    ids: null,
  });
  return { byId: new Map(read.data.conversations.map((c) => [c.id, c])), seen: supabase.seen };
}
const markOf = (dto, mid) => dto.messages.find((m) => m.id === mid)?.from_ad;

test("the Inbox's read says the ad a person first came from, and marks each message that came from an ad, in one read", async () => {
  const { byId, seen } = await inboxRead(world());
  assert.deepEqual(byId.get(C_AD).from_ad, { ad_id: A, name: "Spring colour offer" });
  assert.deepEqual(markOf(byId.get(C_AD), M_FIRST), { ad_id: A, name: "Spring colour offer" });
  assert.equal(markOf(byId.get(C_AD), M_LATER), undefined, "a message of no ad wears no mark");
  // A known person who wrote again from an ad: no line under the head (they did not first come from it), and a mark
  // where it happened.
  assert.equal(byId.get(C_BACK).from_ad, undefined);
  assert.deepEqual(markOf(byId.get(C_BACK), M_AGAIN), { ad_id: D, name: "First visit" });
  assert.equal(byId.get(C_PLAIN).from_ad, undefined);
  const asked = seen.filter((one) => one.rpc === "ad_touches_of");
  assert.equal(asked.length, 1, "one read for every thread of the answer");
  assert.equal(asked[0].args.p_tenant_id, T, "this workspace's");
  assert.deepEqual(
    [...asked[0].args.p_messages].sort(),
    [M_FIRST, M_AGAIN].sort(),
    "only the messages an ad rode in on",
  );
  assert.deepEqual(asked[0].args.p_refs, ["1200001"], "only the people who first came from an ad");
});

test("a read whose threads hold no ad asks nothing more", async () => {
  const plain = world({
    conversations: [thread(C_PLAIN, K_PLAIN)],
    messages: [message(M_PLAIN, C_PLAIN, K_PLAIN, HOUR)],
  });
  const { byId, seen } = await inboxRead(plain);
  assert.equal(byId.get(C_PLAIN).from_ad, undefined);
  assert.equal(
    seen.filter((one) => one.rpc === "ad_touches_of").length,
    0,
    "no person from an ad, no ad's referral: no read",
  );
  // Our own words never carry an ad, whatever their meta says.
  const ours = {
    ...message(M_PLAIN, C_PLAIN, K_PLAIN, HOUR, referral("1200001")),
    direction: "outbound",
    sender: "ai",
  };
  const again = await inboxRead(world({ conversations: [thread(C_PLAIN, K_PLAIN)], messages: [ours] }));
  assert.equal(again.seen.filter((one) => one.rpc === "ad_touches_of").length, 0);
});

test("a read of the ads that fails costs the threads nothing", async () => {
  for (const code of ["57014", "PGRST202"]) {
    const { byId } = await inboxRead(world(), () => {
      throw Object.assign(new Error("refused"), { code });
    });
    assert.equal(byId.size, 3, code);
    assert.equal(byId.get(C_AD).from_ad, undefined, code);
    assert.equal(markOf(byId.get(C_AD), M_FIRST), undefined, code);
  }
});

test("a thread read whole marks its messages that came from an ad, as the Inbox's read does", async () => {
  const supabase = fakeDb(world(), {}, { ad_touches_of: () => TOUCHES });
  const ctx = { supabase, userId: "u1", email: "owner@example.com", params: {} };
  const read = await kernel.load(kernel.readerContext(ctx, { tenantId: T, role: "viewer" }), messagesOf, {
    id: C_BACK,
    before: null,
  });
  assert.deepEqual(read.data.find((m) => m.id === M_AGAIN).from_ad, { ad_id: D, name: "First visit" });
});

test("the thread's model hands its head the ad and each bubble its mark; the Inbox's search finds them by 'from an ad'", async () => {
  const { byId } = await inboxRead(world());
  const vm = toInboxThreadVM(byId.get(C_AD), null, TZ, NOW);
  assert.deepEqual(vm.fromAd, { id: A, name: "Spring colour offer" });
  const bubble = (one, mid) => one.timeline.find((entry) => entry.messageId === mid);
  assert.deepEqual(bubble(vm, M_FIRST).fromAd, { id: A, name: "Spring colour offer" });
  assert.equal(bubble(vm, M_LATER).fromAd, undefined);
  const back = toInboxThreadVM(byId.get(C_BACK), null, TZ, NOW);
  assert.equal(back.fromAd, undefined);
  const plain = toInboxThreadVM(byId.get(C_PLAIN), null, TZ, NOW);
  // An ad Chanlytics does not hold: named where it can be, with no door.
  const unheld = toInboxThreadVM({ ...byId.get(C_AD), from_ad: { ad_id: null, name: null } }, null, TZ, NOW);
  assert.deepEqual(unheld.fromAd, { id: null, name: null });

  for (const words of ["from an ad", "From an ad", "spring colour"]) assert.equal(ixSays(vm, words), true, words);
  assert.equal(ixSays(back, "from an ad"), true, "a message that came from an ad is found too");
  assert.equal(ixSays(back, "first visit"), true, "by the ad's name");
  assert.equal(ixSays(plain, "from an ad"), false);
  assert.equal(ixSays(plain, "sam"), true, "the search finds what it always found");
  assert.equal(ixSays(unheld, "from an ad"), true);
});

test("asked who from the ads is waiting, AI answers with the list the Ads page reads, longest waiting first", async () => {
  const hold = (hid, cid, msAgo) => ({
    id: hid,
    tenant_id: T,
    conversation_id: cid,
    reason: "human_token",
    details: null,
    state: "open",
    created_at: ago(msAgo),
    resolved_at: null,
  });
  const flagged = (cid, pid) => thread(cid, pid, { state: "needs_human" });
  const tables = world({
    conversations: [flagged(C_AD, K_AD), flagged(C_BACK, K_BACK), thread(C_PLAIN, K_PLAIN)],
    escalations: [hold(id("f", 1), C_AD, 2 * HOUR), hold(id("f", 2), C_BACK, 5 * HOUR)],
    memberships: [{ user_id: "u1", tenant_id: T, role: "owner", created_at: "2026-01-01T00:00:00Z" }],
  });
  const ctx = {
    supabase: fakeDb(tables, {}, { ad_touches_of: () => TOUCHES, contact_seen: () => [], people_list: () => [] }),
    userId: "u1",
    email: "owner@example.com",
    params: {},
  };
  const said = JSON.parse(
    (
      await runTool(newToolContext(ctx, T, "owner", TZ, NOW), {
        name: "inbox",
        input: { action: "list", filter: "from_ads" },
      })
    ).result,
  );
  // Jordan waits too, but first came by WhatsApp: the Ads page's line names only the people an ad brought.
  assert.deepEqual(
    said.threads.map((one) => one.conversation_id),
    [C_AD],
  );
  assert.equal(said.total_matching, 1);
  assert.equal(said.threads[0].from_ad, "Spring colour offer", "and names the ad");
});
