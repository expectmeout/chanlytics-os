/**
 * Ask's morning for this member (decision 0070; contracts ask-memory/morning.ts): what Ask would do first today, as Today
 * draws it as rows of Need you (decision 0071), with what Ask noticed from the sequences and their batches (decision 0087).
 * Read where Today is drawn (ROUTE_DRAWS names it), again when what it holds has aged, and as those records move on Today.
 *
 * The morning is asked for as the member arrives: a read that finds none due for a member who may have one asks for it
 * (POST ask/morning), as the Leads page asks for its ideas once its read says they are due. The day is claimed once a
 * member a day on the server, so a second tab, a return or a read a moment later asks for nothing; the turn runs after the
 * answer, and Need you reads again while it writes.
 */
import type { AskLanguage, AskMorningDto } from "@chanlytics/contracts";
import { api, read } from "@/legacy-bridge/api";
import { readAged, type SurfaceOverride } from "@/legacy-bridge/surface-data";
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
  // A batch decided on another page or a sequence's mode changed moves what Ask noticed and the cards it stands over, so
  // they are heard on Today. The morning itself is the member's own, which the feed never tells: it is read where Today is
  // drawn, again when what it holds has aged, while Ask writes it (Need you's own wait) and after a card is pressed.
  ...declareReads("ask_morning", { reads: ["send", "campaign"], fresh: "its-page" }),
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
