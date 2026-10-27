/**
 * The connected mailboxes' switches, as this deployment holds them (decision 0056): which providers a business may
 * connect (each one's OAuth client and the callback both return to), and how each tells the edge a mailbox changed
 * (Gmail's Pub/Sub topic and its push's audience; Graph's clientState and the edge's own origin its notifications
 * reach). A provider whose client is unset is not offered; a push that is unset leaves a mailbox to the five-minute
 * sweep, which reads every one whatever its push.
 */
import type { GoogleAudience, MailboxProvider } from "../../packages/contracts.js";
import { googleAudience } from "../../google/google-config.js";
import type { MailboxOAuthClient } from "../../packages/channels.js";
import { env } from "../../env.js";

/**
 * One provider's OAuth client, or null when this deployment does not offer it. Google's is the mailbox's own pair where
 * one is set, else the Business Profile's (decision 0073, R18: one Google app, every scope filed once), as a pair: never
 * one app's id with the other's secret.
 */
export function mailboxClient(provider: MailboxProvider): MailboxOAuthClient | null {
  const redirectUri = env.MAILBOX_OAUTH_REDIRECT;
  const mailPair = [env.GOOGLE_MAIL_CLIENT_ID, env.GOOGLE_MAIL_CLIENT_SECRET] as const;
  const profilePair = [env.GOOGLE_OAUTH_CLIENT_ID, env.GOOGLE_OAUTH_CLIENT_SECRET] as const;
  const [clientId, clientSecret] =
    provider === "google"
      ? mailPair[0] && mailPair[1]
        ? mailPair
        : profilePair
      : [env.MICROSOFT_MAIL_CLIENT_ID, env.MICROSOFT_MAIL_CLIENT_SECRET];
  return clientId && clientSecret && redirectUri ? { clientId, clientSecret, redirectUri } : null;
}

/** The providers a business may connect here. */
function mailboxProviders(): MailboxProvider[] {
  return (["google", "microsoft"] as const).filter((p) => mailboxClient(p) !== null);
}

/**
 * What the dashboard is told to start a connect with: the public half of each client offered, and, where Google is,
 * its consent screen's audience (the Business Profile app's own, decision 0073 R18), so the page says Google's warning
 * before Connect.
 */
export function mailboxReadiness(): {
  providers: MailboxProvider[];
  oauth: Partial<Record<MailboxProvider, { client_id: string; redirect_uri: string }>>;
  audience: GoogleAudience | null;
} {
  const oauth: Partial<Record<MailboxProvider, { client_id: string; redirect_uri: string }>> = {};
  for (const p of mailboxProviders()) {
    const c = mailboxClient(p);
    if (c) oauth[p] = { client_id: c.clientId, redirect_uri: c.redirectUri };
  }
  return { providers: mailboxProviders(), oauth, audience: oauth.google ? googleAudience() : null };
}

/** Gmail's push: the topic it publishes to, and the audience its subscription's token is signed for. */
export function gmailPush(): { topic: string; audience: string } | null {
  const topic = env.GMAIL_PUSH_TOPIC;
  const audience = env.GMAIL_PUSH_AUDIENCE;
  return topic && audience ? { topic, audience } : null;
}

/** Graph's notifications: where they reach the edge, and the clientState each carries. */
export function graphPush(): { url: string; clientState: string } | null {
  const origin = env.EDGE_ORIGIN;
  const clientState = env.GRAPH_NOTIFY_SECRET;
  return origin && clientState ? { url: `${origin.replace(/\/+$/, "")}/api/mailbox/graph`, clientState } : null;
}
