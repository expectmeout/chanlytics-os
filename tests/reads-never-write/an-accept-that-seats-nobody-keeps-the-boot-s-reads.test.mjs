/**
 * The boot's one accept of invitations changes no read it holds unless it seated someone (invitations/accept.ts, client
 * api.ts `keepsReads`). A write lets go of every answer the boot holds, so the surfaces that read the same lists in turn
 * ask the server again; the accept, a write the shell makes on every boot, answered 600 ms into a cold load of Today and
 * had every read after it asked again, nine of them twice (measured on a production build, 12 Oct 2026). Its own file: the
 * accept is once a page, so a page that seats nobody is this process's alone.
 *
 * Run on the real client and the real accept over a scripted wire.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { importSrc } from "../_source.mjs";

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

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const calls = [];
globalThis.window.fetch = async (url, init = {}) => {
  const line = `${init.method ?? "GET"} ${new URL(String(url), "https://app.chanlytics.com").pathname.replace("/api/v1/", "")}`;
  calls.push(line);
  if (line === "POST me/invitations/accept") return json(200, { ok: true, data: { joined: [] } });
  return json(200, { ok: true, data: { conversations: [] } });
};
const asked = (line) => calls.filter((c) => c === line).length;

const { api } = await importSrc("apps/dashboard/src/legacy-bridge/api.ts");
const { acceptInvitations } = await importSrc("apps/dashboard/src/legacy-bridge/invitations/accept.ts");

test("an accept that seated nobody leaves the boot's held answers shared: the reads after it are not asked again", async () => {
  const release = api().holdAnswers();
  try {
    await api()("GET conversations");
    assert.deepEqual(await acceptInvitations(), [], "nobody was seated");
    await api()("GET conversations");
    assert.equal(asked("POST me/invitations/accept"), 1);
    assert.equal(asked("GET conversations"), 1, "the read after the accept shares the boot's answer");
  } finally {
    release();
  }
});
