/**
 * The email channel's switch, and its wire, as this deployment holds them.
 *
 * Email is on for a deployment when it names a mail domain (EMAIL_DOMAIN, the
 * subdomain that sends and receives: mail.chanlytics.com). Absent, the channel
 * does not exist here: no wire is bound, nothing is drawn, and a delivery that
 * names it fails as "no sender for channel", the way any channel a runtime
 * does not have fails (deliver.ts Wire). Present with no provider key, the
 * channel exists and cannot send: null, a refusal at the door, never a guess.
 *
 * A workspace's own switch is its mailbox row (00126): without one it has no
 * address to be written to, so nothing arrives and nothing is answered.
 */
import { emailSender, type Sender } from "./workspace/core.js";

/** The deployment's mail domain, lower-cased; null when email is off here. */
export function emailDomain(): string | null {
  const d = (process.env.EMAIL_DOMAIN || "").trim().toLowerCase();
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d) ? d : null;
}

/** undefined: no email on this runtime. null: email is on and there is no provider key. */
export function emailWire(): Sender | null | undefined {
  if (!emailDomain()) return undefined;
  const apiKey = process.env.RESEND_API_KEY;
  return emailSender(apiKey ? { apiKey } : null);
}
