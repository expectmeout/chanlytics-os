/**
 * What Glass puts above People and its Pipeline (the plan's step 5.4, canvases P1, P2 and D1): the date and time in the
 * business's zone, the page's name, and where it stands in one sentence. Drawn by `<Glass>` in the route, so Classic has
 * none of it, and by the kit's PageHead. The sentence is the standing line's (rail/standing.tsx, pipeline/scope-screen.tsx),
 * said in words: the same counts and the same parts, from the same rules, so no two of them say different numbers.
 */
import { knownZone } from "@/legacy-bridge/zone";
import { pageDateline, useMinute } from "../../kit/head/dateline";
import { PageHead } from "../../kit/head/page-head";
import { demoSession } from "../../legacy-verbs";
import { useSurface } from "../../use-surface";
import { P } from "../pipeline/pipe";
import { peopleSample } from "../sample";
import type { PeopleSurface } from "../surface";

interface Standing {
  total: number;
  needsYou: number;
  reachedWeek: number;
}

/** "15 people · 2 need you · 9 reached this week": a part with nothing in it is left out, as the standing line leaves it. */
function peopleSentence(agg: Standing): string {
  const parts = [`${agg.total.toLocaleString()} ${agg.total === 1 ? "person" : "people"}`];
  if (agg.needsYou > 0) parts.push(`${agg.needsYou} need you`);
  if (agg.reachedWeek > 0) parts.push(`${agg.reachedWeek} reached this week`);
  return parts.join(" · ");
}

/** The Pipeline's line, in the parts the table's own standing line draws over it: "3 proposals out · 1 waiting over a week · 2 clients". */
function pipelineSentence(people: PeopleSurface, nowMs: number, zone: string): string {
  return P.of(people.rows, people.fetchedAt || nowMs, zone, people.dealPace ?? null)
    .line.map((part) => part.words)
    .join(" · ");
}

export function PeopleHead({ scope = "people" }: { scope?: "people" | "pipeline" }) {
  const people: PeopleSurface | undefined = useSurface("people") ?? (demoSession() ? peopleSample() : undefined);
  const now = useMinute();
  const zone = knownZone() ?? "UTC";
  const sentence = !people
    ? undefined
    : scope === "pipeline"
      ? pipelineSentence(people, now, zone)
      : peopleSentence(people.aggregates);
  return (
    <PageHead
      dateline={pageDateline(now, zone)}
      title={scope === "pipeline" ? "Pipeline" : "People"}
      sentence={sentence}
    />
  );
}
