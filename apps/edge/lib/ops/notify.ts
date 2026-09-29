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
import type { SupabaseClient } from "@supabase/supabase-js";
import { forgetNotification, type Database } from "../packages/db.js";
import type { NotificationsConfig } from "../packages/contracts.js";
import { SERVER_NOTIFICATION_KINDS, isPushKind } from "../packages/contracts.js";
import { scheduleJob } from "../packages/jobs.js";
import { pg } from "../pg.js";
import { env } from "../env.js";
import { logger, errField } from "../log.js";
import { providerFetch } from "../packages/channels.js";

type Db = SupabaseClient<Database>;

const RESEND = "https://api.resend.com/emails";
/** The longest one mail waits for the provider: a page, an owner's notice. A sweep's budget counts it. */
export const NOTIFY_TIMEOUT_MS = 10_000;

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
  /** False keeps the row and sends the mail but tells no phone: for news about the phones themselves, whose push
   *  would be the thing that failed (job-alert.ts). Unsaid, a kept row of a PUSH_KINDS kind is pushed. */
  push?: boolean;
}

export function platformFrom(): string | null {
  return env.LEAD_FROM || null;
}
/**
 * The platform's mailboxes: LEAD_TO, one address or several separated by
 * commas, so a second person can be paged without a second variable. Empty
 * when unset. A filing that wants ONE address (Twilio's contact) takes the
 * first.
 */
export function platformTo(): string[] {
  return (env.LEAD_TO || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** What the transport and the row store can be replaced with, by a test. The real ones are the default. */
export interface NotifyPorts {
  /** The database the row is kept in; null keeps no row. Unset means the edge's own client. */
  db?: Db | null;
  /** The mail transport; Resend through post() unless a test hands in its own. */
  send?: typeof post;
}

export async function post(from: string, to: string[], subject: string, text: string): Promise<boolean> {
  const L = logger();
  const key = env.RESEND_API_KEY;
  if (!key) {
    L.error("notify_skipped_no_api_key", { subject: redactNumbers(subject) });
    return false;
  }
  const r = await providerFetch("resend", RESEND, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from, to, subject, text }),
    timeoutMs: NOTIFY_TIMEOUT_MS,
    // The alarm is always tried: an outage the breaker learned is exactly when it must go.
    breaker: "count",
  });
  if (r.status === 0) {
    L.error("notify_failed", { subject: redactNumbers(subject), error: r.error ?? "no answer" });
    return false;
  }
  if (r.outcome !== "ok") {
    // Loud, with the status: this is the alarm channel failing, and the only
    // place it can be noticed is the log.
    L.error("notify_rejected", { status: r.status, subject: redactNumbers(subject), detail: r.text.slice(0, 200) });
    return false;
  }
  return true;
}

/**
 * WHO gets told, and whether they may see the contents. Pure, and separate from
 * the sending, because this is the decision that leaks customer data if it is
 * wrong — and a decision buried inside a fetch cannot be tested.
 */
type Addressing =
  /** A mailbox this tenant configured. Full detail. */
  | { kind: "tenant"; to: string[]; from: string }
  /** The env pair, which IS this tenant's own owner. Full detail. */
  | { kind: "platform"; to: string[]; from: string }
  /** A tenant we cannot address: the platform operator learns the FACT only. */
  | { kind: "redacted"; to: string[]; from: string }
  /** Nowhere to send. */
  | { kind: "none" };

export function chooseAddressing(target: NotifyTarget, platform: { to: string[]; from: string | null }): Addressing {
  const configured = target.notifications;
  if (configured?.escalation_emails?.length) {
    const from = configured.from || platform.from;
    if (from) return { kind: "tenant", to: configured.escalation_emails, from };
  }
  if (!platform.to.length || !platform.from) return { kind: "none" };
  // The env pair is only THIS tenant's own mailbox for the tenant that predates
  // the control plane. For anyone else it belongs to a different business.
  if (target.isEnvDefault) return { kind: "platform", to: platform.to, from: platform.from };
  return { kind: "redacted", to: platform.to, from: platform.from };
}

/**
 * Whether a notice would reach THIS WORKSPACE's own people.
 *
 * `notify` answers whether anything was sent, which is a different question:
 * the redacted branch tells the PLATFORM that a workspace is unaddressable,
 * and sending that successfully is still an owner who was never told. A caller
 * that spends a once-only guard on the strength of a delivery has to ask this
 * one instead — the deadman stamped `deadman_alerted_at`, which nothing ever
 * clears, on the platform's "needs notification settings" note, so every
 * self-serve workspace in its default state used up its single re-raise on a
 * notice its owner could not see.
 */
export function reachesTenant(target: NotifyTarget): boolean {
  const kind = chooseAddressing(target, { to: platformTo(), from: platformFrom() }).kind;
  return kind === "tenant" || kind === "platform";
}

/**
 * Deliver to the tenant this concerns, or tell the platform operator that we
 * could not. Returns whether anything was delivered.
 */
/**
 * The kinds the table accepts; anything else is kept as a plain alert.
 *
 * Contracts' list, not a copy of it. A copy lived here, and the day two kinds
 * joined the table (00134: template_ready, template_blocked) it went on turning
 * them into "alert" -- the webhook chose the right kind, the migration allowed
 * it, and the row still reached the bell as a plain alert pointing at Today.
 * SERVER_NOTIFICATION_KINDS is held equal to the table's check by type
 * (contracts schema-sets.ts, against the set generated from the database), so
 * the table and this cannot disagree again.
 */
const KEPT_KINDS: ReadonlySet<string> = new Set(SERVER_NOTIFICATION_KINDS);

