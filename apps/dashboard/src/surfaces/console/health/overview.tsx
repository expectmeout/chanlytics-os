/**
 * Health's overview (decision 0068): eight parts, one tile each, judged by the platform's own targets (Kept, A look,
 * Missed, Not judged), each opening its tab; then what needs a look with its fix beside it; then the promises a day at
 * a time; then the clocks and the pager, always drawn. Every word is contracts' (healthTilesOf, healthLooksOf).
 */
import type { MouseEvent } from "react";
import {
  HEALTH_STATE_WORDS,
  healthPathOf,
  type HealthLookVM,
  type HealthScope,
  type HealthTileVM,
  type PromiseRowVM,
} from "@chanlytics/contracts";
import { LinkButton } from "../../kit/link-button/link-button";
import { Panel } from "../../kit/panel/panel";
import { StatePill } from "../../kit/pill/state-pill";
import type { Flash, Go } from "../parts";
import type { ConsoleHealth, ConsoleMe } from "../verbs";
import { ClockList, PagerList } from "./background";
import { NeedsALook } from "./looks";
import { PromiseGrid } from "./promises";

/** One part: its name and state, its number and unit, its one line, and the door to its tab. */
function Part({ t, go }: { t: HealthTileVM; go: Go }) {
  const state = HEALTH_STATE_WORDS[t.state];
  const path = healthPathOf(t.tab);
  return (
    <Panel
      variant="inset"
      size="sm"
      className="cs-h-part"
      data-state={t.state}
      data-testid={`console-health-part-${t.key}`}
    >
      <div className="cs-h-part-head">
        <LinkButton
          href={path}
          onClick={(e: MouseEvent<HTMLAnchorElement>) => {
            e.preventDefault();
            go(path);
          }}
          data-testid={`console-health-part-${t.key}-open`}
        >
          {t.title}
        </LinkButton>
        <StatePill kind="tone" value={state.tone} label={state.label} />
      </div>
      <div className="cs-h-part-value">
        <span className="cs-h-num">{t.value}</span>
        <span className="cs-h-unit">{t.unit}</span>
      </div>
      <span className="cs-h-part-line">{t.line}</span>
    </Panel>
  );
}

export function OverviewTab({
  h,
  tiles,
  looks,
  promises,
  scope,
  nowMs,
  me,
  go,
  flash,
  again,
}: {
  h: ConsoleHealth;
  tiles: readonly HealthTileVM[];
  looks: readonly HealthLookVM[];
  promises: { days: string[]; rows: PromiseRowVM[] };
  scope: HealthScope;
  nowMs: number;
  me: ConsoleMe;
  go: Go;
  flash: Flash;
  again: () => void;
}) {
  return (
    <>
      <div className="cs-h-parts" data-testid="console-health-parts">
        {tiles.map((t) => (
          <Part key={t.key} t={t} go={go} />
        ))}
      </div>
      <NeedsALook looks={looks} scope={scope} h={h} me={me} go={go} flash={flash} again={again} />
      <PromiseGrid
        grid={promises}
        read={h.day_rows !== null}
        sub={scope === "customers" ? "customers' workspaces · a cell is one UTC day" : "a cell is one UTC day"}
      />
      <div className="cs-h-two">
        <ClockList h={h} nowMs={nowMs} first={5} go={go} />
        <PagerList h={h} scope={scope} nowMs={nowMs} recentOnly />
      </div>
    </>
  );
}
