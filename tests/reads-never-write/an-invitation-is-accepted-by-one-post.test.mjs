/**
 * An invitation seats a person by one POST the shell makes once, not by the read of the workspace list (finding R1c,
 * decision 0047 lane 6; the route and its run are workspace/team-audit-and-invites.test.mjs).
 *
 * GET workspaces seated a person from an open invitation on every same-origin read, the document head's included, with no
 * word to them that it had. Now the shell asks once when it boots (invitations/accept.ts), says "You joined Luna" in its toast
 * (invitations/joined-note.tsx), and costs a boot nothing when the list is whole: only a list that holds no workspace, or none the
 * address names, waits for the answer, since that is the list an invitation is about to change.
 *
 * Run on the real workspace surface and the real client over a scripted wire.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { youJoinedWords } from "@chanlytics/contracts";
import { importSrc } from "../_source.mjs";

/* ---- a window, a wire and a place in the world ---- */
globalThis.window ??= globalThis;
globalThis.location ??= { pathname: "/w/harbor/today", hash: "", search: "" };
globalThis.document ??= { visibilityState: "visible", addEventListener() {}, removeEventListener() {} };
const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
globalThis.localStorage ??= storage();
globalThis.sessionStorage ??= storage();
const bus = new EventTarget();
globalThis.window.addEventListener = (...a) => bus.addEventListener(...a);
globalThis.window.removeEventListener = (...a) => bus.removeEventListener(...a);
globalThis.window.dispatchEvent = (e) => bus.dispatchEvent(e);
const replaced = [];
globalThis.location.replace = (to) => replaced.push(to);

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ws = (slug, name) => ({ id: `id-${slug}`, slug, name, status: "active", timezone: "America/New_York" });
const ME = { id: "u1", email: "ada@example.com", role: "operator" };
const listOf = (...workspaces) => ({ workspaces, activeWorkspaceId: workspaces[0]?.id ?? null, user: ME });

/** What the wire saw, by request line; the list it answers in turn (the last repeats); and a hold on the accept. */
const calls = [];
let lists = [];
let hold = null;
const accepted = { joined: [{ id: "id-luna", name: "Luna", role: "operator" }] };
globalThis.window.fetch = async (url, init = {}) => {
  const u = new URL(String(url), "https://app.chanlytics.com");
  const line = `${init.method ?? "GET"} ${u.pathname.replace("/api/v1/", "")}`;
  calls.push(line);
  if (line === "POST me/invitations/accept") {
    await hold;
    return json(200, { ok: true, data: accepted });
  }
  if (line === "GET workspaces") return json(200, { ok: true, data: lists.length > 1 ? lists.shift() : lists[0] });
  return json(404, { ok: false, error: { code: "not_found", message: "no" } });
};
const asked = (line) => calls.filter((c) => c === line).length;
/** Turns of the event loop: a Response's body is read in turns, and a busy machine spends more of them than a quiet one. */
const flush = async (turns = 30) => {
  for (let i = 0; i < turns; i += 1) {
    for (let j = 0; j < 20; j += 1) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  }
};

const { api } = await importSrc("apps/dashboard/src/legacy-bridge/api.ts");
const { workspaceOverride } = await importSrc("apps/dashboard/src/legacy-bridge/surface-data.ts");
const { JOINED_EVENT, takeJoinedWords } = await importSrc("apps/dashboard/src/legacy-bridge/invitations/accept.ts");
const forgetPlace = () => {
  // The client shares identical reads for two seconds: a test's read must not be answered with the one before it.
  api().forget();
  globalThis.__WORKSPACES = undefined;
  globalThis.__ACTIVE_WORKSPACE = undefined;
  calls.length = 0;
  replaced.length = 0;
};

test("the words say which workspaces the person joined, and nothing when none", () => {
  assert.equal(youJoinedWords([]), null);
  assert.equal(youJoinedWords(["Harbor"]), "You joined Harbor");
  assert.equal(youJoinedWords(["Harbor", "Luna"]), "You joined Harbor and Luna");
  assert.equal(youJoinedWords(["Harbor", "Luna", "Zilker"]), "You joined Harbor, Luna and Zilker");
});

test("a boot whose list is whole does not wait for the accept: it is asked once, and the news is kept for whoever draws it", async () => {
  forgetPlace();
  lists = [listOf(ws("harbor", "Harbor"))];
  let release;
  hold = new Promise((r) => (release = r));
  const told = [];
  const hear = () => told.push("joined");
  globalThis.window.addEventListener(JOINED_EVENT, hear);
  try {
    const applied = workspaceOverride.apply().then(() => "applied");
    const first = await Promise.race([applied, flush(80).then(() => "waiting")]);
    assert.equal(first, "applied", "the list was whole, so the boot went on while the accept was still out");
    assert.equal(asked("POST me/invitations/accept"), 1, "asked once");
    assert.equal(asked("GET workspaces"), 1, "and the list read once");
    assert.deepEqual(told, [], "nothing is said before the answer");

    release();
    await flush();
    assert.deepEqual(told, ["joined"], "the answer seated them in Luna, and the page that draws the news is told");
    assert.equal(takeJoinedWords(), "You joined Luna");
    assert.equal(takeJoinedWords(), null, "said once: whoever takes the words clears them");
    assert.equal(asked("GET workspaces"), 1, "a seat beside a whole list is heard by the live feed, not read here");
  } finally {
    globalThis.window.removeEventListener(JOINED_EVENT, hear);
  }
});

test("a list that holds no workspace waits for the accept and is read again for the seat, once", async () => {
  forgetPlace();
  globalThis.location.pathname = "/w/luna/today";
  hold = null;
  // The first read finds the person in nothing (the invitation has not seated them); the read after the accept finds Luna.
  lists = [listOf(), listOf(ws("luna", "Luna"))];
  await workspaceOverride.apply();
  assert.equal(asked("GET workspaces"), 2, "read, then read again with the seat");
  assert.equal(asked("POST me/invitations/accept"), 0, "the accept is the page's one, not asked again");
  assert.deepEqual(
    (globalThis.__WORKSPACES ?? []).map((w) => w.slug),
    ["luna"],
    "the list the tab holds is the one with the seat",
  );
  assert.deepEqual(replaced, [], "so the tab stays where the address put it, and the create screen is not drawn");

  forgetPlace();
  lists = [listOf()];
  await workspaceOverride.apply();
  assert.equal(asked("GET workspaces"), 1, "the seat was read for once: a list that is empty again is not read twice");
});
