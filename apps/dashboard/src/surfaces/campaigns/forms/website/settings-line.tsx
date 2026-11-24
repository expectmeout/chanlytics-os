/**
 * Website forms' one line in Settings › Connections (00709, decision 0148): a site's keys and the forms found on it are in
 * Campaigns › Forms now, and the line opens the website connection there.
 */
import { formsRouteOf } from "@chanlytics/contracts";
import { RecordRow } from "../../../kit/record/row";
import { navigate } from "../../../frame-verbs";
import { WEBSITE_FORM_WORDS } from "./words";

const LINE = WEBSITE_FORM_WORDS.settingsLine;

export function WebsiteFormsLine() {
  return (
    <section className="rec-card set-card set-conn" data-testid="connections-website" aria-label={LINE.label}>
      <RecordRow
        id="wf-moved"
        testid="wf-moved"
        label={LINE.label}
        value={LINE.value}
        act={{ label: LINE.open, onClick: () => navigate(formsRouteOf({ website: true })) }}
      />
    </section>
  );
}
