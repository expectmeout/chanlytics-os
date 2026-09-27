/**
 * A partner signs in with a second factor (decision 0013), M1 and M2, run: the words; the browser's half over a
 * stand-in of Supabase Auth's MFA API (where the first factor lands, the second step, enrolment and its leftovers); and
 * the back office's reset, recorded by the database before the factor is removed through the Auth admin API.
 *
 * Who may reset is the database's decision, proved against the stack in second-factor.db.test.mjs. Nothing here
 * enforces a factor: that is M3.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { fakeDb } from "../_fake-db.mjs";
import {
  PartnerSecondFactorResetSchema,
  SECOND_FACTOR_PATH,
  SECOND_FACTOR_WORDS,
  cleanFactorCode,
  enrolRefusalWords,
  factorCodeWords,
  factorStepNeeded,
  secondFactorResetWords,
} from "@chanlytics/contracts";

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://127.0.0.1:1";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-only";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");
const at = (rel) => pathToFileURL(path.join(ROOT, rel)).href;
const auth = await import(at("apps/dashboard/src/auth/second-factor.ts"));
const { platformPartnerSecondFactorReset } = await import(at("apps/dashboard/src/server/platform/platform.ts"));
const reset = await import(at("apps/dashboard/app/api/v1/platform/partners/second-factor/route.ts"));
const { RATE } = await import(at("apps/dashboard/src/server/rate-limit.ts"));

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
