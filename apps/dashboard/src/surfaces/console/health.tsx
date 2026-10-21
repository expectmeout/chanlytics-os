/**
 * Health (decision 0066; the back office's platform cards, moved as they are): whether the machinery under every
 * workspace is running, how fast the pages are, where their time goes, and each workspace's day. Read with the back
 * office's overview; changes nothing.
 */
import { useMemo } from "react";
import { backOffice } from "@/legacy-bridge/platform";
import { PageHead } from "../kit/head/page-head";
import { PlatformHealthCard, PlatformWorkCards } from "./health-cards";
import { ScreenFailed, ScreenReading, useConsoleRead } from "./parts";

const overview = async () => {
  const r = await backOffice.verbs.list();
  return r.ok ? { ok: true as const, data: r } : { ok: false as const, message: r.message, missing: false };
};

export function HealthScreen() {
  const P = useMemo(() => backOffice.verbs, []);
  const read = useConsoleRead(overview, "health");
  if (!read.data)
    return read.problem ? (
      <ScreenFailed
        what="the platform's health"
        why={read.problem}
        busy={read.busy}
        again={read.again}
        testid="console-health-failed"
      />
    ) : (
      <ScreenReading />
    );
  return (
    <div className="cs-screen" data-testid="console-health">
      <PageHead
        title="Health"
        sentence={read.data.health ? P.healthWords(read.data.health) : "The clocks could not be read just now."}
      />
      <PlatformHealthCard P={P} health={read.data.health} />
      <PlatformWorkCards P={P} vitals={read.data.vitals} problem={null} />
    </div>
  );
}
