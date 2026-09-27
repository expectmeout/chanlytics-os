/**
 * The domain's app links, decided without a request: which native apps may open its links, from one variable per
 * store. Pure, so the route stays a thin door and the files are run in a test.
 *
 *   APP_LINKS_APPLE    TEAMID.bundle.id, several separated by commas
 *   APP_LINKS_ANDROID  package=FINGERPRINT|FINGERPRINT;package2=FINGERPRINT (SHA-256 certificate fingerprints)
 *
 * Unset is nothing: the route answers 404, and the stores learn of the app the day the accounts exist, never of a
 * placeholder they would cache for a day.
 */

/** Paths that stay in a browser: the sign-in return, a workspace's public pages, and the policies every review links to. */
export const BROWSER_ONLY = ["/auth/*", "/yes/*", "/b/*", "/privacy", "/terms", "/data-deletion"] as const;

const list = (s: string | undefined) =>
  (s ?? "")
    .split(/[,;]/)
    .map((x) => x.trim())
    .filter(Boolean);

export function appLinksFor(store: string, env: { apple?: string; android?: string }): unknown | null {
  if (store === "apple") {
    const ids = list(env.apple);
    if (!ids.length) return null;
    return {
      applinks: {
        details: [
          { appIDs: ids, components: [...BROWSER_ONLY.map((p) => ({ "/": p, exclude: true })), { "/": "/*" }] },
        ],
      },
      webcredentials: { apps: ids },
    };
  }
  if (store === "android") {
    const statements = list(env.android)
      .map((entry) => {
        const [pkg, prints] = entry.split("=");
        const fingerprints = (prints ?? "")
          .split("|")
          .map((f) => f.trim().toUpperCase())
          .filter(Boolean);
        return pkg?.trim() && fingerprints.length
          ? {
              relation: ["delegate_permission/common.handle_all_urls"],
              target: { namespace: "android_app", package_name: pkg.trim(), sha256_cert_fingerprints: fingerprints },
            }
          : null;
      })
      .filter((s) => s !== null);
    return statements.length ? statements : null;
  }
  return null;
}
