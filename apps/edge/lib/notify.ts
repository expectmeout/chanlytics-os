/**
 * The one way the edge reaches a human.
 *
 * There were four copies of this fetch — the WhatsApp handoff alert, the
 * unroutable-channel alert, the job runner's failure alert and the voice-call
 * summary — and every one of them shared three defects:
 *
 * 1. NOBODY CHECKED THE RESPONSE. `await fetch(...)` resolves for a 401, a 422
 *    or a rate limit exactly as it does for success. Resend is the ONLY alarm
 *    channel this system has, so an expired API key silenced every alert at
 *    once and nothing anywhere would have said so.
 *
 * 2. NO TIMEOUT, inside a 60s invocation that still has to persist and send.
 *
 * 3. TENANT-BLIND FALLBACKS. Two of them hardcoded a personal address and a
 *    from-name as the default recipient. With a second tenant that is a
 *    cross-tenant disclosure: one business's escalation, carrying its
 *    customer's verbatim message, delivered to a different business's owner.
 *
 * The third is why this file decides recipients rather than accepting a
 * default. A tenant we cannot address does not get someone else's mailbox —
 * it gets a REDACTED platform notice instead, so the operator learns a tenant
 * needs configuring without the customer's words travelling to a stranger.
 */
import type { NotificationsConfig } from "./workspace/contracts.js";
import { pg } from "./pg.js";

const RESEND = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;

export interface NotifyTarget {
  /** The tenant this message is ABOUT. */
  tenantId: string | null;
  /** That tenant's configured notification settings, when we could read them. */
  notifications: NotificationsConfig | null;
  /** True when this tenant is the env-default one, whose owner IS the address
   *  in LEAD_TO — the only case where the env fallback is that tenant's own. */
  isEnvDefault: boolean;
}

export interface NotifyMessage {
  /** The kept row's kind (contracts/notifications.ts); "alert" when not said. */
  kind?: string;
  /** Where the bell sends the reader — a hash route without "#/". */
  route?: string | null;
  /** What the row is about, when it is about one thing. */
  about?: { type: string; id: string } | null;
  subject: string;
  /** The full message, which may quote a customer. Sent only to an address we
   *  know belongs to this tenant. */
  body: string;
  /** What the PLATFORM operator may safely be told about a tenant we cannot
   *  address. Must contain no customer content. Omit to send nothing at all. */
  redactedBody?: string;
}

function platformFrom(): string | null {
  return process.env.LEAD_FROM || null;
}
function platformTo(): string | null {
  return process.env.LEAD_TO || null;
}

async function post(from: string, to: string[], subject: string, text: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.error("notify_skipped_no_api_key", redactNumbers(subject));
    return false;
  }
  try {
    const r = await fetch(RESEND, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to, subject, text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!r.ok) {
      // Loud, with the status: this is the alarm channel failing, and the only
      // place it can be noticed is the log.
      const detail = await r.text().catch(() => "");
      console.error("notify_rejected", JSON.stringify({ status: r.status, subject: redactNumbers(subject), detail: detail.slice(0, 200) }));
      return false;
    }
    return true;
  } catch (e) {
    console.error("notify_failed", JSON.stringify({ subject: redactNumbers(subject), error: e instanceof Error ? e.message : String(e) }));
    return false;
  }
}

/**
 * WHO gets told, and whether they may see the contents. Pure, and separate from
 * the sending, because this is the decision that leaks customer data if it is
 * wrong — and a decision buried inside a fetch cannot be tested.
 */
export type Addressing =
  /** A mailbox this tenant configured. Full detail. */
  | { kind: "tenant"; to: string[]; from: string }
  /** The env pair, which IS this tenant's own owner. Full detail. */
  | { kind: "platform"; to: string[]; from: string }
  /** A tenant we cannot address: the platform operator learns the FACT only. */
  | { kind: "redacted"; to: string[]; from: string }
  /** Nowhere to send. */
  | { kind: "none" };

