/**
 * Reading a team without holding the keys to every team.
 *
 * Both problems here came from one fact: `memberships_self_select` is
 * `user_id = auth.uid()`, so a session client can see its OWN membership row
 * and nobody else's, and emails live in auth.users which PostgREST does not
 * expose. With no way to read a roster on the caller's client, the service
 * role was the only door — and the shape of the code then followed from what
 * the JS admin API happens to offer:
 *
 *   * the roster looped auth.admin.getUserById once per member, sequentially;
 *   * finding one address called listUsers({ perPage: 1000 }), which is
 *     O(every account on the platform) and silently WRONG past a thousand —
 *     an existing user on page two reads as new, the invite email then fails
 *     because the account exists, and the invitation row is rolled back.
 *
 * Two definer functions replace both, and each checks the CALLER's standing
 * itself. That is what makes them safe on the session client, which is the
 * actual win: one fewer privileged path, with the speed as a side effect.
 *
 * Run, not read (25 Nov 2026). On the replayed database: the roster refuses anyone who is not a member, carries each
 * name, and the address lookup ignores case and answers only the platform
 * (a-person-s-name-is-theirs-to-set-and-their-team-s-to-read.db.test.mjs); no session may call the lookup at all
 * (database/privileges.db.test.mjs, "lookup_user_for_invite is the service role's"). The invite's lookup is asked by the
 * platform's client, run in team-writes.test.mjs, where the one auth call left (inviteUserByEmail, the signup email SQL
 * cannot send) is packages/db's. The functions as 00022 wrote them were pinned here until then; 00068 and 00261 have
 * written the roster since, and 00121 moved the lookup to the platform.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { fakeDb } from "../_fake-db.mjs";
import { importSrc } from "../_source.mjs";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";
const team = await importSrc("apps/dashboard/app/api/v1/team/route.ts");
const { setServiceClient } = await importSrc("apps/dashboard/src/server/shared/service-db.ts");

test("the roster is read on the caller's own session, in one query, with the open invitations beside it, each member named", async () => {
  const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const USER = "99999999-9999-4999-8999-999999999999";
  const asked = [];
  // The platform's client, which this read must never reach for: any use of it is the regression.
  const touched = [];
  const platform = new Proxy(
    {},
    {
      get: (_t, key) => {
        touched.push(String(key));
        throw new Error(`REGRESSION: the roster read reached for the service role (${String(key)})`);
      },
    },
  );
  setServiceClient(platform);
  const invitation = (id, over = {}) => ({
    id,
    tenant_id: A,
    email: `${id}@example.com`,
    role: "viewer",
    created_at: "2026-10-01T00:00:00Z",
    expires_at: "2999-01-01T00:00:00Z",
    accepted_at: null,
    revoked_at: null,
    ...over,
  });
  const ctx = {
    supabase: fakeDb(
      {
        memberships: [
          { user_id: USER, tenant_id: A, role: "owner", tenants: { slug: "harbor" }, created_at: "2026-01-01" },
        ],
        invitations: [
          invitation("open"),
          invitation("taken", { accepted_at: "2026-10-02T00:00:00Z" }),
          invitation("withdrawn", { revoked_at: "2026-10-02T00:00:00Z" }),
        ],
      },
      {},
      {
        team_roster: (args) => {
          asked.push(args);
          return [
            {
              membership_id: "m-1",
              member_user_id: USER,
              email: "ada@example.com",
              role: "owner",
              joined_at: "2026-01-01T00:00:00Z",
              display_name: "Ada Lovelace",
            },
          ];
        },
      },
    ),
    userId: USER,
    email: "ada@example.com",
    params: {},
    headers: {},
  };
  try {
    const answer = await team.GET.run(new Request(`http://localhost/api/v1/team?workspace=${A}`), ctx);
    assert.deepEqual(asked, [{ p_tenant_id: A }], "one query for the whole roster, not one per member");
    assert.deepEqual(answer.members, [
      {
        membership_id: "m-1",
        user_id: USER,
        email: "ada@example.com",
        display_name: "Ada Lovelace",
        role: "owner",
        joined_at: "2026-01-01T00:00:00Z",
      },
    ]);
    assert.deepEqual(
      answer.invites.map((i) => i.id),
      ["open"],
      "the open invitations, read by plain RLS beside it: neither taken nor withdrawn",
    );
    assert.deepEqual(touched, [], "and the platform's client is never asked");
  } finally {
    setServiceClient(null);
  }
});
