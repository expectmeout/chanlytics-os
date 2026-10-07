/**
 * Google on the edge: the Places key, the OAuth client, the readiness, and
 * the routines that read a listing or a profile and write what changed —
 * shared by the link, the connect, "Check now" and the hourly sweep. The
 * plans themselves are pure (packages/channels google-sync.ts); this file
 * is the only place a key, a secret or a token is handled and the only
 * writer of the google_* tables.
 *
 * "This file" is now eight modules in this folder. This one holds what the
 * deployment holds: the key, the client, the audience and the readiness.
 * The routines are listing-check.ts, profile-connection.ts, profile-sync.ts
 * and review-answers.ts; the rows are in google-rows.ts, the transport to
 * Google in places.ts, and the credentials in profile-credentials.ts.
 */
import type { OAuthClient } from "../packages/channels.js";
import type { GoogleAudience } from "../packages/contracts.js";
import { env } from "../env.js";

export function placesKey(): string | null {
  return env.GOOGLE_PLACES_API_KEY || null;
}

/** The OAuth client for the Business Profile door, when the environment has all three parts. */
export function profileClient(): OAuthClient | null {
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = env.GOOGLE_OAUTH_REDIRECT_URI;
  return clientId && clientSecret && redirectUri ? { clientId, clientSecret, redirectUri } : null;
}

/**
 * Google's consent-screen audience for our OAuth app, as the operator set it
 * here when Google's console changed: `testing` (only listed test users may
 * grant; everyone else is refused by Google), `unverified` (in production
 * before Google's review; a warning screen), `verified`. Unknown or unset
 * says nothing rather than something wrong.
 */
export function googleAudience(): GoogleAudience | null {
  const a = env.GOOGLE_OAUTH_AUDIENCE;
  return a === "testing" || a === "unverified" || a === "verified" ? a : null;
}

/** What this deployment can do: look listings up; connect profiles; and which audience the app has with Google. */
export function googleReadiness(): { places: boolean; profile: boolean; audience: GoogleAudience | null } {
  return { places: !!placesKey(), profile: !!profileClient(), audience: googleAudience() };
}

/** The public half of the OAuth client, for the dashboard to build the way to Google. */
export function profilePublic(): { client_id: string; redirect_uri: string } | null {
  const c = profileClient();
  return c ? { client_id: c.clientId, redirect_uri: c.redirectUri } : null;
}
