/**
 * One sequence open beside the list (decision 0060, the canvas's record): its head says what it is, what starts it and who
 * approves its batches (contracts sequenceSubLine), with its one act and its More (record-acts.tsx); then at most one notice, the most pressing
 * thing that needs you (D8, contracts sequenceNotice); then the same three tabs for every sequence (D5): Steps, People
 * (Leads for a sequence to leads) and History. Each tab is an address of its own, so Back walks them.
 *
 * On a phone the record is the screen, as a person's page is (the phone review of 16 Oct 2026): its head is one glass
 * capsule (Back, its name and state, what starts it and who approves, More), the frame's bar and bell standing down; its
 * tabs are the kit's capsule of views, stuck under the head as the tab scrolls, a swipe across the tab walking them (kit
 * viewPager) and each move replacing the address, so Back is the list; a swipe right from the first carries the whole pane
 * back to the list, drawn under it as it goes (split.tsx cmGoing). A tab's read starts as a finger reaches it, so the
 * view arrives with its rows. What needs you is the dock at the foot, where a question an act asks and a step's Save
 * stand too (record-foot.ts RecordFootContext); the notice above the tabs is a desk's.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  SEQUENCES_ROUTE,
  SEQUENCE_WORDS,
  peopleTabWord,
  sequenceRoute,
  sequenceSubLine,
  sequenceStateTone,
  sequenceStateWords,
  type SequenceRecordDto,
  type SequenceTab,
} from "@chanlytics/contracts";
import { FailedRead } from "../../kit/empty/empty";
import { useSlide } from "../../kit/motion/use-slide";
import { viewDeck } from "../../kit/motion/view-deck";
import { StatePill } from "../../kit/pill/state-pill";
import { SubTabs } from "../../kit/sub-tabs/sub-tabs";
import { viewPager, type ViewPage } from "../../kit/view-tabs/pager";
import { ViewTabs } from "../../kit/view-tabs/view-tabs";
import { navigate, replaceRoute, routeDoor, touchSwipe, useLegacyToast } from "../../legacy-verbs";
import type { LegacyFlash } from "../../legacy-verbs";
import { CmPane, cmGoing, useCmPhone } from "../parts/split";
import { SequenceHistory } from "./history";
import { SequencePeople } from "./people";
import { HeadActs, RecordNotice, RecordQuestion, RenameForm, phoneFootOf, useRecordActs } from "./record-acts";
import { SequenceSteps } from "./steps";
import { RecordFootContext } from "./record-foot";
import { recordBackNow } from "./trip";
import { useSequenceRead } from "./use-record";
import { sequenceVerbs as verbs } from "./verbs";

type Flash = (flash: LegacyFlash) => void;

/** The tabs in their order: a swipe walks them so, and a tab arrives from the side it stands on. */
const TAB_ORDER: readonly SequenceTab[] = ["steps", "people", "history"];

const sequenceTabOf = (id: string): SequenceTab => TAB_ORDER.find((t) => t === id) ?? "steps";

/**
 * A sequence's tabs: Steps, People (Leads) saying who is in it, with an amber dot where something there needs you (one
 * meaning each: the number is who is in it, the dot that something waits on you), and History. People's and History's
 * reads start as a finger or a pointer reaches their tab (the strip's `warm`), so a swipe lands on their rows.
 */
function tabsOf(rec: SequenceRecordDto) {
  const row = rec.sequence;
  const warm = (read: (id: string) => Promise<unknown>) => () => void read(row.id);
  // What needs you there: an email held or for you to send, a batch waiting for an OK, a reply to answer.
  const needs = row.needs.held + row.needs.to_send + row.needs.waiting + row.needs.replies;
  return [
    { id: "steps", label: SEQUENCE_WORDS.tabs.steps, href: routeDoor(sequenceRoute(row.id)).href },
    {
      id: "people",
      label: peopleTabWord(row),
      ...(row.in_it > 0 ? { count: row.in_it } : {}),
      ...(needs > 0 ? { need: SEQUENCE_WORDS.filters.needs, hint: SEQUENCE_WORDS.filters.needs } : {}),
      href: routeDoor(sequenceRoute(row.id, "people")).href,
      warm: warm(verbs.people),
    },
    {
      id: "history",
      label: SEQUENCE_WORDS.tabs.history,
      href: routeDoor(sequenceRoute(row.id, "history")).href,
      warm: warm((id) => verbs.history(id)),
    },
  ];
}

/** The tab a swipe across walks (the kit's viewPager over the tab's view), for a touch that began in it. */
function tabPages(page: Element, from: EventTarget | null): ViewPage | null {
  const deck = page.querySelector(".sq-deck:not(.view-leaving)");
  return deck && from instanceof Node && deck.contains(from) ? viewPager(deck, from) : null;
}

/** The strip: a desk's sub-tabs; a phone's capsule of views, stuck under the head as the tab scrolls (as a person's is). */
function RecordTabs({ rec, tab, phone }: { rec: SequenceRecordDto; tab: SequenceTab; phone: boolean }) {
  const row = rec.sequence;
  const tabs = tabsOf(rec);
  // On a phone a tab move replaces the address: Back is the list, as the swipe right from Steps is, never three Backs
  // through the tabs a thumb walked. A desk's tabs are pushed, as its pages are.
  const go = (id: string) => (phone ? replaceRoute : navigate)(sequenceRoute(row.id, sequenceTabOf(id)));
  if (!phone) return <SubTabs label={row.name} value={tab} onSelect={go} tabs={tabs} />;
  return (
    <div className="sq-strip-stand" data-testid="sq-strip">
      <ViewTabs
        name="sequence"
        label={row.name}
        picked={tab}
        tabs={tabs.map((t) => ({ ...t, testid: `sq-tab-${t.id}` }))}
        onPick={go}
        fill
      />
    </div>
  );
}

