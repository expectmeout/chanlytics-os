/**
 * Campaigns › Playbooks: the composer a playbook is made and edited in (moved from legacy/pages/playbook-composer.jsx,
 * decision 0015; Reach out Part 2.5). The model it reads is composer-model.ts, its three sections composer-sections.tsx
 * and its verbs composer-acts.ts; this holds the sheet and every hook, in the order they were.
 *
 * The composer: a new playbook, or one being changed, in the pane beside the list (parts/split.tsx), as a thread opens
 * beside the Inbox's. The moments stay where they were beside it: it was a panel over the grid that pushed the cards
 * down and took the unset moments away while it was open, so opening it moved the whole page; then a sheet over the
 * page, which hid the list it was written for.
 *
 * It reads the way a playbook is: who it is for (the moment, and who that reaches today), what it says (the message as
 * a customer reads it, and what fills each of its slots), and when it runs (one sentence, its numbers chosen in place).
 * Everything else is a press away -- every moment and every message behind their own control, the rules every run keeps
 * behind the shield.
 *
 * A slot takes only what keeps its message true (contracts slotChoices): a first name is each person's own and a visit's
 * time each visit's, so neither is a choice; the business name and the booking link may be typed over; a slot on a
 * message written elsewhere may be anything, its guess first. Each slot had a free choice of all six, so a first name
 * could be set to the booking link and a run greeted everyone "Hi your booking link". A message one of whose slots
 * nothing can fill here -- a visit's reminder, on a list -- is not offered at all.
 *
 * Checked here the way the route checks it -- a message chosen, every slot filled -- so an enabled Start is a Start that
 * succeeds unless the server knows something newer (a template no longer approved, a booking link gone).
 */
import { useEffect, useMemo, useState } from "react";
import { LIFECYCLE_WORDS } from "@chanlytics/contracts";
import type { ConsentChannel } from "@chanlytics/contracts";
import { canDo } from "../../legacy-verbs";
import { Button } from "../../kit/button/button";
import { Field } from "../../kit/field/field";
import { Icon } from "../../kit/icon/icon";
import { UnsavedAsk, tabDraft, useUnsavedWork } from "../../kit/record/work";
import type { UnsavedWork } from "../../kit/record/work";
import { useSurface } from "../../use-surface";
import { CmPane } from "../parts/split";
import { composerActs } from "./composer-acts";
import { composerModel, composerOffered, composerOpened } from "./composer-model";
import type { Fields } from "./composer-model";
import {
  changedFields,
  forecast,
  messageSection,
  overSentence,
  reachLine,
  recipe,
  starterToAdd,
} from "./composer-sections";
import type { SectionCtx } from "./composer-sections";
import type { PlaybookCardVM, PlaybooksSurface } from "./surface";

interface ComposerProps {
  data: PlaybooksSurface;
  editing: PlaybookCardVM | null;
  initialTrigger?: string | null;
  /**
   * Another moment chosen in the field, told to the sheet that hosts it: a Turn on's sheet is titled for the moment the
   * field holds, never only the one its address opened it on (home/new-message.tsx).
   */
  onTrigger?: (trigger: string) => void;
  onDone: (d: { id?: string; name?: string }, changed: boolean) => void;
  onCancel: () => void;
}

/**
 * What the foot says over its acts: what stops it first; else, for the moment's own message not added yet, that Turn on
 * adds it; else, for a campaign being changed, how many of its words moved and that they apply from its next run.
 */
function footSay(x: SectionCtx): { tone: string; t: string } | null {
  const S = LIFECYCLE_WORDS.compose.sentence;
  const starter = starterToAdd(x);
  if (x.say && (x.say.tone === "danger" || !x.trig)) return x.say;
  if (starter) return { tone: "plain", t: S.addsFirst(starter.title) };
  if (x.say) return x.say;
  const moved = changedFields(x).length;
  return moved > 0 ? { tone: "plain", t: S.changes(moved) } : null;
}

/**
 * The sheet's foot: what it says first, Cancel, and the one act the sheet is for -- Turn on, which adds the moment's own
 * message first where it is not added yet, or Save changes; with something changed, Cancel asks once first (UnsavedAsk).
 */
function sheetFoot(p: {
  x: SectionCtx;
  work: UnsavedWork;
  editing: PlaybookCardVM | null;
  busy: boolean;
  error: string | null;
  turnOn: () => Promise<void>;
}) {
  const { x, work, editing, busy, error, turnOn } = p;
  const say = footSay(x);
  const ready = x.ready || (!!starterToAdd(x) && !x.adding && !!x.trig);
  return (
    <div className="pb-foot" data-foot-pair={work.asking ? undefined : ""}>
      {/* Cancel, and Escape, with something changed: the one question first (UnsavedAsk), where the buttons were. */}
      {work.asking ? (
        <UnsavedAsk onYes={work.discard} onNo={work.stay} testid="pb-leave" />
      ) : (
        <>
          <span
            className="pb-foot-say"
            data-tone={say ? say.tone : undefined}
            role={error ? "alert" : undefined}
            data-testid={error ? "pb-error" : "pb-foot-say"}
          >
            {say ? say.t : null}
          </span>
          <Button onClick={work.leave} data-testid="pb-cancel">
            Cancel
          </Button>
          <Button variant="primary" disabled={!ready || busy} onClick={() => void turnOn()} data-testid="pb-save">
            {busy || x.adding ? "Saving…" : editing ? "Save changes" : LIFECYCLE_WORDS.compose.turnOnShort}
          </Button>
        </>
      )}
    </div>
  );
}

