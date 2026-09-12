/**
 * The password rule, executed rather than described.
 *
 * The floor is the project's own (`minimum_password_length = 12` in
 * config.toml) and the ceiling is the hash's: bcrypt reads 72 BYTES and
 * ignores the rest, so a cap counted in characters would silently accept a
 * credential whose tail does nothing — and "it stopped working when I added a
 * character" is a bug nobody can reproduce.
 *
 * The other half of this file is the refusal SENTENCE, which has one job
 * beyond being polite: it must read identically for an address nobody has, a
 * password that is wrong, and an account that only ever arrived through
 * Google. Supabase answers all three the same way; a sentence of ours that
 * distinguished them would put the oracle back on our own surface.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { PASSWORD_MIN, PASSWORD_MAX_BYTES, PASSWORD_WORDS, passwordProblem, SignupSchema } from "@chanlytics/contracts";

test("the floor is twelve, and it is the project's own", () => {
  assert.equal(PASSWORD_MIN, 12);
  assert.equal(passwordProblem("x".repeat(11)), "A password is at least 12 characters.");
  assert.equal(passwordProblem("x".repeat(12)), null);
  assert.equal(passwordProblem("correct horse battery staple"), null, "a phrase is the shape this rule wants");
});

test("nothing is not a password, and neither is a number", () => {
  for (const nothing of ["", undefined, null, 12345678901234, {}, []]) {
    assert.equal(passwordProblem(nothing), "Choose a password.", JSON.stringify(nothing));
  }
});

test("the ceiling is counted in BYTES, because that is what the hash reads", () => {
  assert.equal(PASSWORD_MAX_BYTES, 72);
  assert.equal(passwordProblem("a".repeat(72)), null, "72 bytes of ASCII is exactly the ceiling");
  assert.match(passwordProblem("a".repeat(73)) ?? "", /72 bytes at most/);
  // Eighteen four-byte emoji are 72 bytes: eighteen CHARACTERS, and already at
  // the ceiling. One more is refused out loud rather than silently ignored,
  // which is the whole reason this is not a character count.
  const emoji = "\u{1F510}";
  assert.equal(new TextEncoder().encode(emoji).length, 4);
  assert.equal(passwordProblem(emoji.repeat(18)), null, "18 emoji = 72 bytes");
  assert.match(passwordProblem(emoji.repeat(19)) ?? "", /72 bytes at most/, "19 emoji is 76 bytes: refused, not truncated");
  // And the floor is still characters, so a short emoji password is refused
  // for being short rather than accepted for being many bytes.
  assert.match(passwordProblem(emoji.repeat(4)) ?? "", /at least 12 characters/);
});

test("the refusal says nothing about whether the account exists", () => {
  // Three different failures, one sentence. Anything that narrows it is an
  // account-enumeration oracle on a public form.
  assert.doesNotMatch(PASSWORD_WORDS.wrong, /registered|exists|unknown|not found|no account|incorrect password/i);
  assert.match(PASSWORD_WORDS.wrong, /email and password/i, "it blames the PAIR, which is the only honest subject");
  // The nudge is shown to everybody who fails, so it helps a Google-only
  // account without answering for anyone else.
  assert.match(PASSWORD_WORDS.wrongNudge, /Google/);
  assert.doesNotMatch(PASSWORD_WORDS.wrongNudge, /your account|this account/i, "a nudge that says THIS account is the oracle again");
});

test("the words carry a door out of every dead end", () => {
  // A person who cannot sign in has two ways on, and a person mid-reset has a
  // way back. A credential screen with no exit is how somebody emails support.
  for (const w of [PASSWORD_WORDS.codeInstead, PASSWORD_WORDS.forgot, PASSWORD_WORDS.backToSignIn, PASSWORD_WORDS.passwordInstead]) {
    assert.ok(typeof w === "string" && w.length > 0, JSON.stringify(w));
  }
  assert.match(PASSWORD_WORDS.hint, /12 characters/, "the floor is stated where it is typed, not discovered on submit");
  assert.match(PASSWORD_WORDS.resetSent("o@example.com"), /^If o@example\.com can receive email/, "the reset speaks conditionally, like every other send");
});

test("the form admits a password, and the waitlist is why it is optional in the shape", () => {
  const full = SignupSchema.safeParse({ name: "Luna Studio", email: "Owner@Example.COM", password: "a-long-enough-one", timezone: "America/New_York" });
  assert.ok(full.success);
  assert.equal(full.data.password, "a-long-enough-one", "the credential is NOT trimmed or lower-cased: both change it");
  assert.equal(full.data.email, "owner@example.com");
  // The queue takes details and creates no account, so it sends no password;
  // the CREATING path is where the rule is insisted on (the route calls
  // passwordProblem the moment it knows the posture is not the list).
  assert.ok(SignupSchema.safeParse({ name: "Luna", email: "o@example.com" }).success, "a waitlist submission carries no credential");
  assert.equal(SignupSchema.safeParse({ name: "Luna", email: "o@example.com", password: "x".repeat(201) }).success, false, "and a body-size guard still applies");
});
