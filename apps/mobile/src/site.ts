/**
 * The site the shell holds, and how the shell names itself to it.
 *
 * EXPO_PUBLIC_SITE_ORIGIN is inlined at bundle time by a static read (the only way Expo inlines an EXPO_PUBLIC_
 * variable), so it is read here once and nowhere else; unset, the shell holds the product's own address. The User-Agent token is what contracts' inAppFrom parses
 * ("ChanlyticsApp/1.2.0 (ios)"); the two are held to each other by test/site.test.mjs. A workspace page's address is
 * legacy-bridge/workspace.ts's: /w/<slug>, with the hash route after it.
 */
/** The product's one address, as the e2e suite and the env examples name it; an EAS environment may point elsewhere. */
export const DEFAULT_SITE_ORIGIN = "https://app.chanlytics.com";
export const SITE_ORIGIN = (process.env.EXPO_PUBLIC_SITE_ORIGIN || DEFAULT_SITE_ORIGIN).replace(/\/+$/, "");

export type Platform = "ios" | "android";

export function userAgentToken(version: string, platform: Platform): string {
  return `ChanlyticsApp/${version || "0.0.0"} (${platform})`;
}

/** Where a tab's page lives: the workspace at its hash route, or the site's home when no workspace is known yet. */
export function hrefFor(slug: string | null, route: string): string {
  if (!slug) return `${SITE_ORIGIN}/`;
  return `${SITE_ORIGIN}/w/${encodeURIComponent(slug)}#/${route}`;
}

/** The sign-in page. */
export const LOGIN_HREF = `${SITE_ORIGIN}/login`;
/** The native sign-in door: a POST of an identity token that answers with the cookie and a 303 (PR 0). */
export const NATIVE_DOOR = `${SITE_ORIGIN}/auth/native`;

/** Whether a URL is this site's: what the WebView may open itself; anything else goes to the system browser. */
export function isOurs(url: string): boolean {
  try {
    return new URL(url).origin === SITE_ORIGIN;
  } catch {
    return false;
  }
}

/** Whether a URL is the sign-in page or one of its doors: the shell reads "signed out" from the address. */
export function isSignedOutUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.origin === SITE_ORIGIN && /^\/(login|signup|reset-password|auth\/signout)(\/|$)/.test(u.pathname);
  } catch {
    return false;
  }
}
