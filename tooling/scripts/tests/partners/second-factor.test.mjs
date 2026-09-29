/**
 * A partner signs in with a second factor (decision 0013), run: the words; the browser's half over a stand-in of
 * Supabase Auth's MFA API (where the first factor lands, what the second step's page shows, enrolment and its
 * leftovers); the back office's reset (M2), recorded by the database before the factor is removed through the Auth
 * admin API; and the enforcement (M3): a partner's seat, the partner account's doors and the boot refuse a session
 * that has not shown its code with `mfa_required`, which sends the tab to the second step. Every other role is
 * unchanged.
 *
 * Who may reset, and the database's own refusal of the seat (00218), are proved against the stack in
 * second-factor.db.test.mjs.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import {
  PartnerSecondFactorResetSchema,
  SECOND_FACTOR_PATH,
  SECOND_FACTOR_REQUIRED_PATH,
  SECOND_FACTOR_WORDS,
  cleanFactorCode,
  enrolRefusalWords,
  factorCodeWords,
  factorStepNeeded,
  refusalOf,
  seatNeedsSecondFactor,
  secondFactorResetWords,
  secondFactorShown,
} from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const auth = await import(at("apps/dashboard/src/auth/second-factor.ts"));
const { platformPartnerSecondFactorReset } = await import(at("apps/dashboard/src/server/platform/platform.ts"));
const reset = await import(at("apps/dashboard/app/api/v1/platform/partners/second-factor/route.ts"));
const { RATE } = await import(at("apps/dashboard/src/server/rate-limit.ts"));
const { memberContext, requireSecondFactor } = await import(at("apps/dashboard/src/server/with-route.ts"));
const { read, write, workspace } = await import(at("apps/dashboard/src/server/route.ts"));
const partnerDoor = await import(at("apps/dashboard/app/api/v1/partner/route.ts"));
const handoverDoor = await import(at("apps/dashboard/app/api/v1/partner/workspaces/route.ts"));
const resendDoor = await import(at("apps/dashboard/app/api/v1/partner/workspaces/[id]/resend/route.ts"));
const boot = await import(at("apps/dashboard/app/api/v1/workspaces/route.ts"));
const { createApi } = await import(at("apps/dashboard/src/client/api.ts"));

/* ------------------------------------------------------------ the words */

test("a session owes its code only when the account has a factor it has not shown", () => {
  assert.equal(factorStepNeeded({ currentLevel: "aal1", nextLevel: "aal2" }), true);
  assert.equal(factorStepNeeded({ currentLevel: "aal2", nextLevel: "aal2" }), false, "shown");
  assert.equal(factorStepNeeded({ currentLevel: "aal1", nextLevel: "aal1" }), false, "no factor");
  assert.equal(factorStepNeeded(null), false, "unknown is not owed");
  assert.equal(SECOND_FACTOR_PATH, "/verify");
});

