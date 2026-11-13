/**
 * A page of People reads its own people's reply modes, and nobody else's (people_reply_modes, 00624).
 *
 * Beside each page of people the page read every reply policy the workspace held, a thousand rows a read, however many
 * people had a mode of their own: a workspace that set a mode for thousands of people paid for all of them on every
 * page. Now the page asks the database for the modes of the people it draws, with the page's own arguments, beside its
 * rows, so it waits no extra round trip. The everyone readers (the CSV, Ask) keep their one read for all their pages.
 * The SQL itself is proved on a stack in people/moments/a-page-s-modes-are-its-own.db.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const { listPeople, listEveryone } = await import(
  pathToFileURL(path.join(ROOT, "apps/dashboard/src/server/people/people.ts")).href
);

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const idOf = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
const policyId = (i) => `99999999-0000-4000-8000-${String(i).padStart(12, "0")}`;
const ON_PAGE = 50;

/** The workspace's first fifty people, as people_list answers its first page and nothing past it. */
const people = Array.from({ length: ON_PAGE }, (_, i) => ({ id: idOf(i + 1), display_name: `Person ${i + 1}` }));
const peopleList = (args) => (args.p_tenant_id === A && !args.p_offset && !args.p_after_id ? people : []);

/**
 * Three thousand people off this page with a mode of their own, one person on it with theirs, and the workspace's own
 * mode written last.
 */
const policies = [
  ...Array.from({ length: 3000 }, (_, i) => ({
    id: policyId(i + 1),
    tenant_id: A,
    class: "reply",
    subject_type: "contact",
    subject_id: idOf(10_000 + i),
    mode: "never",
  })),
  { id: policyId(4000), tenant_id: A, class: "reply", subject_type: "contact", subject_id: idOf(7), mode: "ask" },
  { id: policyId(5000), tenant_id: A, class: "reply", subject_type: null, subject_id: null, mode: "veto" },
];

/** The database in memory answers people_reply_modes as 00624 writes it, over this world's page and policies. */
const ctxOf = () => {
  const db = fakeDb({ policies, contacts: [] }, {}, { people_list: peopleList });
  return { db, ctx: { supabase: db } };
};

test("fifty people with one of their own among thousands: the page reads only the modes it draws", async () => {
  const { db, ctx } = ctxOf();
  const rows = await listPeople(ctx, A, {});
  assert.equal(rows.length, ON_PAGE);
  assert.equal(
    db.seen.filter((q) => q.table === "policies").length,
    0,
    "no reply policy is read but through the page's own question",
  );
  const lists = db.seen.filter((q) => q.rpc === "people_list");
  const modes = db.seen.filter((q) => q.rpc === "people_reply_modes");
  assert.equal(modes.length, 1, "one read of the page's modes");
  assert.deepEqual(modes[0].args, lists[0].args, "asked with the page's own arguments, so it names the same people");
});

test("the page's modes are exactly what the read of everyone says of the same people", async () => {
  const page = new Map((await listPeople(ctxOf().ctx, A, {})).map((p) => [p.id, p.effective_reply_mode]));
  const everyone = new Map((await listEveryone(ctxOf().ctx, A)).map((p) => [p.id, p.effective_reply_mode]));
  assert.deepEqual(page, everyone, "the everyone read keeps the old way: one read of every policy, for all its pages");
  assert.equal(page.get(idOf(7)), "ask", "their own");
  assert.equal(page.get(idOf(8)), "veto", "the workspace's, for someone with none of their own");
});

test("a page whose modes cannot be read says none, never a guessed one, and still draws its people", async () => {
  const db = fakeDb(
    { policies, contacts: [] },
    {},
    {
      people_list: peopleList,
      people_reply_modes: () => {
        throw Object.assign(new Error("canceling statement due to statement timeout"), { code: "57014" });
      },
    },
  );
  const rows = await listPeople({ supabase: db }, A, {});
  assert.equal(rows.length, ON_PAGE);
  assert.ok(rows.every((r) => r.effective_reply_mode === null));
});
