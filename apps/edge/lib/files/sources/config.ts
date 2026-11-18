/**
 * Footage sources' switches, as this deployment holds them (the footage sources plan): the OAuth client a business
 * connects its Google Drive with and the dashboard's callback Google returns to, and where Google's signals reach the
 * edge. The client is the one Google app every Chanlytics connection uses (decision 0073, R18): the scopes are filed
 * once on it, and each key holds its own alone. A deployment with no client offers no connect; one with no address of
 * its own opens no channel, and the clock's floor reads every folder all the same.
 */
import type { OAuthClient } from "@chanlytics/channels/google";
import type { GoogleAudience } from "@chanlytics/contracts";
import { env } from "../../shared/env.js";
import { googleAudience, googleClientAt } from "../../shared/google/config.js";

/** Where Google's signal for a watched folder lands on the edge. */
const DRIVE_SIGNAL_PATH = "/api/sources/drive";

/** The OAuth client for a Drive connect, when the environment has all three parts. */
export function driveClient(): OAuthClient | null {
  return googleClientAt(env.SOURCES_OAUTH_REDIRECT);
}

/** The address a push channel is opened with, or null where the edge does not know its own origin. */
export function driveSignalAddress(): string | null {
  const origin = env.EDGE_ORIGIN;
  return origin ? `${origin.replace(/\/+$/, "")}${DRIVE_SIGNAL_PATH}` : null;
}

/**
 * What the dashboard is told to start a connect with: whether Drive is offered here, the public half of its client, and
 * Google's consent screen's audience, so the page says Google's warning before Connect.
 */
export function sourcesReadiness(): {
  drive: boolean;
  oauth: { client_id: string; redirect_uri: string } | null;
  audience: GoogleAudience | null;
} {
  const client = driveClient();
  return {
    drive: client !== null,
    oauth: client ? { client_id: client.clientId, redirect_uri: client.redirectUri } : null,
    audience: client ? googleAudience() : null,
  };
}
