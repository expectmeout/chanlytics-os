/**
 * A refusal in the owner's words.
 *
 * The typed client had one branch for every refusal but the 401: the server's
 * sentence went on screen as it came, "Request failed (502)." whenever the
 * answer was not an envelope, and the envelope's details -- the rate limiter's
 * retry_after_s, a form's fields, the role a door wanted -- were dropped on the
 * way. A timeout was told "nothing was changed" of a write the server might
 * still be making.
 *
 * Decided here, once, so the client, the Ask stream and a courier's own
 * refusal say the same thing. The server's sentence stays wherever it wrote
 * one: it is already the owner's words ("Only an owner can do this.", "Too
 * many replies in a short time — try again in 40 seconds."). What this adds is
 * a title that says what kind of no it is, a sentence of ours where the server
 * gave none or gave its catch-all, the wait, and a form's fields.
 *
 * And the no before the press (roleGate): a control a role may not press says
 * who may, in the same words, before anyone presses it.
 */

import { ROLE_PERMS, ROLES, type Role } from "./config";

/** The title of a no, by the least role the door wanted: the gate says it before the press (roleGate), the refusal after it. */
export const NEEDS_TITLE: Readonly<Record<"owner" | "operator", string>> = { owner: "Owner only", operator: "Not for viewers" };

export interface RefusalInput {
  /** The envelope's code; absent when the answer was not an envelope. `network`, `timeout` and `client` are the client's own. */
  code?: string | null;
  /** The HTTP status; 0 when nothing answered. */
  status: number;
  /** The server's sentence, when it sent one. */
  message?: string | null;
  /** The envelope's details: the rate limiter's `retry_after_s`, a form's `fields`, the role a door `needs`. */
  details?: unknown;
  /** The Retry-After header: seconds, or an HTTP date. */
  retryAfter?: string | null;
  /** A write may have gone through when no proper answer came back; a read changed nothing. */
  write: boolean;
  /** The clock, for a Retry-After given as a date. */
  nowMs?: number;
}

export interface Refusal {
  code: string;
  status: number;
  /** What kind of no, in a few words: "Owner only", "Too many at once", "Check the details". */
  title: string;
  /** Why, and what to do next, in the owner's words. */
  message: string;
  /** Seconds until the same request may be tried again, when the server said. */
  retryAfterS: number | null;
  /** A form's refusal: one sentence per field, by the field's name in the request. */
  fields: Readonly<Record<string, string>> | null;
  /**
   * A reply by email that waits on a yes: the address it will go to, which is
   * not the one the person last wrote from (core reply.ts). The same request
   * sent again with `email_to` set to this value is the yes. Present on that
   * refusal and no other.
   */
  confirmEmailTo?: string;
}

const TITLES: ReadonlyMap<string, string> = new Map([
  ["unauthorized", "Signed out"],
  ["forbidden", "Not allowed"],
  ["not_found", "Not found"],
  ["validation", "Check the details"],
  ["choose_workspace", "Choose a workspace"],
  ["conflict", "Not possible right now"],
  ["rate_limited", "Too many at once"],
  ["payment_required", "Needs a subscription"],
  ["window_closed", "WhatsApp's 24 hours have passed"],
  ["upstream_meta", "WhatsApp didn't accept it"],
  ["upstream_retell", "The phone line didn't answer"],
  ["upstream_anthropic", "The assistant didn't answer"],
  ["upstream_email", "The email didn't go"],
  ["upstream_auth", "Couldn't check your sign-in"],
  ["internal", "Something went wrong"],
  ["network", "No connection"],
  ["timeout", "No answer in time"],
  ["client", "Not sent"],
]);

/** Ours, for a refusal whose envelope carried no sentence. */
const SAID: ReadonlyMap<string, string> = new Map([
  ["forbidden", "Your role can't do this."],
  ["not_found", "That isn't here any more."],
  ["validation", "Something in this form wasn't accepted."],
  ["choose_workspace", "Choose which workspace first."],
  ["conflict", "That isn't possible right now."],
  ["payment_required", "This needs a subscription — see Billing."],
  ["window_closed", "WhatsApp's 24 hours have passed — send an approved message instead."],
  ["upstream_meta", "WhatsApp didn't accept it — try again in a moment."],
  ["upstream_retell", "The phone line didn't answer — try again in a moment."],
  ["upstream_anthropic", "The assistant didn't answer — try again in a moment."],
  ["upstream_email", "The email didn't go — try again in a moment."],
  ["upstream_auth", "Couldn't check your sign-in just now — try again."],
  ["client", "Not sent."],
]);

/** The server's own catch-all (with-route.ts): true, and nothing an owner can act on. */
const SERVER_CATCH_ALL = "Something went wrong.";

const NETWORK_WRITE = "Network error — nothing was changed.";
const NETWORK_READ = "Chanlytics could not be reached.";
const TIMEOUT_WRITE = "Chanlytics took too long to answer — this may still go through, so check before trying again.";
const TIMEOUT_READ = "Chanlytics took too long to answer — try again in a moment.";
const NO_ANSWER_WRITE = "Chanlytics didn't answer properly, so this may or may not have gone through — check before trying again.";
const UNCONFIRMED_WRITE = "Chanlytics hit a problem and couldn't confirm this — check whether it went through before trying again.";
const READ_AGAIN = "Chanlytics couldn't read this just now — try again in a moment.";
const OUT_OF_DATE = "This page is out of date — reload it and try again.";

/** A wait, in the words the rate limiter's own refusals use. */
function waitWords(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const m = Math.ceil(seconds / 60);
  return `${m} minute${m === 1 ? "" : "s"}`;
}

