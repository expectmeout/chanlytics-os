/**
 * An ad's drawer on the real page (the Ads plan's 4.5; Ruben, 25 Nov 2026: what is which, in parts with a hairline between,
 * and no more). Under its name, where it stands. Then what people see of it and where it shows; what it spent of its total
 * over its days, Meta's own words where Meta will not run it, and its numbers in compact rows, Chanlytics' and Meta's,
 * each labelled as whose it is (decision 0049, call 3); then the people it brought or who commented. At its foot the one
 * thing its owner can do here: Pause, always; turn it back on only where Meta holds a total and an end date for it alone,
 * as a question that names the most it can cost; otherwise a door into Meta. An ad made here also says its one sentence,
 * whose total, last day and miles its owner taps to change (change-sentence.tsx), with End; one Meta turned down offers
 * Fix it, and a door to ask Meta to look again. Every sentence is the model's (model.ts, change-model.ts).
 */
import type { ReactNode } from "react";
import { personTabRoute } from "@chanlytics/contracts";
import { Button } from "../../../kit/button/button";
import { Figure } from "../../../kit/figure/figure";
import { Icon } from "../../../kit/icon/icon";
import { LinkButton } from "../../../kit/link-button/link-button";
import { ListRow } from "../../../kit/list-row/list-row";
import { Meter } from "../../../kit/meter/meter";
import { Sheet } from "../../../kit/sheet/sheet";
import { cx } from "../../../kit/variants";
import { gate, routeDoor } from "../../../frame-verbs";
import { GATE } from "../model/words";
import { dayOfIso } from "../model/vm-base";
import { dayWord } from "../model/words";
import { ChangeSentence, EndAd } from "./change-sentence";
import { FIX } from "./change-words";
import type { FigureVM, SheetVM } from "./model";
import type { AdChangeActs } from "./use-change";
import { useAdPeople } from "./use-live";
import { ADS_MANAGER, META_TAB, SHEET } from "./words";
import { WorthLine } from "./worth-line";

/**
 * One half of an ad's numbers, labelled as whose it is (decision 0049, call 3: never one number made of both): the kit's
 * compact figures side by side, as the page's own top draws them, and what is said of them under the row.
 */
function Figures(props: { label: string; figures: FigureVM[]; after?: ReactNode; testid: string }) {
  const { label, figures, after, testid } = props;
  if (figures.length === 0) return null;
  return (
    <section className="ads-live-figures" aria-label={label} data-testid={testid}>
      <b>{label}</b>
      {/* Numbers to read, not to press: plain figures in a row, with no box that looks like a button. */}
      <dl className="ads-live-nums">
        {figures.map((figure) => (
          <Figure key={figure.label} look="compact" label={figure.label} value={figure.value} />
        ))}
      </dl>
      {after}
    </section>
  );
}

/**
 * What people see of the ad, first (Ruben, 25 Nov 2026: "when i click on an ad i dont see the creative"): the business's own
 * picture large; Meta's small one of an ad made in Meta beside its words, as the ad reads.
 */
function Seen({ vm }: { vm: SheetVM }) {
  const { picture, small, words } = vm.seen;
  return (
    <div className="ads-seen" data-small={(picture && small) || undefined} data-testid="ads-live-seen">
      {picture ? <img className="ads-seen-picture" src={picture} alt={vm.name} /> : null}
      <div className="ads-seen-said">
        {words ? <p className="ads-seen-words">{words}</p> : null}
        {/* Where it shows, and what a tap opens where that is a place of its own. */}
        <p className="ads-seen-where" data-testid="ads-live-where">
          {vm.where}
        </p>
        {/* The post itself, as people see it, where the ad runs one: one press away, in a tab of its own. */}
        {vm.postUrl ? (
          <LinkButton href={vm.postUrl} {...META_TAB} data-testid="ads-live-post">
            {SHEET.seeOnInstagram} <Icon name="external" size={12} />
          </LinkButton>
        ) : null}
      </div>
    </div>
  );
}

