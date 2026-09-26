/**
 * When a deploy on the web should reload the pages the shell holds. The site's /api/version says its build sha with
 * no-store; the shell asks on every return to the foreground and reloads every page when the sha it last saw has
 * changed, never more than once in five minutes, and never for the first sha it learns (that is not a change).
 */
export const RELOAD_GAP_MS = 5 * 60 * 1000;

export interface DeployInput {
  lastSha: string | null;
  sha: string | null;
  lastReloadAt: number;
  now: number;
}

export function decideReload({ lastSha, sha, lastReloadAt, now }: DeployInput): "reload" | "keep" {
  if (!sha || !lastSha) return "keep";
  if (sha === lastSha) return "keep";
  if (now - lastReloadAt < RELOAD_GAP_MS) return "keep";
  return "reload";
}

/** The sha in /api/version's answer, or null for anything else. */
export function shaOf(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const sha = (body as { sha?: unknown }).sha;
  return typeof sha === "string" && sha.trim() ? sha.trim() : null;
}

/** The oldest app version the site still speaks to, from /api/version's answer, or null when every version is welcome. */
export function minAppOf(body: unknown): string | null {
  if (!body || typeof body !== "object") return null;
  const v = (body as { min_app?: unknown }).min_app;
  return typeof v === "string" && /^\d+(\.\d+){0,2}$/.test(v.trim()) ? v.trim() : null;
}

/** Whether this app (1.2.0) is older than the site's floor (1.3): numeric parts, missing parts zero. */
export function isOlderThan(version: string, min: string): boolean {
  const a = version.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const b = min.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    if (x !== y) return x < y;
  }
  return false;
}
