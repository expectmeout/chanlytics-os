/**
 * Apple's push service, spoken to directly (the phone app's PRD, PR 7): a Live Activity is started by a push of
 * type `liveactivity`, which Expo's push service does not carry. Token-based auth: a JWT signed with the team's
 * .p8 key (ES256), good for an hour, over HTTP/2 to api.push.apple.com. Nothing here knows a call; it takes device
 * tokens and a payload. Unset keys make the port absent, never a guess.
 *
 * The connection, the clock and the wait are injectable so the wire is executed in a test without Apple.
 */
import { createPrivateKey, sign as signRaw } from "node:crypto";
import http2 from "node:http2";
import { env } from "../env.js";
import { MIN_MS } from "../packages/contracts.js";

export interface ApnsPort {
  /**
   * Start a Live Activity on each phone by its push-to-start token: one connection, every push at once, each bounded
   * by APNS_WAIT_MS. Never throws: what became of each token is in the answer, and a dead wire is every one refused.
   */
  startActivities(tokens: readonly string[], payload: Record<string, unknown>): Promise<ActivitySend[]>;
}

/** Started; gone (Apple's 410: the token is dead, forget it); or refused, with Apple's reason or the wire's. */
export type ActivitySend =
  | { token: string; state: "started" }
  | { token: string; state: "gone" }
  | { token: string; state: "refused"; error: string };

export const APNS_PRODUCTION = "https://api.push.apple.com";
export const APNS_SANDBOX = "https://api.sandbox.push.apple.com";
/** Apple takes a provider token for an hour and refuses one refreshed more often than every 20 minutes. */
const JWT_LIFE_MS = 50 * MIN_MS;
/** How long one push may take, connecting included: the Retell webhook waits on it. */
const APNS_WAIT_MS = 3000;

interface ApnsKeys {
  teamId: string;
  keyId: string;
  /** The .p8 file's contents, PEM; a base64 of the PEM is accepted too, since a one-line variable is what Vercel takes. */
  p8: string;
  /** The app's bundle id; the topic is it plus ".push-type.liveactivity". */
  bundleId: string;
  sandbox: boolean;
}

/** The keys from the environment, or null while any is unset. */
export function apnsKeys(): ApnsKeys | null {
  const teamId = env.APNS_TEAM_ID;
  const keyId = env.APNS_KEY_ID;
  const p8 = env.APNS_KEY_P8;
  const bundleId = env.APNS_BUNDLE_ID;
  if (!teamId || !keyId || !p8 || !bundleId) return null;
  return { teamId, keyId, p8, bundleId, sandbox: env.APNS_SANDBOX === "on" };
}

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString("base64").replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

/** The provider token: ES256 over the header and the claims, the signature raw r‖s as JOSE wants it. */
export function apnsJwt(keys: Pick<ApnsKeys, "teamId" | "keyId" | "p8">, nowMs: number): string {
  const pem = keys.p8.includes("-----BEGIN") ? keys.p8 : Buffer.from(keys.p8, "base64").toString("utf8");
  const head = b64url(JSON.stringify({ alg: "ES256", kid: keys.keyId }));
  const claims = b64url(JSON.stringify({ iss: keys.teamId, iat: Math.floor(nowMs / 1000) }));
  const data = `${head}.${claims}`;
  const sig = signRaw("sha256", Buffer.from(data), { key: createPrivateKey(pem), dsaEncoding: "ieee-p1363" });
  return `${data}.${b64url(sig)}`;
}

interface Http2Stream {
  on(event: "response", cb: (h: Record<string, unknown>) => void): void;
  on(event: "data", cb: (chunk: Buffer) => void): void;
  on(event: "end", cb: () => void): void;
  on(event: "error", cb: (e: Error) => void): void;
  end(body: string): void;
}
interface Http2Like {
  request(headers: Record<string, string>): Http2Stream;
  on(event: "error", cb: (e: Error) => void): void;
  close(): void;
  destroy(): void;
}
type Connect = (origin: string) => Http2Like;

const realConnect: Connect = (origin) => http2.connect(origin) as unknown as Http2Like;

/**
 * Provider tokens by key, for the life of the process: the webhook builds a port per delivery, and a token minted per
 * delivery is the refresh Apple answers 429 TooManyProviderTokenUpdates to.
 */
const JWTS = new Map<string, { value: string; at: number }>();
function providerToken(keys: ApnsKeys, t: number): string {
  const key = `${keys.teamId}:${keys.keyId}`;
  const held = JWTS.get(key);
  if (held && t - held.at <= JWT_LIFE_MS) return held.value;
  const value = apnsJwt(keys, t);
  JWTS.set(key, { value, at: t });
  return value;
}

const sendOf = (token: string, status: number, body: string): ActivitySend =>
  status >= 200 && status < 300
    ? { token, state: "started" }
    : status === 410
      ? { token, state: "gone" }
      : { token, state: "refused", error: `apns_rejected ${status} ${body.slice(0, 200)}`.trim() };

interface ApnsWire {
  connect?: Connect;
  now?: () => number;
  waitMs?: number;
}

export function apns(keys: ApnsKeys, wire: ApnsWire = {}): ApnsPort {
  const { connect = realConnect, now = Date.now, waitMs = APNS_WAIT_MS } = wire;
  const origin = keys.sandbox ? APNS_SANDBOX : APNS_PRODUCTION;
  const headersFor = (device: string): Record<string, string> => ({
    ":method": "POST",
    ":path": `/3/device/${device}`,
    authorization: `bearer ${providerToken(keys, now())}`,
    "apns-topic": `${keys.bundleId}.push-type.liveactivity`,
    "apns-push-type": "liveactivity",
    "apns-priority": "10",
    "apns-expiration": "0",
    "content-type": "application/json",
  });
  return {
    async startActivities(tokens, payload) {
      if (!tokens.length) return [];
      const session = connect(origin);
      // A refused or dropped connection is an error on the session; with no listener it takes the process down.
      const waiting = new Set<(e: Error) => void>();
      let broken: Error | null = null;
      session.on("error", (e) => {
        broken = e;
        for (const fail of [...waiting]) fail(e);
      });
      let hung = false;
      const one = (device: string) =>
        new Promise<ActivitySend>((resolve) => {
          let timer: ReturnType<typeof setTimeout> | undefined;
          const done = (send: ActivitySend) => {
            waiting.delete(fail);
            clearTimeout(timer);
            resolve(send);
          };
          const fail = (e: Error) => done({ token: device, state: "refused", error: e.message });
          if (broken) return fail(broken);
          waiting.add(fail);
          timer = setTimeout(() => {
            hung = true;
            fail(new Error("apns_timeout"));
          }, waitMs);
          try {
            const req = session.request(headersFor(device));
            let status = 0;
            let body = "";
            req.on("response", (h) => {
              status = Number(h[":status"] ?? 0);
            });
            req.on("data", (c) => {
              body += c.toString();
            });
            req.on("end", () => done(sendOf(device, status, body)));
            req.on("error", fail);
            req.end(JSON.stringify(payload));
          } catch (e) {
            fail(e instanceof Error ? e : new Error(String(e)));
          }
        });
      const sends = await Promise.all(tokens.map(one));
      // A push that never answered holds its stream open, and close() would wait for it.
      if (hung || broken) session.destroy();
      else session.close();
      return sends;
    },
  };
}
