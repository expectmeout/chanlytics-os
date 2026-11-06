/**
 * A session that showed its second factor (decision 0013), for the database suites: a partner's seat asks for one
 * (00218), so a suite that acts as a partner enrols an authenticator on the Auth server the stack runs and answers
 * its first code, computed here as an authenticator app would (RFC 6238: HMAC-SHA1 over thirty-second steps, six
 * digits). The session is aal2 from then on, as a person's is after the second step.
 */
import { createHmac, randomBytes } from "node:crypto";

const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function fromBase32(text) {
  const clean = String(text).replace(/=+$/, "").replace(/\s+/g, "").toUpperCase();
  let bits = 0;
  let value = 0;
  const out = [];
  for (const ch of clean) {
    const i = BASE32.indexOf(ch);
    if (i < 0) throw new Error(`not base32: ${ch}`);
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** The six digits an authenticator shows for this key at this moment. */
export function totpCode(secret, atMs = Date.now()) {
  const step = Buffer.alloc(8);
  step.writeBigUInt64BE(BigInt(Math.floor(atMs / 30_000)));
  const mac = createHmac("sha1", fromBase32(secret)).update(step).digest();
  const at = mac[mac.length - 1] & 0x0f;
  const n = (mac.readUInt32BE(at) & 0x7fffffff) % 1_000_000;
  return String(n).padStart(6, "0");
}

/** Enrol an authenticator on this signed-in client and show its first code: the session is aal2 after. */
export async function showSecondFactor(client) {
  const e = await client.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `test-${randomBytes(4).toString("hex")}`,
  });
  if (e.error) throw new Error(`enrol: ${e.error.message}`);
  const v = await client.auth.mfa.challengeAndVerify({ factorId: e.data.id, code: totpCode(e.data.totp.secret) });
  if (v.error) throw new Error(`verify: ${v.error.message}`);
  return client;
}
