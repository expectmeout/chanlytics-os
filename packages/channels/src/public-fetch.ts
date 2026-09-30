/**
 * A fetch of an address a person typed: resolve the name, refuse every private answer, and connect to the address that
 * was checked.
 *
 * `feedUrlOk` (contracts) judges the address as a string, so a public name that RESOLVES to a private address passed:
 * a calendar feed at `feed.example.com` whose record points at 169.254.169.254 (a cloud's metadata service) or 10.0.0.5
 * was read from inside the platform's own network, by the preview, the receptionist's availability tool and Ask's
 * openings. Checking the name's addresses first and connecting afterwards is no better: a name can answer once with a
 * public address and again with a private one (DNS rebinding) between the check and the connect. So the check is the
 * connect: the socket's own lookup is replaced by one that resolves the name, refuses the connection if ANY of its
 * addresses is not a public one (a name that answers both is the attack), and hands the socket the address it judged.
 * Nothing here follows a redirect (`redirect: "manual"` is the only mode): the callers judge each hop's address and ask
 * again (contracts fetchPublic), so each hop is checked at its own connect.
 *
 * https and http only; a host that is an IP literal is judged before any socket is made (a literal skips the lookup).
 * The body arrives as a stream, decompressed as fetch does, and the caller bounds how much of it is read.
 */
import dns from "node:dns";
import http from "node:http";
import https from "node:https";
import net from "node:net";
import { Readable } from "node:stream";
import zlib from "node:zlib";

/** One address a name resolved to. */
export interface Resolved {
  address: string;
  family: number;
}

/** Every address a name answers (the resolver's seam: a test hands a fake one). */
export type Resolve = (host: string) => Promise<Resolved[]>;

const resolveByLookup: Resolve = async (host) => {
  const all = await dns.promises.lookup(host, { all: true, verbatim: true });
  return all.map((a) => ({ address: a.address, family: a.family }));
};

/** An IPv4 address as its four octets, or null when it is not one. */
function octetsOf(address: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (!m) return null;
  const o = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as [number, number, number, number];
  return o.every((n) => n <= 255) ? o : null;
}

function v4IsPublic(o: readonly [number, number, number, number]): boolean {
  const [a, b, c] = o;
  if (a === 0 || a === 10 || a === 127) return false; // this network, private, loopback
  if (a === 100 && b >= 64 && b <= 127) return false; // 100.64.0.0/10, carrier-grade NAT
  if (a === 169 && b === 254) return false; // link-local, and the metadata service
  if (a === 172 && b >= 16 && b <= 31) return false; // private
  if (a === 192 && b === 168) return false; // private
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return false; // IETF protocol assignments, TEST-NET-1
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51 && c === 100) return false; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return false; // TEST-NET-3
  if (a >= 224) return false; // multicast, reserved, broadcast
  return true;
}

/** The sixteen bytes of an IPv6 address, or null when it is not one (an embedded IPv4 tail is read). */
function bytesOfV6(address: string): number[] | null {
  const bare = address.replace(/^\[|\]$/g, "").split("%")[0] ?? "";
  if (net.isIP(bare) !== 6) return null;
  let head = bare;
  const tail = /(\d{1,3}(?:\.\d{1,3}){3})$/.exec(bare);
  if (tail) {
    const o = octetsOf(tail[1] ?? "");
    if (!o) return null;
    head = bare.slice(0, tail.index) + ((o[0] << 8) | o[1]).toString(16) + ":" + ((o[2] << 8) | o[3]).toString(16);
  }
  const [left = "", right] = head.split("::");
  const groups = (s: string) => (s ? s.split(":").filter((x) => x !== "") : []);
  const l = groups(left);
  const r = right === undefined ? [] : groups(right);
  const zeros = right === undefined ? 0 : 8 - l.length - r.length;
  if (zeros < 0 || (right === undefined && l.length !== 8)) return null;
  const all = [...l, ...Array<string>(zeros).fill("0"), ...r];
  const bytes: number[] = [];
  for (const g of all) {
    const n = parseInt(g, 16);
    if (!Number.isFinite(n) || n < 0 || n > 0xffff) return null;
    bytes.push(n >> 8, n & 0xff);
  }
  return bytes.length === 16 ? bytes : null;
}