/**
 * Keep the alert as a row the workspace can read on its bell, whether or not
 * an email goes out — a workspace with no recipients configured still owns
 * its own alerts (members read; the row is theirs under RLS). Never throws:
 * losing the row must not lose the email.
 *
 * A PLATFORM notice (no tenant: a broken sweep, a new sign-up, a workspace
 * that cannot be addressed) has no workspace and so no bell. It goes by mail
 * only; when that mail fails, the log says so and the pager's memory
 * (operator_pages, read on /api/diag) holds the conditions nobody was told.
 */
export async function recordNotification(
  tenantId: string | null,
  n: { kind?: string; title: string; body: string; route?: string | null; about?: { type: string; id: string } | null },
  db: Db | null = pg(),
): Promise<{ id: string; kind: string } | null> {
  if (!tenantId) return null;
  if (!db) return null;
  const kind = n.kind && KEPT_KINDS.has(n.kind) ? n.kind : "alert";
  const L = logger({ tenant_id: tenantId });
  try {
    const { data, error } = await db
      .from("notifications")
      .insert({
        tenant_id: tenantId,
        kind,
        title: n.title.slice(0, 200),
        body: n.body.slice(0, 4000),
        route: n.route ?? null,
        subject_type: n.about?.type ?? null,
        subject_id: n.about?.id ?? null,
      })
      .select("id")
      .single();
    if (error || !data) {
      L.error("notification_record_failed", { kind, error: error?.message ?? "no row" });
      return null;
    }
    return { id: data.id, kind };
  } catch (e) {
    L.error("notification_record_failed", { kind, error: errField(e) });
    return null;
  }
}

/**
 * A phone is told from the kept row, by the ledger: never in this request
 * (the mail is the alarm channel and must not wait on a push provider), and
 * never lost with the mail (a scheduling failure is logged, not thrown).
 * Only the kinds a phone should hear about (contracts PUSH_KINDS).
 */
async function schedulePush(tenantId: string, kept: { id: string; kind: string }, db: Db | null): Promise<void> {
  if (!db || !isPushKind(kept.kind)) return;
  try {
    await scheduleJob(db, {
      tenantId,
      kind: "push_send",
      dueAt: new Date(),
      payload: { notification_id: kept.id },
    });
  } catch (e) {
    logger({ tenant_id: tenantId }).error("push_schedule_failed", { kind: kept.kind, error: errField(e) });
  }
}

export async function notify(target: NotifyTarget, msg: NotifyMessage, ports: NotifyPorts = {}): Promise<boolean> {
  // The row first: it is the workspace's own record, addressed or not.
  const db = ports.db === undefined ? pg() : ports.db;
  const kept = await recordNotification(
    target.tenantId,
    { kind: msg.kind, title: msg.subject, body: msg.body, route: msg.route, about: msg.about },
    db,
  );
  if (kept && target.tenantId && msg.push !== false) await schedulePush(target.tenantId, kept, db);
  return mail(target, msg, ports);
}

/**
 * notify, for news its owner must hear exactly once (a reach-out run's first hold, R20): the row first, and no mail
 * without it; then the mail, and on a mail that failed the row goes again, so the caller asks once more and the bell
 * does not keep a twin. A workspace the mail cannot address (no recipients: reachesTenant) has its bell row, which is
 * the notice then. True only when the owner was told.
 */
export async function notifyOnce(target: NotifyTarget, msg: NotifyMessage, ports: NotifyPorts = {}): Promise<boolean> {
  const db = ports.db === undefined ? pg() : ports.db;
  const kept = await recordNotification(
    target.tenantId,
    { kind: msg.kind, title: msg.subject, body: msg.body, route: msg.route, about: msg.about },
    db,
  );
  if (!kept || !target.tenantId || !db) return false;
  const told = !reachesTenant(target) || (await mail(target, msg, ports));
  if (!told) {
    await forgetNotification(db, { tenantId: target.tenantId, id: kept.id }).catch((e) =>
      logger({ tenant_id: target.tenantId }).error("notification_record_failed", {
        kind: kept.kind,
        error: errField(e),
      }),
    );
    return false;
  }
  if (msg.push !== false) await schedulePush(target.tenantId, kept, db);
  return true;
}

/**
 * The mail half of notify: who is told, and whether they may see the contents; no row is kept. For news whose row
 * is already written elsewhere -- a lead search's question is kept by its own trigger, in the transaction that asked
 * it -- so the bell does not get it twice.
 */
export async function mail(
  target: NotifyTarget,
  msg: Pick<NotifyMessage, "subject" | "body" | "redactedBody">,
  ports: Pick<NotifyPorts, "send"> = {},
): Promise<boolean> {
  const L = logger({ tenant_id: target.tenantId });
  const send = ports.send ?? post;
  const addressing = chooseAddressing(target, { to: platformTo(), from: platformFrom() });

  switch (addressing.kind) {
    case "tenant":
    case "platform":
      return send(addressing.from, addressing.to, msg.subject, msg.body);

    case "redacted": {
      L.error("notify_tenant_unaddressable", { subject: redactNumbers(msg.subject) });
      if (!msg.redactedBody) return false;
      return send(
        addressing.from,
        addressing.to,
        "A workspace needs notification settings",
        `${msg.redactedBody}\n\nWorkspace: ${target.tenantId ?? "unknown"}\n\n` +
          `This workspace has no notification recipients configured, so the details were withheld ` +
          `rather than sent to a mailbox that does not belong to it. Set them in Settings.`,
      );
    }

    case "none":
      L.error("notify_no_recipient", { subject: redactNumbers(msg.subject) });
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
