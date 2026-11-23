/**
 * The ticket a clip's address carries, as the app signs and reads it (the footage sources plan, "Taking a file in").
 * The relay (apps/relay/src/ticket.ts) reads the same ticket in a Worker, and must import nothing of ours, so this is
 * the app's own side of one format: `v1.<claim>.<signature>`, the claim `{"item":"…","exp":<unix seconds>}` in
 * base64url, the signature an HMAC-SHA256 of `v1.<claim>` under the ticket's key. `tests/files/takes` holds the two
 * sides to each other: a ticket signed here is read there, and one signed there here.
 *
 * A ticket names one item and when it ends, and nothing else. It is never a Google key: whoever holds it can ask the
 * relay for that one clip until it ends, and the relay asks the app's key door, which may still say no.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { DAY_MS, SECOND_MS, recordOrNull } from "@chanlytics/contracts";
import { z } from "zod";

/**
 * What the relay asks the app's key door for each request it serves (apps/relay/src/relay.ts `askKeyDoor`): the ticket
 * it was shown, and what is being asked of the clip, so the door can count Google's units where they are spent.
 */
export const RELAY_KEY_ASK = z.object({
  ticket: z.string().min(1).max(2048),
  method: z.enum(["GET", "HEAD"]),
  range: z.string().max(64).nullish(),
});
export type RelayKeyAsk = z.infer<typeof RELAY_KEY_ASK>;

const RELAY_TICKET_VERSION = "v1";
/** The longest a ticket may still have to run when it is shown: the relay refuses a longer one, and so does the door. */
const RELAY_TICKET_SECONDS_MAX = DAY_MS / SECOND_MS;
/** What an item is called in a ticket and in an address: a row's id, never a name. */
const RELAY_ITEM = /^[A-Za-z0-9_-]{1,128}$/;
/** What a clip's address may end in, so a fetcher that reads a type off a name finds one. */
const RELAY_EXTENSION = /^[a-z0-9]{1,5}$/;

const signatureOf = (signingKey: string, body: string): Buffer =>
  createHmac("sha256", signingKey).update(body).digest();

/** A ticket for one item, good until `expiresAt` (unix seconds). Throws on a name no item has, or an empty key. */
export function signRelayTicket(signingKey: string, claim: { item: string; expiresAt: number }): string {
  if (!signingKey) throw new Error("a relay ticket is signed with the ticket's key");
  if (!RELAY_ITEM.test(claim.item)) throw new Error("a relay ticket names an item by its id");
  const claimJson = JSON.stringify({ item: claim.item, exp: Math.floor(claim.expiresAt) });
  const body = `${RELAY_TICKET_VERSION}.${Buffer.from(claimJson, "utf8").toString("base64url")}`;
  return `${body}.${signatureOf(signingKey, body).toString("base64url")}`;
}

/** Why a ticket opens nothing: not a ticket, not signed by the app, ended, or signed for longer than a ticket runs. */
type RelayTicketRefusal = "malformed" | "signature" | "expired" | "too_long";
type RelayTicketRead = { ok: true; item: string; expiresAt: number } | { ok: false; reason: RelayTicketRefusal };

/**
 * What a ticket says, once its signature holds and its time has not come: the item it names. The signature is checked
 * before anything it signs is believed, by a compare that takes the same time for any wrong one.
 */
export function readRelayTicket(signingKey: string, ticket: string | null, nowMs: number): RelayTicketRead {
  const [version, claimText, signatureText, ...rest] = (ticket ?? "").split(".");
  if (version !== RELAY_TICKET_VERSION || !claimText || !signatureText || rest.length || !signingKey)
    return { ok: false, reason: "malformed" };
  if (!/^[A-Za-z0-9_-]+$/.test(signatureText)) return { ok: false, reason: "malformed" };
  const given = Buffer.from(signatureText, "base64url");
  const expected = signatureOf(signingKey, `${version}.${claimText}`);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "signature" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(claimText, "base64url").toString("utf8"));
  } catch {
    // Signed, yet not JSON: a ticket of another shape.
    return { ok: false, reason: "malformed" };
  }
  const claim = recordOrNull(parsed);
  const item = claim?.item;
  const exp = claim?.exp;
  if (typeof item !== "string" || !RELAY_ITEM.test(item) || typeof exp !== "number" || !Number.isFinite(exp))
    return { ok: false, reason: "malformed" };
  const left = exp - Math.floor(nowMs / SECOND_MS);
  if (left <= 0) return { ok: false, reason: "expired" };
  if (left > RELAY_TICKET_SECONDS_MAX) return { ok: false, reason: "too_long" };
  return { ok: true, item, expiresAt: exp };
}

