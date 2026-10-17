export const CLIENT_ERROR_BOUNDARIES = ["shell", "os", "root"];
export const CLIENT_ERROR_LIMITS = {
  name: 60,
  message: 300,
  stack: 1200,
  page: 32,
  digest: 64,
  workspace: 64
};
export const PAGE = /^[a-z][a-z0-9-]{0,31}$/;
export const WORKSPACE = /^[A-Za-z0-9][A-Za-z0-9-]{0,63}$/;
export function clientErrorOf(boundary, error, page, digest, workspace) {
  const e = error instanceof Error ? error : new Error(String(error));
  const first = (page ?? "").split(/[/?#]/)[0] ?? "";
  return {
    boundary,
    page: PAGE.test(first) ? first : null,
    name: (e.name || "Error").slice(0, CLIENT_ERROR_LIMITS.name),
    message: (e.message || "").slice(0, CLIENT_ERROR_LIMITS.message),
    stack: e.stack ? e.stack.slice(0, CLIENT_ERROR_LIMITS.stack) : null,
    digest: digest ? digest.slice(0, CLIENT_ERROR_LIMITS.digest) : null,
    workspace: workspace && WORKSPACE.test(workspace) ? workspace : null
  };
}
