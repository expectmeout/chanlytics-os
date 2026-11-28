/**
 * The shelf's ticket (the archive plan's B2: packages/channels/src/files/relay-ticket.ts signs it, apps/relay/src/ticket.ts
 * reads it, in two modules that share no code, since a Worker imports nothing of ours). A video Chanlytics made keeps
 * a copy on a shelf of Chanlytics' own, and everything asked of that shelf rides one of these: whose workspace, which
 * file, what may be done, and, for a put, the very bytes. These hold the two sides to one format, and a clip's ticket
 * (v1) and the shelf's (v2) apart: neither opens what the other does.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { at } from "../../_cron-doors-world.mjs";
import { importSrc } from "../../_source.mjs";

const { readRelayTicket, signRelayTicket, signShelfTicket } = await importSrc(
  "packages/channels/src/files/relay-ticket.ts",
);
const relay = await import(at("apps/relay/src/ticket.ts"));

const KEY = "ticket-key-for-this-file";
const TENANT = "5d0c2b7e-0e55-4a53-9b4e-6f1c2a3b4c5d";
const FILE = "0b0e6c1e-6f0a-4b6e-9d3e-2a1f5c7d9e11";
const SHA = "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08";
const NOW = Date.parse("2026-11-23T03:00:00Z");
const HOUR_S = 60 * 60;
const inHours = (hours) => NOW / 1000 + hours * HOUR_S;
const base = (use, more = {}) => ({ tenant: TENANT, file: FILE, use, expiresAt: inHours(1), ...more });
/** A list's claim: a workspace, and no file. */
const LIST = { tenant: TENANT, use: "list", expiresAt: inHours(1) };

/** A ticket of any claim at all, signed with the key as the app signs one: what only a holder of the key could make. */
function signed(claim, version = "v2", key = KEY) {
  const body = `${version}.${Buffer.from(JSON.stringify(claim), "utf8").toString("base64url")}`;
  return `${body}.${createHmac("sha256", key).update(body).digest().toString("base64url")}`;
}
const claimOf = (ticket) => Buffer.from(ticket.split(".")[1], "base64url").toString("utf8");

/** A clip's ticket for this key, item and end, as it was signed before the shelf had one (22 November 2026). */
const CLIP_TICKET =
  "v1.eyJpdGVtIjoiMGIwZTZjMWUtNmYwYS00YjZlLTlkM2UtMmExZjVjN2Q5ZTExIiwiZXhwIjoxNzk0OTkyNDAwfQ.lJjhlYR_YywS35UOdf6Uo4ad36_ezDLEzQRl0kANViw";
const CLIP_TICKET_AT = Date.parse("2026-11-18T03:00:00Z");

test("a ticket the app signs for the shelf is read by the relay, for each thing it may do", async () => {
  for (const use of ["read", "delete"]) {
    const ticket = signShelfTicket(KEY, base(use));
    assert.deepEqual(await relay.readShelfTicket(KEY, ticket, NOW), { ok: true, ...base(use) }, use);
  }
  const put = signShelfTicket(KEY, base("put", { bytes: 31_457_280, sha256: SHA }));
  assert.deepEqual(await relay.readShelfTicket(KEY, put, NOW), {
    ok: true,
    ...base("put", { bytes: 31_457_280, sha256: SHA }),
  });
  // A list names its workspace and no file: the relay reads it so, and says so.
  assert.deepEqual(await relay.readShelfTicket(KEY, signShelfTicket(KEY, LIST), NOW), {
    ok: true,
    ...LIST,
    file: null,
  });
});

