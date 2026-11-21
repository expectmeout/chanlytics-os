/**
 * An ad's drawer on the real page (the Ads plan's 4.5): where it stands, that it was made in Meta where it was,
 * Meta's own words where Meta will not run it, Chanlytics' count beside Meta's numbers, each labelled as whose it is,
 * the people it brought, and at its foot the one thing its owner can do here: Pause, always; turn it back on only
 * where Meta holds a total and an end date for it alone, as a question that names the most it can cost; otherwise a
 * door into Meta. An ad made here also says its one sentence, whose total, last day and miles its owner taps to change
 * (change-sentence.tsx), with End; one Meta turned down offers Fix it, and a door to ask Meta to look again. Every
 * sentence is the model's (model.ts, change-model.ts).
 */
import type { ReactNode } from "react";
import { personTabRoute } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { Sheet } from "../../../kit/sheet/sheet";
import { gate, routeDoor } from "../../../frame-verbs";
import { GATE } from "../model/words";
import { dayOfIso } from "../model/vm-base";
import { dayWord } from "../model/words";
import { ChangeSentence, EndAd } from "./change-sentence";
import { FIX } from "./change-words";
import type { FigureVM, SheetVM } from "./model";
import type { AdChangeActs } from "./use-change";
import { useAdPeople } from "./use-live";
import { ADS_MANAGER, SHEET } from "./words";

const META_TAB = { target: "_blank", rel: "noopener noreferrer" } as const;

function Figures({ label, figures, note }: { label: string; figures: FigureVM[]; note?: string }) {
  if (figures.length === 0) return null;
  return (
    <section className="ads-live-figures" aria-label={label}>
      <b>{label}</b>
      <dl className="ads-conn-facts">
        {figures.map((figure) => (
          <div key={figure.label}>
            <dt>{figure.label}</dt>
            <dd className="tabular">{figure.value}</dd>
          </div>
        ))}
      </dl>
      {note ? <p className="ads-conn-says">{note}</p> : null}
    </section>
  );
}

/** The people an ad brought: each opens their page; fifty at a time. */
function People({ adId, timezone, onGo }: { adId: string; timezone: string; onGo: (route: string) => void }) {
  const list = useAdPeople(adId);
  return (
    <section className="ads-live-figures" aria-label={SHEET.people} data-testid="ads-live-people">
      <b>{SHEET.people}</b>
      {list.state === "read" && list.people.length === 0 ? <p className="ads-conn-says">{SHEET.nobody}</p> : null}
      <ul className="ads-live-people">
        {list.people.map((person) => (
          <li key={person.id}>
            <LinkButton {...routeDoor(personTabRoute(person.id, "overview"), onGo)} size="inherit">
              {person.name}
            </LinkButton>
            <span className="ads-live-when">{dayWord(dayOfIso(person.first_at, timezone))}</span>
            {person.booked ? <span className="ads-live-booked">{SHEET.bookedMark}</span> : null}
          </li>
        ))}
      </ul>
      {list.state === "failed" ? (
        <LinkButton onClick={list.next} data-testid="ads-live-people-again">
          {SHEET.peopleFailed}
        </LinkButton>
      ) : null}
      {list.state === "read" && list.more ? (
        <LinkButton onClick={list.next} data-testid="ads-live-people-more">
          {SHEET.more}
        </LinkButton>
      ) : null}
    </section>
  );
}

/** What the drawer's presses do: each carries the version the drawer was drawn from. */
export interface SheetActs extends AdChangeActs {
  pause: (id: string, version: number) => void;
  resume: (id: string, version: number) => void;
  /** Ask Meta what stands of an ad whose last switch it never answered. */
  check: (id: string, version: number) => void;
  /** A press is on its way: the foot waits. */
  busy: boolean;
}

