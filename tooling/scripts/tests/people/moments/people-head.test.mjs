/**
 * What Glass puts above People and its Pipeline (the plan's step 5.4, canvases P1, P2 and D1): the date and time in the
 * business's zone, the page's name and where it stands in one sentence, drawn by the kit's PageHead. The sentence is the
 * standing line's, in words: the same counts and the same parts, from the same rules (rail/standing.tsx, pipeline/scope-screen.tsx).
 * And it is Glass's alone: the route draws it inside `<Glass>`, so a page in Classic has no head at all, never one hidden.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { toPersonRowVM } from "@chanlytics/contracts";
import { importSrc } from "../../_source.mjs";
import { scenario } from "../../../e2e-harness/scenarios.mjs";
import { installLegacyReact, fresh, again, textOf, find } from "../../_legacy-react.mjs";

installLegacyReact({ __DEMO_MODE: false });
// The head keeps the minute on a timer (kit/head/dateline.ts), and a test that draws by hand starts none: a live interval
// would hold the process open after the last test.
globalThis.setInterval = () => 0;
globalThis.clearInterval = () => undefined;
const { setSurfaceValue } = await importSrc("apps/dashboard/src/surfaces/surface-values.ts");
const { peopleSample } = await importSrc("apps/dashboard/src/surfaces/people/sample.ts");
const { PeopleHead } = await importSrc("apps/dashboard/src/surfaces/people/page/people-head.tsx");
const { P } = await importSrc("apps/dashboard/src/surfaces/people/pipeline/pipe.ts");

const NOW = new Date("2026-09-28T20:02:00Z");
/** The head as it is drawn: its dateline, its name and its sentence, each by the class the kit's rules style it by. */
const headOf = (props) => {
  fresh();
  const tree = again(() => PeopleHead(props));
  const words = (cls) => {
    const el = find(tree, (n) => typeof n.props?.className === "string" && n.props.className.split(" ").includes(cls));
    return el ? textOf(el) : null;
  };
  return { dateline: words("pg-dateline"), title: words("pg-title"), sentence: words("pg-sentence") };
};

test("People's head says the date in the business's zone, the page's name, and the standing line's counts in words", () => {
  const surface = peopleSample(NOW);
  setSurfaceValue("people", surface);
  const head = headOf({});
  assert.equal(head.title, "People");
  assert.match(
    head.dateline,
    /^[A-Z][a-z]+day, [A-Z][a-z]+ \d{1,2} · \d{1,2}:\d{2} [AP]M$/,
    "a day and a time, in the page's words",
  );
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
  assert.equal(headOf({}).sentence, "1 person", "one person, and nothing else to say");
  setSurfaceValue("people", undefined);
  assert.equal(headOf({}).sentence, null, "before People has landed the head is the name and no sentence");
});

test("the Pipeline's head is the line over its table: every part it draws, in its order", () => {
  // The e2e harness's pipeline record: a studio that sells by proposal, with someone in every group.
  const record = scenario("pipeline", NOW.getTime());
  const rows = record.people.map((r) => toPersonRowVM(r, "America/New_York", NOW));
  const surface = { ...peopleSample(NOW), rows, dealsOn: true, fetchedAt: NOW.getTime() };
  setSurfaceValue("people", surface);
  const head = headOf({ scope: "pipeline" });
  assert.equal(head.title, "Pipeline");
  const line = P.of(rows, NOW.getTime(), "UTC", null).line.map((part) => part.words);
  assert.ok(line.length > 0, "the record has deals to say");
  assert.equal(head.sentence, line.join(" · "));
  setSurfaceValue("people", undefined);
});

test("the route draws the head inside <Glass>, and nothing of it in Classic", async () => {
  const route = (await import("node:fs")).readFileSync(
    new URL("../../../../../apps/dashboard/src/surfaces/people/people-route.tsx", import.meta.url),
    "utf8",
  );
  assert.ok(/<Glass>\s*<PeopleHead\s*\/>\s*<\/Glass>/.test(route), "People's head is Glass's");
  assert.ok(/<Glass>\s*<PeopleHead scope="pipeline"\s*\/>\s*<\/Glass>/.test(route), "and so is the Pipeline's");
  assert.ok(
    !/<PeopleHead/.test(route.replace(/<Glass>\s*<PeopleHead[^>]*\/>\s*<\/Glass>/g, "")),
    "never drawn outside it",
  );
});