/** The wait: the details the server counted first, else the header, in seconds or as a date. */
function retryAfterOf(details: unknown, header: string | null | undefined, nowMs: number): number | null {
  const counted = details && typeof details === "object" ? (details as { retry_after_s?: unknown }).retry_after_s : undefined;
  if (typeof counted === "number" && Number.isFinite(counted) && counted >= 0) return Math.max(1, Math.ceil(counted));
  const h = typeof header === "string" ? header.trim() : "";
  if (!h) return null;
  if (/^[0-9]+$/.test(h)) return Math.max(1, Number(h));
  const at = Date.parse(h);
  if (!Number.isFinite(at)) return null;
  const s = Math.ceil((at - nowMs) / 1000);
  return s > 0 ? s : null;
}

/** A form's fields: named, each with a sentence; anything else is not a field map. */
function fieldsOf(details: unknown): Readonly<Record<string, string>> | null {
  const f = details && typeof details === "object" ? (details as { fields?: unknown }).fields : undefined;
  if (!f || typeof f !== "object" || Array.isArray(f)) return null;
  const out: Record<string, string> = {};
  for (const [name, said] of Object.entries(f as Record<string, unknown>)) {
    if (name && typeof said === "string" && said.trim()) out[name] = said;
  }
  return Object.keys(out).length ? out : null;
}

/** The address a held email reply will go to, when that is what the server is asking about. */
function confirmEmailToOf(details: unknown): string | null {
  const to = details && typeof details === "object" ? (details as { confirm_email_to?: unknown }).confirm_email_to : undefined;
  return typeof to === "string" && to.trim() ? to.trim() : null;
}

export function refusalOf(input: RefusalInput): Refusal {
  const status = Number.isFinite(input.status) ? input.status : 0;
  const said = typeof input.message === "string" ? input.message.trim() : "";
  const retryAfterS = retryAfterOf(input.details, input.retryAfter, input.nowMs ?? Date.now());
  const fields = fieldsOf(input.details);
  const code = typeof input.code === "string" && input.code ? input.code : null;
  const confirmEmailTo = confirmEmailToOf(input.details);
  const refusal = (c: string, title: string, message: string): Refusal => ({ code: c, status, title, message, retryAfterS, fields, ...(confirmEmailTo ? { confirmEmailTo } : {}) });

  if (!code) {
    // Not an envelope: nothing answered, a gateway answered for us, or this page
    // asked for a route the deployed app no longer has.
    if (status === 0) return refusal("network", "No connection", input.write ? NETWORK_WRITE : NETWORK_READ);
    if (status >= 500) return refusal("internal", "No answer", input.write ? NO_ANSWER_WRITE : READ_AGAIN);
    if (status === 413) return refusal("internal", "Too large", "That was too large to send.");
    return refusal("internal", "Out of date", OUT_OF_DATE);
  }

  switch (code) {
    case "unauthorized":
      return refusal(code, "Signed out", "Signed out.");
    case "network":
      return refusal(code, "No connection", input.write ? NETWORK_WRITE : NETWORK_READ);
    case "timeout":
      return refusal(code, "No answer in time", input.write ? TIMEOUT_WRITE : TIMEOUT_READ);
    case "internal":
      return refusal(code, "Something went wrong", said && said !== SERVER_CATCH_ALL ? said : input.write ? UNCONFIRMED_WRITE : READ_AGAIN);
    case "rate_limited":
      return refusal(code, "Too many at once", said || `Too many at once — try again in ${retryAfterS ? waitWords(retryAfterS) : "a moment"}.`);
    case "forbidden": {
      const needs = input.details && typeof input.details === "object" ? (input.details as { needs?: unknown }).needs : undefined;
      return refusal(code, needs === "owner" || needs === "operator" ? NEEDS_TITLE[needs] : "Not allowed", said || (SAID.get(code) as string));
    }
    default:
      return refusal(code, TITLES.get(code) ?? "Not done", said || SAID.get(code) || "That didn't go through.");
  }
}

/* ------------------------------------------------- the no before the press */

/** A permission a control can be gated on (config.ts ROLE_PERMS). */
export type RolePerm = keyof (typeof ROLE_PERMS)[Role];

/**
 * What a control on a permission does, when the control does not say. A control
 * whose own act is narrower names it: an owner's line is gated on `team`, and
 * "manage the team" is not what buying a number does.
 */
export const PERM_DOING: Readonly<Record<RolePerm, string>> = {
  approve: "approve or send",
  autonomy: "change what the receptionist may do on its own",
  disconnect: "disconnect a channel",
  billing: "change billing",
  team: "manage the team",
  settings: "change the business details",
  export: "export the customer list",
};

/**
 * The gate before the press: null when the role may; otherwise the least role
 * that may, and one sentence in the words the server's refusal gives after the
 * press ("Only an owner can change the business details."). A role that is not
 * one, or none yet, is a viewer: the gate fails closed, as the page's role does.
 */
export function roleGate(role: string | null | undefined, perm: RolePerm, doing?: string | null): { needs: "owner" | "operator"; title: string; reason: string } | null {
  const who: Role = (ROLES as readonly string[]).includes(role ?? "") ? (role as Role) : "viewer";
  if (ROLE_PERMS[who]?.[perm]) return null;
  const needs = ROLE_PERMS.operator?.[perm] ? "operator" : "owner";
  const what = doing?.trim() || PERM_DOING[perm] || "do this";
  return { needs, title: NEEDS_TITLE[needs], reason: needs === "owner" ? `Only an owner can ${what}.` : `Only an owner or operator can ${what}.` };
}