/** Who commented on the ad (00719): a row each, the latest first, each opening their page. */
function Commenters({ vm, timezone, onGo }: { vm: SheetVM; timezone: string; onGo: (route: string) => void }) {
  const { commenters } = vm;
  if (!commenters) return null;
  return (
    <section className="ads-live-figures" aria-label={SHEET.commented} data-testid="ads-live-commenters">
      <b>
        {SHEET.commented} <span className="tabular">{commenters.count}</span>
      </b>
      <ul className="ads-live-people">
        {commenters.people.map((person) => (
          <li key={person.id}>
            <ListRow
              face={{ person: { name: person.name }, size: "sm" }}
              {...routeDoor(personTabRoute(person.id, "overview"), onGo)}
              name={person.name}
              said={dayWord(dayOfIso(person.at, timezone))}
              className="ads-live-person"
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/** What its total has spent, over its bar, and its days beside it. */
function Money({ vm }: { vm: SheetVM }) {
  if (!vm.spent && !vm.days) return null;
  return (
    <div className="ads-live-money" data-testid="ads-live-money">
      <p className="ads-live-money-said">
        {vm.spent ? <b>{vm.spent.said}</b> : null}
        {vm.days ? <span>{vm.days}</span> : null}
      </p>
      {vm.spent ? (
        <Meter
          size="sm"
          parts={[
            { share: vm.spent.share, tone: "ink" },
            { share: 1 - vm.spent.share, tone: "ground" },
          ]}
          aria-label={vm.spent.said}
        />
      ) : null}
    </div>
  );
}

/**
 * Where the ad stands, under its name, as its row says it: the dot and the word in its tone, then the rest of the line,
 * quiet. A span: the sheet's head line it stands in is a paragraph of its own.
 */
function StateLine({ vm }: { vm: SheetVM }) {
  return (
    <span className="ads-live-state" data-testid="ads-live-sheet-line">
      <span className="ads-dot" data-state={vm.tone} aria-hidden="true" />
      <span className="ads-state-word" data-tone={vm.tone}>
        {vm.state}
      </span>
      {vm.facts ? <span className="ads-live-state-facts">· {vm.facts}</span> : null}
    </span>
  );
}

/**
 * Meta's count beside the messages that reached Chanlytics (the tracking plan's T2): a quiet line, and when the two part
 * a calm box that says what it means: nothing for the owner to do.
 */
function ChatsKept({ chats }: { chats: SheetVM["chats"] }) {
  if (!chats) return null;
  if (!chats.parted)
    return (
      <p className="ads-conn-says" data-testid="ads-live-chats">
        {chats.line}
      </p>
    );
  return (
    <div className="ads-conn-need" data-tone="calm" data-testid="ads-live-chats">
      <b>{chats.line}</b>
      <span>{chats.parted}</span>
    </div>
  );
}

/**
 * The people an ad brought: a row each, with their face, the day they first wrote and whether they booked, which opens
 * their page; fifty at a time.
 */
function People({ adId, timezone, onGo }: { adId: string; timezone: string; onGo: (route: string) => void }) {
  const list = useAdPeople(adId);
  return (
    <section className="ads-live-figures" aria-label={SHEET.people} data-testid="ads-live-people">
      <b>{SHEET.people}</b>
      {list.state === "read" && list.people.length === 0 ? <p className="ads-conn-says">{SHEET.nobody}</p> : null}
      {list.people.length > 0 ? (
        <ul className="ads-live-people">
          {list.people.map((person) => (
            <li key={person.id}>
              <ListRow
                face={{ person: { name: person.name }, size: "sm" }}
                {...routeDoor(personTabRoute(person.id, "overview"), onGo)}
                name={person.name}
                said={dayWord(dayOfIso(person.first_at, timezone))}
                end={(place) =>
                  person.booked ? <span className={cx(place, "ads-live-booked")}>{SHEET.bookedMark}</span> : null
                }
                className="ads-live-person"
              />
            </li>
          ))}
        </ul>
      ) : null}
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
  /** Cancel an ad made here while it is set up. */
  cancel: (id: string) => void;
  /** A press is on its way: the foot waits. */
  busy: boolean;
}

/** The foot's door into Meta, where the ad is changed there: its words, by why (the drawer's one act, across the foot). */
const META_DOOR: Partial<Record<SheetVM["foot"]["kind"], string>> = {
  "in-meta": SHEET.inMeta,
  left: SHEET.openMeta,
  meta: SHEET.openInMeta,
};

function footOf(vm: SheetVM, acts: SheetActs, onClose: () => void): ReactNode {
  const { foot } = vm;
  const door = META_DOOR[foot.kind];
  if (door)
    return (
      <Button
        variant="secondary"
        href={vm.metaPage}
        {...META_TAB}
        className="ads-live-door"
        data-testid={`ads-live-${foot.kind}`}
      >
        {door} <Icon name="external" size={13} />
      </Button>
    );
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
  if (foot.kind === "cancel")
    return (
      <Button
        variant="danger"
        disabled={acts.busy}
        onClick={() => acts.cancel(vm.id)}
        data-testid="ads-live-cancel"
        {...gate("approve", GATE.change)}
      >
        {SHEET.cancel}
      </Button>
    );
  return null;
}

/** The words above the foot's press: what it will do, or why there is none. */
function Above({ vm }: { vm: SheetVM }) {
  const { foot } = vm;
  if (foot.kind === "pause" || foot.kind === "fix" || foot.kind === "cancel")
    return <p className="ads-conn-says">{foot.body}</p>;
  if (foot.kind === "check" || foot.kind === "left")
    return (
      <div className="ads-conn-need" data-tone="warn" data-testid="ads-live-launch">
        <span>{foot.line}</span>
      </div>
    );
  if (foot.kind === "resume" || foot.kind === "in-meta" || foot.kind === "held")
    return (
      <div className="ads-conn-need" data-tone="calm" data-testid="ads-live-ask">
        <b>{foot.kind === "resume" ? foot.ask : foot.head}</b>
        <span>{foot.body}</span>
      </div>
    );
  return foot.line ? <p className="ads-conn-says">{foot.line}</p> : null;
}

/** The piece of Content the ad was made from (Campaigns in three tabs): one press back to it in Made, or that it is gone. */
function MadeFrom({ from, onGo }: { from: NonNullable<SheetVM["from"]>; onGo: (route: string) => void }) {
  const { name, route } = from;
  return (
    <p className="ads-conn-says" data-testid="ads-live-from">
      {SHEET.madeFrom}{" "}
      {name !== null && route !== null ? (
        <LinkButton onClick={() => onGo(route)} data-testid="ads-live-from-piece">
          {name}
        </LinkButton>
      ) : (
        <span>{SHEET.fromGone}</span>
      )}
    </p>
  );
}

interface AdSheetProps {
  vm: SheetVM | null;
  timezone: string;
  acts: SheetActs;
  onClose: () => void;
  onGo: (route: string) => void;
}

/**
 * The drawer, as tall as what it holds (Ruben, 25 Nov 2026: an ad opened at the whole screen stood half empty over its
 * one act): its foot right under what it says, on a phone as on a desk.
 */
export function AdSheet({ vm, timezone, acts, onClose, onGo }: AdSheetProps) {
  return (
    <Sheet
      open={vm !== null}
      onClose={onClose}
      title={vm?.name ?? ""}
      sub={vm ? <StateLine vm={vm} /> : undefined}
      close={{ label: "Close", glyph: <Icon name="x" size={13} /> }}
      foot={vm ? footOf(vm, acts, onClose) : null}
      flatFoot
      fit
      testid="ads-live-sheet"
    >
      {vm ? (
        <div className="ads-conn ads-ad-view">
          {/* What people see of it, and where. */}
          <div className="ads-ad-part">
            <Seen vm={vm} />
          </div>
          {/* What it spent of its total, over its days, and what changes it or stops it. */}
          <div className="ads-ad-part">
            <Money vm={vm} />
            {vm.from ? <MadeFrom from={vm.from} onGo={onGo} /> : null}
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
            <Figures
              label={SHEET.ours}
              figures={vm.ours}
              testid="ads-live-ours"
              after={
                <>
                  {vm.back ? (
                    <p className="ads-conn-says" data-testid="ads-live-back">
                      {vm.back}
                    </p>
                  ) : null}
                  <WorthLine worth={vm.worth} className="ads-conn-says" testid="ads-live-worth" onGo={onGo} />
                </>
              }
            />
            <Figures
              label={vm.theirsLabel}
              figures={vm.theirs}
              testid="ads-live-theirs"
              after={<ChatsKept chats={vm.chats} />}
            />
          </div>
          {/* Who it brought, or who commented on it, where anyone did; then what its foot does. */}
          {vm.commenters || vm.counted ? (
            <div className="ads-ad-part">
              <Commenters vm={vm} timezone={timezone} onGo={onGo} />
              {vm.counted ? <People adId={vm.id} timezone={timezone} onGo={onGo} /> : null}
            </div>
          ) : null}
          <Above vm={vm} />
          {vm.ends ? <EndAd name={vm.name} busy={acts.busy || acts.changing} onEnd={() => acts.end(vm.id)} /> : null}
        </div>
      ) : null}
    </Sheet>
  );
}
