/**
 * Other people's notes keep nothing of a person erased (decision 0036, 00340) -- on a real database.
 *
 * An erasure takes the person's own notes with them (00158); a note about someone else that carries their number or
 * address is scrubbed in place by person_notes_scrub: every spelling erasureKeys makes, matched without regard to case,
 * overwritten with "[erased]", the note kept, its names left, its version moved on. The erasure route calls it before
 * the rows go and after (erasure-door.test.mjs proves the order); this proves what it does to the rows. Skipped without
 * a local database.
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@supabase/supabase-js";
import { at } from "../../_cron-doors-world.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const { erasureKeys } = await import(at("apps/dashboard/src/server/people/erasure.ts"));

const URL_ = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const skip =
  !URL_ || !KEY || KEY === "test-only"
    ? "no database in env"
    : !/^http:\/\/(127\.0\.0\.1|localhost):\d+\/?$/.test(URL_)
      ? "refusing a database that is not on this machine: this suite writes customers and their notes"
      : false;

let db;
const tenants = [];
const ok = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};
const workspace = async (tag) => {
  const row = ok(
    await db
      .from("tenants")
      .insert({ slug: `notes-scrub-${tag}-${Date.now()}`, name: "Notes scrub" })
      .select("id")
      .single(),
    "tenant",
  );
  tenants.push(row.id);
  return row.id;
};
const person = async (tenant_id, row = {}) =>
  ok(
    await db
      .from("contacts")
      .insert({ tenant_id, ...row })
      .select("id")
      .single(),
    "contact",
  ).id;
const note = async (tenant_id, contact_id, body) =>
  ok(
    await db
      .from("person_notes")
      .insert({ tenant_id, contact_id, body, author_kind: "member", source: "page" })
      .select("id")
      .single(),
    "note",
  ).id;
const read = async (id) => ok(await db.from("person_notes").select("body, version").eq("id", id).single(), "read");

before(() => {
  if (skip) return;
  db = createClient(URL_, KEY, { auth: { persistSession: false } });
});

after(async () => {
  if (skip) return;
  for (const t of tenants) await db.from("tenants").delete().eq("id", t);
});

test(
  "every spelling of the person's number and address is overwritten in other people's notes, the notes and their names kept, the version moved on",
  { skip },
  async () => {
    const A = await workspace("a");
    const B = await workspace("b");
    const ana = await person(A, { phone_e164: "+15550100123", email: "ana@example.com", display_name: "Ana Ruiz" });
    const ben = await person(A, { phone_e164: "+15550100124", display_name: "Ben" });
    const other = await person(B, { phone_e164: "+15550100125" });
    const { needles } = erasureKeys({ phone_e164: "+15550100123", email: "ana@example.com" }, []);

    const about = await note(
      A,
      ben,
      "Ben's sister Ana Ruiz: call her on 555 010 0123, or (555) 010-0123 after six, or write to ANA@Example.com.",
    );
    const display = await note(A, ben, "Old number +1 (555) 010-0123; new one 5550100123.");
    const quiet = await note(A, ben, "Prefers mornings; Ana Ruiz recommended us.");
    const own = await note(A, ana, "Her number is +1 (555) 010-0123.");
    const elsewhere = await note(B, other, "Knows Ana on 555 010 0123.");

    const changed = ok(
      await db.rpc("person_notes_scrub", { p_tenant_id: A, p_contact_id: ana, p_needles: needles }),
      "scrub",
    );
    assert.equal(changed, 2, "answers how many notes changed");
    assert.deepEqual(await read(about), {
      body: "Ben's sister Ana Ruiz: call her on [erased], or [erased] after six, or write to [erased].",
      version: 2,
    });
    assert.deepEqual(await read(display), { body: "Old number [erased]; new one [erased].", version: 2 });
    assert.deepEqual(
      await read(quiet),
      { body: "Prefers mornings; Ana Ruiz recommended us.", version: 1 },
      "a name is no key: the note that only names her is untouched",
    );
    assert.equal((await read(own)).version, 1, "her own notes go with her (00158), and the scrub leaves them to it");
    assert.equal((await read(elsewhere)).version, 1, "another workspace's notes are its own");

    assert.equal(
      ok(await db.rpc("person_notes_scrub", { p_tenant_id: A, p_contact_id: ana, p_needles: needles }), "again"),
      0,
      "a second pass finds nothing left",
    );
  },
);

test(
  "a needle under six characters is no key, a needle's own % _ ( + are characters, and none changes nothing",
  { skip },
  async () => {
    const A = await workspace("c");
    const ana = await person(A);
    const ben = await person(A);
    const shortish = await note(A, ben, "Room 0123, desk 4.");
    const literal = await note(A, ben, "Code a_b%c(+1) and axbyc+1.");
    const scrub = (needles) =>
      db
        .rpc("person_notes_scrub", { p_tenant_id: A, p_contact_id: ana, p_needles: needles })
        .then((r) => ok(r, "scrub"));

    assert.equal(await scrub(["0123", "desk"]), 0, "short needles match nothing");
    assert.equal(await scrub([]), 0);
    assert.equal(await scrub(["a_b%c(+1)"]), 1);
    assert.deepEqual(
      await read(literal),
      { body: "Code [erased] and axbyc+1.", version: 2 },
      "only the needle as written",
    );
    assert.equal((await read(shortish)).version, 1);
  },
);
