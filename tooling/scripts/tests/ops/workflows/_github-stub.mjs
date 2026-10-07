/**
 * A stand-in for GitHub's API and the edge's pager door, preloaded into a script that would call them:
 * `node --import <this file> tooling/scripts/ops/rolling-issue.mjs ...`. No issue is open, an issue opens as #1, and the
 * pager door answers with the status STUB_PAGE_STATUS names (200 when unset). Nothing leaves the machine.
 *
 * Not named *.test.mjs on purpose: the runner globs that pattern.
 */
globalThis.fetch = async (url, init = {}) => {
  const target = new URL(String(url));
  const json = (status, body) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  if (target.pathname === "/api/admin/page") {
    const status = Number(process.env.STUB_PAGE_STATUS ?? 200);
    return json(status, status === 200 ? { ok: true, outcome: "sent" } : { ok: false });
  }
  if (target.hostname !== "api.github.com") throw new Error(`the stub has no answer for ${target.href}`);
  if ((init.method ?? "GET") === "GET") return json(200, []);
  return json(200, { number: 1 });
};