function v6IsPublic(b: readonly number[]): boolean {
  const zero = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);
  if (zero(0, 15) && (b[15] === 0 || b[15] === 1)) return false; // :: and ::1
  // An IPv4 address carried in an IPv6 one (::ffff:a.b.c.d, and the deprecated ::a.b.c.d) reaches whatever that IPv4 does.
  if (zero(0, 10) && b[10] === 0xff && b[11] === 0xff)
    return v4IsPublic([b[12] ?? 0, b[13] ?? 0, b[14] ?? 0, b[15] ?? 0]);
  if (zero(0, 12)) return v4IsPublic([b[12] ?? 0, b[13] ?? 0, b[14] ?? 0, b[15] ?? 0]);
  // NAT64 (64:ff9b::/96) carries an IPv4 address: the one it carries is the one that is reached.
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && zero(4, 12))
    return v4IsPublic([b[12] ?? 0, b[13] ?? 0, b[14] ?? 0, b[15] ?? 0]);
  const first = b[0] ?? 0;
  const second = b[1] ?? 0;
  if ((first & 0xfe) === 0xfc) return false; // unique local, fc00::/7
  if (first === 0xfe && (second & 0xc0) === 0x80) return false; // link-local, fe80::/10
  if (first === 0xff) return false; // multicast
  if (first === 0x20 && second === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return false; // documentation, 2001:db8::/32
  return true;
}

/** Whether an address is on the public internet: what a fetch of a person's address may connect to. */
export function isPublicAddress(address: string): boolean {
  const o = octetsOf(address);
  if (o) return v4IsPublic(o);
  const b = bytesOfV6(address);
  return b ? v6IsPublic(b) : false;
}

/** A name's refusal: it answered an address that is not the public internet's, or nothing. */
export class NotPublicError extends Error {
  constructor(host: string, detail: string) {
    super(`${host}: ${detail}`);
    this.name = "NotPublicError";
  }
}

type LookupCallback = (err: Error | null, address: string | dns.LookupAddress[], family?: number) => void;

/**
 * The lookup a socket is given instead of the system's: it resolves, judges every address, and answers the socket an
 * address that passed. This is what makes the check the connect.
 */
export function publicLookup(resolve: Resolve) {
  return (host: string, options: dns.LookupOptions | number | undefined, callback: LookupCallback): void => {
    resolve(host).then(
      (answers) => {
        const bad = answers.find((a) => !isPublicAddress(a.address));
        if (answers.length === 0) return callback(new NotPublicError(host, "no address"), "");
        if (bad) return callback(new NotPublicError(host, `resolves to ${bad.address}, not a public address`), "");
        if (typeof options === "object" && options?.all) return callback(null, answers);
        const first = answers[0];
        return first
          ? callback(null, first.address, first.family)
          : callback(new NotPublicError(host, "no address"), "");
      },
      (e: unknown) => callback(e instanceof Error ? e : new Error(String(e)), ""),
    );
  };
}

/** What a caller may supply: the resolver (a test's), and the transport (a test's). */
export interface PublicFetchDeps {
  resolve?: Resolve;
  request?: typeof https.request;
}

const BODYLESS = new Set([101, 103, 204, 205, 304]);

/** The response body as a stream fetch would give it: the content-coding taken off. */
function decoded(res: http.IncomingMessage): Readable {
  const coding = String(res.headers["content-encoding"] ?? "").toLowerCase();
  if (coding === "gzip" || coding === "x-gzip") return res.pipe(zlib.createGunzip());
  if (coding === "deflate") return res.pipe(zlib.createInflate());
  if (coding === "br") return res.pipe(zlib.createBrotliDecompress());
  return res;
}

/**
 * A `fetch` for addresses a person typed. `redirect: "manual"` answers the 3xx as it is (the caller judges the next
 * address); the default follows up to REDIRECTS_MAX hops, each connected to through the same lookup, so a redirect to a
 * private address is refused at its own connect. It takes an AbortSignal. The default resolves through the system and
 * uses node's own http and https; the deps are the seams a test uses.
 */
