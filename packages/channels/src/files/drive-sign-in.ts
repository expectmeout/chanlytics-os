/**
 * The sign-in a business connects its Google Drive with (the footage sources plan, D17; the archive PRD 1.1, principle
 * 9): the way to Google's consent screen and the code's exchange. Pure, so the tests run it without a network; the
 * edge makes each request.
 *
 * Each Google key opens one door, and each door has a sign-in of its own. To watch a folder it asks for Drive, read
 * only: a restricted scope, which Google's review and its security assessment cover, with Gmail's. To choose files and
 * to save a copy on the owner's press it asks for the narrow one: only the files the business picks or the app makes.
 * Both ask who the account is and nothing else, and no scope an earlier consent gave another sign-in is folded in
 * (`include_granted_scopes=false`), so the narrow key never carries the wide one's reach.
 */
import type { SourceDoor } from "@chanlytics/contracts";
import { GOOGLE_AUTH_URL, GOOGLE_TOKEN_URL, type OAuthClient } from "../google/oauth";
import type { PlacesRequest } from "../google/places";

/** Drive, read only: every file the account can open, and nothing written. */
export const DRIVE_READ_SCOPE = "https://www.googleapis.com/auth/drive.readonly";

/** Drive, file by file: what the business picks in Google's picker and what the app itself makes, and no more. */
const DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";

/** The Drive scope each door's grant must hold. */
const DRIVE_SCOPE_OF_DOOR = { watch: DRIVE_READ_SCOPE, save: DRIVE_FILE_SCOPE } as const satisfies Record<
  SourceDoor,
  string
>;

/** The Drive scope a door's grant must hold: connect refuses a grant without it. */
export const driveScopeOfDoor = (door: SourceDoor): string => DRIVE_SCOPE_OF_DOOR[door];

/**
 * Google's consent screen, asked for one door's grant: who the account is (its id and its email) and that door's Drive
 * scope; offline access and consent every time (Google hands a refresh token on a first consent only, and a reconnect
 * is a first consent on purpose), nothing granted before folded in, and PKCE's challenge where one is given.
 */
export function driveAuthorizeUrl(
  cfg: Pick<OAuthClient, "clientId" | "redirectUri">,
  state: string,
  opts: { door: SourceDoor; loginHint: string | null; challenge: string | null },
): string {
  const query = new URLSearchParams({
    client_id: cfg.clientId,
    redirect_uri: cfg.redirectUri,
    response_type: "code",
    scope: ["openid", "email", driveScopeOfDoor(opts.door)].join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "false",
    state,
  });
  if (opts.challenge) {
    query.set("code_challenge", opts.challenge);
    query.set("code_challenge_method", "S256");
  }
  if (opts.loginHint) query.set("login_hint", opts.loginHint);
  return `${GOOGLE_AUTH_URL}?${query.toString()}`;
}

/** The code's exchange, with PKCE's verifier where the consent was asked with its challenge. */
export function driveTokenRequest(cfg: OAuthClient, code: string, verifier: string | null): PlacesRequest {
  return {
    url: GOOGLE_TOKEN_URL,
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: cfg.clientId,
      client_secret: cfg.clientSecret,
      redirect_uri: cfg.redirectUri,
      grant_type: "authorization_code",
      ...(verifier ? { code_verifier: verifier } : {}),
    }).toString(),
  };
}
