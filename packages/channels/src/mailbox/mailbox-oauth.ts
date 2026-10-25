/**
 * A mailbox connected with OAuth (decision 0056): the way to the provider's consent screen, the code traded for a grant,
 * the grant refreshed, and the scopes a grant must hold. Google's and Microsoft's, side by side; pure, so the tests run
 * it without a network, and the edge makes each request (lib/email/mailbox/mailbox-credentials.ts).
 *
 * Google asks the least that does the job: gmail.send (a sensitive scope: Google's review only) and gmail.readonly (a
 * restricted one: the review and its security assessment), never gmail.modify or the whole mailbox. Microsoft asks
 * Mail.Send and Mail.ReadWrite (a draft is made from the MIME, its Message-ID read, then sent), and offline_access for a
 * lasting grant. The state that rides the way out and back is google-oauth.ts's (signState, verifyState), with the
 * provider in it.
 *
 * Asked beside them, never required (decision 0073, R18 to R20): the owner's contacts and the people they wrote to, and
 * their calendars, read-only, so what the mailbox connects brings its people and its visits too. The owner may untick
 * either on Google's screen; the mailbox still connects, and what it holds is asked of the grant (grantHolds). Google's
 * screen keeps what an earlier consent gave (include_granted_scopes), so one app files every scope once.
 */
import type { MailboxProvider } from "@chanlytics/contracts";
import { parseTokenResponse, type TokenGrant } from "../google/google-oauth";

const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const GMAIL_READ_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";
const CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts.readonly";
const OTHER_CONTACTS_SCOPE = "https://www.googleapis.com/auth/contacts.other.readonly";
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

/** What each provider is asked for. */
export const MAILBOX_SCOPES: Record<MailboxProvider, readonly string[]> = {
  google: [
    "openid",
    "email",
    "profile",
    GMAIL_SEND_SCOPE,
    GMAIL_READ_SCOPE,
    CONTACTS_SCOPE,
    OTHER_CONTACTS_SCOPE,
    CALENDAR_SCOPE,
  ],
  microsoft: [
    "offline_access",
    "openid",
    "email",
    "profile",
    "User.Read",
    "Mail.ReadWrite",
    "Mail.Send",
    "Contacts.Read",
    "Calendars.Read",
  ],
};

/** What a grant may bring beside its mail, each read only where the owner left it ticked (grantHolds). */
export type MailboxReach = "contacts" | "other_contacts" | "calendar";

const REACH: Record<MailboxProvider, Readonly<Partial<Record<MailboxReach, string>>>> = {
  google: { contacts: CONTACTS_SCOPE, other_contacts: OTHER_CONTACTS_SCOPE, calendar: CALENDAR_SCOPE },
  // Graph keeps no "other contacts": the people the owner wrote to come in with the mail itself.
  microsoft: { contacts: "contacts.read", calendar: "calendars.read" },
};

/** What a grant must hold for its mailbox to send and be read; the rest (who it is) only names it. */
const REQUIRED: Record<MailboxProvider, readonly string[]> = {
  google: [GMAIL_SEND_SCOPE, GMAIL_READ_SCOPE],
  microsoft: ["mail.readwrite", "mail.send"],
};

const MAILBOX_AUTH_URL: Record<MailboxProvider, string> = {
  google: "https://accounts.google.com/o/oauth2/v2/auth",
  // "common": a work or school account in any tenant, or a personal Microsoft account (refused later as free mail).
  microsoft: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
};
const MAILBOX_TOKEN_URL: Record<MailboxProvider, string> = {
  google: "https://oauth2.googleapis.com/token",
  microsoft: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
};
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";

export interface MailboxOAuthClient {
  clientId: string;
  clientSecret: string;
  /** The dashboard's callback, registered with the provider as it is written here. */
  redirectUri: string;
}

/** One request to a provider, made by the edge (its http) and read back here. */
export interface MailboxRequest {
  url: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  headers: Record<string, string>;
  body?: string;
}

const FORM = { "Content-Type": "application/x-www-form-urlencoded" };
const form = (p: Record<string, string>): string => new URLSearchParams(p).toString();

/**
 * The provider's consent screen, asked for this mailbox's grant. Google: offline access, consent every time (it hands a
 * refresh token on a first consent only, and a reconnect is a first consent on purpose), no scopes granted before folded
 * in. Microsoft: offline_access already asks for the refresh token; select_account so a person signed in to two picks.
 */