export function publicFetch(deps: PublicFetchDeps = {}): typeof fetch {
  const lookup = publicLookup(deps.resolve ?? resolveByLookup);
  const request = deps.request ?? https.request;

  /** One request to one address, no redirect followed. */
  const once: typeof fetch = async (input, init) => {
    const target = new URL(input instanceof Request ? input.url : String(input));
    if (target.protocol !== "https:" && target.protocol !== "http:")
      throw new NotPublicError(target.host, `${target.protocol} is not fetched`);
    // A literal address skips the socket's lookup, so it is judged here.
    const literal = target.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(literal) && !isPublicAddress(literal)) throw new NotPublicError(target.host, "not a public address");

    const headers: Record<string, string> = { "accept-encoding": "gzip, deflate, br" };
    new Headers(input instanceof Request ? input.headers : undefined).forEach((v, k) => (headers[k] = v));
    new Headers(init?.headers).forEach((v, k) => (headers[k] = v));
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    const signal = init?.signal ?? (input instanceof Request ? input.signal : undefined);

    return new Promise<Response>((resolveResponse, reject) => {
      if (signal?.aborted) return reject(signal.reason instanceof Error ? signal.reason : new Error("aborted"));
      const send =
        deps.request ?? (target.protocol === "http:" ? (http.request as unknown as typeof https.request) : request);
      const req = send(target, { method, headers, lookup: lookup as never }, (res) => {
        const out = new Headers();
        for (let i = 0; i + 1 < res.rawHeaders.length; i += 2)
          out.append(res.rawHeaders[i] ?? "", res.rawHeaders[i + 1] ?? "");
        const status = res.statusCode ?? 0;
        if (out.has("content-encoding")) {
          out.delete("content-encoding");
          out.delete("content-length");
        }
        const body =
          BODYLESS.has(status) || method === "HEAD" ? null : (Readable.toWeb(decoded(res)) as ReadableStream);
        if (body === null) res.resume();
        resolveResponse(new Response(body, { status, statusText: res.statusMessage ?? "", headers: out }));
      });
      const onAbort = () => req.destroy(signal?.reason instanceof Error ? signal.reason : new Error("aborted"));
      signal?.addEventListener("abort", onAbort, { once: true });
      req.on("error", (e) => {
        signal?.removeEventListener("abort", onAbort);
        reject(e);
      });
      req.on("close", () => signal?.removeEventListener("abort", onAbort));
      const body = init?.body;
      if (body !== undefined && body !== null && method !== "GET" && method !== "HEAD") req.write(String(body));
      req.end();
    });
  };

  return async (input, init) => {
    const manual = init?.redirect === "manual" || (input instanceof Request && input.redirect === "manual");
    if (manual) return once(input, init);
    let url = input instanceof Request ? input.url : String(input);
    let at = init;
    for (let hop = 0; ; hop += 1) {
      const res = await once(url, at);
      const next = REDIRECT_STATUSES.has(res.status) ? res.headers.get("location") : null;
      if (!next) return res;
      await res.body?.cancel().catch(() => undefined);
      if (hop >= REDIRECTS_MAX) throw new NotPublicError(new URL(url).host, "too many redirects");
      url = new URL(next, url).toString();
      // A redirect turns a write into a read, as fetch does for 301, 302 and 303.
      if (res.status !== 307 && res.status !== 308) at = { ...at, method: "GET", body: undefined };
    }
  };
}

/** How many redirects a following read takes before it stops: an http to https hop and a www one are what a site does. */
const REDIRECTS_MAX = 5;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Where a suite's stand-in for the network is kept: on `globalThis`, under a key of its own, so every copy of this
 * module in one process sees the same one (a suite loads the server's modules through its own loader, which evaluates
 * this file again). Nothing in production sets it.
 */
const STAND_IN = Symbol.for("chanlytics.publicFetch.standIn");
type Holder = { [STAND_IN]?: typeof fetch | null };

let guarded: typeof fetch | null = null;

/**
 * The fetch every server-side read of an address a person typed goes through: the guarded one, or a test's.
 * (`setPublicFetch`, as `setPg` and `setBearerVerifier` are the other seams the suites stand in for.)
 */
export function publicFetcher(): typeof fetch {
  const standIn = (globalThis as Holder)[STAND_IN];
  if (standIn) return standIn;
  guarded ??= publicFetch();
  return guarded;
}

/** For tests only: stand in for the network. Returns the one before, to put back; null restores the guarded one. */
export function setPublicFetch(f: typeof fetch | null): typeof fetch | null {
  const holder = globalThis as Holder;
  const before = holder[STAND_IN] ?? null;
  holder[STAND_IN] = f;
  return before;
}