/* ------------------------------------------------------------------------------------------ the shelf's ticket -- */

const SHELF_TICKET_VERSION = "v2";
const SHELF_USES = ["read", "put", "delete"] as const;
/** A SHA-256 as the shelf and its ticket write one: 64 lower-case hex characters. */
export const SHA_256_HEX = /^[0-9a-f]{64}$/;

/**
 * What a shelf ticket says (the archive plan's B2): whose workspace and which file, what may be done, and when it
 * ends (unix seconds). A put names the very bytes it may put, their size and their SHA-256, and no other use names any.
 */
interface ShelfTicketClaim {
  tenant: string;
  file: string;
  use: (typeof SHELF_USES)[number];
  expiresAt: number;
  bytes?: number;
  sha256?: string;
}

/**
 * A ticket for the shelf, where a video Chanlytics made keeps a copy of its own: a ticket apart from a clip's, so
 * neither opens what the other does. `v2.<claim>.<signature>`, the claim
 * `{"for":"shelf","tenant":"…","file":"…","use":"…","exp":<unix seconds>}` with `"bytes"` and `"sha256"` after them on
 * a put, in base64url, signed as a clip's is under the same key. The relay reads it (apps/relay/src/ticket.ts
 * `readShelfTicket`), and tests/files/shelf holds the two sides to each other. Throws on a claim that says too little
 * or too much, so no such ticket is ever signed.
 */
export function signShelfTicket(signingKey: string, claim: ShelfTicketClaim): string {
  if (!signingKey) throw new Error("a shelf ticket is signed with the ticket's key");
  if (!RELAY_ITEM.test(claim.tenant) || !RELAY_ITEM.test(claim.file))
    throw new Error("a shelf ticket names a workspace and a file, each by its id");
  if (!SHELF_USES.some((use) => use === claim.use)) throw new Error("a shelf ticket reads, puts or deletes");
  const names = claim.bytes !== undefined || claim.sha256 !== undefined;
  if (claim.use !== "put" && names) throw new Error("only a put names bytes");
  const whole =
    typeof claim.bytes === "number" &&
    Number.isSafeInteger(claim.bytes) &&
    claim.bytes >= 1 &&
    typeof claim.sha256 === "string" &&
    SHA_256_HEX.test(claim.sha256);
  if (claim.use === "put" && !whole) throw new Error("a put names the bytes it may put: their size and their SHA-256");
  const claimJson = JSON.stringify({
    for: "shelf",
    tenant: claim.tenant,
    file: claim.file,
    use: claim.use,
    exp: Math.floor(claim.expiresAt),
    ...(claim.use === "put" ? { bytes: claim.bytes, sha256: claim.sha256 } : {}),
  });
  const body = `${SHELF_TICKET_VERSION}.${Buffer.from(claimJson, "utf8").toString("base64url")}`;
  return `${body}.${signatureOf(signingKey, body).toString("base64url")}`;
}

/**
 * Where the video platform fetches one clip from: the relay's address for the item, ending in its type's extension,
 * carrying its ticket. Throws on an address that is not https, since a ticket is only ever sent over one.
 */
export function relayClipAddress(relayUrl: string, clip: { item: string; ticket: string; extension: string }): string {
  const base = new URL(relayUrl);
  if (base.protocol !== "https:") throw new Error("the relay is reached over https");
  if (!RELAY_ITEM.test(clip.item)) throw new Error("a clip's address names an item by its id");
  if (!RELAY_EXTENSION.test(clip.extension)) throw new Error("a clip's address ends in its type");
  const address = new URL(`/clip/${clip.item}/clip.${clip.extension}`, base);
  address.searchParams.set("ticket", clip.ticket);
  return address.toString();
}