/** What the tab picked holds, as a view of the record (the kit's view deck): it arrives from the side its tab stands on. */
function TabView({ tab, children }: { tab: SequenceTab; children: ReactNode }) {
  const slide = useSlide(TAB_ORDER, tab);
  return (
    <div className="sq-deck" key={tab} ref={viewDeck.view("sequence-tab")} data-slide={slide}>
      {children}
    </div>
  );
}

/**
 * A sequence read and open: keyed by its id where it is drawn, so a question asked, a name being changed or a step open
 * never carries over to the next sequence opened.
 */
function OpenRecord(p: {
  rec: SequenceRecordDto;
  tab: SequenceTab;
  flash: Flash;
  moved: () => void;
  again: number;
  toast: ReactNode;
  /** The day of History the address opens, where it names one (a run's address landed here). */
  day: string | null;
}) {
  const { rec, tab, flash, moved, again, toast, day } = p;
  const row = rec.sequence;
  const phone = useCmPhone();
  // The step open to be changed, held here so the dock's Edit step N opens it (on Steps, where it stands).
  const [editingStep, setEditingStep] = useState<string | null>(null);
  const editStep = useCallback(
    (id: string) => {
      setEditingStep(id);
      if (tab !== "steps") (phone ? replaceRoute : navigate)(sequenceRoute(row.id));
    },
    [tab, phone, row.id],
  );
  const a = useRecordActs(rec, flash, moved, editStep);
  // On a phone the record is the screen and its Back the only way out: a record Leads opened goes back there (every trip
  // comes back, and a pile's end says "Back brings you here"); a desk says that way in the head, and Close is the list.
  const wayBack = phone ? recordBackNow(row.id) : null;
  const close = () => navigate(wayBack ?? SEQUENCES_ROUTE);
  // A step opened to be changed holds the foot for its Cancel and Save (step-editor.tsx), at either width.
  const [editing, setEditing] = useState(false);
  const [footEl, setFootEl] = useState<HTMLDivElement | null>(null);
  const hold = useCallback((on: boolean) => setEditing(on), []);
  const footSlot = useMemo(() => ({ el: editing ? footEl : null, hold }), [editing, footEl, hold]);
  const foot = editing ? <div className="sq-foot sq-foot-edit" ref={setFootEl} /> : phone ? phoneFootOf(a, tab) : null;
  // A question stands where the notice stood on a desk; on a phone the dock says both.
  const top = a.renaming ? (
    <RenameForm a={a} />
  ) : phone ? null : a.asking ? (
    <RecordQuestion a={a} />
  ) : (
    <RecordNotice a={a} tab={tab} />
  );
  // The swipe is the pane's: its head, body and dock go back to the list together, the list drawn under them.
  const swipe = phone ? touchSwipe({ onBack: close, pages: tabPages, when: () => phone, onGrab: cmGoing }) : undefined;
  return (
    <CmPane
      title={row.name}
      badge={<StatePill kind="tone" value={sequenceStateTone(row)} label={sequenceStateWords(row)} />}
      sub={sequenceSubLine(row, { word: rec.word, timezone: rec.timezone, mode: rec.mode }, Date.now())}
      tools={<HeadActs a={a} phone={phone} />}
      foot={foot}
      onClose={close}
      closeLabel={wayBack ? SEQUENCE_WORDS.backToLeadsLabel : undefined}
      swipe={swipe}
      testid="sq-record"
      className="sq-record"
    >
      <RecordFootContext.Provider value={footSlot}>
        <div className="sq-rec">
          {top}
          <RecordTabs rec={rec} tab={tab} phone={phone} />
          <TabView tab={tab}>
            {tab === "steps" ? (
              <SequenceSteps
                rec={rec}
                flash={flash}
                moved={moved}
                again={again}
                editing={editingStep}
                onEditing={setEditingStep}
                onCancelSend={() => a.setAsking("cancel")}
              />
            ) : null}
            {tab === "people" ? <SequencePeople rec={rec} flash={flash} again={again} moved={moved} /> : null}
            {tab === "history" ? <SequenceHistory rec={rec} again={again} moved={moved} day={day} /> : null}
          </TabView>
        </div>
      </RecordFootContext.Provider>
      {toast}
    </CmPane>
  );
}

interface SequenceRecordProps {
  id: string;
  tab: SequenceTab;
  /** A day of History open, by its batch (`/history/<batch>`). */
  day?: string | null;
}

export function SequenceRecord({ id, tab, day = null }: SequenceRecordProps) {
  const [again, setAgain] = useState(0);
  const moved = useCallback(() => setAgain((n) => n + 1), []);
  const [toast, flash] = useLegacyToast();
  const read = useSequenceRead(id, verbs.record, verbs.peekRecord, { again });
  // An address that named one of its parts (a step's id, a run's) is replaced by the sequence's own, its day kept.
  const named = read.state === "read" ? read.data.sequence.id : null;
  useEffect(() => {
    if (named && named !== id) replaceRoute(sequenceRoute(named, tab, day));
  }, [named, id, tab, day]);
  if (read.state !== "read") {
    return (
      <CmPane title={SEQUENCE_WORDS.title} onClose={() => navigate(SEQUENCES_ROUTE)} testid="sq-record">
        {read.state === "failed" ? (
          <FailedRead what="this sequence" why={read.why} onRetry={moved} testid="sq-record-failed" />
        ) : (
          <div className="sq-reading" aria-busy="true" />
        )}
        {toast}
      </CmPane>
    );
  }
  return (
    <OpenRecord
      key={read.data.sequence.id}
      rec={read.data}
      tab={tab}
      flash={flash}
      moved={moved}
      again={again}
      toast={toast}
      day={day}
    />
  );
}
