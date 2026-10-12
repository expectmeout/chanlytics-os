/**
 * The foot of an ad's drawer (MOCKUP): a question where one stands (End it? Update the ad? Remove what was made? Discard what
 * you changed?), else Edit's pair (Cancel | Save, over a line saying what the changes do, and a raise naming its most), else
 * the ad's own presses: Pause | Edit, Resume | Edit, Run it again, or only Pause and Resume for an ad the owner made on the
 * platform itself. Nothing at all while an ad is being made.
 */
import type { FootAct } from "@chanlytics/contracts/ads-page";
import { DRAWER, GATE } from "@chanlytics/contracts/ads-page";
import { Button } from "../../../kit/button/button";
import { Confirm } from "../../../kit/confirm/confirm";
import { Icon } from "../../../kit/icon/icon";
import { UnsavedAsk } from "../../../kit/record/work";
import { gate } from "../../../legacy-verbs";
import type { Pane } from "./use-pane";

/** Whether the foot has anything to say or press. */
export const hasFoot = (pane: Pane): boolean => pane.asking !== null || pane.editing || pane.vm.foot.length > 0;

/** In Edit: what the changes will do, then Cancel | Save changes (or Save · raise to $900). */
function EditFoot({ pane }: { pane: Pane }) {
  const n = pane.changed.size;
  const foot = pane.editFoot;
  return (
    <div className="ads-foot" data-foot-pair="">
      <span className="ads-foot-say" data-testid="ads-foot-say">
        {foot ? foot.say : ""}
      </span>
      <Button className="ads-act" onClick={pane.close} data-testid="ads-cancel">
        {DRAWER.foot.cancel}
      </Button>
      <Button
        variant="primary"
        className="ads-act"
        disabled={n === 0}
        onClick={pane.edit.save}
        {...gate("approve", GATE.change)}
        data-testid="ads-save"
      >
        {foot ? foot.save : DRAWER.foot.save}
      </Button>
    </div>
  );
}

/** One of the ad's own presses. Resume is the filled act while it is paused. */
function FootPress({ act, pane }: { act: FootAct; pane: Pane }) {
  const { running } = pane;
  switch (act) {
    case "again":
      return (
        <Button
          variant="primary"
          className="ads-act"
          onClick={pane.again}
          {...gate("approve", GATE.again)}
          data-testid="ads-again"
        >
          <Icon name="repeat" size={12} /> {DRAWER.foot.again}
        </Button>
      );
    case "edit":
      return (
        <Button className="ads-act" onClick={pane.edit.start} data-testid="ads-edit-press">
          <Icon name="pencil" size={12} /> {DRAWER.foot.edit}
        </Button>
      );
    case "resume":
      return (
        <Button
          variant="primary"
          className="ads-act"
          onClick={running.resume}
          {...gate("approve", GATE.resume)}
          data-testid="ads-pause"
        >
          <Icon name="play" size={12} /> {DRAWER.foot.resume}
        </Button>
      );
    default:
      return (
        <Button className="ads-act" onClick={running.pause} {...gate("approve", GATE.pause)} data-testid="ads-pause">
          <Icon name="pause" size={12} /> {DRAWER.foot.pause}
        </Button>
      );
  }
}

/** Pause | Edit, an equal pair; Resume is the filled act while it is paused; an ended ad can only be run again. */
function RunFoot({ pane }: { pane: Pane }) {
  return (
    <div className="ads-foot" data-foot-pair="">
      {pane.vm.foot.map((act) => (
        <FootPress key={act} act={act} pane={pane} />
      ))}
    </div>
  );
}

/** The question standing in the foot, or null where none does. */
function Question({ pane }: { pane: Pane }) {
  const { vm, asking } = pane;
  if (asking === "end") {
    return (
      <Confirm
        question={vm.endConfirm}
        yes={DRAWER.menu.endPress}
        no={DRAWER.menu.keep}
        danger
        onYes={pane.running.end}
        onNo={() => pane.ask(null)}
        testid="ads-end"
      />
    );
  }
  if (asking === "update") {
    return (
      <Confirm
        question={vm.confirm.update}
        yes={DRAWER.confirm.updateYes}
        no={DRAWER.confirm.updateNo}
        onYes={pane.answer.update}
        onNo={() => pane.ask(null)}
        testid="ads-update"
      />
    );
  }
  if (asking === "remove") {
    return (
      <Confirm
        question={vm.confirm.remove}
        yes={DRAWER.confirm.removeYes}
        no={DRAWER.confirm.removeNo}
        danger
        onYes={pane.answer.remove}
        onNo={() => pane.ask(null)}
        testid="ads-remove"
      />
    );
  }
  if (asking === "discard") {
    return <UnsavedAsk onYes={pane.discard} onNo={() => pane.ask(null)} testid="ads-leave" />;
  }
  return null;
}

/** The foot: a question where one stands, else Edit's pair, else the ad's own presses. */
export function Foot({ pane }: { pane: Pane }) {
  if (pane.asking !== null) {
    return (
      <div className="ads-foot">
        <Question pane={pane} />
      </div>
    );
  }
  return pane.editing ? <EditFoot pane={pane} /> : <RunFoot pane={pane} />;
}
