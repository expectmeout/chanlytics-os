/**
 * Ask's morning for this member (decision 0070; contracts ask-memory/morning.ts): what Ask would do first today, as Today
 * draws it in Ask for you. Read where Today is drawn (ROUTE_DRAWS names it), and again when what it holds has aged.
 *
 * The morning is asked for as the member arrives: a read that finds none due for a member who may have one asks for it
 * (POST ask/morning), as the Leads page asks for its ideas once its read says they are due. The day is claimed once a
 * member a day on the server, so a second tab, a return or a read a moment later asks for nothing; the turn runs after the
 * answer, and Ask for you reads again while it writes.
 */
import type { AskLanguage, AskMorningDto } from "@chanlytics/contracts";
import { api, read } from "@/legacy-bridge/api";
import { ON_DEMAND_STALE_MIN, readAged, type SurfaceOverride } from "@/legacy-bridge/surface-data";
import { declareReads } from "@/legacy-bridge/surface-registry";
import { setSurfaceValue, surfaceValue } from "../surface-values";

/** The member's morning, and when it was read. */
export interface AskMorningSurface {
  dto: AskMorningDto;
  fetchedAt: number;
}

/** The language the morning is answered in, from the browser's own: Spanish where it says Spanish, else English. */
const pageLanguage = (): AskLanguage => (/^es\b/i.test(navigator.language || "") ? "es" : "en");

export const askMorningOverride: SurfaceOverride = {
  key: "ask_morning",
  value: "ask_morning",
  onDemand: true,
  isStale: () => readAged(surfaceValue("ask_morning")?.fetchedAt),
  events: ["surface:ask_morning"],
  // The member's own morning: no record of the workspace's, so the feed tells it nothing. Read where Today is drawn, and
  // again when what it holds has aged, while Ask writes it (Ask for you's own wait) and after a card is pressed.
  ...declareReads("ask_morning", { reads: [], fresh: { aged: ON_DEMAND_STALE_MIN } }),
  apply: async () => {
    const got = await read("GET ask/morning");
    let dto = got.morning;
    // None yet today, for a member who may have one: asked for now. A refusal (a member who acts no more, mornings off
    // meanwhile) is the read's answer, and the next arrival asks again.
    if (dto.offered && dto.state === "none") {
      const asked = await api()("POST ask/morning", { body: { language: pageLanguage(), locale: navigator.language } });
      if (asked.ok) dto = asked.data.morning;
    }
    setSurfaceValue("ask_morning", { dto, fetchedAt: Date.now() });
  },
};