export function chooseAddressing(
  target: NotifyTarget,
  platform: { to: string | null; from: string | null },
): Addressing {
  const configured = target.notifications;
  if (configured?.escalation_emails?.length) {
    const from = configured.from || platform.from;
    if (from) return { kind: "tenant", to: configured.escalation_emails, from };
  }
  if (!platform.to || !platform.from) return { kind: "none" };
  // The env pair is only THIS tenant's own mailbox for the tenant that predates
  // the control plane. For anyone else it belongs to a different business.
  if (target.isEnvDefault) return { kind: "platform", to: [platform.to], from: platform.from };
  return { kind: "redacted", to: [platform.to], from: platform.from };
}

/**
 * Deliver to the tenant this concerns, or tell the platform operator that we
 * could not. Returns whether anything was delivered.
 */
/** The kinds the table accepts; anything else is kept as a plain alert. */
const KEPT_KINDS = new Set(["handoff", "deadman", "call", "number", "sweep", "job_failed", "playbook", "calendar_people", "alert", "review"]);

/**
 * Keep the alert as a row the workspace can read on its bell, whether or not
 * an email goes out — a workspace with no recipients configured still owns
 * its own alerts (members read; the row is theirs under RLS). Never throws:
 * losing the row must not lose the email.
 */
export async function recordNotification(
  tenantId: string | null,
  n: { kind?: string; title: string; body: string; route?: string | null; about?: { type: string; id: string } | null },
): Promise<void> {
  if (!tenantId) return;
  const db = pg();
  if (!db) return;
  const kind = n.kind && KEPT_KINDS.has(n.kind) ? n.kind : "alert";
  try {
    const { error } = await db.from("notifications").insert({
      tenant_id: tenantId, kind, title: n.title.slice(0, 200), body: n.body.slice(0, 4000),
      route: n.route ?? null, subject_type: n.about?.type ?? null, subject_id: n.about?.id ?? null,
    });
    if (error) console.error("notification_record_failed", JSON.stringify({ tenant: tenantId, kind, error: error.message }));
  } catch (e) {
    console.error("notification_record_failed", JSON.stringify({ tenant: tenantId, kind, error: e instanceof Error ? e.message : String(e) }));
  }
}

export async function notify(target: NotifyTarget, msg: NotifyMessage): Promise<boolean> {
  // The row first: it is the workspace's own record, addressed or not.
  await recordNotification(target.tenantId, { kind: msg.kind, title: msg.subject, body: msg.body, route: msg.route, about: msg.about });
  const addressing = chooseAddressing(target, { to: platformTo(), from: platformFrom() });

  switch (addressing.kind) {
    case "tenant":
    case "platform":
      return post(addressing.from, addressing.to, msg.subject, msg.body);

    case "redacted": {
      console.error("notify_tenant_unaddressable", JSON.stringify({ tenant: target.tenantId, subject: redactNumbers(msg.subject) }));
      if (!msg.redactedBody) return false;
      return post(
        addressing.from,
        addressing.to,
        "A workspace needs notification settings",
        `${msg.redactedBody}\n\nWorkspace: ${target.tenantId ?? "unknown"}\n\n` +
          `This workspace has no notification recipients configured, so the details were withheld ` +
          `rather than sent to a mailbox that does not belong to it. Set them in Settings.`,
      );
    }

    case "none":
      console.error("notify_no_recipient", JSON.stringify({ tenant: target.tenantId, subject: redactNumbers(msg.subject) }));
      return false;
  }
}

/**
 * A subject line names the customer ("WhatsApp handoff needed: +1917…"), which
 * is right for the owner's inbox and wrong for a log. Digits in runs of six or
 * more are a phone number; everything else in the subject is kept.
 */
function redactNumbers(subject: string): string {
  return subject.replace(/\+?\d[\d\s().-]{4,}\d/g, "[number]");
}
