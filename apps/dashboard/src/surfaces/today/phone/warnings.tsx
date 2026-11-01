/**
 * What cannot wait for the list, under the head on a desk and a phone alike (the phone canvas, 28 Oct 2026, the spec's §2;
 * on a desk since the redesign of 1 Nov 2026): a line that is down (brief.tsx TodayAlert), a reply that never reached
 * anyone (the recap's warning, the one line that must never be quiet, which Your brief said on a desk until its pane went),
 * and a warning the bell holds that stops customers being answered, with its door, two at most. The bell keeps the rest,
 * and While you were away says what the bell holds on a desk, less the warnings said here (away.tsx). Nothing at all when
 * nothing is wrong.
 */
import { Button } from "../../kit/button/button";
import { Icon } from "../../kit/icon/icon";
import { useSurface } from "../../use-surface";
import { appNavigate } from "../shell";
import { useAwayGroups, warningsUnderHead } from "../pages/away";
import { HeroBrief } from "../pages/brief";

export function TodayWarnings() {
  const vm = useSurface("today");
  const away = useAwayGroups();
  if (!vm) return null;
  const failed = (vm.recap ? vm.recap.sentences : []).filter((sn) => sn.warn && !sn.traffic);
  const warned = warningsUnderHead(away ? away.groups : []);
  if (!vm.standing.alert && !failed.length && !warned.length) return null;
  return (
    <div className="tpw" data-testid="today-warnings">
      <HeroBrief />
      {failed.map((sn, i) => (
        <div key={`sn-${i}`} className="tpw-row" data-tone="danger" data-testid="today-failed-reply">
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
            <div key={g.row.id} className="tpw-row" data-tone="warn" data-testid="today-warning">
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
