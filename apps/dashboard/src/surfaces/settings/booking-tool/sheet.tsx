/**
 * The Booking tool's sheet on the page a person is on: the Business tab's own fold (business/open-bookings.tsx
 * BtBookingTool), drawn with no row under it, over the tab's one saver. Nothing here is a second editor: what it opens
 * with, refuses, saves and says is the fold's, and a save reads Settings, Today, the Calendar and Setup again as it
 * does from Settings (legacy-bridge/refresh-map.ts).
 *
 * It needs what Settings reads, which another page may not have: the workspace's record, and the Calendar's read for
 * the tool's emails. Each is asked for where it is missing, and the sheet opens once they have answered. A workspace
 * with no receptionist yet, or a configuration that could not be read, has no row to edit: the door goes to Settings,
 * which says so.
 */
import { useEffect, useRef, useState } from "react";
import { CALENDAR_SETTING_ROUTE } from "@chanlytics/contracts";
import { BUSINESS_TAB } from "@/legacy-bridge/business-tab";
import { recFolds } from "../../kit/record/registry";
import { canDo, navigate, refreshSurface } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { BtBookingTool, BOOKING_TOOL_FOLD } from "../business/open-bookings";
import type { Config } from "../business/save";
import { businessTabSave } from "../business/saver";
import { calendarNow, settingsNow } from "../business/shell";

/** The settings and the calendar read where this page has neither; true once both have answered, well or not. */
function useBookingToolReads(): boolean {
  const [read, setRead] = useState(() => !!settingsNow() && !!calendarNow());
  useEffect(() => {
    if (read) return undefined;
    let live = true;
    const ask = (key: string, has: unknown): Promise<void> => (has ? null : refreshSurface(key)) ?? Promise.resolve();
    void Promise.allSettled([ask("settings", settingsNow()), ask("calendar", calendarNow())]).then(() => {
      if (live) setRead(true);
    });
    return () => {
      live = false;
    };
  }, [read]);
  return read;
}

/** Drawn again as the tab's saver moves and as Settings is read again, as the Business tab's page is (business/tab.tsx). */
function useBookingToolDraws(): void {
  const [, setTick] = useState(0);
  const saver = businessTabSave.saver;
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    const stop = saver.subscribe(bump);
    window.addEventListener("surface:settings", bump);
    let live = true;
    // The save's own rules come with the fold, never with the page (the bridge's loadSaveRules).
    BUSINESS_TAB.loadSaveRules().then(
      () => {
        if (live) bump();
      },
      () => {},
    );
    return () => {
      live = false;
      stop();
      window.removeEventListener("surface:settings", bump);
    };
  }, [saver]);
}

export function BookingToolSheet({ onClosed, flash }: { onClosed: () => void; flash: (flash: LegacyFlash) => void }) {
  useBookingToolDraws();
  const read = useBookingToolReads();
  const settings = (read && settingsNow()) || null;
  const config = settings ? (settings.config as Config | null) : null;
  const brain = (config && config.brain) || null;
  const opened = useRef(false);
  // Read, and nothing here to edit: Settings says what stands in the row's place.
  const nowhere = read && !brain;
  useEffect(() => {
    if (!nowhere) return;
    onClosed();
    navigate(CALENDAR_SETTING_ROUTE);
  }, [nowhere, onClosed]);
  // Opened once, as the row's own act opens it: the fold under this has bound its tests by now (its effects ran first).
  useEffect(() => {
    if (!brain || opened.current) return;
    opened.current = true;
    recFolds.request(BOOKING_TOOL_FOLD);
  }, [brain]);
  // Saved, cancelled or given way to another editor: the fold is no longer the open one, and the host lets go.
  useEffect(
    () =>
      recFolds.subscribe(() => {
        if (opened.current && recFolds.open() !== BOOKING_TOOL_FOLD) onClosed();
      }),
    [onClosed],
  );
  if (!config || !brain) return null;
  return (
    <BtBookingTool
      bare
      brain={brain}
      config={config}
      canEdit={canDo("settings")}
      flash={flash}
      saver={businessTabSave.saver}
    />
  );
}