/**
 * The sheet's body, as one sentence (Ruben, 11 Oct 2026, "Option B"; composer-sections.tsx): what keeps a run from sending
 * over it, the sentence, who it reaches now under it, the message as its person reads it, and when it first runs. It
 * stood as five rows of a word and a section each (To, Send by, Says, When, Rules).
 */
function sheetBody(x: SectionCtx) {
  return (
    <div className="pb-compose cm-sentence">
      {overSentence(x)}
      {recipe(x)}
      {reachLine(x)}
      {messageSection(x)}
      {forecast(x)}
    </div>
  );
}

export function PlaybookComposer({ data, editing, initialTrigger = null, onTrigger, onDone, onCancel }: ComposerProps) {
  // As on Broadcasts: a template this product cannot put on the wire is not
  // offered, rather than offered and refused by Meta for every recipient.
  const offered = useMemo(() => composerOffered(data.templates), [data.templates]);
  // What it opens as: the playbook being changed, or a new one on the moment pressed. Words typed here before and
  // not saved come back over that (the tab's draft, useUnsavedWork), except the moment a slot was pressed for.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- what it opened as, read once
  const opened = useMemo(() => composerOpened(editing, initialTrigger, data), [editing, initialTrigger]);
  const draftKey = editing ? editing.id : "new";
  // What the tab kept of this sheet's words: what `held` below was, when it was left.
  const [kept] = useState(() => tabDraft("playbook", draftKey) as Fields | null);
  const start = kept ? { ...kept, trigger: initialTrigger || kept.trigger } : opened;
  const [trigger, setTrigger] = useState(start.trigger);
  // The message the owner chose. Until they choose one it is the moment's own,
  // and it follows the moment -- nothing is picked for them that the moment
  // was not written for: it opened on whichever template sorted first.
  const [tplId, setTplId] = useState(start.tplId);
  const [picked, setPicked] = useState(start.picked);
  // Null follows the name the route gives a playbook given none; words are the owner's.
  const [name, setName] = useState(start.name);
  const [hour, setHour] = useState(start.hour);
  const [cap, setCap] = useState(start.cap);
  const [gap, setGap] = useState(start.gap);
  const [cadence, setCadence] = useState(start.cadence);
  // Per message: what fills each slot, and the words typed into it.
  const [fills, setFills] = useState(start.fills);
  const [typed, setTyped] = useState(start.typed);
  const [listId, setListId] = useState(start.listId === undefined ? null : start.listId);
  const [cls, setCls] = useState(start.cls || "campaign");
  // The channels it goes by, ticked in the Send by row: what the playbook has, or null, which follows the message in view
  // until a switch is pressed (composer-model channelsModelOf): every channel it can go by, for whichever message is picked.
  const [channels, setChannels] = useState<ConsentChannel[] | null>(
    start.channels && start.channels.length > 0 ? start.channels : null,
  );
  // What the sheet holds, against what it opened as: changed, it is kept in the tab, and Cancel asks first.
  const held: Fields = { trigger, tplId, picked, name, hour, cap, gap, cadence, listId, cls, fills, typed, channels };
  const work = useUnsavedWork("playbook", draftKey, {
    value: held,
    dirty: JSON.stringify(held) !== JSON.stringify(opened),
    onLeave: onCancel,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  // Turn on pressed with the moment's own message not added yet: it is added, and the campaign saved once it reads back.
  const [startAfter, setStartAfter] = useState(false);
  // Which step of the preview's walk is in view: the channels it goes by, one at a time (composer-sections.tsx).
  const [who, setWho] = useState(0);
  const templatesAll = useSurface("settings")?.templatesAll;
  const canEdit = canDo("approve");

  const m = composerModel({ data, editing, offered, templatesAll, f: held, busy, error });
  const acts = composerActs({
    m,
    f: held,
    editing,
    adding,
    setTrigger: (id) => {
      setTrigger(id);
      onTrigger?.(id);
    },
    setTplId,
    setPicked,
    setBusy,
    setError,
    setAdding,
    done: () => work.done(),
    onDone,
  });
  const x: SectionCtx = {
    ...m,
    data,
    editingId: editing ? editing.id : null,
    editingTemplateName: editing ? editing.template_name : null,
    editing,
    opened,
    f: held,
    canEdit,
    adding,
    setHour,
    setCap,
    setGap,
    setCadence,
    setListId,
    setCls,
    setChannels,
    setFills,
    setTyped,
    who,
    setWho,
    ...acts,
  };
  // The message added reads back with the playbooks: the campaign is saved on it then, as Turn on was pressed for.
  useEffect(() => {
    if (!startAfter || busy || adding || !m.ready) return;
    setStartAfter(false);
    void acts.save();
  }, [startAfter, busy, adding, m.ready, acts]);
  const turnOn = async () => {
    if (!starterToAdd(x)) return acts.save();
    setStartAfter(true);
    await acts.addStarter();
  };
  // In the pane beside the list (parts/split.tsx), where the record kit's sheet stood over the page: the list stays in
  // sight and in reach, as the Inbox's does beside a thread.
  return (
    <CmPane
      testid="pb-composer"
      className="pb-sheet"
      title={
        <span className="pb-title-wrap">
          <Field
            className="pb-title-box"
            shape="title"
            value={m.title}
            placeholder={m.auto}
            onValueChange={setName}
            maxLength={80}
            spellCheck={false}
            aria-label="The campaign's name"
            data-testid="pb-name"
          />
          <Icon name="pencil" size={13} />
        </span>
      }
      onClose={work.leave}
      closeLabel="Cancel"
      foot={sheetFoot({ x, work, editing, busy, error, turnOn })}
    >
      {sheetBody(x)}
    </CmPane>
  );
}
