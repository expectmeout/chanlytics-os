/**
 * Settings › Notifications' grid (decision 0040): what the workspace is told about, a topic a row in its group, with
 * where each one goes as a column: email, the business's choice (locked where it is always emailed), and the member's
 * own phone where they have one. The cells are contracts' (alertGrid); the tick is Autonomy's dot (`pol-dot`), one shape
 * for "this is chosen" across Settings, a table at every width since two columns of ticks fit a phone.
 */
import {
  ALERT_PANE_WORDS as W,
  type AlertCell,
  type AlertGridGroup,
  type AlertTopic,
} from "@chanlytics/contracts/alert-pane";
import { Icon } from "../../kit/icon/icon";
import { Press } from "../../kit/press";
import { RecordTip } from "../../kit/record/field";
import { gate, showTip, type GateProps } from "../../legacy-verbs";

/** What a press of a tick asks for: the topic, its channel, and the state it asks for. */
export type PutTick = (topic: AlertTopic, channel: "email" | "phone", on: boolean) => void;

/** Why a tick cannot be pressed, said where it is pressed, as a gated act says it. */
function heldProps(why: string): GateProps {
  return { "aria-disabled": true, "data-tip": why, onClick: (e) => showTip(e.currentTarget) };
}

/** The props that hold an email tick: the role's gate, or a sentence for a config that cannot be read or no address. */
function emailHold(cell: Extract<AlertCell, { kind: "tick" }>): GateProps | null {
  if (cell.held === "role") return gate("settings", "change what the business is emailed");
  if (cell.held === "broken")
    return heldProps(
      "This workspace's settings can't be read — Chanlytics has to repair them before anything here can change",
    );
  if (cell.held === "no_address") return heldProps(W.addFirst);
  return null;
}

function Cell({
  cell,
  topic,
  channel,
  put,
  busy,
}: {
  cell: AlertCell;
  topic: AlertTopic;
  channel: "email" | "phone";
  put: PutTick;
  busy: boolean;
}) {
  // Locked, and told with no choice yet, are presses that change nothing: focusable, described, saying why when pressed,
  // as a gated act is (the one gate), never a title a keyboard or a finger cannot reach.
  if (cell.kind === "always")
    return (
      <Press className="ntf-lock" aria-label={W.always} {...heldProps(W.always)}>
        <Icon name="lock" size={11} />
      </Press>
    );
  if (cell.kind === "none")
    return (
      <span className="pol-dash" title={channel === "email" ? W.notEmailed : W.notPushed}>
        —
      </span>
    );
  if (cell.kind === "told")
    return (
      <Press className="pol-dot on ntf-told" aria-label={W.phoneTold} {...heldProps(W.phoneTold)}>
        <Icon name="check" size={11} />
      </Press>
    );
  const hold = channel === "email" ? emailHold(cell) : null;
  const held = busy ? heldProps("Saving — wait for this one to land.") : hold;
  return (
    <Press
      className={`pol-dot ${cell.on ? "on" : ""}`}
      aria-label={`${topic.title}: ${channel === "email" ? W.emailHead : W.phoneHead}`}
      aria-pressed={cell.on}
      data-testid={`ntf-${channel}-${topic.key}`}
      onClick={() => put(topic, channel, !cell.on)}
      {...(held || {})}
    >
      {cell.on ? <Icon name="check" size={11} /> : ""}
    </Press>
  );
}

/** The grid: a head saying whose each column is, then each group under its title. */
export function AlertGrid({
  groups,
  put,
  busy,
}: {
  groups: AlertGridGroup[];
  put: PutTick;
  /** The save that is out, if one is: every tick waits for it, so two presses never race (one list, one version). */
  busy: string | null;
}) {
  const phone = groups.some((g) => g.rows.some((r) => r.phone));
  return (
    <table className="ntf-grid" data-testid="ntf-grid">
      <thead>
        <tr>
          <th scope="col" className="ntf-topic-head">
            <span className="rec-sr">Alert</span>
          </th>
          <th scope="col" className="ntf-col">
            <span className="pol-mode-words">
              <span className="pol-mode-head">{W.emailHead}</span>
              <span className="pol-mode-sub">{W.emailHeadSub}</span>
            </span>
          </th>
          {phone && (
            <th scope="col" className="ntf-col">
              <span className="pol-mode-words">
                <span className="pol-mode-head">{W.phoneHead}</span>
                <span className="pol-mode-sub">{W.phoneHeadSub}</span>
              </span>
            </th>
          )}
        </tr>
      </thead>
      {groups.map((g) => (
        <tbody key={g.group} data-group={g.group} data-testid={`ntf-group-${g.group}`}>
          <tr className="ntf-group">
            <th scope="colgroup" colSpan={phone ? 3 : 2}>
              {g.title}
            </th>
          </tr>
          {g.rows.map((r) => (
            <tr key={r.topic.key} data-testid={`ntf-topic-${r.topic.key}`}>
              <th scope="row" className="ntf-topic">
                <span className="pol-label">
                  {r.topic.title}
                  <RecordTip text={r.topic.what} label={`When this is sent: ${r.topic.what}`} />
                </span>
              </th>
              <td className="ntf-cell">
                <Cell cell={r.email} topic={r.topic} channel="email" put={put} busy={busy !== null} />
              </td>
              {phone && r.phone && (
                <td className="ntf-cell">
                  <Cell cell={r.phone} topic={r.topic} channel="phone" put={put} busy={busy !== null} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      ))}
    </table>
  );
}