test("a code is six digits, spaces dropped; the Auth server's refusals read as a person's to fix, or ours", () => {
  assert.equal(cleanFactorCode(" 123 456 "), "123456");
  assert.equal(cleanFactorCode("12345"), null);
  assert.equal(cleanFactorCode("abcdef"), null);
  assert.match(factorCodeWords("Invalid TOTP code entered"), /didn't match/);
  assert.match(factorCodeWords("too many requests"), /Too many tries/);
  assert.match(factorCodeWords("socket hang up"), /could not check/);
  assert.deepEqual(enrolRefusalWords("MFA enroll is disabled for TOTP"), {
    unavailable: true,
    words: SECOND_FACTOR_WORDS.unavailable,
  });
  assert.equal(enrolRefusalWords("boom").unavailable, false);
});

test("the reset's input: whose, and why with how it was checked; its answer in words", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(PartnerSecondFactorResetSchema.safeParse({ partner_id: id, why: "Called them back." }).success, true);
  assert.equal(PartnerSecondFactorResetSchema.safeParse({ partner_id: id, why: "  " }).success, false);
  assert.equal(PartnerSecondFactorResetSchema.safeParse({ partner_id: "nope", why: "x" }).success, false);
  assert.equal(PartnerSecondFactorResetSchema.safeParse({ partner_id: id, why: "x", extra: 1 }).success, false);
  assert.match(secondFactorResetWords("ada-co", 1), /^ada-co's authenticator is removed/);
  assert.match(secondFactorResetWords("ada-co", 0), /had no authenticator to remove/);
});

/* ------------------------------------------------------------ the browser's half */

/** A stand-in for supabase.auth.mfa: the account's factors, the session's level, and what was asked of it. */
function stand({ factors = [], current = "aal1", enrollError = null, verifyError = null, throwsOn = null } = {}) {
  const asked = [];
  let level = current;
  const mfa = {
    async getAuthenticatorAssuranceLevel() {
      asked.push(["aal"]);
      if (throwsOn === "aal") throw new Error("offline");
      const verified = factors.some((f) => f.status === "verified");
      return { data: { currentLevel: level, nextLevel: verified ? "aal2" : "aal1" }, error: null };
    },
    async listFactors() {
      asked.push(["list"]);
      if (throwsOn === "list") return { data: null, error: new Error("offline") };
      return {
        data: { all: factors, totp: factors.filter((f) => f.factor_type === "totp" && f.status === "verified") },
        error: null,
      };
    },
    async unenroll({ factorId }) {
      asked.push(["unenroll", factorId]);
      return { data: { id: factorId }, error: null };
    },
    async enroll(params) {
      asked.push(["enroll", params]);
      if (enrollError) return { data: null, error: { message: enrollError } };
      return {
        data: { id: "f-new", totp: { qr_code: "<svg/>", secret: "JBSWY3DP", uri: "otpauth://x" } },
        error: null,
      };
    },
    async challengeAndVerify({ factorId, code }) {
      asked.push(["verify", factorId, code]);
      if (verifyError) return { data: null, error: { message: verifyError } };
      level = "aal2";
      return { data: {}, error: null };
    },
  };
  return { client: { auth: { mfa } }, asked };
}
const verified = { id: "f1", factor_type: "totp", status: "verified" };

test("the second step's page: the code when one is owed; the setup when a refusal said one is required and there is none", async () => {
  assert.equal(await auth.secondStep(stand({ factors: [verified] }).client, false), "code");
  assert.equal(await auth.secondStep(stand({ factors: [verified] }).client, true), "code");
  assert.equal(await auth.secondStep(stand({ factors: [verified], current: "aal2" }).client, true), "in", "shown");
  assert.equal(await auth.secondStep(stand({ factors: [] }).client, false), "in", "nothing asked of this account");
  assert.equal(await auth.secondStep(stand({ factors: [] }).client, true), "enrol", "a partner without one");
  assert.equal(await auth.secondStep(stand({ throwsOn: "aal" }).client, true), "code", "unknown never loops back in");
  assert.equal(await auth.secondStep(stand({ throwsOn: "aal" }).client, false), "in");
});

test("where the first factor lands: the second step when the account has an authenticator, else in", async () => {
  assert.equal(await auth.pathAfterSignIn(stand({ factors: [verified] }).client), "/verify");
  assert.equal(await auth.pathAfterSignIn(stand({ factors: [] }).client), "/");
  assert.equal(
    await auth.pathAfterSignIn(stand({ factors: [verified], current: "aal2" }).client),
    "/",
    "shown already",
  );
  assert.equal(await auth.pathAfterSignIn(stand({ throwsOn: "aal" }).client), "/", "unknown lands in; the door asks");
});

test("the second step: the code checked against the account's authenticator; a wrong one says so and asks nothing", async () => {
  const ok = stand({ factors: [verified] });
  assert.equal(await auth.verifyFactor(ok.client, "123 456"), null);
  assert.deepEqual(ok.asked.at(-1), ["verify", "f1", "123456"]);
  const short = stand({ factors: [verified] });
  assert.equal(await auth.verifyFactor(short.client, "12"), "Type the six digits the app shows.");
  assert.deepEqual(short.asked, [], "nothing asked of the server");
  const wrong = stand({ factors: [verified], verifyError: "Invalid TOTP code entered" });
  assert.match(await auth.verifyFactor(wrong.client, "000000"), /didn't match/);
  assert.match(await auth.verifyFactor(stand({ factors: [] }).client, "123456"), /no authenticator/);
});

test("enrolment: a setup begun and never finished is cleared first; the QR comes back as an image address", async () => {
  const s = stand({ factors: [{ id: "f-old", factor_type: "totp", status: "unverified" }] });
  const r = await auth.startEnrolment(s.client);
  assert.equal(r.ok, true);
  assert.deepEqual(
    s.asked.map((a) => a[0]),
    ["list", "unenroll", "enroll"],
  );
  assert.deepEqual(s.asked[1], ["unenroll", "f-old"]);
  assert.equal(r.enrolment.factorId, "f-new");
  assert.equal(r.enrolment.secret, "JBSWY3DP");
  assert.match(r.enrolment.qr, /^data:image\/svg\+xml;utf-8,%3Csvg/);
  assert.equal(await auth.confirmEnrolment(s.client, "f-new", "654321"), null);
  assert.deepEqual(s.asked.at(-1), ["verify", "f-new", "654321"]);

  const off = await auth.startEnrolment(stand({ enrollError: "MFA enroll is disabled for TOTP" }).client);
  assert.deepEqual(off, { ok: false, unavailable: true, message: SECOND_FACTOR_WORDS.unavailable });
});

test("whether it is on: a verified authenticator; a read that failed says so rather than reading as off", async () => {
  assert.deepEqual(await auth.factorState(stand({ factors: [verified] }).client), { ok: true, on: true });
  assert.deepEqual(await auth.factorState(stand({ factors: [] }).client), { ok: true, on: false });
  assert.equal((await auth.factorState(stand({ throwsOn: "list" }).client)).ok, false);
});

/* ------------------------------------------------------------ the back office's reset */

const PARTNER = "22222222-2222-4222-8222-222222222222";
const USER = "33333333-3333-4333-8333-333333333333";
function admin({ factors = [{ id: "f1" }], listError = null } = {}) {
  const removed = [];
  return {
    removed,
    svc: {
      auth: {
        admin: {
          mfa: {
            listFactors: async ({ userId }) =>
              listError ? { data: null, error: listError } : { data: { factors, userId }, error: null },
            deleteFactor: async ({ id, userId }) => {
              removed.push([id, userId]);
              return { data: { id }, error: null };
            },
          },
        },
      },
    },
  };
}

test("the reset: recorded by the function first, then every factor of that account removed; its refusals mapped", async () => {
  const recorded = [];
  const office = {
    session: fakeDb(
      {},
      {},
      {
        partner_second_factor_reset: (a) => {
          recorded.push(a);
          if (a.p_partner !== PARTNER) throw Object.assign(new Error("No such partner."), { code: "P0002" });
          return USER;
        },
      },
    ),
  };
  const a = admin({ factors: [{ id: "f1" }, { id: "f2" }] });
  assert.deepEqual(await platformPartnerSecondFactorReset(office, PARTNER, "Called them back.", a.svc), { removed: 2 });
  assert.deepEqual(recorded, [{ p_partner: PARTNER, p_why: "Called them back." }]);
  assert.deepEqual(a.removed, [
    ["f1", USER],
    ["f2", USER],
  ]);
  assert.deepEqual(await platformPartnerSecondFactorReset(office, PARTNER, "x", admin({ factors: [] }).svc), {
    removed: 0,
  });
  await assert.rejects(
    platformPartnerSecondFactorReset(office, "44444444-4444-4444-8444-444444444444", "x", admin().svc),
    (e) => e.code === "not_found",
  );
  const untouched = admin();
  await assert.rejects(
    platformPartnerSecondFactorReset(
      {
        session: fakeDb(
          {},
          {},
          {
            partner_second_factor_reset: () => {
              throw Object.assign(new Error("no"), { code: "42501" });
            },
          },
        ),
      },
      PARTNER,
      "x",
      untouched.svc,
    ),
  );
  assert.deepEqual(untouched.removed, [], "nothing removed without the record");
  await assert.rejects(
    platformPartnerSecondFactorReset(office, PARTNER, "x", admin({ listError: new Error("503") }).svc),
    (e) => e.code === "upstream_auth",
  );
});

test("the reset's door: the platform's, counted, and its input judged before anything", () => {
  assert.deepEqual(reset.POST.policy, {
    kind: "write",
    scope: "platform",
    role: null,
    rate: "platform_partner_second_factor",
    spend: false,
  });
  assert.equal(RATE.platform_partner_second_factor.limit, 10);
});

/* ------------------------------------------------------------ M3: the seat asks for it */

test("the rule: a partner's seat alone asks for the second factor, and only aal2 is shown; the refusal reads as ours", () => {
  assert.deepEqual(["owner", "operator", "partner", "viewer", null].map(seatNeedsSecondFactor), [
    false,
    false,
    true,
    false,
    false,
  ]);
  assert.equal(secondFactorShown("aal2"), true);
  for (const aal of ["aal1", "", undefined, null, "AAL2"]) assert.equal(secondFactorShown(aal), false, String(aal));
  assert.equal(SECOND_FACTOR_REQUIRED_PATH, "/verify?for=partner");
  const r = refusalOf({ code: "mfa_required", status: 403, message: SECOND_FACTOR_WORDS.required });
  assert.equal(r.title, "Two-step sign-in");
  assert.equal(r.message, SECOND_FACTOR_WORDS.required);
});

const U = "u1";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const seat = (tenant_id, role, slug, created_at) => ({ user_id: U, tenant_id, role, tenants: { slug }, created_at });
const world = (extra = {}) => ({
  memberships: [
    seat(A, "owner", "harbor", "2026-01-01T00:00:00Z"),
    seat(B, "partner", "bayside", "2026-02-01T00:00:00Z"),
  ],
  tenants: [
    { id: A, slug: "harbor", name: "Harbor", status: "active", timezone: "America/New_York" },
    { id: B, slug: "bayside", name: "Bayside", status: "active", timezone: "America/New_York" },
  ],
  profiles: [],
  ...extra,
});
const session = (aal, tables = world(), rpcs = {}) => ({
  supabase: fakeDb(tables, {}, { is_platform_admin: () => false, ...rpcs }),
  userId: U,
  email: "ada@example.com",
  ...(aal ? { aal } : {}),
  params: {},
});
const mfa = (e) => e.code === "mfa_required" && e.status === 403 && e.message === SECOND_FACTOR_WORDS.required;
const at_ = (tenant, method = "GET", body) =>
  new Request(`http://localhost/api/v1/x?workspace=${tenant}`, {
    method,
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

test("the door: a partner's seat on a session without the code is refused, read or write; with it, or as an owner, it opens", async () => {
  const looked = read({ scope: workspace, handle: async ({ member }) => member.role });
  const changed = write({ scope: workspace, role: "partner", rate: null, handle: async ({ member }) => member.role });
  for (const aal of ["aal1", undefined]) {
    await assert.rejects(memberContext(session(aal), B), mfa, `memberContext, ${aal}`);
    await assert.rejects(looked.run(at_(B), session(aal)), mfa, "a read");
    await assert.rejects(changed.run(at_(B, "POST", {}), session(aal)), mfa, "a write");
    assert.equal(await looked.run(at_(A), session(aal)), "owner", "their own workspace, unchanged");
    assert.equal(await changed.run(at_(A, "POST", {}), session(aal)), "owner");
  }
  assert.equal(await looked.run(at_(B), session("aal2")), "partner");
  assert.equal(await changed.run(at_(B, "POST", {}), session("aal2")), "partner");
  assert.throws(() => requireSecondFactor({ aal: "aal1" }), mfa);
  assert.doesNotThrow(() => requireSecondFactor({ aal: "aal2" }));
});

test("the partner account's doors, its own reads and the boot: refused without the code, before the database is asked", async () => {
  const asked = [];
  const rpcs = Object.fromEntries(
    ["partner_become", "create_workspace_for_business", "partner_handover_resend"].map((n) => [
      n,
      () => {
        asked.push(n);
        throw new Error("never reached");
      },
    ]),
  );
  const body = (b) => new Request("http://localhost/api/v1/x", { method: "POST", body: JSON.stringify(b) });
  await assert.rejects(partnerDoor.POST.run(body({ code: "ada", terms: true }), session("aal1", world(), rpcs)), mfa);
  await assert.rejects(
    handoverDoor.POST.run(body({ name: "Luna Studio", email: "owner@example.com" }), session("aal1", world(), rpcs)),
    mfa,
  );
  const resend = { ...session("aal1", world(), rpcs), params: { id: B } };
  await assert.rejects(resendDoor.POST.run(body({ email: "owner@example.com" }), resend), mfa);
  assert.deepEqual(asked, [], "nothing asked of the database");

  // The boot: a partner account opens the app past its second factor; anyone else, as ever.
  const partnerRow = { id: "p1", user_id: U, code: "ada", status: "active" };
  const home = new Request(`http://localhost/api/v1/workspaces?workspace=${A}`);
  await assert.rejects(boot.GET.run(home, session("aal1", world({ partners: [partnerRow] }))), mfa);
  const opened = await boot.GET.run(home, session("aal2", world({ partners: [partnerRow] })));
  assert.equal(opened.user.partner.code, "ada");

  // The partner account's own reads (00247 gates the database's answers too): past the second factor for a partner;
  // a caller who is no partner is told so, as ever.
  const own = new Request("http://localhost/api/v1/x");
  await assert.rejects(partnerDoor.GET.run(own, session("aal1", world({ partners: [partnerRow] }))), mfa);
  await assert.rejects(handoverDoor.GET.run(own, session("aal1", world({ partners: [partnerRow] }))), mfa);
  assert.deepEqual(await partnerDoor.GET.run(own, session("aal1", world({ partners: [] }))), {
    partner: null,
    balance: [],
  });
  const owner = {
    memberships: [seat(A, "owner", "harbor", "2026-01-01T00:00:00Z")],
    tenants: world().tenants.slice(0, 1),
  };
  assert.equal((await boot.GET.run(home, session("aal1", { ...owner, profiles: [] }))).activeWorkspaceId, A);
});

test("the client: an mfa_required sends the tab to the second step, and says so in our words", async () => {
  const events = [];
  const api = createApi({
    fetch: async () =>
      new Response(
        JSON.stringify({ ok: false, error: { code: "mfa_required", message: SECOND_FACTOR_WORDS.required } }),
        { status: 403 },
      ),
    workspace: () => A,
    onSignedOut: () => events.push("signed-out"),
    onChooseWorkspace: () => events.push("choose-workspace"),
    onSecondFactor: () => events.push("second-factor"),
    refresh: async () => {},
  });
  const r = await api("GET workspaces");
  assert.equal(r.ok, false);
  assert.equal(r.code, "mfa_required");
  assert.deepEqual(events, ["second-factor"]);
});
