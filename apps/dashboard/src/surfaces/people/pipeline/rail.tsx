/**
 * The Pipeline's rail (contracts pipelineRail), moved from legacy/pages/pipeline-scope.jsx (decision 0015): the rows, by
 * section, each a pick of People's rail kit. What waits on the owner counts in the warn ink (the kit's `asks`). Drawn on
 * a desk's rail and in a phone's lists sheet alike. `compact` is the phone's sheet (People's RailEmpty): a view with no
 * deal in it is said in a line, not drawn -- all deals and the one picked always are.
 */
import type { PipelineRailSection, PipelineView } from "@chanlytics/contracts";
import { RailEmpty, RailRow, RailSection, railQuiet } from "../rail/rail-kit";

export const PipelineRailRows = ({
  sections,
  view,
  onPick,
  compact = false,
}: {
  sections: readonly PipelineRailSection[];
  view: PipelineView;
  onPick: (view: PipelineView) => void;
  compact?: boolean;
}) => (
  <>
    {sections.map((s) => {
      const quiet = compact ? railQuiet(s.rows, (r) => r.view === "all" || view === r.view) : [];
      return (
        <RailSection key={s.key} label={s.label} testid={`pipeline-rail-${s.key}`}>
          {s.rows
            .filter((r) => !quiet.includes(r))
            .map((r) => (
              <RailRow
                key={r.view}
                label={r.label}
                count={r.count}
                active={view === r.view}
                onPick={() => onPick(r.view)}
                className={r.tone === "warn" ? "asks" : ""}
                testid={`pipeline-rail-row-${r.view}`}
              />
            ))}
          <RailEmpty labels={quiet.map((r) => r.label)} testid={`pipeline-rail-empty-${s.key}`} />
        </RailSection>
      );
    })}
  </>
);
