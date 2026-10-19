/**
 * Where People stands, said to the frame's head in Glass (the plan's step 5.4, canvases P1 and P3): the page's name and
 * one sentence beside it. The frame draws the head (kit/head/frame-head.tsx) with the date and time; the page says the
 * name and the sentence. The sentence is the standing line's (rail/standing.tsx), said in words: the same counts and the
 * same parts, from the same rules, so no two of them say different numbers. A person's page is its own head and says its
 * own standing (person-real.tsx). The Pipeline says its own standing, with its act (pipeline/standing.tsx).
 */
import type { ReactNode } from "react";
import { useStanding } from "../../kit/head/standing";
import { useSurface } from "../../use-surface";
import { useDemoPeople } from "../hooks/demo";
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

/**
 * People's standing, said to the frame's head as the page draws; null says nothing (the Pipeline's address, whose page
 * says its own, and a person's, whose page says its own head and its way back: person-real.tsx). The list's act (Add a
 * person, on a desk) stands at the right of the strip of scopes.
 */
export function usePeopleStanding(scope: "people" | null, act: ReactNode = null): void {
  const live = useSurface("people");
  const demo = useDemoPeople();
  const people: PeopleSurface | undefined = live ?? demo;
  const sentence = people ? peopleSentence(people.aggregates) : undefined;
  // A scope is picked in the page's own strip (People | Leads | Pipeline), so none has a way back above its name (D1).
  useStanding(scope === null ? null : { title: "People", sentence, back: null, act: act ?? undefined });
}
