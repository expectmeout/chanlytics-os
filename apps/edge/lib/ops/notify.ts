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
import {
  forgetNotification,
  mailSent,
  noticeFor,
  workspaceNamed,
  type Database,
  type KeptNotice,
} from "../packages/db.js";
import type { NotificationsConfig } from "../packages/contracts.js";
import {
  EMAIL_ALWAYS_KINDS,
  SERVER_NOTIFICATION_KINDS,
  appLink,
  emailsFor,
  isPushKind,
  noticeRoute,
  openItLine,
} from "../packages/contracts.js";
import { scheduleJob } from "../packages/jobs.js";
import { pg } from "../pg.js";
import { env } from "../env.js";
import { logger, errField } from "../log.js";
import { providerFetch } from "../packages/channels.js";
import { dashboardOrigin } from "../dashboard-origin.js";

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
  /** The workspace's address word (tenants.slug), when it was read with the recipients: the link at the foot of an alert
   *  mail is built from it. Unset means not read, and the mail reads it once; null means the workspace has none. */
  slug?: string | null;
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
   *  would be the thing that failed (job-alert.ts). "after_mail" tells the phone only once the mail has gone: for a
   *  notice a sweep raises again until its mail goes (the deadman), so a failing provider does not push it to every
   *  phone on every tick (decision 0040). Unsaid, a kept row of a PUSH_KINDS kind is pushed at once, mail or not. */
  push?: boolean | "after_mail";
  /** The event this notice answers (decision 0043): kept on the row, unique, so a second delivery of it tells nobody. */
  sourceEvent?: string;
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

