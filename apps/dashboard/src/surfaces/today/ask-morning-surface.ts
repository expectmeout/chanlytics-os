/**
 * Ask's morning for this member (decision 0070; contracts ask/memory/morning.ts): what Ask would do first today, as Today
 * draws it as rows of Need you (decision 0071), with what Ask noticed from the sequences and their batches (decision 0087).
 * Read where Today is drawn (ROUTE_DRAWS names it), again when what it holds has aged, and as those records move on Today.
 *
 * The morning is asked for as the member arrives: a read that finds none due for a member who may have one asks for it
 * (POST ask/morning), as the Leads page asks for its ideas once its read says they are due. The day is claimed once a
 * member a day on the server, so a second tab, a return or a read a moment later asks for nothing; the turn runs after the
 * answer, and Need you reads again while it writes.
 *
 * Read on another page too, ahead of a press to Today (first-draw-read.ts readTodaySoon), since Today's first draw waits
 * for this read: read only as Today was reached, it held a press 0.5 to 2.2 s on production (the phone re-measure of 16 Nov
 * 2026). There it never asks: a morning due is kept as Today draws it while it is being asked for, and read again as Today
 * is reached (`isStale`), which asks for it there.
 */
import type { AskLanguage, AskMorningDto } from "@chanlytics/contracts";
import { api, read } from "@/bridge/api";
import { readAged, type SurfaceOverride } from "@/bridge/surface-data";
import { declareReads } from "@/bridge/surface-registry";
import { setSurfaceValue, surfaceValue } from "../surface-values";
import { todayOnScreen } from "./setup-card-code";

/** The member's morning, and when it was read. */
export interface AskMorningSurface {
  dto: AskMorningDto;
  fetchedAt: number;
  /**
   * Ask has been asked to write it (POST ask/morning) and has not answered yet, or a morning due was read off Today and is
   * asked for as Today is reached: Ask found holds its ideas' place.
   */
  asking?: boolean;
}

/** The ask for today's morning while it is out: one at a time, so a read again meanwhile asks for nothing. */
let askingNow: Promise<void> | null = null;
/** A morning due, read off Today: Today's to ask for, so it is read again as Today is reached (`isStale`). */
let dueOffToday = false;

/** The language the morning is answered in, from the browser's own: Spanish where it says Spanish, else English. */
const pageLanguage = (): AskLanguage => (/^es\b/i.test(navigator.language || "") ? "es" : "en");

export const askMorningOverride: SurfaceOverride = {
  key: "ask_morning",
  value: "ask_morning",
  onDemand: true,
  isStale: () => dueOffToday || readAged(surfaceValue("ask_morning")?.fetchedAt),
  events: ["surface:ask_morning"],
  // A batch decided on another page or a sequence's mode changed moves what Ask noticed and the cards it stands over, so
  // they are heard on Today. The morning itself is the member's own, which the feed never tells: it is read where Today is
  // drawn, again when what it holds has aged, while Ask writes it (Need you's own wait) and after a card is pressed.
  ...declareReads("ask_morning", { reads: ["send", "campaign"], fresh: "its-page" }),
  apply: async () => {
    const got = await read("GET ask/morning");
    const dto = got.morning;
    // None yet today, for a member who may have one: asked for now, on Today; read off Today, as Today is reached. A refusal
    // (a member who acts no more, mornings off meanwhile) is the read's answer, and the next arrival asks again. The morning as read is Today's at once, and the ask
    // goes on behind it: Today's first draw waits for this read (ROUTE_WAITS), and never for the ask (13 Nov 2026), whose
    // answer is the morning it starts writing.
    const due = dto.offered && dto.state === "none";
    const asks = due && todayOnScreen();
    dueOffToday = due && !asks;
    setSurfaceValue("ask_morning", { dto, fetchedAt: Date.now(), asking: due || !!askingNow });
    if (asks && !askingNow) askingNow = askForMorning(dto).finally(() => (askingNow = null));
  },
};

/** Ask's morning, asked to be written; the morning it answers is the surface's, else the morning as read, asked no more. */
async function askForMorning(read: AskMorningDto): Promise<void> {
  const asked = await api()("POST ask/morning", {
    body: { language: pageLanguage(), locale: navigator.language },
  }).catch(() => null);
  setSurfaceValue("ask_morning", { dto: asked?.ok ? asked.data.morning : read, fetchedAt: Date.now(), asking: false });
  // Past the read, so said as the read says it: what draws the morning hears it (surface-status hearSurfaces).
  window.dispatchEvent(new CustomEvent("surface:ask_morning"));
}
