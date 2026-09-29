/**
 * The wires a workspace's words leave on: WhatsApp's from its credentials, and email's bound to its own addresses.
 * deliver() decides whether a send may leave; these only put it on the provider's wire, and refuse a request that
 * would leave as somebody else.
 */
import {
  sendText,
  sendTemplate,
  sendEmail,
  requestLeavesAs,
  addressOf,
  type SendResult,
  type EmailLeftAsWhy,
  type WaConfig,
  type EmailRequest,
  type EmailSendsAs,
  type ResendConfig,
} from "@chanlytics/channels";
import type { Channel, Sender } from "./deliver";

/**
 * What a read of a workspace's credentials came back as, from wherever they
 * are kept (the edge's Vault, for WhatsApp). Three answers, because two of
 * them used to be one: `present` is the pair; `absent` is a channel that
 * carries none -- not connected, refused at the door and said to the owner;
 * `unavailable` is a read that FAILED (Vault, the database) whose truth nobody
 * has. The number may well be connected, so it is neither a refusal nor "not
 * connected": a send that meets it waits (WireUnavailable) rather than fail
 * for good and send the owner to reconnect a number that works.
 */
export type CredentialsRead<C> =
  { outcome: "present"; credentials: C } | { outcome: "absent" } | { outcome: "unavailable"; error: string };

/**
 * A wire that could not be BOUND this run: the workspace's credentials could
 * not be read (CredentialsRead unavailable). A plain object rather than a
 * class, because the value is built on the edge and read inside core's dist
 * and jobs' bundle of it, and `instanceof` does not cross a bundle.
 */
export interface WireUnavailable {
  unavailable: true;
  /** The read's own words, for the log and the pager; never shown to an owner. */
  error: string;
}
export const wireUnavailable = (error: string): WireUnavailable => ({ unavailable: true, error });
export function isWireUnavailable(w: unknown): w is WireUnavailable {
  return typeof w === "object" && w !== null && "unavailable" in w && w.unavailable === true;
}

/**
 * The door could not be opened: this channel's wire could not be bound
 * (Wire's WireUnavailable). Thrown before anything is written -- a queued row
 * stays queued, no event is emitted -- as every read that fails at the door
 * throws: "we could not check" is not "not connected". A caller that speaks to
 * a person tries again later (sendQueued, sendBroadcastBatch); deliverSafely
 * says it as `wire_unreadable`. Told apart by name, not by class, for the same
 * reason WireUnavailable is an object.
 */
export class WireUnavailableError extends Error {
  readonly channel: Channel;
  constructor(channel: Channel, error: string) {
    super(`deliver: the ${channel} wire could not be bound: ${error}`);
    this.name = "WireUnavailableError";
    this.channel = channel;
  }
}
export function isWireUnavailableError(e: unknown): e is WireUnavailableError {
  return e instanceof Error && e.name === "WireUnavailableError";
}

/**
 * WhatsApp's wire from a workspace's credentials. Graph wants bare digits,
 * so the "+" is stripped here rather than by a caller who should not know.
 */
export function whatsappSender(cfg: WaConfig | null): Sender | null {
  if (!cfg) return null;
  return (to, p) => {
    const digits = to.replace(/^\+/, "");
    return p.template ? sendTemplate(cfg, digits, p.template) : sendText(cfg, digits, p.body);
  };
}

/** WhatsApp's wire from a credentials READ: the sender, none to refuse with, or a wire that could not be bound. */
export function whatsappWire(read: CredentialsRead<WaConfig>): Sender | null | WireUnavailable {
  if (read.outcome === "unavailable") return wireUnavailable(read.error);
  return whatsappSender(read.outcome === "present" ? read.credentials : null);
}

/**
 * One address a workspace's email may leave as, and the provider account it leaves through. "hosted" is the mailbox
 * on the platform's account, for everything but a cold email; "own" is one of the workspace's own verified domains on
 * the cold account, for outreach and nothing else.
 */
export interface EmailRoute {
  lane: "hosted" | "own";
  cfg: ResendConfig;
  as: EmailSendsAs;
}

/**
 * Email's wire, bound to ONE workspace's addresses. It sends the frozen request
 * and nothing it assembled itself: a delivery without one, one addressed to
 * somebody other than `to`, or one that would leave as another workspace, is a
 * failure the caller hears about, never a send. The provider keys are the
 * deployment's; the routes are what make the wire this workspace's: the hosted
 * mailbox on the platform's account, and each of its own verified domains on
 * the cold account (Reach out), so a cold email never spends the reputation
 * every workspace's replies share. The route is chosen by the request's From,
 * within the send's lane: an own domain carries outreach only, so a reply
 * frozen with an own domain's From never leaves around outreach's rules, and a
 * cold email never leaves as the hosted mailbox. That route's own Reply-To rule
 * still applies. No routes, no email line (null, like a number with no
 * credentials). `held` is the addresses of the workspace's own domains that
 * are held: no route, but a reply frozen with one says why it went as the
 * mailbox.
 */
export function emailSender(routes: EmailRoute[], held: readonly string[] = []): Sender | null {
  if (routes.length === 0) return null;
  const refuse = (errorBody: string): Promise<SendResult> =>
    Promise.resolve({ ok: false, wamid: null, status: 0, errorBody });
  return async (to, p) => {
    if (!p.email) return refuse("no_frozen_request");
    if (p.email.to.length !== 1 || p.email.to[0] !== to) return refuse("request_names_another_recipient");
    const own = p.reply && p.ownEmail && p.purpose !== "outreach" ? ownRouteOf(routes, held, to, p.ownEmail) : null;
    if (own && "route" in own) return { ...(await sendEmail(own.route.cfg, p.ownEmail!)), leftAs: "own" };
    const from = addressOf(p.email.from)?.address;
    const lane = p.purpose === "outreach" ? "own" : "hosted";
    const route = routes.find((r) => r.lane === lane && r.as.address === from);
    if (!route || !requestLeavesAs(p.email, route.as)) return refuse("request_leaves_as_another_sender");
    const sent = await sendEmail(route.cfg, p.email);
    return own ? { ...sent, leftAs: "mailbox", leftAsWhy: own.why } : sent;
  };
}

/**
 * The own route a person's reply may leave by (G15): the route whose address is its twin's From, when that route
 * still holds its Reply-To. Why not, otherwise: the reply then leaves as the mailbox's request (N5).
 */
function ownRouteOf(
  routes: EmailRoute[],
  held: readonly string[],
  to: string,
  twin: EmailRequest,
): { route: EmailRoute } | { why: EmailLeftAsWhy } {
  const owns = routes.filter((r) => r.lane === "own");
  const from = addressOf(twin.from)?.address;
  const isHeld = from !== undefined && held.includes(from);
  if (owns.length === 0) return { why: isHeld ? "domain_held" : "no_own_route" };
  if (twin.to.length !== 1 || twin.to[0] !== to) return { why: "twin_names_another_recipient" };
  const route = owns.find((r) => r.as.address === from);
  if (!route) return { why: isHeld ? "domain_held" : "domain_has_no_route" };
  return requestLeavesAs(twin, route.as) ? { route } : { why: "route_refuses_twin" };
}
