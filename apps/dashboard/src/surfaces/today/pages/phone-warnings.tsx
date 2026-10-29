/**
 * What cannot wait for the list, under a phone's head (the phone canvas, 28 Oct 2026; the spec's §2): a line that is down
 * (brief.tsx TodayAlert, as on a desk), a reply that never reached anyone (the recap's warning, which on a desk Your brief
 * says with "See the thread": the one line that must never be quiet), and a warning the bell holds (a WhatsApp number's
 * quality dropping), with its door, two at most. The bell keeps the rest: on a phone While you were away has no pane, and
 * good news is the bell's alone. Nothing at all when nothing is wrong.
 */
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { useSurface } from "../../use-surface";
import { appNavigate } from "../shell";
import { useAwayGroups } from "./away";
import { HeroBrief } from "./brief";

/**
 * A warning about a person is not said here: a customer waiting, a reply that never left, a review are Need you's, the
 * recap's failed line's or Ask found's, by their record or by their kind. What stays is about the business: a line, a
 * mailbox, a number's quality, a campaign that could not run.
 */
const ABOUT_A_PERSON = new Set(["conversation", "call", "review"]);
const PERSON_KINDS = new Set(["handoff", "deadman", "reply_held"]);

/** Two warnings at most under the head: the bell holds the rest. */
const WARNINGS_MAX = 2;

export function PhoneWarnings() {
  const vm = useSurface("today");
  const away = useAwayGroups();
  if (!vm) return null;
  const failed = (vm.recap ? vm.recap.sentences : []).filter((sn) => sn.warn && !sn.traffic);
  const warned = (away ? away.groups : [])
    .filter(
      (g) =>
        g.row.tone === "warn" &&
        !PERSON_KINDS.has(g.row.kind) &&
        !(g.row.about && ABOUT_A_PERSON.has(g.row.about.type)),
    )
    .slice(0, WARNINGS_MAX);
  if (!vm.standing.alert && !failed.length && !warned.length) return null;
  return (
    <div className="tpw" data-testid="today-phone-warnings">
      <HeroBrief />
      {failed.map((sn, i) => (
        <div key={`sn-${i}`} className="tpw-row" data-tone="danger" data-testid="today-phone-failed">
          <Icon name="alert" size={14} />
          <span className="tpw-words">{sn.text}</span>
          <Button variant="quiet" size="sm" onClick={() => appNavigate(sn.to || "inbox")}>
            See the thread
          </Button>
        </div>
      ))}
      {away &&
        warned.map((g) => {
          const act = g.row.actions && g.row.actions[0];
          return (
            <div key={g.row.id} className="tpw-row" data-tone="warn" data-testid="today-phone-warning">
              <Icon name={g.row.icon} size={14} />
              <span className="tpw-words">{g.count > 1 ? g.title : g.row.title}</span>
              {act ? (
                <Button variant="quiet" size="sm" onClick={() => away.openNote(g.row, act.to)}>
                  {act.label}
                </Button>
              ) : null}
            </div>
          );
        })}
    </div>
  );
}