function footOf(vm: SheetVM, acts: SheetActs, onClose: () => void): ReactNode {
  const { foot } = vm;
  if (foot.kind === "pause")
    return (
      <Button
        variant="primary"
        disabled={acts.busy}
        onClick={() => acts.pause(vm.id, vm.version)}
        data-testid="ads-live-pause"
        {...gate("approve", GATE.change)}
      >
        {SHEET.pause}
      </Button>
    );
  if (foot.kind === "resume")
    return (
      <>
        <Button
          variant="primary"
          disabled={acts.busy}
          onClick={() => acts.resume(vm.id, vm.version)}
          data-testid="ads-live-resume"
          {...gate("approve", GATE.change)}
        >
          {foot.press}
        </Button>
        <Button variant="quiet" onClick={onClose} data-testid="ads-live-keep">
          {SHEET.keepPaused}
        </Button>
      </>
    );
  if (foot.kind === "in-meta")
    return (
      <LinkButton href={ADS_MANAGER} {...META_TAB} data-testid="ads-live-in-meta">
        {SHEET.inMeta} <Icon name="chevron" size={12} />
      </LinkButton>
    );
  if (foot.kind === "check")
    return (
      <Button
        variant="primary"
        disabled={acts.busy}
        onClick={() => acts.check(vm.id, vm.version)}
        data-testid="ads-live-check"
        {...gate("approve", GATE.change)}
      >
        {SHEET.check}
      </Button>
    );
  if (foot.kind === "fix")
    return (
      <>
        <Button
          variant="primary"
          disabled={acts.busy || acts.fixing}
          onClick={() => acts.fix(vm.id)}
          data-testid="ads-live-fix"
          {...gate("approve", GATE.change)}
        >
          {acts.fixing ? FIX.writing : FIX.press}
        </Button>
        <LinkButton href={ADS_MANAGER} {...META_TAB} data-testid="ads-live-look-again">
          {FIX.again} <Icon name="chevron" size={12} />
        </LinkButton>
      </>
    );
  if (foot.kind === "left")
    return (
      <LinkButton href={ADS_MANAGER} {...META_TAB} data-testid="ads-live-left">
        {SHEET.openMeta} <Icon name="chevron" size={12} />
      </LinkButton>
    );
  return null;
}

/** The words above the foot's press: what it will do, or why there is none. */
function Above({ vm }: { vm: SheetVM }) {
  const { foot } = vm;
  if (foot.kind === "pause" || foot.kind === "fix") return <p className="ads-conn-says">{foot.body}</p>;
  if (foot.kind === "check" || foot.kind === "left")
    return (
      <div className="ads-conn-need" data-tone="warn" data-testid="ads-live-launch">
        <span>{foot.line}</span>
      </div>
    );
  if (foot.kind === "resume" || foot.kind === "in-meta")
    return (
      <div className="ads-conn-need" data-tone="calm" data-testid="ads-live-ask">
        <b>{foot.kind === "resume" ? foot.ask : foot.head}</b>
        <span>{foot.body}</span>
      </div>
    );
  return foot.line ? <p className="ads-conn-says">{foot.line}</p> : null;
}

interface AdSheetProps {
  vm: SheetVM | null;
  timezone: string;
  acts: SheetActs;
  onClose: () => void;
  onGo: (route: string) => void;
}

export function AdSheet({ vm, timezone, acts, onClose, onGo }: AdSheetProps) {
  return (
    <Sheet
      open={vm !== null}
      onClose={onClose}
      title={vm?.name ?? ""}
      sub={vm?.over}
      close={{ label: "Close", glyph: <Icon name="x" size={13} /> }}
      foot={vm ? footOf(vm, acts, onClose) : null}
      flatFoot
      fit
      testid="ads-live-sheet"
    >
      {vm ? (
        <div className="ads-conn ads-conn-open ads-live-sheet">
          <p className="ads-conn-says" data-strong="true" data-testid="ads-live-sheet-line">
            {vm.line}
          </p>
          {vm.made ? <p className="ads-conn-says">{vm.made}</p> : null}
          {vm.change ? (
            <ChangeSentence
              key={`${vm.id}:${vm.version}`}
              vm={vm.change}
              timezone={timezone}
              busy={acts.busy || acts.changing}
              onChange={(ask, back) => acts.change(vm.id, ask, back)}
            />
          ) : null}
          {vm.reason ? (
            <div className="ads-conn-need" data-tone="warn" data-testid="ads-live-reason">
              <b>{vm.reason.label}</b>
              <span>“{vm.reason.words}”</span>
              {vm.reason.note ? <span>{vm.reason.note}</span> : null}
            </div>
          ) : null}
          <Figures label={SHEET.ours} figures={vm.ours} />
          <Figures label={SHEET.theirs} figures={vm.theirs} note={SHEET.theirsNote} />
          {vm.counted ? <People adId={vm.id} timezone={timezone} onGo={onGo} /> : null}
          <Above vm={vm} />
          {vm.ends ? <EndAd name={vm.name} busy={acts.busy || acts.changing} onEnd={() => acts.end(vm.id)} /> : null}
        </div>
      ) : null}
    </Sheet>
  );
}
