/**
 * Reports › Campaigns: Forms (00680; the Forms canvas, "Reports › Campaigns: Forms"). A part of Campaigns' report, not
 * a report of its own: for each form that was ever published, how often it was opened, its requests, the
 * conversations and visits that followed, who was new, and each place a request came through. Its own read (GET
 * reports/forms), made as the Campaigns lens is drawn; a workspace with no form draws nothing, and a read that fails
 * draws nothing rather than a number it does not have.
 */
import "./forms-line.css";
import { useEffect, useState } from "react";
import type { FormsReportDto } from "@chanlytics/contracts";
import { read } from "@/bridge/api";
import { placeBrought, resultsWords } from "../../campaigns/forms/words";
import { Panel } from "../../kit/panel/panel";
import { RptSection } from "../blocks";

/** The section's name: what it is, and over how long. */
const titleOf = (days: number) => `Forms · last ${days} days`;

/** One form: its heading, the sentence of what it brought, and each place a request came through. */
function FormBrought({ form }: { form: FormsReportDto["forms"][number] }) {
  const numbers = resultsWords({ ...form.results, days: 0 });
  return (
    <Panel variant="pane" size="sm" className="rpt-forms-one" data-testid="rpt-form">
      <h3>{form.heading}</h3>
      {numbers ? (
        <p className="rpt-forms-nums">
          {numbers.line}
          <small>{numbers.who}</small>
        </p>
      ) : (
        <p className="rpt-forms-nums" data-empty="">
          Nothing yet
        </p>
      )}
      {form.places.length > 0 ? (
        <dl className="rpt-forms-by">
          {form.places.map((place) => (
            <div key={place.place}>
              <dt>{place.place}</dt>
              <dd>{placeBrought(place)}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </Panel>
  );
}

/** The forms' line of the Campaigns lens. */
export function FormsLine() {
  const [dto, setDto] = useState<FormsReportDto | null>(null);
  useEffect(() => {
    let live = true;
    void read("GET reports/forms").then(
      (answer) => live && setDto(answer),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, []);
  if (!dto || dto.forms.length === 0) return null;
  return (
    <RptSection title={titleOf(dto.days)} testid="rpt-forms">
      <div className="rpt-forms">
        {dto.forms.map((form) => (
          <FormBrought key={form.id} form={form} />
        ))}
      </div>
    </RptSection>
  );
}
