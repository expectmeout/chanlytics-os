/**
 * The world the tests of routes/ share. Split by behaviour from people-routes.test.mjs on 25 Nov 2026 (layer 14: a test
 * file over 1,600 lines is two files); its header, as it was:
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 *
 */
/**
 * People and lists, run through route(): the real route modules, their `run`
 * called with a database in memory. What is proved is the policy each
 * declares and what the handler answers, not its text. The erasure's happy
 * path reaches the jobs ledger through the service client, which is pointed at
 * the same database for the one test of what it hands the Ask scrub; the rest
 * run its doors, and erase.test.mjs holds its order.
 */
import { beforeEach } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../../_fake-db.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";

process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

export const { setRateStore, memoryStore } = await import(at("apps/dashboard/src/server/shared/rate-limit.ts"));

export const { setServiceClient } = await import(at("apps/dashboard/src/server/shared/service-db.ts"));

export const { erasureKeys } = await import("@chanlytics/db/erasure");

export const contacts = await import(at("apps/dashboard/app/api/v1/contacts/route.ts"));

export const receptionistMany = await import(at("apps/dashboard/app/api/v1/contacts/receptionist/route.ts"));

export const notesMany = await import(at("apps/dashboard/app/api/v1/contacts/notes/route.ts"));

export const views = await import(at("apps/dashboard/app/api/v1/views/route.ts"));

export const viewSet = await import(at("apps/dashboard/app/api/v1/views/[page]/route.ts"));

export const person = await import(at("apps/dashboard/app/api/v1/contacts/[id]/route.ts"));

export const details = await import(at("apps/dashboard/app/api/v1/contacts/[id]/details/route.ts"));

export const deal = await import(at("apps/dashboard/app/api/v1/contacts/[id]/deal/route.ts"));

export const merge = await import(at("apps/dashboard/app/api/v1/contacts/[id]/merge/route.ts"));

export const noteWrite = await import(at("apps/dashboard/app/api/v1/contacts/[id]/notes/route.ts"));

export const noteRemove = await import(at("apps/dashboard/app/api/v1/contacts/[id]/notes/remove/route.ts"));

export const noteDecide = await import(at("apps/dashboard/app/api/v1/contacts/[id]/notes/decide/route.ts"));

export const receptionist = await import(at("apps/dashboard/app/api/v1/contacts/[id]/receptionist/route.ts"));

export const lists = await import(at("apps/dashboard/app/api/v1/segments/route.ts"));

export const list = await import(at("apps/dashboard/app/api/v1/segments/[id]/route.ts"));

beforeEach(() => setRateStore(memoryStore()));

export const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

export const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

export const P1 = "11111111-1111-4111-8111-111111111111";

export const P2 = "22222222-2222-4222-8222-222222222222";

export const P3 = "33333333-3333-4333-8333-333333333333";

export const D1 = "dddddddd-1111-4111-8111-dddddddddddd";

export const M1 = "eeeeeeee-1111-4111-8111-eeeeeeeeeeee";

export const S1 = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";

export const S2 = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

export const USER = "u1";

export const membership = (tenant_id, role, slug, created_at) => ({
  user_id: USER,
  tenant_id,
  role,
  tenants: { slug },
  created_at,
});

/** A member of two workspaces: harbor (the older membership, so the default) and bayside. */
export const both = (harbor, bayside) => [
  membership(A, harbor, "harbor", "2026-01-01T00:00:00Z"),
  membership(B, bayside, "bayside", "2026-02-01T00:00:00Z"),
];

export const inA = `?workspace=${A}`;

/**
 * `record_deal` (00357) over a test's own `deal_record`, for a database in memory: the door as the test fakes it,
 * called with what the move names under the door's own argument names, then the record_deal decision as the caller's,
 * written to `tables.decisions` with the fields the function writes; the door's answer with the decision's id beside
 * it. A move the door refuses leaves no decision, as the function's one transaction does.
 */
