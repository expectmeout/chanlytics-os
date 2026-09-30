/**
 * What People and its Pipeline say to the frame's head in Glass (the plan's step 5.4, canvases P1, P2 and D1): the page's
 * name and where it stands in one sentence. The frame draws the head (kit/head/frame-head.tsx, with the date and time in
 * the business's zone); the page says the name and the sentence through the standing store (kit/head/standing.ts). The
 * sentence is the standing line's, in words: the same counts and the same parts, from the same rules (rail/standing.tsx,
 * pipeline/scope-screen.tsx). A person's page says nothing: the frame names it from the crumbs, with the way back.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toPersonRowVM } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";
import { scenario } from "../../../e2e-harness/scenarios.mjs";
import { installLegacyReact, fresh, again } from "../../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false });
// The standing keeps the minute on a timer (kit/head/dateline.ts), and a test that draws by hand starts none: a live
// interval would hold the process open after the last test.
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => undefined;
const { setSurfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
const { peopleSample } = await importSrc("apps/dashboard/src/surfaces/people/sample.ts");
const { usePeopleStanding } = await importSrc("apps/dashboard/src/surfaces/people/page/people-head.tsx");
const { standingSaid, forgetStanding } = await importSrc("apps/dashboard/src/surfaces/kit/head/standing.ts");
const { P } = await importSrc("apps/dashboard/src/surfaces/people/pipeline/pipe.ts");

const NOW = new Date("2026-09-28T20:02:00Z");
/** A page that says its standing as People's route does, and what the frame's head then reads: the name and the sentence. */
const Page = ({ scope }) => {
  usePeopleStanding(scope);
  return null;
};
const headOf = (scope) => {
  forgetStanding();
  fresh();
  again(() => Page({ scope }));
  const said = standingSaid();
  return said ? { title: said.title, sentence: said.sentence ?? null } : null;
};

test("People says its name and the standing line's counts in words to the frame's head", () => {
  const surface = peopleSample(NOW);
  setSurfaceValue("people", surface);
  const head = headOf("people");
  assert.equal(head.title, "People");
  const agg = surface.aggregates;
  const expected = [
    `${agg.total} ${agg.total === 1 ? "person" : "people"}`,
    ...(agg.needsYou > 0 ? [`${agg.needsYou} need you`] : []),
    ...(agg.reachedWeek > 0 ? [`${agg.reachedWeek} reached this week`] : []),
  ].join(" · ");
  assert.equal(
    head.sentence,
    expected,
    "the counts of the line the table has over it, in the same order, a part with nothing left out",
  );
  setSurfaceValue("people", { ...surface, aggregates: { total: 1, needsYou: 0, reachedWeek: 0 } });
  assert.equal(headOf("people").sentence, "1 person", "one person, and nothing else to say");
  setSurfaceValue("people", undefined);
  assert.equal(headOf("people").sentence, null, "before People has landed the head is the name and no sentence");
});

test("the Pipeline's head is the line over its table: every part it draws, in its order", () => {
  // The e2e harness's pipeline record: a studio that sells by proposal, with someone in every group.
  const record = scenario("pipeline", NOW.getTime());
  const rows = record.people.map((r) => toPersonRowVM(r, "America/New_York", NOW));
  const surface = { ...peopleSample(NOW), rows, dealsOn: true, fetchedAt: NOW.getTime() };
  setSurfaceValue("people", surface);
  const head = headOf("pipeline");
  assert.equal(head.title, "Pipeline");
  const line = P.of(rows, NOW.getTime(), "UTC", null).line.map((part) => part.words);
  assert.ok(line.length > 0, "the record has deals to say");
  assert.equal(head.sentence, line.join(" · "));
  setSurfaceValue("people", undefined);
});

test("a person's page says nothing: the frame names it from the crumbs, with the way back to People", () => {
  setSurfaceValue("people", peopleSample(NOW));
  assert.equal(headOf(null), null, "no standing said");
  setSurfaceValue("people", undefined);
});

test("the route says the standing once, from its address: a person's page none, the Pipeline its own, else People's", async () => {
  const route = (await import("node:fs")).readFileSync(
    new URL("../../../../../apps/dashboard/src/surfaces/people/people-route.tsx", import.meta.url),
    "utf8",
  );
  assert.match(
    route,
    /usePeopleStanding\(person \? null : pipeline \? "pipeline" : "people"\)/,
    "one call, keyed by the address",
  );
  assert.equal(route.match(/usePeopleStanding\(/g).length, 1, "and only the one");
  assert.ok(!/<PeopleHead|<Glass>/.test(route), "the page draws no head of its own; the frame's is the head");
});
