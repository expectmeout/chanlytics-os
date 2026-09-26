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
