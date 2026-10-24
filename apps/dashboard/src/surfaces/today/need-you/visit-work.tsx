/**
 * Yesterday's visit to mark, as Need you draws it (decision 0071, E6): Kept, or Missed and the rebook Ask writes, changed
 * in place and sent from the row as a first message to the person (the person_message door, its grace counted down
 * with Undo, sends.ts). Where Ask cannot write it, the member writes it; where no way takes words, there is nothing to
 * send and Missed stands alone.
 */
import { useEffect, useState } from "react";
import {
  NEED_YOU_WORDS as W,
  VISIT_ASK_WORDS,
  VISIT_WORDS,
  writeWireName,
  type AppointmentWord,
  type PersonReachDto,
  type VisitWord,
} from "@chanlytics/contracts";
import { askDraft, readReach } from "../../inbox/new-conversation/verbs";
import { sayVisit } from "../../visit-line";
import { Button } from "../../kit";
import { gate } from "../shell";
import { Acts, Done, Editor, Going, Note, Words, Writing, type WorkProps } from "./parts";
import { sendWords, undoSend, useSend } from "./sends";

/** The way a first message to a person can go with words of the member's own: theirs by default, else any that takes words. */
function wordsWay(reach: PersonReachDto): PersonReachDto["ways"][number] | null {
  const takes = (w: PersonReachDto["ways"][number]) => w.ok && w.carries === "words";
  return reach.ways.find((w) => w.wire === reach.default_wire && takes(w)) ?? reach.ways.find(takes) ?? null;
}

/** The way the rebook goes: its wire, and the wire in words. */
interface Way {
  wire: string;
  words: string;
}

/** The rebook Ask writes for a missed visit: the way to send it and the words, or why there are none (and the way, if any). */
type Rebook =
  | { state: "writing" }
  | { state: "ready"; way: Way; text: string; subject: string }
  | { state: "none"; why: string; way: Way | null };

/** Ask's rebook for a person who missed their visit: their reach read, then the person draft on the way that takes words. */
function useRebook(personId: string | null, on: boolean, about: string): Rebook | null {
  const [rebook, setRebook] = useState<Rebook | null>(null);
  useEffect(() => {
    if (!on || !personId) return;
    let live = true;
    setRebook({ state: "writing" });
    void (async () => {
      // The new conversation's own reads of how a person can be written to, and of Ask's words for them.
      const reach = await readReach(personId);
      if (!reach.ok) return live && setRebook({ state: "none", why: reach.message, way: null });
      const found = wordsWay(reach.data.reach);
      // No way takes words to them: the reason the first one that would gives ("No texting line yet.").
      const blocked = reach.data.reach.ways.find((w) => w.carries === "words")?.why;
      if (!found) return live && setRebook({ state: "none", why: W.visit.noWay(blocked ?? W.couldNot), way: null });
      const way = { wire: found.wire, words: writeWireName(found.wire) };
      const d = await askDraft(personId, { how: "message", wire: found.wire, about });
      if (!live) return;
      if (!d.ok || !d.data.text)
        setRebook({ state: "none", why: d.ok ? (d.data.asks[0]?.question ?? W.couldNot) : d.message, way });
      else setRebook({ state: "ready", way, text: d.data.text, subject: d.data.subject });
    })();
    return () => {
      live = false;
    };
  }, [on, personId, about]);
  return rebook;
}