/** The kind a row is kept as: the one asked for when the table keeps it, a plain alert otherwise. */
const keptKind = (kind: string | undefined): string => (kind && KEPT_KINDS.has(kind) ? kind : "alert");

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
  n: {
    kind?: string;
    title: string;
    body: string;
    route?: string | null;
    about?: { type: string; id: string } | null;
    sourceEvent?: string;
    /** The mail of this notice is still to go: the row says so (`mail_due_at`, 00409) until the mail is sent (mailSent). */
    mailOwed?: boolean;
  },
  db: Db | null = pg(),
): Promise<{ id: string; kind: string } | null> {
  if (!tenantId) return null;
  if (!db) return null;
  const kind = keptKind(n.kind);
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
        ...(n.sourceEvent ? { source_event: n.sourceEvent } : {}),
        ...(n.mailOwed ? { mail_due_at: new Date().toISOString() } : {}),
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
 * Only the kinds a phone should hear about (contracts PUSH_KINDS); which of its
 * members' phones is the push_send job's to decide (each member's push_off).
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

/**
 * The bell's row and the phone's, with no mail: for news a path writes to the bell alone that a phone should hear too (a
 * card declined, a trial ending, a review; decision 0040), where recordNotification kept the row and told no phone,
 * though the kind is one phones are told. Never throws, as recordNotification does not.
 */
export async function keepAndPush(
  tenantId: string,
  n: Parameters<typeof recordNotification>[1],
  db: Db | null = pg(),
): Promise<{ id: string; kind: string } | null> {
  const kept = await recordNotification(tenantId, n, db);
  if (kept) await schedulePush(tenantId, kept, db);
  return kept;
}

export async function notify(target: NotifyTarget, msg: NotifyMessage, ports: NotifyPorts = {}): Promise<boolean> {
  // The row first: it is the workspace's own record, addressed or not.
  const db = ports.db === undefined ? pg() : ports.db;
  const kept = await recordNotification(
    target.tenantId,
    {
      kind: msg.kind,
      title: msg.subject,
      body: msg.body,
      route: msg.route,
      about: msg.about,
      sourceEvent: msg.sourceEvent,
    },
    db,
  );
  if (kept && target.tenantId && msg.push !== false && msg.push !== "after_mail")
    await schedulePush(target.tenantId, kept, db);
  // Mailed only if contracts keeps the kind for email and the business has not turned it off (emailsFor: the topics
  // Settings › Notifications draws, so what the page says is emailed is what is). A kind kept for the bell, or one the
  // business turned off, is a row and no more, and the row is the notice.
  if (!emailsFor(target.notifications, msg.kind)) return kept !== null;
  const sent = await mailNotice(target, msg, ports, db);
  if (sent && kept && target.tenantId && msg.push === "after_mail") await schedulePush(target.tenantId, kept, db);
  return sent;
}

/** The mail half of a notice that is also kept: the mail, ending with the link to the page the notice names (openItLink). */
function mailNotice(target: NotifyTarget, msg: NotifyMessage, ports: NotifyPorts, db: Db | null): Promise<boolean> {
  return mail(target, { ...msg, openIt: true }, { send: ports.send, db });
}

/**
 * notify, for news its owner must hear exactly once (a reach-out run's first hold, R20): the bell's row and the phones
 * first, then the mail, which is retried alone if it failed: the row stays, marked as owing its mail (`mail_due_at`,
 * 00409), and asking again finds it by what it is about and sends the mail and nothing else, so the bell keeps no twin
 * and the phones are not told twice (decision 0048). A notice with nothing to find it by (no event, nothing it is about)
 * keeps the old way: its row goes again when the mail failed. A workspace the mail cannot address (no recipients:
 * reachesTenant) has its bell row, which is the notice then. True only when the owner was told in full.
 */
export async function notifyOnce(target: NotifyTarget, msg: NotifyMessage, ports: NotifyPorts = {}): Promise<boolean> {
  return keepThenMail(target, msg, ports, false);
}

/**
 * notifyOnce, for the notice an event raises (a hold's: decision 0043, core SUBSCRIBERS.owner_notice; a customer's no:
 * SUBSCRIBERS.consent_notice). The row keeps the event it answers, so a twin delivery's row refuses a second and the
 * delivery that finds the first tells only what it still owes; a workspace nobody can be mailed at has its bell row, and
 * the platform the fact without the words, as notify sends it. True only when the owner was told in full: a mail that
 * failed leaves the row and the phones as they went, owes the mail, and the delivery tries again for the mail alone.
 */
export async function notifyEvent(
  target: NotifyTarget,
  msg: NotifyMessage & { sourceEvent: string },
  ports: NotifyPorts = {},
): Promise<boolean> {
  return keepThenMail(target, msg, ports, true);
}

/**
 * What finds a notice again when its mail is owed: the event it answers, else what it is about with its title. A notice
 * that names neither cannot be told from a new one on a second try.
 */
function retryKey(tenantId: string, msg: NotifyMessage): Parameters<typeof noticeFor>[1] | null {
  const kind = keptKind(msg.kind);
  if (msg.sourceEvent) return { tenantId, kind, sourceEvent: msg.sourceEvent };
  if (msg.about?.type && msg.about.id)
    return { tenantId, kind, subjectType: msg.about.type, subjectId: msg.about.id, title: msg.subject.slice(0, 200) };
  return null;
}

/**
 * A notice is three deliveries with one state each (decision 0048): the bell's row, the phones, and the mail. The row
 * is kept and the phones scheduled FIRST, at once; the mail follows, and a mail that failed no longer takes the row
 * back: the row says its mail is owed (`mail_due_at`), and a retry finds it (noticeFor) and sends the mail alone. So a
 * mail provider that is down for twelve minutes costs the owner twelve minutes of mail and nothing else, where it used
 * to cost the hold its bell row and its push as well.
 */
async function keepThenMail(
  target: NotifyTarget,
  msg: NotifyMessage,
  ports: NotifyPorts,
  platformCopy: boolean,
): Promise<boolean> {
  const db = ports.db === undefined ? pg() : ports.db;
  if (!target.tenantId || !db) return false;
  const tenantId = target.tenantId;
  const key = retryKey(tenantId, msg);
  // Nothing to find it by on a second try: the way before decision 0048, the row withdrawn with a mail that failed.
  if (!key) return keepOrWithdraw(target, msg, { ...ports, db }, platformCopy);
  const L = logger({ tenant_id: tenantId });
  const mails = emailsFor(target.notifications, msg.kind);
  const toTenant = mails && reachesTenant(target);
  // What an earlier try kept: told in full is told; a mail still owed is all that is left to do.
  let earlier: KeptNotice | null;
  try {
    earlier = await noticeFor(db, key);
  } catch (e) {
    // "Could not check" is not "never told": a second row now could be the twin of the first.
    L.error("notification_record_failed", { kind: key.kind, error: errField(e) });
    return false;
  }
  if (earlier && !earlier.mailOwed) return true;
  const kept = earlier ?? (await recordNotification(tenantId, noticeOf(msg, toTenant), db));
  if (!kept) return false;
  // The phones go with the row, at once, whatever becomes of the mail.
  if (!earlier && msg.push !== false) await schedulePush(tenantId, kept, db);
  if (!toTenant) {
    // Nobody in the workspace to mail: the bell's row is the notice, and the platform's copy is said if it can be, for a
    // kind the receptionist must reach someone with (a hold's). News (a customer's STOP, an unsubscribe) is the bell's alone:
    // a note to the platform for each would be the operator's inbox filling with a business's opt-outs. A mail owed from a
    // try when somebody was on file is owed no more.
    if (mails && platformCopy && (EMAIL_ALWAYS_KINDS as readonly string[]).includes(msg.kind ?? "")) {
      await mailNotice(target, msg, ports, db);
    }
    if (earlier) await owedNoMore(db, tenantId, kept);
    return true;
  }
  if (!(await mailNotice(target, msg, ports, db))) return false;
  await owedNoMore(db, tenantId, kept);
  return true;
}

/** The row a notice keeps: its words, and that its mail is owed when one is to go. */
function noticeOf(msg: NotifyMessage, mailOwed: boolean): Parameters<typeof recordNotification>[1] {
  return {
    kind: msg.kind,
    title: msg.subject,
    body: msg.body,
    route: msg.route,
    about: msg.about,
    sourceEvent: msg.sourceEvent,
    mailOwed,
  };
}

/** Say the notice's mail is done with. A row that could not be written leaves the mail owed: said, and never thrown. */
async function owedNoMore(db: Db, tenantId: string, kept: { id: string; kind: string }): Promise<void> {
  await mailSent(db, { tenantId, id: kept.id }).catch((e: unknown) =>
    logger({ tenant_id: tenantId }).error("notification_record_failed", { kind: kept.kind, error: errField(e) }),
  );
}

/**
 * The way before decision 0048, for a notice nothing can find again: the row, the mail, and on a mail that failed the row goes
 * again. Its ports carry the database the caller resolved.
 */
async function keepOrWithdraw(
  target: NotifyTarget,
  msg: NotifyMessage,
  ports: NotifyPorts & { db: Db },
  platformCopy: boolean,
): Promise<boolean> {
  const { db } = ports;
  const kept = await recordNotification(target.tenantId, noticeOf(msg, false), db);
  if (!kept || !target.tenantId) return false;
  let told = true;
  if (emailsFor(target.notifications, msg.kind)) {
    if (reachesTenant(target)) told = await mailNotice(target, msg, ports, db);
    // Nobody in the workspace to mail: the bell's row is the notice, and the platform's copy is said if it can be.
    else if (platformCopy) await mailNotice(target, msg, ports, db);
  }
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
 * it -- so the bell does not get it twice. A caller that names the kind is held to the business's choice (emailsFor):
 * a kind it turned off is not mailed, and reads as told, since the bell's row is the notice. A mail of no kind (the
 * first run's "you're live", a test) is not one an owner turns off.
 *
 * `openIt` ends the mail that goes to the workspace's own people with the link to the page the notice names (openItLink),
 * and no other: not the redacted copy, and not a mail whose builder wrote its own link (a lead's question, "you're live",
 * the alert test). notify and its kin set it; a caller that sends a mail by itself does not.
 */
export async function mail(
  target: NotifyTarget,
  msg: Pick<NotifyMessage, "subject" | "body" | "redactedBody" | "route"> & { kind?: string; openIt?: boolean },
  ports: Pick<NotifyPorts, "send" | "db"> = {},
): Promise<boolean> {
  const L = logger({ tenant_id: target.tenantId });
  if (msg.kind !== undefined && !emailsFor(target.notifications, msg.kind)) return true;
  const send = ports.send ?? post;
  const addressing = chooseAddressing(target, { to: platformTo(), from: platformFrom() });

  switch (addressing.kind) {
    case "tenant":
    case "platform": {
      const link = msg.openIt ? await openItLink(target, msg, ports.db) : null;
      return send(addressing.from, addressing.to, msg.subject, link ? `${msg.body}\n\n${openItLine(link)}` : msg.body);
    }

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
 * The page an alert mail ends with, as a link: the dashboard's origin, the workspace's address and the place the notice
 * opens on the bell and the phone (contracts noticeRoute: its own route, else its kind's list). Null when the notice is
 * about no workspace (the platform's own news), or the workspace's address is not known.
 *
 * The slug comes with the recipients where the loader read it (NotifyTarget.slug). A target built from a loader that read
 * only the recipients has it read here, once, for the one mail that goes. A link that cannot be built is no link, said on
 * the log: never a mail that does not go (the alarm is this system's only channel), and never a link to another business.
 */
async function openItLink(
  target: NotifyTarget,
  msg: Pick<NotifyMessage, "kind" | "route">,
  db: Db | null | undefined,
): Promise<string | null> {
  if (!target.tenantId) return null;
  try {
    const slug =
      target.slug !== undefined ? target.slug : db ? ((await workspaceNamed(db, target.tenantId))?.slug ?? null) : null;
    return slug ? `${dashboardOrigin()}${appLink(slug, noticeRoute(msg.kind, msg.route))}` : null;
  } catch (e) {
    logger({ tenant_id: target.tenantId }).warn("notify_link_unavailable", { error: errField(e) });
    return null;
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
