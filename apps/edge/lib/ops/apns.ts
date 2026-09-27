/**
 * Apple's push service, spoken to directly (the phone app's PRD, PR 7): a Live Activity is started by a push of
 * type `liveactivity`, which Expo's push service does not carry. Token-based auth: a JWT signed with the team's
 * .p8 key (ES256), good for an hour, over HTTP/2 to api.push.apple.com. Nothing here knows a call; it takes a
 * device token, a payload and a priority. Unset keys make the port absent, never a guess.
 *
 * The session and the signer are injectable so the wire is executed in a test without Apple.
 */
import { createPrivateKey, sign as signRaw } from "node:crypto";
import http2 from "node:http2";
import { env } from "../env.js";

export interface ApnsPort {
  /** Start a Live Activity on one phone by its push-to-start token. Throws on a refusal or a dead wire. */
  startActivity(token: string, payload: Record<string, unknown>): Promise<void>;
}

export const APNS_PRODUCTION = "https://api.push.apple.com";
export const APNS_SANDBOX = "https://api.sandbox.push.apple.com";
const JWT_LIFE_MS = 50 * 60_000;

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

interface Http2Like {
  request(headers: Record<string, string>): {
    on(event: "response", cb: (h: Record<string, unknown>) => void): void;
    on(event: "data", cb: (chunk: Buffer) => void): void;
    on(event: "end", cb: () => void): void;
    on(event: "error", cb: (e: Error) => void): void;
    end(body: string): void;
  };
  close(): void;
}
type Connect = (origin: string) => Http2Like;

const realConnect: Connect = (origin) => http2.connect(origin) as unknown as Http2Like;

export function apns(keys: ApnsKeys, connect: Connect = realConnect, now: () => number = Date.now): ApnsPort {
  let jwt: { value: string; at: number } | null = null;
  const token = () => {
    const t = now();
    if (!jwt || t - jwt.at > JWT_LIFE_MS) jwt = { value: apnsJwt(keys, t), at: t };
    return jwt.value;
  };
  const origin = keys.sandbox ? APNS_SANDBOX : APNS_PRODUCTION;
  return {
    startActivity(device, payload) {
      return new Promise<void>((resolve, reject) => {
        const session = connect(origin);
        const req = session.request({
          ":method": "POST",
          ":path": `/3/device/${device}`,
          authorization: `bearer ${token()}`,
          "apns-topic": `${keys.bundleId}.push-type.liveactivity`,
          "apns-push-type": "liveactivity",
          "apns-priority": "10",
          "apns-expiration": "0",
          "content-type": "application/json",
        });
        let status = 0;
        let body = "";
        req.on("response", (h) => {
          status = Number(h[":status"] ?? 0);
        });
        req.on("data", (c) => {
          body += c.toString();
        });
        req.on("end", () => {
          session.close();
          if (status >= 200 && status < 300) resolve();
          else reject(new Error(`apns_rejected ${status} ${body.slice(0, 200)}`.trim()));
        });
        req.on("error", (e) => {
          session.close();
          reject(e);
        });
        req.end(JSON.stringify(payload));
      });
    },
  };
}
