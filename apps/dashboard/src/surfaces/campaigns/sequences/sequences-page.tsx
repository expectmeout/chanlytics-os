/**
 * Campaigns › Sequences (decision 0060): everything the workspace sends on its own, as one list, and a sequence's record
 * beside it -- Campaigns' one layout (parts/split.tsx), the list narrowing to the Inbox's column while a record is open,
 * the record taking the screen over on a phone. It is Campaigns (the plan's S6: the home, Sent's list and the Library
 * went, their addresses landing here and on Messages). Its list is the `sequences` surface; a record reads
 * its own (verbs.ts), each following the list. The address says what is open (contracts parseSequencesRoute), so Back
 * walks the list, a record, its tabs and a run of it: a run's one screen stands where the record does, at its home under
 * its sequence (run-pane.tsx, the Campaigns wiring review's lane 2). The list's pane is drawn by Sent's sheet too, Get
 * their yes standing beside it at its own address (broadcasts/broadcasts-page.tsx). Its head is Campaigns' own, as
 * Messages' is: the name, the strip of views, and New beside it (a phone's round + by the strip), the one New that asks
 * who and when (new.tsx, lane 6), the list keeping its search alone.
 * Opened from a lead (the lead sheet's hand-off), the head's way back names the lead and returns to it, across a record's
 * tabs; a new sequence to leads is a draft made by name where its leads are chosen, written on its record.
 * On a phone a record opened from the list is pushed in over it as iOS pushes a page, as a thread is over the Inbox's and a
 * person over People (Ruben, 22 Oct 2026: "like iphone imessage"), and the list is held where it was under it, so a
 * thumb carrying the record back, or its Back, lands on the row it was opened from (kit/motion/held-list.ts).
 */
import {
  CAMPAIGN_ROOMS,
  LIFECYCLE_WORDS,
  NEW_WORDS,
  SEQUENCE_WORDS,
  newSequenceRoute,
  parseSequencesRoute,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { ActWords } from "../../kit/head/act-words";
import { useStanding } from "../../kit/head/standing";
import { Icon } from "../../kit/icon/icon";
import { useHeldList, type Arrival } from "../../kit/motion/held-list";
import { gate, navigate, routeDoor } from "../../legacy-verbs";
import { usePartShown, useSurface } from "../../use-surface";
import { CmSplit, cmGoing, useCmPhone, type CmView } from "../parts/split";
import { SequencesList, sequencesList } from "./list";
import { NewSequence } from "./new/new-page";
import { SequenceRecord } from "./record";
import { SequenceRun } from "./run-pane";
import { recordBackOf, tripNow } from "./trip";
import "./sequences.css";

/** The list's pane: reading, failed, empty, or the sequences, `openId` the one open beside it. */
function SequencesListPane({ openId = null }: { openId?: string | null }) {
  const page = useSurface("sequences");
  if (page === null)
    return <FailedRead what="the sequences" title={SEQUENCE_WORDS.failed} surface="sequences" testid="sq-failed" />;
  // On its way: the shell's quiet words, which wait their beat, so a list that lands fast is never said.
  if (page === undefined)
    return (
      <div className="route-reading sq-reading" role="status" aria-busy="true">
        {LIFECYCLE_WORDS.reading}
      </div>
    );
  return page.sequences.length === 0 ? (
    <EmptyState
      kind="card"
      glyph="send"
      title={SEQUENCE_WORDS.title}
      body={SEQUENCE_WORDS.empty}
      action={{
        label: NEW_WORDS.title,
        to: newSequenceRoute(),
        testid: "sq-empty-new",
        gate: gate("approve"),
      }}
      testid="sq-empty"
    />
  ) : (
    <SequencesList page={page} openId={openId} />
  );
}

/**
 * New, the head's act (the one New: who and when), its mark and its words as the kit's act says them (act-words.tsx): "+ New
 * sequence" where the row holds it, "+ New" where it does not, as People's Add people and the Inbox's New (Ruben, 20 Oct
 * 2026: a plus alone said nothing).
 */
const newAct = () => (
  <Button variant="primary" {...routeDoor(newSequenceRoute())} data-testid="sq-new-open" {...gate("approve")}>
    <ActWords icon={<Icon name="plus" size={14} />} words={NEW_WORDS.act} />
  </Button>
);

/** The way back to the lead a trip came from: by the lead's name where Leads said it, else Leads. */
function backWayOf(back: string | null) {
  if (!back) return null;
  const t = tripNow();
  return { label: (t && t.leadName) || SEQUENCE_WORDS.backToLeads, go: () => navigate(back) };
}

/**
 * How a record comes in over the list it was opened from (kit/motion/held-list.ts): its pane once read, which a thumb
 * carries back (record.tsx), worn as a thumb carrying it wears it (split.tsx cmGoing). A record still being read has
 * no such pane yet, and comes in as it arrives (sequences.css, data-over).
 */
const RECORD_ARRIVES: Arrival = {
  page: () => document.querySelector<HTMLElement>(".sq-page > .cm-pane.sq-record"),
  going: cmGoing,
};

/** Sequences as Campaigns draws it, a view kept beside Messages: `view` is the deck's seat and side (parts/split.tsx CmView). */
export function SequencesPage({ route, view }: { route: string; view?: CmView }) {
  const place = parseSequencesRoute(route) ?? { view: "list" as const };
  // On a phone a sequence open, its record or a run of it, is the screen: the list is held where it was under it, and put
  // back there as it goes, by any Back; a record opened from it is pushed in over it. A desk keeps the list beside it.
  const phone = useCmPhone();
  const over = useHeldList(phone && place.view === "record", sequencesList, RECORD_ARRIVES);
  // Campaigns' first part (client/page-speed.ts, contracts PRIMARY_PART): Sequences' list, drawn with its rows, or with
  // what could not be read. Timed from the press, so the page's own chunk and its read are in it, not the gate's frame alone.
  const list = useSurface("sequences");
  usePartShown("campaigns", "list", list !== undefined);
  // A record keeps the way back it was opened with while its tabs change; the list and New say only their own.
  const held = recordBackOf(place.view === "record" ? place.id : null, place.back ?? null);
  const back = place.view === "record" ? held : (place.back ?? null);
  // Campaigns' head, the view's name in the strip under it: no way back above it but the lead a trip came from, and New
  // beside the strip until one is being made.
  useStanding({ title: CAMPAIGN_ROOMS.home, back: backWayOf(back), act: place.view === "new" ? null : newAct() });
  const open =
    place.view === "record" && place.run ? (
      <SequenceRun sequenceId={place.id} runId={place.run} />
    ) : place.view === "record" ? (
      <SequenceRecord id={place.id} tab={place.tab} over={over} />
    ) : place.view === "new" ? (
      // A door's moment opens its own New, so the line it wrote in is never another moment's.
      <NewSequence
        key={place.draft ?? place.moment ?? "new"}
        moment={place.moment ?? null}
        who={place.who ?? null}
        to={place.to ?? null}
        kept={place.draft ?? null}
      />
    ) : null;
  return (
    <CmSplit
      testid="sq-page"
      className="sq-page"
      view={view}
      list={<SequencesListPane openId={place.view === "record" ? place.id : null} />}
      open={open}
    />
  );
}