test("its text says it is the shelf's, whose and which, what it may do and when it ends, and a put the very bytes", () => {
  const read = signShelfTicket(KEY, base("read"));
  assert.match(read, /^v2\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.equal(claimOf(read), `{"for":"shelf","tenant":"${TENANT}","file":"${FILE}","use":"read","exp":${inHours(1)}}`);
  assert.equal(
    claimOf(signShelfTicket(KEY, base("put", { bytes: 42, sha256: SHA }))),
    `{"for":"shelf","tenant":"${TENANT}","file":"${FILE}","use":"put","exp":${inHours(1)},"bytes":42,"sha256":"${SHA}"}`,
  );
  assert.equal(
    claimOf(signShelfTicket(KEY, LIST)),
    `{"for":"shelf","tenant":"${TENANT}","use":"list","exp":${inHours(1)}}`,
  );
  // The same claim under the same key is the same ticket: nothing random rides in one.
  assert.equal(read, signShelfTicket(KEY, base("read")));
  assert.equal(read, signed({ for: "shelf", tenant: TENANT, file: FILE, use: "read", exp: inHours(1) }));
});

test("the relay refuses a shelf ticket that was not signed by the app, was changed, has ended or runs too long", async () => {
  const good = signShelfTicket(KEY, base("read"));
  const [version, claim, signature] = good.split(".");
  const cases = [
    ["another key's", signShelfTicket("another-key", base("read")), "signature"],
    ["a claim changed after signing", `${version}.${claim.slice(0, -2)}AA.${signature}`, "signature"],
    ["a signature changed", `${version}.${claim}.${signature.slice(0, -2)}AA`, "signature"],
    ["ended", signShelfTicket(KEY, { ...base("read"), expiresAt: inHours(-1) }), "expired"],
    ["signed for longer than a day", signShelfTicket(KEY, { ...base("read"), expiresAt: inHours(25) }), "too_long"],
    ["two parts", `${version}.${claim}`, "malformed"],
    ["no ticket", null, "malformed"],
    ["not a ticket", "hello", "malformed"],
  ];
  for (const [what, ticket, reason] of cases)
    assert.deepEqual(await relay.readShelfTicket(KEY, ticket, NOW), { ok: false, reason }, what);
  assert.deepEqual(await relay.readShelfTicket("", good, NOW), { ok: false, reason: "malformed" }, "no key to read by");
});

test("a signed claim that says too little, too much or something else is no shelf ticket", async () => {
  const whole = { for: "shelf", tenant: TENANT, file: FILE, use: "read", exp: inHours(1) };
  const cases = [
    ["for another place", { ...whole, for: "clip" }],
    ["for no place", { tenant: TENANT, file: FILE, use: "read", exp: inHours(1) }],
    ["a use nobody knows", { ...whole, use: "write" }],
    ["no use", { for: "shelf", tenant: TENANT, file: FILE, exp: inHours(1) }],
    ["no workspace", { for: "shelf", file: FILE, use: "read", exp: inHours(1) }],
    ["a workspace that is no id", { ...whole, tenant: "../another" }],
    ["a file that is no id", { ...whole, file: "Saturday colour.MOV" }],
    ["a put with no bytes", { ...whole, use: "put", sha256: SHA }],
    ["a put with no checksum", { ...whole, use: "put", bytes: 42 }],
    ["a put of nothing", { ...whole, use: "put", bytes: 0, sha256: SHA }],
    ["a put of half a byte", { ...whole, use: "put", bytes: 4.5, sha256: SHA }],
    ["a put whose checksum is no SHA-256", { ...whole, use: "put", bytes: 42, sha256: "abc" }],
    ["a read that names bytes", { ...whole, bytes: 42, sha256: SHA }],
    ["a delete that names a checksum", { ...whole, use: "delete", sha256: SHA }],
    ["an end that is no number", { ...whole, exp: "soon" }],
    ["a clip's claim under the shelf's version", { item: FILE, exp: inHours(1) }],
    ["a read that names no file", { for: "shelf", tenant: TENANT, use: "read", exp: inHours(1) }],
    ["a list that names a file", { ...whole, use: "list" }],
    ["a list that names bytes", { for: "shelf", tenant: TENANT, use: "list", exp: inHours(1), bytes: 42 }],
    ["a list of no workspace", { for: "shelf", use: "list", exp: inHours(1) }],
  ];
  for (const [what, claim] of cases)
    assert.deepEqual(await relay.readShelfTicket(KEY, signed(claim), NOW), { ok: false, reason: "malformed" }, what);
  // The shelf's claim, whole, under a clip's version, is not the shelf's ticket either.
  assert.deepEqual(await relay.readShelfTicket(KEY, signed(whole, "v1"), NOW), { ok: false, reason: "malformed" });
});

test("a clip's ticket opens nothing of the shelf's, and the shelf's nothing of a clip's", async () => {
  assert.deepEqual(await relay.readShelfTicket(KEY, CLIP_TICKET, CLIP_TICKET_AT), { ok: false, reason: "malformed" });
  for (const use of ["read", "put", "delete", "list"]) {
    const more = use === "put" ? { bytes: 42, sha256: SHA } : {};
    const ticket = signShelfTicket(KEY, use === "list" ? LIST : base(use, more));
    assert.deepEqual(await relay.readTicket(KEY, ticket, NOW), { ok: false, reason: "malformed" }, `the relay: ${use}`);
    assert.deepEqual(readRelayTicket(KEY, ticket, NOW), { ok: false, reason: "malformed" }, `the app: ${use}`);
  }
});

test("the app never signs a shelf ticket that says too little or too much", () => {
  const refused = [
    [() => signShelfTicket("", base("read")), /ticket's key/],
    [() => signShelfTicket(KEY, { ...base("read"), tenant: "../another" }), /by its id/],
    [() => signShelfTicket(KEY, { ...base("read"), file: "Saturday colour.MOV" }), /by its id/],
    [() => signShelfTicket(KEY, base("write")), /reads, puts, deletes or lists/],
    [() => signShelfTicket(KEY, base("list")), /a list names a workspace and no file/],
    [() => signShelfTicket(KEY, { ...LIST, tenant: "../another" }), /by its id/],
    [() => signShelfTicket(KEY, { ...LIST, bytes: 42, sha256: SHA }), /only a put names bytes/],
    [() => signShelfTicket(KEY, { tenant: TENANT, use: "read", expiresAt: inHours(1) }), /by its id/],
    [() => signShelfTicket(KEY, base("put")), /the bytes it may put/],
    [() => signShelfTicket(KEY, base("put", { bytes: 42 })), /the bytes it may put/],
    [() => signShelfTicket(KEY, base("put", { bytes: 0, sha256: SHA })), /the bytes it may put/],
    [() => signShelfTicket(KEY, base("put", { bytes: 42, sha256: SHA.toUpperCase() })), /the bytes it may put/],
    [() => signShelfTicket(KEY, base("read", { bytes: 42, sha256: SHA })), /only a put names bytes/],
    [() => signShelfTicket(KEY, base("delete", { sha256: SHA })), /only a put names bytes/],
  ];
  for (const [sign, why] of refused) assert.throws(sign, why);
});

test("a clip's ticket is the ticket it was before the shelf had one", async () => {
  // Nothing of v1 moved: the relay live today reads what this edge signs, and this relay what the edge live today signs.
  const clip = { item: FILE, expiresAt: CLIP_TICKET_AT / 1000 + 6 * HOUR_S };
  assert.equal(signRelayTicket(KEY, clip), CLIP_TICKET);
  assert.equal(await relay.signTicket(KEY, clip), CLIP_TICKET);
  assert.deepEqual(readRelayTicket(KEY, CLIP_TICKET, CLIP_TICKET_AT), { ok: true, ...clip });
  assert.deepEqual(await relay.readTicket(KEY, CLIP_TICKET, CLIP_TICKET_AT), { ok: true, ...clip });
});
