/**
 * The field data reporter (00225): Next's web-vitals hook, fed to this load's collector (field-data.ts), which
 * sends when the page is put away.
 *
 * LegacyHost loads this module once the page has loaded, as a chunk of its own, so nobody waits for it and the
 * workspace route's budget does not carry it. The hook's observers read the entries the browser buffered, so a late
 * start still reports the whole load: its first paint, its largest, its layout shifts, its slow interactions.
 *
 * One collector for the load, named for the page it landed on, and a callback that is a module function, so the
 * hook's effect registers its observers once.
 */
import { useEffect } from "react";
import { useReportWebVitals } from "next/web-vitals";
import { vitalsPageOf } from "@chanlytics/contracts";
import { hashRoute } from "../legacy-bridge/app-bridge";
import { beaconTo, createFieldData, flushWhenHidden, type FieldData } from "./field-data";

let fieldData: FieldData | null = null;

function noteVital(metric: { id: string; name: string; value: number }): void {
  fieldData?.note(metric);
}

/** `landedOn`: the address's hash as the page began, before the shell could move it. */
export default function FieldDataReporter({ landedOn }: { landedOn: string }): null {
  useEffect(() => {
    fieldData ??= createFieldData(vitalsPageOf(hashRoute(landedOn)), beaconTo(navigator));
    return flushWhenHidden(window, fieldData);
  }, [landedOn]);
  useReportWebVitals(noteVital);
  return null;
}
