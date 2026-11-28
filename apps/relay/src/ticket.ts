/**
 * The ticket a clip's address carries (footage sources, plan v4, "Taking a file in"): signed by the app, it names one item
 * and when it ends, and nothing else. It is never a Google key: the relay trades it at the app's key door for an hour's key
 * to that one file, so an address that leaks opens one clip for a few hours and no Drive.
 *
 * `v1.<claim>.<signature>`: the claim is `{"item":"…","exp":<unix seconds>}` in base64url, the signature an HMAC-SHA256 of
 * `v1.<claim>` under the ticket's key. Web Crypto only, so the same module signs in a Node script and reads in a Worker.
 */

const TICKET_VERSION = "v1";
/** The longest a ticket may still have to run when it is shown, a day: one signed for longer is refused, however it is signed. */
const TICKET_SECONDS_MAX = 24 * 60 * 60;
/** What an item is called: a provider's id or a row's, never a name. */
const ITEM = /^[A-Za-z0-9_-]{1,128}$/;
const MS_IN_A_SECOND = 1000;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function base64UrlOf(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

/** The bytes a base64url text holds; null for text that is not base64url. */
function bytesOfBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) return null;
  try {
    const binary = atob(text.replaceAll("-", "+").replaceAll("_", "/"));
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    // Not base64 after all: no ticket.
    return null;
  }
}

const hmacKeyOf = (signingKey: string, use: "sign" | "verify"): Promise<CryptoKey> =>
  crypto.subtle.importKey("raw", encoder.encode(signingKey), { name: "HMAC", hash: "SHA-256" }, false, [use]);

/** A ticket for one item, good until `expiresAt` (unix seconds). Throws on a name no item has, or an empty key. */
export async function signTicket(signingKey: string, claim: { item: string; expiresAt: number }): Promise<string> {
  if (!signingKey) throw new Error("a ticket is signed with the ticket's key");
  if (!ITEM.test(claim.item)) throw new Error("a ticket names an item by its id");
  const body = `${TICKET_VERSION}.${base64UrlOf(encoder.encode(JSON.stringify({ item: claim.item, exp: Math.floor(claim.expiresAt) })))}`;
  const signature = await crypto.subtle.sign("HMAC", await hmacKeyOf(signingKey, "sign"), encoder.encode(body));
  return `${body}.${base64UrlOf(new Uint8Array(signature))}`;
}

/** Why a ticket opens nothing: not a ticket, not signed by the app, ended, or signed for longer than a ticket runs. */
type TicketRefusal = "malformed" | "signature" | "expired" | "too_long";
type TicketRead = { ok: true; item: string; expiresAt: number } | { ok: false; reason: TicketRefusal };

function ticketClaimOf(text: string): { item: string; exp: number } | null {
  const bytes = bytesOfBase64Url(text);
  if (!bytes) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(bytes));
  } catch {
    // Signed, yet not JSON: a ticket of another shape, refused as malformed.
    return null;
  }
  if (typeof parsed !== "object" || parsed === null || !("item" in parsed) || !("exp" in parsed)) return null;
  const { item, exp } = parsed;
  return typeof item === "string" && ITEM.test(item) && typeof exp === "number" && Number.isFinite(exp)
    ? { item, exp }
    : null;
}

/**
 * What a ticket says, once its signature holds and its time has not come: the item it names. The signature is checked
 * before anything it signs is believed, and by Web Crypto's own compare, which takes the same time for any wrong one.
 */
export async function readTicket(signingKey: string, ticket: string | null, nowMs: number): Promise<TicketRead> {
  const [version, claimText, signatureText, ...rest] = (ticket ?? "").split(".");
  if (version !== TICKET_VERSION || !claimText || !signatureText || rest.length)
    return { ok: false, reason: "malformed" };
  const signature = bytesOfBase64Url(signatureText);
  if (!signature || !signingKey) return { ok: false, reason: signature ? "signature" : "malformed" };
  const signed = encoder.encode(`${version}.${claimText}`);
  if (!(await crypto.subtle.verify("HMAC", await hmacKeyOf(signingKey, "verify"), signature, signed)))
    return { ok: false, reason: "signature" };
  const claim = ticketClaimOf(claimText);
  if (!claim) return { ok: false, reason: "malformed" };
  const left = claim.exp - Math.floor(nowMs / MS_IN_A_SECOND);
  if (left <= 0) return { ok: false, reason: "expired" };
  if (left > TICKET_SECONDS_MAX) return { ok: false, reason: "too_long" };
  return { ok: true, item: claim.item, expiresAt: claim.exp };
}

/* ------------------------------------------------------------------------------------------ the shelf's ticket -- */