export function mailboxAuthorizeUrl(
  provider: MailboxProvider,
  cfg: Pick<MailboxOAuthClient, "clientId" | "redirectUri">,
  state: string,
  loginHint?: string | null,
): string {
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: MAILBOX_SCOPES[provider].join(" "),
    state,
  });
  if (provider === "google") {
    q.set("access_type", "offline");
    q.set("prompt", "consent");
    // What an earlier consent to this app gave stays given (decision 0073, R18): one app, every scope filed once.
    q.set("include_granted_scopes", "true");
  } else {
    q.set("response_mode", "query");
    q.set("prompt", "select_account");
  }
  if (loginHint) q.set("login_hint", loginHint);
  return `${MAILBOX_AUTH_URL[provider]}?${q.toString()}`;
}

/**
 * The link a Microsoft 365 admin opens to approve Chanlytics once for their whole organisation, where the tenant lets no
 * member consent alone (Entra's v2 admin consent: `organizations`, since a personal account approves nothing for a
 * tenant). It asks the same Graph scopes a member's sign-in does, and comes back to the callback with
 * `admin_consent=True` and the state.
 */
export function mailboxAdminConsentUrl(
  cfg: Pick<MailboxOAuthClient, "clientId" | "redirectUri">,
  state: string,
): string {
  const scope = MAILBOX_SCOPES.microsoft.map((s) =>
    /^(openid|email|profile|offline_access)$/.test(s) ? s : `https://graph.microsoft.com/${s}`,
  );
  const q = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    scope: scope.join(" "),
    state,
  });
  return `https://login.microsoftonline.com/organizations/v2.0/adminconsent?${q.toString()}`;
}

export function mailboxTokenRequest(provider: MailboxProvider, cfg: MailboxOAuthClient, code: string): MailboxRequest {
  return {
    url: MAILBOX_TOKEN_URL[provider],
    method: "POST",
    headers: FORM,
    body: form({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
      ...(provider === "microsoft" ? { scope: MAILBOX_SCOPES.microsoft.join(" ") } : {}),
    }),
  };
}

export function mailboxRefreshRequest(
  provider: MailboxProvider,
  cfg: Pick<MailboxOAuthClient, "clientId" | "clientSecret">,
  refreshToken: string,
): MailboxRequest {
  return {
    url: MAILBOX_TOKEN_URL[provider],
    method: "POST",
    headers: FORM,
    body: form({
      refresh_token: refreshToken,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      grant_type: "refresh_token",
      ...(provider === "microsoft" ? { scope: MAILBOX_SCOPES.microsoft.join(" ") } : {}),
    }),
  };
}

/**
 * The grant given back: Google revokes a token (the refresh token ends the grant); Microsoft has no single-token
 * revocation for a delegated grant, so there is nothing to ask, and removing the mailbox drops the token here.
 */
export function mailboxRevokeRequest(provider: MailboxProvider, token: string): MailboxRequest | null {
  if (provider !== "google") return null;
  return { url: GOOGLE_REVOKE_URL, method: "POST", headers: FORM, body: form({ token }) };
}

export type MailboxGrant = TokenGrant;

/** The token endpoint's answer, read: the same shape at both providers (RFC 6749). Throws on an answer with no token. */
export function parseMailboxGrant(json: unknown): MailboxGrant {
  return parseTokenResponse(json);
}

/** A scope as the grant names it, compared without Graph's resource prefix or case. */
const scopeKey = (s: string): string => s.replace(/^https:\/\/graph\.microsoft\.com\//i, "").toLowerCase();

/** The required scopes a grant does not hold: none missing is a mailbox that can send and be read. */
export function grantScopesMissing(provider: MailboxProvider, granted: string): string[] {
  const have = new Set(granted.split(/\s+/).filter(Boolean).map(scopeKey));
  return REQUIRED[provider].filter((s) => !have.has(scopeKey(s)));
}

/** The grant's scopes, as the row keeps them. */
export function grantScopes(granted: string): string[] {
  return [...new Set(granted.split(/\s+/).filter(Boolean))].slice(0, 20);
}

/** Whether a grant (its scopes, as a string or as the row keeps them) reaches beyond the mail to this. */
export function grantHolds(
  provider: MailboxProvider,
  granted: string | readonly string[],
  reach: MailboxReach,
): boolean {
  const scope = REACH[provider][reach];
  if (!scope) return false;
  const list = typeof granted === "string" ? granted.split(/\s+/) : granted;
  return list.some((s) => scopeKey(s) === scopeKey(scope));
}
