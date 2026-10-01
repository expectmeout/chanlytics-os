/**
 * People's pages in the tab (decision 0021, step 3): every page after the first asks just past the last row once the
 * page before said where the next begins (`page.next`, handed back as `after`, beside the offset that counts the rows
 * the tab holds), and by the offset alone when it did not (a database before 00276). The real surface module reads
 * over a fake of GET contacts.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const storage = () => {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
};
const listeners = {};
globalThis.localStorage = storage();
globalThis.sessionStorage = storage();
globalThis.document = {
  body: {},
  activeElement: null,
  addEventListener() {},
  removeEventListener() {},
  getElementById: () => null,
  querySelector: () => null,
  createElement: () => ({ setAttribute() {}, style: {}, classList: { add() {}, remove() {} } }),
};
globalThis.window = {
  location: {
    pathname: "/w/studio",
    hash: "#/clients",
    origin: "https://app.chanlytics.com",
    assign() {},
    replace() {},
  },
  history: { replaceState() {}, back() {} },
  localStorage: globalThis.localStorage,
  sessionStorage: globalThis.sessionStorage,
  addEventListener: (type, fn) => (listeners[type] ||= new Set()).add(fn),
  removeEventListener: (type, fn) => listeners[type]?.delete(fn),
  dispatchEvent: () => true,
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h),
  __WORKSPACES: [{ id: "t-studio", slug: "studio", name: "Studio", status: "active", timezone: "America/New_York" }],
  __ACTIVE_WORKSPACE: "t-studio",
};

/** GET contacts over `total` people, a thousand a page; `next` is said only when `cursors` (a database with 00276). */
function contactsServer(total, { cursors }) {
  const asked = [];
  globalThis.window.fetch = async (url) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    if (u.pathname !== "/api/v1/contacts") return new Response("{}", { status: 404 });
    const q = Object.fromEntries(u.searchParams);
    asked.push({ offset: q.offset, ...(q.after ? { after: q.after } : {}) });
    const from = q.after ? Number(q.after.slice(1)) : Number(q.offset ?? 0);
    const rows = Array.from({ length: Math.max(0, Math.min(1000, total - from)) }, (_, i) => ({ id: `p${from + i}` }));
    const more = from + rows.length < total;
    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          people: rows,
          page: {
            q: null,
            offset: Number(q.offset ?? 0),
            limit: 1000,
            total,
            has_more: more,
            next: cursors && more ? `n${from + rows.length}` : null,
          },
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  return asked;
}

const firstPage = (total, cursors) => ({
  people: Array.from({ length: 1000 }, (_, i) => ({ id: `p${i}` })),
  page: { q: null, offset: 0, limit: 1000, total, has_more: true, next: cursors ? "n1000" : null },
});

const quietly = async (fn) => {
  const e = console.error;
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.error = e;
  }
};
const { everyPerson } = await quietly(() => import("../../../../../apps/dashboard/src/surfaces/people/surface.ts"));

test("every page after the first starts just past the last row, where the page before said, with the rows held counted beside it", async () => {
  const asked = contactsServer(2300, { cursors: true });
  const { people, page } = await everyPerson(firstPage(2300, true));
  assert.equal(people.length, 2300);
  assert.equal(new Set(people.map((p) => p.id)).size, 2300, "nobody twice");
  assert.deepEqual(asked, [
    { offset: "1000", after: "n1000" },
    { offset: "2000", after: "n2000" },
  ]);
  assert.deepEqual([page.has_more, page.next], [false, null]);
});

test("a page that says nowhere (a database before 00276) is followed by the offset alone, as before", async () => {
  const asked = contactsServer(2300, { cursors: false });
  const { people } = await everyPerson(firstPage(2300, false));
  assert.equal(people.length, 2300);
  assert.deepEqual(asked, [{ offset: "1000" }, { offset: "2000" }]);
});
