/**
 * Campaigns › Sequences (decision 0060): everything the workspace sends on its own, as one list, and a sequence's record
 * beside it -- Campaigns' one layout (parts/split.tsx), the list narrowing to the Inbox's column while a record is open,
 * the record taking the screen over on a phone. It is Campaigns (the plan's S6: the home, Sent's list and the Library
 * went, their addresses landing here and on Messages). Its list is the `sequences` surface; a record reads
 * its own (verbs.ts), each following the list. The address says what is open (contracts parseSequencesRoute), so Back
 * walks the list, a record and its tabs. The list's pane is drawn by Sent's sheets too, a run's, To send and Get their
 * yes standing beside it at their own addresses (broadcasts/broadcasts-page.tsx). Its head is Campaigns' own, as Messages'
 * is: the name, the strip of views, and New beside it (a phone's round + by the strip), the list keeping its search alone.
 * Opened from a lead (the lead sheet's hand-off), the head's way back names the lead and returns to it, across a record's
 * tabs; a new sequence to leads is a draft made by name where its leads are chosen, written on its record.
 */
import {
  CAMPAIGN_ROOMS,
  LIFECYCLE_WORDS,
  SEQUENCES_ROUTE,
  SEQUENCE_WORDS,
  parseSequencesRoute,
} from "@chanlytics/contracts";
import { Button } from "../../kit/button/button";
import { EmptyState, FailedRead } from "../../kit/empty/empty";
import { useStanding } from "../../kit/head/standing";
import { Icon } from "../../kit/icon/icon";
import { gate, navigate, routeDoor } from "../../legacy-verbs";
import { usePartShown, useSurface } from "../../use-surface";
import { CmSplit, type CmView } from "../parts/split";
import { SequencesList } from "./list";
import { NewSequence } from "./new";
import { SequenceRecord } from "./record";
import { recordBackOf, tripNow } from "./trip";
import "./sequences.css";

/** The list's pane: reading, failed, empty, or the sequences, `openId` the one open beside it. */
export function SequencesListPane({ openId = null }: { openId?: string | null }) {
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
        label: SEQUENCE_WORDS.newSequence,
        to: `${SEQUENCES_ROUTE}/new`,
        testid: "sq-empty-new",
        gate: gate("approve"),
      }}
      testid="sq-empty"
    />
  ) : (
    <SequencesList page={page} openId={openId} />
  );
}

/** New sequence, the head's act: its words on a desk, its mark alone on a phone (campaigns.css cm-act-noun). */
const newAct = () => (
  <Button {...routeDoor(`${SEQUENCES_ROUTE}/new`)} data-testid="sq-new-open" {...gate("approve")}>
    <Icon name="plus" size={12} />{" "}
    <span>
      New<span className="cm-act-noun"> sequence</span>
    </span>
  </Button>
);

/** The way back to the lead a trip came from: by the lead's name where Leads said it, else Leads. */
function backWayOf(back: string | null) {
  if (!back) return null;
  const t = tripNow();
  return { label: (t && t.leadName) || SEQUENCE_WORDS.backToLeads, go: () => navigate(back) };
}

/** Sequences as Campaigns draws it, a view kept beside Messages: `view` is the deck's seat and side (parts/split.tsx CmView). */
export function SequencesPage({ route, view }: { route: string; view?: CmView }) {
  const place = parseSequencesRoute(route) ?? { view: "list" as const };
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
    place.view === "record" ? (
      <SequenceRecord id={place.id} tab={place.tab} day={place.day ?? null} />
    ) : place.view === "new" ? (
      // A door's moment opens its own New, so the line it wrote in is never another moment's.
      <NewSequence key={place.moment ?? "new"} moment={place.moment ?? null} />
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