/** The rebook in the row: Ask's words (or why there are none), changed in place, and sent with its grace counted down. */
function RebookWork(p: WorkProps & { word: AppointmentWord; onDontSend: () => void; onChange: () => void }) {
  const { row, main, may, flash } = p;
  const rebook = useRebook(row.person_id, true, W.visit.rebookAbout(p.word, row.when));
  const [mine, setMine] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [sentHere, setSentHere] = useState(false);
  const { s: send, seconds, share } = useSend(row.id);
  const way = rebook && rebook.state !== "writing" ? rebook.way : null;
  const words = mine ?? (rebook?.state === "ready" ? rebook.text : "");
  const edit = (from: string) => {
    setMine(from);
    setEditing(true);
  };
  const sendIt = async () => {
    if (!way || !row.person_id || !words.trim()) return;
    const subject = rebook?.state === "ready" ? rebook.subject : "";
    // Pressed here, before the countdown is drawn: it is drawn the moment the door answers, and takes the keys as it is.
    setSentHere(true);
    const r = await sendWords(row.id, {
      kind: "person_message",
      payload: {
        contact_id: row.person_id,
        wire: way.wire,
        text: words,
        ...(subject ? { subject } : {}),
        then: "receptionist",
      },
      who: row.who,
      wire: way.words,
    });
    if (!r.ok) {
      setSentHere(false);
      return flash({ tone: "danger", msg: <>{r.message}</> });
    }
    setEditing(false);
  };
  // Undo inside the grace keeps the words to send again; too late, it says so, as a reply's does.
  const undo = async () => {
    const r = await undoSend(row.id);
    if (!r.ok) flash({ tone: "danger", msg: <>{r.message}</> });
    else setMine(words);
  };

  if (send?.state === "going")
    return (
      <Going
        line={W.sendingIn(seconds)}
        sub={W.sendingTo(row.who, way?.words ?? "")}
        share={share}
        act={{ label: W.undo, onPress: () => void undo() }}
        takeFocus={sentHere}
      />
    );
  if (send?.state === "gone") return <Done words={W.visit.rebookSent} />;
  // No way takes words to them: Missed stands, with why nothing can follow it.
  if (rebook?.state === "none" && !way)
    return <Done words={VISIT_WORDS.missed} detail={rebook.why} act={{ label: W.visit.change, onPress: p.onChange }} />;
  const written = editing ? (
    <Editor who={row.who} value={words} onChange={setMine} />
  ) : words ? (
    <Words
      by={mine !== null ? W.yours : W.visit.rebook}
      text={words}
      who={row.who}
      onEdit={may ? () => edit(words) : null}
    />
  ) : rebook?.state === "writing" ? (
    <Writing />
  ) : rebook?.state === "none" ? (
    <Note>{rebook.why}</Note>
  ) : null;
  const end =
    words || !way ? (
      <Button
        variant={main}
        onClick={() => void sendIt()}
        disabled={!way || !words.trim()}
        {...gate("approve", "send the rebook")}
      >
        {W.send}
      </Button>
    ) : (
      <Button variant={main} onClick={() => edit("")}>
        {W.writeItMyself}
      </Button>
    );
  return (
    <>
      <Note>{VISIT_WORDS.missed}</Note>
      {send?.state === "stopped" ? <Note>{W.canceled}</Note> : null}
      {written}
      <Acts
        start={
          <Button variant="quiet" onClick={p.onDontSend}>
            {W.booked.dontSend}
          </Button>
        }
        end={end}
      />
    </>
  );
}

/** Yesterday's visit to mark: Kept, or Missed and the rebook Ask writes, sent from the row. */
export function VisitWork(p: WorkProps & { word: AppointmentWord }) {
  const { row, main, may, flash, keep } = p;
  const [mark, setMark] = useState<VisitWord | "rebook" | null>(null);
  const [busy, setBusy] = useState(false);
  const say = async (status: VisitWord) => {
    if (!row.visit) return;
    setBusy(true);
    keep(row);
    const r = await sayVisit(row.visit.id, status);
    setBusy(false);
    if (!r.ok) return flash({ tone: "danger", msg: <>{r.message}</> });
    setMark(status === "missed" && row.person_id && may ? "rebook" : status);
  };

  if (mark === "rebook")
    return <RebookWork {...p} onDontSend={() => setMark("missed")} onChange={() => setMark(null)} />;
  if (mark) return <Done words={VISIT_WORDS[mark]} act={{ label: W.visit.change, onPress: () => setMark(null) }} />;
  // Its two words as the row is asked them (visitLineOf's `asks`): the first its act, the second the quiet one.
  const [first, second] = row.visit?.asks ?? [];
  const press = (status: VisitWord, variant: "primary" | "secondary" | "quiet") => (
    <Button
      variant={variant}
      onClick={() => void say(status)}
      disabled={busy}
      data-testid={`queue-visit-${status}`}
      {...gate("approve", VISIT_ASK_WORDS.gate)}
      aria-label={`${VISIT_WORDS[status]}: ${row.who}`}
    >
      {VISIT_WORDS[status]}
    </Button>
  );
  return <Acts start={second ? press(second, "quiet") : null} end={first ? press(first, main) : null} />;
}
