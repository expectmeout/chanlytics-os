/**
 * People | Leads (| Pipeline): the one switch between this page's scopes (PRD 6.1), moved whole from
 * legacy/pages/people.jsx (decision 0015). A tablist, because they are views of one page, not pages. Drawn as the shell's
 * own tab strip (.stabs, the Inbox's and Campaigns' views: the picked one underlined in the accent) at every width: on a
 * desk a row of its own over the rail and the rows (the page's first child, clients.css), on a phone the first row of
 * the bar (PeoplePhoneBar).
 */
import { plScopes } from "../words";

export function PeopleScopeTabs({
  scope,
  onScope,
  dealsOn = false,
  testid = "people-scope",
}: {
  scope: string;
  onScope: (to: string) => void;
  dealsOn?: boolean;
  testid?: string;
}) {
  return (
    <div className="stabs stabs-people" role="tablist" aria-label="Which people" data-testid={testid}>
      {plScopes(dealsOn).map((s) => (
        <button
          key={s.id}
          type="button"
          role="tab"
          aria-selected={scope === s.id}
          className={`stabs-tab${scope === s.id ? " active" : ""}`}
          onClick={() => onScope(s.id)}
          data-testid={`scope-${s.id}`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}