/**
 * The shelf's ticket (the archive plan's B2): a video Chanlytics made keeps a copy on a shelf of Chanlytics' own, and
 * everything asked of that shelf rides one of these. It is a ticket of its own, apart from a clip's above: another
 * version, and a claim that says it is the shelf's, whose workspace and which file, what may be done, when it ends,
 * and for a put the very bytes that may be put. A clip's ticket opens nothing here, and this one no clip.
 *
 * `v2.<claim>.<signature>`: the claim is `{"for":"shelf","tenant":"…","file":"…","use":"…","exp":<unix seconds>}`, with
 * `"bytes"` and `"sha256"` after them on a put and only there, in base64url; the signature an HMAC-SHA256 of
 * `v2.<claim>` under the same ticket's key. The app signs it (packages/channels/src/files/relay-ticket.ts).
 *
 * One use names no file: `list`, which says what one workspace's shelf holds (the "Prove it works" plan, lane 1). Its
 * claim is `{"for":"shelf","tenant":"…","use":"list","exp":…}`, and a list that names a file is no ticket: it reads no
 * bytes, and a file's ticket lists nothing.
 */
const SHELF_TICKET_VERSION = "v2";
const SHELF_USES = ["read", "put", "delete", "list"] as const;
/** What a shelf ticket may do: read a file's bytes or its record, put its bytes there, take them off, or list a workspace's. */
export type ShelfUse = (typeof SHELF_USES)[number];
const SHA_256_HEX = /^[0-9a-f]{64}$/;

/** What a shelf ticket says. `file` is null for a list alone. `bytes` and `sha256` are a put's, and no other use names them. */
export interface ShelfClaim {
  tenant: string;
  file: string | null;
  use: ShelfUse;
  expiresAt: number;
  bytes?: number;
  sha256?: string;
}
type ShelfTicketRead = ({ ok: true } & ShelfClaim) | { ok: false; reason: TicketRefusal };

const isShelfUse = (value: unknown): value is ShelfUse => SHELF_USES.some((use) => use === value);

/** A signed claim read as the shelf's, or null where it says too little, too much or something else. */
function shelfClaimOf(text: string): ShelfClaim | null {
  const bytes = bytesOfBase64Url(text);
  if (!bytes) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decoder.decode(bytes));
  } catch {
    // Signed, yet not JSON: no ticket of the shelf's.
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const claim: Record<string, unknown> = { ...parsed };
  const { tenant, file, use, exp, bytes: size, sha256 } = claim;
  if (claim.for !== "shelf" || !isShelfUse(use)) return null;
  if (typeof tenant !== "string" || !ITEM.test(tenant)) return null;
  if (typeof exp !== "number" || !Number.isFinite(exp)) return null;
  // A list names its workspace and nothing else: no file, and no bytes.
  if (use === "list")
    return file === undefined && size === undefined && sha256 === undefined
      ? { tenant, file: null, use, expiresAt: exp }
      : null;
  if (typeof file !== "string" || !ITEM.test(file)) return null;
  // A put names the very bytes it may put, and nothing else names any.
  if (use !== "put") return size === undefined && sha256 === undefined ? { tenant, file, use, expiresAt: exp } : null;
  if (typeof size !== "number" || !Number.isSafeInteger(size) || size < 1) return null;
  if (typeof sha256 !== "string" || !SHA_256_HEX.test(sha256)) return null;
  return { tenant, file, use, expiresAt: exp, bytes: size, sha256 };
}

/**
 * What a shelf ticket says, once its signature holds and its time has not come. Checked as a clip's is: the
 * signature before anything it signs is believed, by Web Crypto's own compare.
 */
export async function readShelfTicket(
  signingKey: string,
  ticket: string | null,
  nowMs: number,
): Promise<ShelfTicketRead> {
  const [version, claimText, signatureText, ...rest] = (ticket ?? "").split(".");
  if (version !== SHELF_TICKET_VERSION || !claimText || !signatureText || rest.length)
    return { ok: false, reason: "malformed" };
  const signature = bytesOfBase64Url(signatureText);
  // No key to read by, or a signature that is no base64url: nothing here can be a ticket.
  if (!signature || !signingKey) return { ok: false, reason: "malformed" };
  const signed = encoder.encode(`${version}.${claimText}`);
  if (!(await crypto.subtle.verify("HMAC", await hmacKeyOf(signingKey, "verify"), signature, signed)))
    return { ok: false, reason: "signature" };
  const claim = shelfClaimOf(claimText);
  if (!claim) return { ok: false, reason: "malformed" };
  const left = claim.expiresAt - Math.floor(nowMs / MS_IN_A_SECOND);
  if (left <= 0) return { ok: false, reason: "expired" };
  if (left > TICKET_SECONDS_MAX) return { ok: false, reason: "too_long" };
  return { ok: true, ...claim };
}
