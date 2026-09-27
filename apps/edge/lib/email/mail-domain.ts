/**
 * Whether the one domain all of this deployment's email is on is still working
 * — asked of the provider, because nothing in our own rows would say.
 *
 * THE FAILURE THIS EXISTS FOR. A verified mail domain stops being verified
 * without anybody doing anything: a DNS record edited for another reason, a
 * registrar migration, a zone restored from an older copy. The provider then
 * keeps accepting mail addressed to us and drops it. The sender gets no
 * bounce, we get no webhook, `last_received_at` simply stops moving — and a
 * mailbox that has been quiet for two days looks exactly like a small business
 * nobody happened to email. There is no signal in our data to read, so the
 * check is a question put to the provider, once each health tick.
 *
 * The domain is the DEPLOYMENT's, not a workspace's, so this is the platform's
 * condition and it pages the platform (page-operator.ts), once per window,
 * like the other two conditions no sweep row can show.
 *
 * SEPARATED FROM THE ASKING, for the reason sweep-health.ts is: what counts as
 * broken decides whether the only alarm channel is flooded or silent, and
 * `judgeMailDomain` is a function over the provider's own words.
 */
import { fetchMailDomains, type MailCapability, type MailDomainFacts } from "../packages/channels.js";

/** The one status that means the DNS is in place. Everything else is judged by what it costs, never assumed benign. */
const VERIFIED = "verified";
/**
 * The one status the provider gives ONLY to a domain that was verified and has
 * stopped being seen on a periodic check. Worth its own words, because it is
 * the case where mail that was arriving has started being lost.
 *
 * `failed` deliberately is NOT in here, though it was at first. The provider
 * uses it for "the records stayed unseen for 72 hours", which a domain reaches
 * from either direction -- one that was working and lost them, and one that was
 * never finished. Our own mail domain sat at `failed` having never verified,
 * which is how the wrong grouping was caught: the alarm would have said a
 * domain that never worked had stopped working.
 */
const WAS_VERIFIED: ReadonlySet<string> = new Set(["temporary_failure"]);

type MailDomainTrouble =
  /** The provider has no such domain. EMAIL_DOMAIN names something that was never added, or was deleted. */
  | { kind: "absent" }
  /** Never verified: added and not finished (`not_started`, `pending`), or a status this code has not heard of. */
  | { kind: "never_verified"; status: string }
  /** It was verified and the records stopped being seen: mail that was arriving is being lost now. */
  | { kind: "stopped"; status: string }
  /** The provider gave up after 72 hours of not seeing the records. It may never have been verified, or it may have been and lost them. */
  | { kind: "given_up"; status: string }
  /** One half verified, the other not (`partially_verified`, `partially_failed`). Which half is in the provider's dashboard. */
  | { kind: "half"; status: string }
  /** Verified, and configured with a half switched off — so that half of the address does nothing. */
  | { kind: "off"; sending: MailCapability; receiving: MailCapability };

/**
 * What is wrong with the domain we send and receive on; null when nothing is.
 *
 * The two fields are read with opposite defaults on purpose. `status` is the
 * provider reporting on the world, so a word this code does not know reads as
 * NOT verified — a status invented after this was written must not buy
 * silence. `capabilities` is the provider reading back configuration WE set,
 * so only an explicit "disabled" is a fault: a field the API stops sending is
 * a release note, not an outage, and must not page anybody at three in the
 * morning.
 */
export function judgeMailDomain(
  domains: MailDomainFacts[],
  wanted: string,
  o: { receiveOnly?: boolean } = {},
): MailDomainTrouble | null {
  const name = wanted.trim().toLowerCase();
  const d = domains.find((x) => x.name === name);
  if (!d) return { kind: "absent" };
  if (d.status !== VERIFIED) {
    if (d.status.startsWith("partially_")) return { kind: "half", status: d.status };
    if (d.status === "failed") return { kind: "given_up", status: d.status };
    return WAS_VERIFIED.has(d.status)
      ? { kind: "stopped", status: d.status }
      : { kind: "never_verified", status: d.status };
  }
  // A domain that only receives (the cold reply domain, D17) may send nothing, and is off only when it cannot receive.
  if ((d.sending === "disabled" && !o.receiveOnly) || d.receiving === "disabled")
    return { kind: "off", sending: d.sending, receiving: d.receiving };
  return null;
}

/**
 * The page for a cold reply domain (D17) that stopped receiving: every cold email's Reply-To is on it, so a reply,
 * a lead's "no thanks" included, is dropped with no bounce, and the chain writes to them again.
 */
