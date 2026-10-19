/**
 * One run's read (broadcasts/detail-read.ts), as a link to the run hears it (broadcasts/route.tsx): every answer the page's
 * own read has is told to whoever hears the run, its Retry's among them, so a link lands once the run is read however many
 * tries that took. The landing read the run once by itself, and a first read that failed left a sent run on Sent's page
 * after the page's Retry drew it (the Inbox's run review, 18 Oct 2026). And each answer is remembered for the run's crumb
 * (broadcasts/run-names.ts), so a run older than Sent's newest fifty is called by its name. Run through the typed client,
 * with the wire answered by the test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { installLegacyReact } from "../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false });
const S = "../../../../apps/dashboard/src/surfaces/campaigns/broadcasts";
const { runDetail, hearRunDetail, peekRunDetail } = await import(`${S}/detail-read.ts`);
const { rememberedRun } = await import(`${S}/run-names.ts`);

const json = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const RUN = {
  broadcast: { id: "b-old", name: "Autumn hours · 2026-09-01", run_for: "2026-09-01", state: "sent" },
  recipients: [],
  reach_out: null,
};
/** The wire: each read of the run answered in turn, as the test lines them up. */
const wire = (...answers) => {
  const asked = [];
  globalThis.fetch = async (url) => {
    const u = new URL(String(url), "https://app.chanlytics.com");
    asked.push(u.pathname);
    if (u.pathname !== "/api/v1/broadcasts/b-old")
      return json(404, { ok: false, error: { code: "not_found", message: `no ${u.pathname}` } });
    const next = answers.shift();
    return next === "fail"
      ? json(500, { ok: false, error: { code: "internal", message: "down" } })
      : json(200, { ok: true, data: RUN });
  };
  return asked;
};

test("a run's link hears every answer the page reads, a Retry's among them, and stops hearing when it lets go", async () => {
  const asked = wire("fail", "ok", "ok");
  const heard = [];
  const stop = hearRunDetail("b-old", (r) => heard.push(r.ok));
  // The page's open, which fails: the landing hears it, and has nothing to land by.
  assert.equal((await runDetail("b-old")).ok, false);
  assert.deepEqual(heard, [false]);
  assert.equal(rememberedRun("b-old"), null, "a refusal names nothing");
  // The page's Retry, which reads it: the landing hears that too, rather than having read once on its own and given up.
  assert.equal((await runDetail("b-old")).ok, true);
  assert.deepEqual(heard, [false, true], "the Retry's answer reaches the link");
  assert.equal(peekRunDetail("b-old")?.ok, true, "kept for the tab, to paint at once");
  assert.equal(rememberedRun("b-old")?.name, "Autumn hours · 2026-09-01", "and remembered for its crumb");
  // Let go (the link has landed, or the page has gone): a read after it is no answer of the link's.
  stop();
  await runDetail("b-old");
  assert.deepEqual(heard, [false, true]);
  assert.equal(asked.length, 3, "each try one read of the run, none of the landing's own");
});