export const withDealDoor = (tables, rpcs) =>
  !rpcs.deal_record
    ? rpcs
    : {
        ...rpcs,
        record_deal: (a) => {
          const door = rpcs.deal_record({
            p_contact_id: a.p_contact_id,
            p_stage: a.p_stage,
            ...Object.fromEntries(Object.entries(a.p_move ?? {}).map(([k, v]) => [`p_${k}`, v])),
          });
          if (!door || door.error || !door.deal) return door;
          const decisions = (tables.decisions ??= []);
          const decision = {
            id: `decision-${decisions.length + 1}`,
            tenant_id: (tables.contacts ?? []).find((c) => c.id === a.p_contact_id)?.tenant_id ?? null,
            subject_type: "deal",
            subject_id: door.deal.id,
            verb: "record_deal",
            actor_type: "user",
            actor_user_id: USER,
            payload: {
              contact_id: a.p_contact_id,
              stage: a.p_stage,
              from: door.from ?? null,
              service: door.deal.service ?? null,
              ...(a.p_via ? { via: a.p_via } : {}),
            },
            undo_of: a.p_undo_of ?? null,
          };
          decisions.push(decision);
          return { ...door, decision_id: decision.id, undo_dropped: false };
        },
      };

export const ctxFor = (tables, params = {}, rpcs = {}) => ({
  supabase: fakeDb(tables, {}, withDealDoor(tables, rpcs)),
  userId: USER,
  email: "ada@example.com",
  params,
});

export const get = (q = "") => new Request(`http://localhost/api/v1/x${q}`);

export const send = (method, body, q = "") =>
  new Request(`http://localhost/api/v1/x${q}`, {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

export async function refused(p, code, status, why) {
  await assert.rejects(p, (e) => {
    assert.equal(e.code, code, why ?? e.message);
    if (status) assert.equal(e.status, status, why);
    return true;
  });
}

/** Every row the code under test wrote, changed or removed. */
export const writes = (ctx) =>
  ctx.supabase.seen.filter((s) => ["insert", "update", "delete", "upsert"].includes(s.op)).length;

export const contact = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  phone_e164: "+15550000001",
  display_name: "Ada",
  erased_at: null,
  marketing_consent: null,
  notes: null,
  ...over,
});

/** A row as people_list answers it. */
export const personRow = (id, over = {}) => ({
  id,
  display_name: "Ada",
  phone_e164: "+15550000001",
  consent: "opted_in",
  dnc: false,
  ...over,
});

export const pol = (tenant_id, subject_type, subject_id, mode) => ({
  tenant_id,
  class: "reply",
  subject_type,
  subject_id,
  mode,
});

/* ----------------------------------------------------------------------------
 * THE PEOPLE PAGE AT SCALE (slice D of the data program). The list pages and
 * counts; the search reaches the door only past the defaults; the batch doors
 * for the receptionist and a note; the view a member keeps per workspace.
 * ------------------------------------------------------------------------- */
export const liveContact = (id, tenant_id, over = {}) => ({
  id,
  tenant_id,
  phone_e164: "+15550000001",
  display_name: "Ada",
  wa_profile_name: null,
  erased_at: null,
  merged_into_contact_id: null,
  notes: null,
  ...over,
});

/**
 * people_list as 00276 answers it, over `n` people of workspace A in the kept order (the latest in touch first, then
 * the newest added, then the id, falling): a page after the cursor or the offset, each row carrying its place. With
 * `places: false`, a database before 00276: the same rows without their place, and no cursor taken. Every question is
 * kept in `asked`, and `move(id)` puts someone at the top, as a word from them would.
 */
export function kept(n, { places = true } = {}) {
  const idOf = (i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
  const rows = Array.from({ length: n }, (_, i) => ({
    id: idOf(i + 1),
    at: new Date(Date.UTC(2026, 8, 1) - i * 60_000).toISOString(),
    added: "2026-01-01T00:00:00.000Z",
  }));
  const asked = [];
  // The order's comparison, falling: -1 when a comes first.
  const before = (a, b) =>
    a.at !== b.at ? (a.at > b.at ? -1 : 1) : a.added !== b.added ? (a.added > b.added ? -1 : 1) : a.id > b.id ? -1 : 1;
  const people_list = (a) => {
    asked.push(a);
    const order = [...rows].sort(before);
    const after = a.p_after_id ? { at: a.p_after_at, added: a.p_after_added, id: a.p_after_id } : null;
    if (after && !places) throw new Error("a database before 00276 was named a cursor");
    const from = after ? order.filter((r) => before(after, r) < 0) : order.slice(a.p_offset ?? 0);
    return from
      .slice(0, a.p_limit ?? 1000)
      .map((r) => personRow(r.id, places ? { in_touch_at: r.at, added_at: r.added } : {}));
  };
  const move = (id) => {
    rows.find((r) => r.id === id).at = new Date(Date.UTC(2026, 8, 2)).toISOString();
  };
  const contacts = rows.map((r) => liveContact(r.id, A));
  return { people_list, asked, move, contacts, idOf };
}