export function describeColdReplyDomainTrouble(
  t: MailDomainTrouble,
  domain: string,
): { subject: string; body: string } {
  const said =
    t.kind === "absent"
      ? "the provider has no domain by that name"
      : t.kind === "off"
        ? `verified, receiving ${t.receiving}`
        : `status "${t.status}"`;
  return {
    subject: `The cold reply domain ${domain} is not receiving: ${said}`,
    body:
      `Cold emails are answered at ${domain} (COLD_REPLY_DOMAIN, or COLD_REPLY_DOMAIN_PREVIOUS while it winds down), and ` +
      `the provider reports ${said}.\n\n` +
      `While this lasts, replies to cold email are dropped without a bounce, a lead's "no thanks" among them, and the ` +
      `next step of their reach-out writes to them again. Nothing in our own rows shows it.\n\n` +
      `Check the domain's receiving records in the platform's Resend account. Until it receives, unset nothing: set ` +
      `COLD_REPLY_DOMAIN_PREVIOUS if COLD_REPLY_DOMAIN moves (docs/runbook.md, "Before scale").\n`,
  };
}

/** What each kind of trouble COSTS, in the terms the person woken by it cares about. */
function consequence(t: MailDomainTrouble): string {
  switch (t.kind) {
    case "absent":
      return "no workspace can be written to or reply: every address on this domain is one the provider does not know.";
    case "never_verified":
      return "email is switched on for this deployment and the domain was never finished. Mail sent to it is refused or dropped, and replies cannot leave.";
    case "stopped":
      return "mail addressed to every workspace is being dropped WITHOUT a bounce to the sender, so nobody on either side is told. Replies fail too.";
    case "given_up":
      return "mail addressed to every workspace is being dropped and replies cannot leave. The provider stopped looking after 72 hours, so this will not fix itself even once the records are right: somebody has to ask it to verify the domain again.";
    case "half":
      return "one of sending and receiving is verified and the other is not. If it is receiving, customers' emails are being lost silently.";
    case "off":
      return t.receiving === "disabled"
        ? "the domain is verified but receiving is switched off, so every address we published accepts nothing."
        : "the domain is verified but sending is switched off, so no reply can leave.";
  }
}

/** The page: what the provider said, what it costs, and the one place to go and look. */
export function describeMailDomainTrouble(t: MailDomainTrouble, domain: string): { subject: string; body: string } {
  const said =
    t.kind === "absent"
      ? "the provider has no domain by that name"
      : t.kind === "off"
        ? `verified, sending ${t.sending}, receiving ${t.receiving}`
        : `status "${t.status}"`;
  return {
    subject: `The mail domain ${domain} is not working: ${said}`,
    body:
      `Every workspace's email address on this deployment is on ${domain}, and the provider reports ${said}.\n\n` +
      `While this lasts: ${consequence(t)}\n\n` +
      `Nothing in our own rows shows this — a mailbox that receives nothing looks the same as one nobody wrote to — ` +
      `so this mail is the only place it appears.\n\n` +
      `Check the domain's DNS records in the Resend dashboard. GET /api/diag with the x-diag-key header shows ` +
      `when this last paged, under "pages".\n` +
      `Further notices are suppressed for six hours, and only once this one has actually been delivered.\n`,
  };
}

interface MailDomainPorts {
  /** The deployment's mail domain (lib/email.ts emailDomain); null when email is off here, and there is nothing to check. */
  domain: string | null;
  apiKey: string | undefined;
  /** The provider. Injected so the judgement can be proved without a network. */
  domains?: (cfg: { apiKey: string }) => Promise<MailDomainFacts[]>;
  /** A domain that only receives (the cold reply domain, D17): its sending switched off is no trouble. */
  receiveOnly?: boolean;
}

/**
 * The check as the health tick runs it. It never throws: a provider that could
 * not be reached is `error`, which is logged and changes nothing — an outage at
 * the provider must not page as an outage of ours, and the next tick asks again.
 */
export async function checkMailDomain(
  p: MailDomainPorts,
): Promise<{ trouble: MailDomainTrouble | null; error?: string; skipped?: "email_off" | "no_key" }> {
  if (!p.domain) return { trouble: null, skipped: "email_off" };
  if (!p.apiKey) return { trouble: null, skipped: "no_key" };
  const ask = p.domains ?? fetchMailDomains;
  try {
    return { trouble: judgeMailDomain(await ask({ apiKey: p.apiKey }), p.domain, { receiveOnly: p.receiveOnly }) };
  } catch (e) {
    return { trouble: null, error: e instanceof Error ? e.message : String(e) };
  }
}
